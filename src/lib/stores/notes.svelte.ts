// Rune-based notes & labels store. Persists to IndexedDB via $effect.
import type { Note, Label, NoteColor } from '$lib/types';
import {
	getAllNotes,
	putNote,
	deleteNote,
	getAllLabels,
	putLabel,
	deleteLabel,
	bulkPutNotes,
	bulkPutLabels,
	clearAllNotes,
	clearAllLabels
} from '$lib/db/idb';
import { mergeNoteLists, mergeTwoNotes, mergeLabelLists } from '$lib/noteMerge';
import { syncStore } from '$lib/stores/sync.svelte';
import { uid, daysSinceTrashed, TRASH_PURGE_DAYS, cloneNote } from '$lib/utils';
import { noteAttachments, toggleLineAt } from '$lib/checklistBody';
import { readLabelsMirror, readNotesMirror, writeLabelsMirror, writeNotesMirror } from '$lib/noteStorage';
import { readLabelTombstones, readTombstones, writeLabelTombstones, writeTombstones } from '$lib/syncTombstones';
import { rememberLinkPreviews } from '$lib/linkPreview';

export class NotesStore {
	notes = $state<Note[]>([]);
	labels = $state<Label[]>([]);
	loaded = $state(false);
	lastPersistError = $state<string | null>(null);
	deletedNoteIds = $state<Record<string, number>>(readTombstones());
	deletedLabelIds = $state<Record<string, number>>(readLabelTombstones());

	constructor() {
		this.notes = readNotesMirror();
		this.labels = readLabelsMirror();
		if (this.notes.length > 0) this.loaded = true;
		if (typeof window !== 'undefined') {
			window.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'hidden') this.mirrorToLS();
			});
		}
	}

	// Derived collections -------------------------------------------------
	activeNotes = $derived(this.notes.filter((n) => !n.archived && !n.trashed));
	pinnedNotes = $derived(this.activeNotes.filter((n) => n.pinned));
	unpinnedNotes = $derived(this.activeNotes.filter((n) => !n.pinned));
	archivedNotes = $derived(this.notes.filter((n) => n.archived && !n.trashed));
	trashedNotes = $derived(this.notes.filter((n) => n.trashed));
	notesWithReminders = $derived(
		this.activeNotes
			.filter((n) => n.reminder != null)
			.sort((a, b) => (a.reminder ?? 0) - (b.reminder ?? 0))
	);

	// --- Lifecycle -------------------------------------------------------
	async init() {
		if (this.loaded) {
			await this.rehydrateFromIDB();
			return;
		}

		const mirrorNotes = this.notes.length ? this.notes : readNotesMirror();
		const mirrorLabels = this.labels.length ? this.labels : readLabelsMirror();
		let dbNotes: Note[] = [];
		let dbLabels: Label[] = [];
		let deviceReadFailed = false;
		try {
			[dbNotes, dbLabels] = await Promise.all([getAllNotes(), getAllLabels()]);
		} catch (err) {
			deviceReadFailed = true;
			this.recordPersistenceError('Could not read IndexedDB', err);
		}

		const notes = mergeNoteLists(mirrorNotes, dbNotes).sort((a, b) => b.updatedAt - a.updatedAt);
		const labels = mergeLabelLists(mirrorLabels, dbLabels).sort((a, b) => a.name.localeCompare(b.name));
		const seededFlag = typeof localStorage !== 'undefined' ? localStorage.getItem('gkc-seeded') : null;

		if (notes.length === 0 && labels.length === 0 && !seededFlag) {
			localStorage?.setItem('gkc-seeded', '1');
			this.notes = this.seedNotes();
			this.labels = [];
			this.mirrorToLS();
			try {
				await bulkPutNotes(this.notes);
			} catch (err) {
				this.recordPersistenceError('Could not save starter notes', err);
			}
		} else {
			this.notes = notes;
			this.labels = labels;
			this.mirrorToLS();
			// Recover the primary store from a valid mirror after an IDB reset.
			if (!deviceReadFailed && dbNotes.length === 0 && notes.length > 0) {
				try {
					await bulkPutNotes(notes);
					await bulkPutLabels(labels);
				} catch (err) {
					this.recordPersistenceError('Could not restore IndexedDB from mirror', err);
				}
			}
		}
		this.purgeOldTrash();
		this.seedLinkPreviewCache(this.notes);
		this.loaded = true;
	}

	private seedLinkPreviewCache(notes: Note[]) {
		for (const note of notes) {
			if (note.linkPreviews?.length) rememberLinkPreviews(note.linkPreviews);
		}
	}

	private async rehydrateFromIDB() {
		try {
			const [dbNotes, dbLabels] = await Promise.all([getAllNotes(), getAllLabels()]);
			this.notes = mergeNoteLists(this.notes, dbNotes).sort((a, b) => b.updatedAt - a.updatedAt);
			this.labels = mergeLabelLists(this.labels, dbLabels).sort((a, b) => a.name.localeCompare(b.name));
			this.seedLinkPreviewCache(this.notes);
			this.mirrorToLS();
		} catch (err) {
			this.recordPersistenceError('Could not rehydrate from IndexedDB', err);
		}
	}

	async flushNote(id: string, patch: Partial<Note> = {}): Promise<void> {
		const idx = this.notes.findIndex((x) => x.id === id);
		if (idx === -1) return;
		if (Object.keys(patch).length > 0) {
			const current = this.notes[idx];
			this.notes[idx] = {
				...current,
				...patch,
				updatedAt: Date.now(),
				labels: patch.labels ? [...patch.labels] : current.labels,
				images: patch.images
					? patch.images.map((image) => ({ ...image }))
					: current.images,
				linkPreviews: patch.linkPreviews
					? patch.linkPreviews.map((preview) => ({ ...preview }))
					: current.linkPreviews
			};
		}
		const note = this.notes[idx];
		this.mirrorToLS();
		try {
			await putNote(note);
			this.lastPersistError = null;
		} catch (err) {
			this.recordPersistenceError(`Could not save note ${id}`, err);
			throw err;
		}
	}

	discardIfEmpty(id: string): void {
		const n = this.notes.find((x) => x.id === id);
		if (!n) return;
		const empty =
			!n.title.trim() &&
			!(n.body ?? '').trim() &&
			!noteAttachments(n).some((attachment) => attachment.dataUrl.length > 0);
		if (!empty) return;
		this.deleteNoteForever(id);
	}

	/** Remove notes that have been in trash > 7 days. */
	purgeOldTrash() {
		const toPurge = this.notes.filter(
			(n) => n.trashed && daysSinceTrashed(n.trashedAt) >= TRASH_PURGE_DAYS
		);
		if (toPurge.length === 0) return;
		this.markNotesDeleted(toPurge.map((note) => note.id));
		this.notes = this.notes.filter((n) => !toPurge.find((p) => p.id === n.id));
		Promise.all(toPurge.map((p) => deleteNote(p.id))).catch((err) =>
			this.recordPersistenceError('Could not purge expired trash', err)
		);
	}

	// --- CRUD ------------------------------------------------------------
	createNote(partial: Partial<Note> = {}): Note {
		const now = Date.now();
		const note: Note = {
			id: uid(),
			title: partial.title ?? '',
			body: partial.body ?? '',
			color: partial.color ?? 'default',
			pinned: partial.pinned ?? false,
			archived: false,
			trashed: false,
			trashedAt: null,
			createdAt: now,
			updatedAt: now,
			reminder: partial.reminder ?? null,
			labels: [...(partial.labels ?? [])],
			images: (partial.images ?? []).map((image) => ({ ...image })),
			...(partial.linkPreviews?.length
				? { linkPreviews: partial.linkPreviews.map((preview) => ({ ...preview })) }
				: {})
		};
		this.notes = [note, ...this.notes];
		this.persist(note.id);
		return note;
	}

	updateNote(id: string, patch: Partial<Note>): void {
		const idx = this.notes.findIndex((n) => n.id === id);
		if (idx === -1) return;
		const current = this.notes[idx];
		const next: Note = {
			...current,
			...patch,
			updatedAt: Date.now(),
			labels: patch.labels ? [...patch.labels] : current.labels,
			images: patch.images
				? patch.images.map((image) => ({ ...image }))
				: current.images,
			linkPreviews: patch.linkPreviews
				? patch.linkPreviews.map((preview) => ({ ...preview }))
				: current.linkPreviews
		};
		this.notes[idx] = next;
		this.persist(id);
	}

	togglePin(id: string): void {
		const n = this.notes.find((x) => x.id === id);
		if (!n) return;
		this.updateNote(id, { pinned: !n.pinned });
	}

	toggleArchive(id: string): void {
		const n = this.notes.find((x) => x.id === id);
		if (!n) return;
		this.updateNote(id, { archived: !n.archived, pinned: false });
	}

	setColor(id: string, color: NoteColor): void {
		this.updateNote(id, { color });
	}

	setReminder(id: string, reminder: number | null): void {
		this.updateNote(id, { reminder });
	}

	/** Toggle `[ ]` / `[x]` line in unified body text. */
	toggleBodyChecklistLine(noteId: string, lineIndex: number): void {
		const n = this.notes.find((x) => x.id === noteId);
		if (!n) return;
		const body = toggleLineAt(n.body ?? '', lineIndex);
		this.updateNote(noteId, { body });
	}

	toggleLabel(noteId: string, labelId: string): void {
		const n = this.notes.find((x) => x.id === noteId);
		if (!n) return;
		const labels = n.labels.includes(labelId)
			? n.labels.filter((l) => l !== labelId)
			: [...n.labels, labelId];
		this.updateNote(noteId, { labels });
	}

	// Trash ----------------------------------------------------------------
	trashNote(id: string): void {
		this.updateNote(id, { trashed: true, trashedAt: Date.now(), pinned: false });
	}

	restoreNote(id: string): void {
		this.updateNote(id, { trashed: false, trashedAt: null });
	}

	deleteNoteForever(id: string): void {
		this.markNotesDeleted([id]);
		this.notes = this.notes.filter((n) => n.id !== id);
		this.mirrorToLS();
		deleteNote(id).catch((err) => this.recordPersistenceError(`Could not delete note ${id}`, err));
	}

	emptyTrash(): void {
		const ids = this.trashedNotes.map((n) => n.id);
		this.markNotesDeleted(ids);
		this.notes = this.notes.filter((n) => !n.trashed);
		this.mirrorToLS();
		Promise.all(ids.map((id) => deleteNote(id))).catch((err) =>
			this.recordPersistenceError('Could not empty trash', err)
		);
	}

	// Labels ---------------------------------------------------------------
	createLabel(name: string): Label | null {
		const trimmed = name.trim();
		if (!trimmed) return null;
		if (this.labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) return null;
		const now = Date.now();
		const label: Label = { id: uid(), name: trimmed, createdAt: now, updatedAt: now };
		this.labels = [...this.labels, label].sort((a, b) => a.name.localeCompare(b.name));
		this.mirrorToLS();
		putLabel(label).catch((err) => this.recordPersistenceError('Could not save label', err));
		this.markLabelsDirty();
		return label;
	}

	renameLabel(id: string, name: string): void {
		const trimmed = name.trim();
		if (!trimmed) return;
		const idx = this.labels.findIndex((l) => l.id === id);
		if (idx === -1) return;
		const renamed = { ...this.labels[idx], name: trimmed, updatedAt: Date.now() };
		this.labels[idx] = renamed;
		this.labels.sort((a, b) => a.name.localeCompare(b.name));
		this.mirrorToLS();
		putLabel(renamed).catch((err) => this.recordPersistenceError('Could not rename label', err));
		this.markLabelsDirty();
	}

	removeLabel(id: string, options: { deleteNotes?: boolean } = {}): void {
		if (!this.labels.some((label) => label.id === id)) return;
		const deletedAt = Date.now();
		const affected = this.notes.filter((note) => note.labels.includes(id));

		if (options.deleteNotes) {
			// Trash notes that carry this label (recoverable from Trash).
			this.notes = this.notes.map((note) => {
				if (!note.labels.includes(id)) return note;
				if (note.trashed) {
					return { ...note, labels: note.labels.filter((labelId) => labelId !== id), updatedAt: deletedAt };
				}
				return {
					...note,
					labels: note.labels.filter((labelId) => labelId !== id),
					trashed: true,
					trashedAt: deletedAt,
					pinned: false,
					updatedAt: deletedAt
				};
			});
			this.labels = this.labels.filter((label) => label.id !== id);
			this.mirrorToLS();
			deleteLabel(id).catch((err) => this.recordPersistenceError('Could not delete label', err));
			for (const note of affected) this.persist(note.id);
			this.markLabelsDeleted([id], deletedAt);
			return;
		}

		this.labels = this.labels.filter((label) => label.id !== id);
		const affectedNoteIds: string[] = [];
		this.notes = this.notes.map((note) => {
			if (!note.labels.includes(id)) return note;
			affectedNoteIds.push(note.id);
			return { ...note, labels: note.labels.filter((labelId) => labelId !== id), updatedAt: deletedAt };
		});
		this.mirrorToLS();
		deleteLabel(id).catch((err) => this.recordPersistenceError('Could not delete label', err));
		for (const noteId of affectedNoteIds) this.persist(noteId);
		this.markLabelsDeleted([id], deletedAt);
	}

	notesForLabel(id: string): Note[] {
		return this.activeNotes.filter((n) => n.labels.includes(id));
	}

	// Search ---------------------------------------------------------------
	search(query: string, pool?: Note[]): Note[] {
		const q = query.trim().toLowerCase();
		if (!q) return pool ?? this.activeNotes;
		const base = pool ?? this.activeNotes;
		return base.filter((n) => {
			const inTitle = n.title.toLowerCase().includes(q);
			const inBody = n.body.toLowerCase().includes(q);
			const inLabels = n.labels.some((lid) =>
				this.labels.find((l) => l.id === lid)?.name.toLowerCase().includes(q)
			);
			return inTitle || inBody || inLabels;
		});
	}

	// Backup ---------------------------------------------------------------
	async exportBackup(): Promise<{ notes: Note[]; labels: Label[] }> {
		return { notes: this.notes.map(cloneNote), labels: [...this.labels] };
	}

	async importBackup(data: { notes: Note[]; labels: Label[] }): Promise<void> {
		if (!data || !Array.isArray(data.notes) || !Array.isArray(data.labels)) return;
		await clearAllNotes();
		await clearAllLabels();
		await bulkPutNotes(data.notes);
		await bulkPutLabels(data.labels);
		this.notes = [...data.notes].sort((a, b) => b.updatedAt - a.updatedAt);
		this.labels = [...data.labels].sort((a, b) => a.name.localeCompare(b.name));
		this.mirrorToLS();
	}

	// Reload all three layers. Mirror is only a fast-boot cache; IDB always participates so
	// image blobs are rehydrated even when a mirror exists.
	async hardResync() {
		const mirrorNotes = readNotesMirror();
		const mirrorLabels = readLabelsMirror();
		try {
			const [dbNotes, dbLabels] = await Promise.all([getAllNotes(), getAllLabels()]);
			this.notes = mergeNoteLists(mirrorNotes, dbNotes).sort((a, b) => b.updatedAt - a.updatedAt);
			this.labels = mergeLabelLists(mirrorLabels, dbLabels).sort((a, b) => a.name.localeCompare(b.name));
			this.mirrorToLS();
		} catch (err) {
			this.recordPersistenceError('Could not refresh from IndexedDB', err);
		}
		this.purgeOldTrash();
	}

	// Persistence helpers --------------------------------------------------

	private markNotesDeleted(ids: string[]): void {
		if (ids.length === 0) return;
		const deletedAt = Date.now();
		for (const id of ids) this.deletedNoteIds[id] = deletedAt;
		writeTombstones(this.deletedNoteIds);
		this.dirty = true;
		this.scheduleSyncPush();
	}

	private markLabelsDeleted(ids: string[], deletedAt = Date.now()): void {
		if (ids.length === 0) return;
		for (const id of ids) this.deletedLabelIds[id] = deletedAt;
		writeLabelTombstones(this.deletedLabelIds);
		this.markLabelsDirty();
	}

	private markLabelsDirty(): void {
		this.dirty = true;
		this.scheduleSyncPush();
	}

	private mirrorToLS() {
		writeNotesMirror(this.notes);
		writeLabelsMirror(this.labels);
	}

	private recordPersistenceError(context: string, err: unknown): void {
		const detail = err instanceof Error ? err.message : String(err);
		this.lastPersistError = `${context}: ${detail}`;
		console.error(`[notes] ${context}`, err);
	}

	private syncPushTimer: ReturnType<typeof setTimeout> | null = null;
	private noteRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private noteRetryAttempts = new Map<string, number>();
	private dirty = false;

	private scheduleNoteRetry(id: string): void {
		if (this.noteRetryTimers.has(id)) return;
		const attempt = this.noteRetryAttempts.get(id) ?? 0;
		const delay = Math.min(30_000, 1_000 * 2 ** attempt);
		const timer = setTimeout(() => {
			this.noteRetryTimers.delete(id);
			const note = this.notes.find((item) => item.id === id);
			if (!note) return;
			putNote(note)
				.then(() => {
					this.noteRetryAttempts.delete(id);
					this.lastPersistError = null;
				})
				.catch((err) => {
					this.noteRetryAttempts.set(id, attempt + 1);
					this.recordPersistenceError(`Could not retry note ${id}`, err);
					this.scheduleNoteRetry(id);
				});
		}, delay);
		this.noteRetryTimers.set(id, timer);
	}

	private persist(id: string) {
		const note = this.notes.find((x) => x.id === id);
		if (!note) return;
		// Preserve a crash-safe, blob-free copy synchronously before async IDB work.
		this.mirrorToLS();
		putNote(note)
			.then(() => {
				this.lastPersistError = null;
			})
			.catch((err) => {
				this.recordPersistenceError(`Could not save note ${id}`, err);
				this.scheduleNoteRetry(id);
			});
		this.dirty = true;
		this.scheduleSyncPush();
	}

	private scheduleSyncPush() {
		if (this.syncPushTimer) clearTimeout(this.syncPushTimer);
		this.syncPushTimer = setTimeout(async () => {
			if (!this.dirty) return;
			const synced = await this.syncWithCloud();
			if (synced) {
				this.dirty = false;
			} else if (this.dirty) {
				this.scheduleSyncPush();
			}
		}, 5000);
	}

	// Replace this device's local data with the already-linked account without uploading any
	// local records or tombstones first. The cloud response is obtained before local storage is cleared.
	async replaceWithCloudManual(): Promise<boolean> {
		if (!syncStore.isLoggedIn) return false;
		try {
			const result = await syncStore.sync([], [], {}, {}, true);
			if (!result.success || !result.notes) {
				this.recordPersistenceError(result.error || 'Cloud sync returned no notes', result.error);
				return false;
			}
			const tombstones = result.tombstones ?? {};
			const labelTombstones = result.labelTombstones ?? {};
			const cloudNotes = (result.notes as Note[])
				.filter((note) => (Number(tombstones[note.id]) || 0) < note.updatedAt)
				.sort((a, b) => b.updatedAt - a.updatedAt);
			const cloudLabels = ((result.labels ?? []) as Label[])
				.filter((label) => (Number(labelTombstones[label.id]) || 0) < label.updatedAt)
				.sort((a, b) => a.name.localeCompare(b.name));

			await clearAllNotes();
			await clearAllLabels();
			await bulkPutNotes(cloudNotes);
			await bulkPutLabels(cloudLabels);
			this.notes = cloudNotes;
			this.labels = cloudLabels;
			this.seedLinkPreviewCache(cloudNotes);
			this.deletedNoteIds = { ...tombstones };
			this.deletedLabelIds = { ...labelTombstones };
			writeTombstones(this.deletedNoteIds);
			writeLabelTombstones(this.deletedLabelIds);
			this.mirrorToLS();
			this.dirty = false;
			this.lastPersistError = null;
			return true;
		} catch (err) {
			this.recordPersistenceError('Could not replace this device with cloud notes', err);
			return false;
		}
	}

	// Manual sync — caller shows UI feedback (spinning cloud icon).
	async syncWithCloudManual(): Promise<boolean> {
		return this.doSync(true);
	}

	// Auto sync — silent, no UI feedback.
	async syncWithCloud(): Promise<boolean> {
		return this.doSync(false);
	}

	// Core sync. Full note snapshots include images; local IDB remains the authoritative
	// device copy and the server applies deterministic per-record LWW merging.
	private async doSync(indicate = false): Promise<boolean> {
		if (!syncStore.isLoggedIn) return false;
		const localNotes = this.notes.map(cloneNote);
		const localLabels = [...this.labels];
		try {
			const result = await syncStore.sync(localNotes, localLabels, this.deletedNoteIds, this.deletedLabelIds, indicate);
			if (!result.success || !result.notes) {
				this.recordPersistenceError(result.error || 'Cloud sync returned no notes', result.error);
				return false;
			}

			const incomingTombstones = result.tombstones ?? {};
			for (const [id, deletedAt] of Object.entries(incomingTombstones)) {
				if ((Number(deletedAt) || 0) > (this.deletedNoteIds[id] || 0)) this.deletedNoteIds[id] = Number(deletedAt);
			}
			writeTombstones(this.deletedNoteIds);
			const incomingLabelTombstones = result.labelTombstones ?? {};
			for (const [id, deletedAt] of Object.entries(incomingLabelTombstones)) {
				if ((Number(deletedAt) || 0) > (this.deletedLabelIds[id] || 0)) this.deletedLabelIds[id] = Number(deletedAt);
			}
			writeLabelTombstones(this.deletedLabelIds);
			const remoteNotes = (result.notes as Note[])
				.filter((note) => (this.deletedNoteIds[note.id] || 0) < note.updatedAt);
			const localById = new Map(this.notes.map((note) => [note.id, note]));
			const remoteById = new Map(remoteNotes.map((note) => [note.id, note]));
			const mergedNotes = mergeNoteLists(this.notes, remoteNotes)
				.filter((note) => (this.deletedNoteIds[note.id] || 0) < note.updatedAt)
				.sort((a, b) => b.updatedAt - a.updatedAt);
			const remoteLabels = ((result.labels ?? []) as Label[])
				.filter((label) => (this.deletedLabelIds[label.id] || 0) < label.updatedAt);
			const mergedLabels = mergeLabelLists(this.labels, remoteLabels)
				.filter((label) => (this.deletedLabelIds[label.id] || 0) < label.updatedAt)
				.sort((a, b) => a.name.localeCompare(b.name));
			const labelsChanged = JSON.stringify(this.labels) !== JSON.stringify(mergedLabels);

			// Do not rewrite every IDB image blob after every sync. Persist only remote notes that
			// actually changed locally, including equal-timestamp rows that supplied missing image data.
			const notesToPersist = mergedNotes.filter((merged) => {
				const local = localById.get(merged.id);
				const remote = remoteById.get(merged.id);
				if (!local || !remote) return !local;
				if (remote.updatedAt > local.updatedAt) return true;
				const localImages = new Map((local.images ?? []).map((image) => [image.id, image]));
				return (merged.images ?? []).some((image) => {
					const previous = localImages.get(image.id);
					return !previous || (!previous.dataUrl.length && image.dataUrl.length > 0);
				});
			});

			const tombstonedLocalIds = this.notes
				.filter((note) => (this.deletedNoteIds[note.id] || 0) >= note.updatedAt)
				.map((note) => note.id);
			const tombstonedLocalLabelIds = this.labels
				.filter((label) => (this.deletedLabelIds[label.id] || 0) >= label.updatedAt)
				.map((label) => label.id);
			this.notes = mergedNotes;
			this.labels = mergedLabels;
			this.seedLinkPreviewCache(mergedNotes);
			this.mirrorToLS();
			for (const note of notesToPersist) await putNote(note);
			await Promise.all([
				...tombstonedLocalIds.map((id) => deleteNote(id)),
				...tombstonedLocalLabelIds.map((id) => deleteLabel(id)),
				...(labelsChanged ? [bulkPutLabels(mergedLabels)] : [])
			]);
			this.lastPersistError = null;
			return true;
		} catch (err) {
			this.recordPersistenceError('Cloud sync reconciliation failed', err);
			return false;
		}
	}

	// Seed -----------------------------------------------------------------
	private seedNotes(): Note[] {
		const now = Date.now();
		return [
			{
				id: uid(),
				title: 'Welcome to Shard 👋',
				body: 'Small note fragments, offline-first. Notes live on this device and sync when you sign in. Try pins, archive, colours, checklists, and reminders.',
				color: 'yellow',
				pinned: true,
				archived: false,
				trashed: false,
				trashedAt: null,
				createdAt: now,
				updatedAt: now,
				reminder: null,
				labels: []
			},
			{
				id: uid(),
				title: 'Groceries',
				body: '[x] Oat milk\n[ ] Sourdough bread\n[ ] Avocados\n[ ] Dark chocolate',
				color: 'green',
				pinned: false,
				archived: false,
				trashed: false,
				trashedAt: null,
				createdAt: now - 1000,
				updatedAt: now - 1000,
				reminder: null,
				labels: []
			},
			{
				id: uid(),
				title: 'Reading list',
				body: 'Antifragile — Taleb\nThe Beginning of Infinity — Deutsch',
				color: 'blue',
				pinned: false,
				archived: false,
				trashed: false,
				trashedAt: null,
				createdAt: now - 2000,
				updatedAt: now - 2000,
				reminder: null,
				labels: []
			}
		];
	}
}

export const notesStore = new NotesStore();
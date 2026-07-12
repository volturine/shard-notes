// Rune-based notes & labels store. Persists to IndexedDB via $effect.
import type { Note, Label, NoteColor, ChecklistItem } from '$lib/types';
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
	clearAllLabels,
	normalizeLabel
} from '$lib/db/idb';
import { mergeNoteLists, mergeTwoNotes, mergeLabelLists } from '$lib/noteMerge';
import { syncStore } from '$lib/stores/sync.svelte';
import { uid, daysSinceTrashed, TRASH_PURGE_DAYS, cloneNote } from '$lib/utils';
import { effectiveBody, noteImages, toggleLineAt } from '$lib/checklistBody';
import { readLabelsMirror, readNotesMirror, writeLabelsMirror, writeNotesMirror } from '$lib/noteStorage';

export class NotesStore {
	notes = $state<Note[]>([]);
	labels = $state<Label[]>([]);
	loaded = $state(false);
	lastPersistError = $state<string | null>(null);

	constructor() {
		this.notes = readNotesMirror();
		this.labels = readLabelsMirror().map(normalizeLabel);
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
		const mirrorLabels = this.labels.length ? this.labels : readLabelsMirror().map(normalizeLabel);
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
		const labels = mergeLabelLists(mirrorLabels, dbLabels)
			.map(normalizeLabel)
			.sort((a, b) => a.name.localeCompare(b.name));
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
		this.loaded = true;
	}

	private async rehydrateFromIDB() {
		try {
			const [dbNotes, dbLabels] = await Promise.all([getAllNotes(), getAllLabels()]);
			this.notes = mergeNoteLists(this.notes, dbNotes).sort((a, b) => b.updatedAt - a.updatedAt);
			this.labels = mergeLabelLists(this.labels, dbLabels)
				.map(normalizeLabel)
				.sort((a, b) => a.name.localeCompare(b.name));
			this.mirrorToLS();
		} catch (err) {
			this.recordPersistenceError('Could not rehydrate from IndexedDB', err);
		}
	}

	async flushNote(id: string, patch: Partial<Note> = {}): Promise<void> {
		const idx = this.notes.findIndex((x) => x.id === id);
		if (idx === -1) return;
		if (Object.keys(patch).length > 0) {
			this.notes[idx] = { ...this.notes[idx], ...patch, updatedAt: Date.now() };
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
			!effectiveBody(n).trim() &&
			!noteImages(n).some((i) => (i.dataUrl?.length ?? 0) > 0);
		if (!empty) return;
		this.deleteNoteForever(id);
	}

	/** Remove notes that have been in trash > 7 days. */
	purgeOldTrash() {
		const toPurge = this.notes.filter(
			(n) => n.trashed && daysSinceTrashed(n.trashedAt) >= TRASH_PURGE_DAYS
		);
		if (toPurge.length === 0) return;
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
			items: partial.items ?? [],
			kind: partial.kind ?? 'text',
			color: partial.color ?? 'default',
			pinned: partial.pinned ?? false,
			archived: false,
			trashed: false,
			trashedAt: null,
			createdAt: now,
			updatedAt: now,
			reminder: partial.reminder ?? null,
			labels: partial.labels ?? [],
			images: partial.images ?? []
		};
		this.notes = [note, ...this.notes];
		this.persist(note.id);
		return note;
	}

	updateNote(id: string, patch: Partial<Note>): void {
		const idx = this.notes.findIndex((n) => n.id === id);
		if (idx === -1) return;
		this.notes[idx] = { ...this.notes[idx], ...patch, updatedAt: Date.now() };
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

	toggleChecklistItem(noteId: string, itemId: string): void {
		const n = this.notes.find((x) => x.id === noteId);
		if (!n) return;
		const items = n.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i));
		this.updateNote(noteId, { items });
	}

	addChecklistItem(noteId: string, text: string): void {
		if (!text.trim()) return;
		const n = this.notes.find((x) => x.id === noteId);
		if (!n) return;
		const item: ChecklistItem = { id: uid(), text: text.trim(), checked: false };
		this.updateNote(noteId, { items: [...n.items, item] });
	}

	updateChecklistItem(noteId: string, itemId: string, text: string): void {
		const n = this.notes.find((x) => x.id === noteId);
		if (!n) return;
		const items = n.items.map((i) => (i.id === itemId ? { ...i, text } : i));
		this.updateNote(noteId, { items });
	}

	deleteChecklistItem(noteId: string, itemId: string): void {
		const n = this.notes.find((x) => x.id === noteId);
		if (!n) return;
		this.updateNote(noteId, { items: n.items.filter((i) => i.id !== itemId) });
	}

	reorderChecklistItems(noteId: string, items: ChecklistItem[]): void {
		this.updateNote(noteId, { items });
	}

	/** Toggle `[ ]` / `[x]` line in unified body text. */
	toggleBodyChecklistLine(noteId: string, lineIndex: number): void {
		const n = this.notes.find((x) => x.id === noteId);
		if (!n) return;
		const body = toggleLineAt(effectiveBody(n), lineIndex);
		this.updateNote(noteId, { body, kind: 'text', items: [] });
	}

	setNoteKind(id: string, kind: 'text' | 'list'): void {
		const n = this.notes.find((x) => x.id === id);
		if (!n) return;
		// When converting text -> list, push body text as the first item if present.
		if (kind === 'list' && n.kind === 'text' && n.body.trim()) {
			this.updateNote(id, {
				kind,
				body: '',
				items: n.items.length
					? n.items
					: [{ id: uid(), text: n.body.trim(), checked: false }]
			});
			return;
		}
		if (kind === 'text' && n.kind === 'list') {
			this.updateNote(id, { kind, items: [], body: n.body });
		}
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
		this.notes = this.notes.filter((n) => n.id !== id);
		this.mirrorToLS();
		deleteNote(id).catch((err) => this.recordPersistenceError(`Could not delete note ${id}`, err));
	}

	emptyTrash(): void {
		const ids = this.trashedNotes.map((n) => n.id);
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
	}

	removeLabel(id: string): void {
		this.labels = this.labels.filter((l) => l.id !== id);
		this.notes = this.notes.map((n) =>
			n.labels.includes(id) ? { ...n, labels: n.labels.filter((l) => l !== id) } : n
		);
		this.mirrorToLS();
		deleteLabel(id).catch((err) => this.recordPersistenceError('Could not delete label', err));
		this.notes.forEach((n) => this.persist(n.id));
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
			const inItems = n.items.some((i) => i.text.toLowerCase().includes(q));
			const inLabels = n.labels.some((lid) =>
				this.labels.find((l) => l.id === lid)?.name.toLowerCase().includes(q)
			);
			return inTitle || inBody || inItems || inLabels;
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
		this.labels = data.labels.map(normalizeLabel).sort((a, b) => a.name.localeCompare(b.name));
		this.mirrorToLS();
	}

	// Reload all three layers. Mirror is only a fast-boot cache; IDB always participates so
	// image blobs are rehydrated even when a mirror exists.
	async hardResync() {
		const mirrorNotes = readNotesMirror();
		const mirrorLabels = readLabelsMirror().map(normalizeLabel);
		try {
			const [dbNotes, dbLabels] = await Promise.all([getAllNotes(), getAllLabels()]);
			this.notes = mergeNoteLists(mirrorNotes, dbNotes).sort((a, b) => b.updatedAt - a.updatedAt);
			this.labels = mergeLabelLists(mirrorLabels, dbLabels)
				.map(normalizeLabel)
				.sort((a, b) => a.name.localeCompare(b.name));
			this.mirrorToLS();
		} catch (err) {
			this.recordPersistenceError('Could not refresh from IndexedDB', err);
		}
		this.purgeOldTrash();
	}

	// Persistence helpers --------------------------------------------------

	private mirrorToLS() {
		writeNotesMirror(this.notes);
		writeLabelsMirror(this.labels.map(normalizeLabel));
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
		const localLabels = this.labels.map(normalizeLabel);
		try {
			const result = await syncStore.sync(localNotes, localLabels, indicate);
			if (!result.success || !result.notes) {
				this.recordPersistenceError(result.error || 'Cloud sync returned no notes', result.error);
				return false;
			}

			const remoteNotes = result.notes as Note[];
			const localById = new Map(this.notes.map((note) => [note.id, note]));
			const remoteById = new Map(remoteNotes.map((note) => [note.id, note]));
			const mergedNotes = mergeNoteLists(this.notes, remoteNotes)
				.sort((a, b) => b.updatedAt - a.updatedAt);
			const mergedLabels = mergeLabelLists(this.labels, (result.labels ?? []) as Label[])
				.map(normalizeLabel)
				.sort((a, b) => a.name.localeCompare(b.name));
			const labelsChanged = JSON.stringify(this.labels) !== JSON.stringify(mergedLabels);

			// Do not rewrite every IDB image blob after every sync. Persist only remote notes that
			// actually changed locally, including equal-timestamp rows that supplied missing image data.
			const notesToPersist = mergedNotes.filter((merged) => {
				const local = localById.get(merged.id);
				const remote = remoteById.get(merged.id);
				if (!local || !remote) return !local;
				if (remote.updatedAt > local.updatedAt) return true;
				const localHasImageData = (local.images ?? []).some((image) => image.dataUrl.length > 0);
				const mergedHasImageData = (merged.images ?? []).some((image) => image.dataUrl.length > 0);
				return !localHasImageData && mergedHasImageData;
			});

			this.notes = mergedNotes;
			this.labels = mergedLabels;
			this.mirrorToLS();
			await Promise.all([
				...notesToPersist.map((note) => putNote(note)),
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
				items: [],
				kind: 'text',
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
				body: '',
				items: [
					{ id: uid(), text: 'Oat milk', checked: true },
					{ id: uid(), text: 'Sourdough bread', checked: false },
					{ id: uid(), text: 'Avocados', checked: false },
					{ id: uid(), text: 'Dark chocolate', checked: false }
				],
				kind: 'list',
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
				items: [],
				kind: 'text',
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
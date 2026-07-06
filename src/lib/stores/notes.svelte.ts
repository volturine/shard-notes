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
	clearAllLabels
} from '$lib/db/idb';
import { uid, daysSinceTrashed, TRASH_PURGE_DAYS, cloneNote } from '$lib/utils';
import { effectiveBody, noteImages, toggleLineAt } from '$lib/checklistBody';
import { mergeNoteLists, mergeTwoNotes } from '$lib/noteMerge';
import { syncStore } from '$lib/stores/sync.svelte';
import { finishSyncCloudIndicator } from '$lib/syncCloudIndicator';
import { noteForLocalStorage, stripMirrorPayload, clearOversizedNoteStorage } from '$lib/noteStorage';

const SAVE_DEBOUNCE_MS = 250;

const LS_NOTES_MIRROR = 'gkc-notes-mirror';
const LS_LABELS_MIRROR = 'gkc-labels-mirror';

// No more free function — mirrorToLS is now a private method on the class.

export class NotesStore {
	notes = $state<Note[]>([]);
	labels = $state<Label[]>([]);
	loaded = $state(false);

	// Synchronous load from localStorage — runs before first render so notes
	// appear instantly with no async gap / flicker.
	constructor() {
		if (typeof localStorage === 'undefined') return;
		clearOversizedNoteStorage();
		try {
			const mNotes = localStorage.getItem(LS_NOTES_MIRROR);
			if (mNotes) {
				const parsed = stripMirrorPayload(mNotes);
				if (parsed === null) {
					console.warn('[notes] Clearing corrupt/oversized notes mirror');
					localStorage.removeItem(LS_NOTES_MIRROR);
				} else {
					this.notes = parsed;
				}
			}
			const mLabels = localStorage.getItem(LS_LABELS_MIRROR);
			if (mLabels) {
				try {
					this.labels = JSON.parse(mLabels) as Label[];
				} catch {
					localStorage.removeItem(LS_LABELS_MIRROR);
				}
			}
			if (this.notes.length > 0) this.loaded = true;
		} catch (err) {
			console.error('[notes] constructor LS load:', err);
			try {
				localStorage.removeItem(LS_NOTES_MIRROR);
			} catch {}
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
		if (this.notes.length > 0) {
			this.loaded = true;
			await this.rehydrateFromIDB();
			return;
		}

		let notes: Note[] = [];
		let labels: Label[] = [];
		if (typeof localStorage !== 'undefined') {
			try {
				const mNotes = localStorage.getItem(LS_NOTES_MIRROR);
				if (mNotes) {
					const parsed = stripMirrorPayload(mNotes);
					if (parsed) notes = parsed;
				}
				const mLabels = localStorage.getItem(LS_LABELS_MIRROR);
				if (mLabels) labels = JSON.parse(mLabels) as Label[];
			} catch {}
		}

		try {
			const [dbNotes, dbLabels] = await Promise.all([getAllNotes(), getAllLabels()]);
			notes = mergeNoteLists(notes, dbNotes);
			if (labels.length === 0) labels = dbLabels;
		} catch {}

		const seededFlag = typeof localStorage !== 'undefined' ? localStorage.getItem('gkc-seeded') : null;
		if (notes.length === 0 && labels.length === 0 && !seededFlag) {
			localStorage.setItem('gkc-seeded', '1');
			const seed = this.seedNotes();
			this.notes = seed;
			this.mirrorToLS();
			Promise.all(seed.map((n) => putNote(n))).catch(() => {});
		} else {
			this.notes = notes.sort((a, b) => b.updatedAt - a.updatedAt);
			this.labels = labels.sort((a, b) => a.name.localeCompare(b.name));
		}
		this.purgeOldTrash();
		this.loaded = true;
	}

	private async rehydrateFromIDB() {
		try {
			const dbNotes = await getAllNotes();
			if (!dbNotes.length) return;
			const merged = mergeNoteLists(this.notes, dbNotes);
			this.notes = merged.sort((a, b) => b.updatedAt - a.updatedAt);
		} catch (err) {
			console.error('[notes] rehydrateFromIDB:', err);
		}
	}

	async flushNote(id: string): Promise<void> {
		const n = this.notes.find((x) => x.id === id);
		if (!n) return;
		if (this.mirrorTimer) {
			clearTimeout(this.mirrorTimer);
			this.mirrorTimer = null;
		}
		await putNote(n);
		this.mirrorToLS();
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
		Promise.all(toPurge.map((p) => deleteNote(p.id))).catch(() => {});
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
		deleteNote(id).catch(() => {});
	}

	emptyTrash(): void {
		const ids = this.trashedNotes.map((n) => n.id);
		this.notes = this.notes.filter((n) => !n.trashed);
		this.mirrorToLS();
		Promise.all(ids.map((id) => deleteNote(id))).catch(() => {});
	}

	// Labels ---------------------------------------------------------------
	createLabel(name: string): Label | null {
		const trimmed = name.trim();
		if (!trimmed) return null;
		if (this.labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) return null;
		const label: Label = { id: uid(), name: trimmed, createdAt: Date.now() };
		this.labels = [...this.labels, label].sort((a, b) => a.name.localeCompare(b.name));
		putLabel(label).catch(() => {});
		return label;
	}

	renameLabel(id: string, name: string): void {
		const trimmed = name.trim();
		if (!trimmed) return;
		const idx = this.labels.findIndex((l) => l.id === id);
		if (idx === -1) return;
		this.labels[idx] = { ...this.labels[idx], name: trimmed };
		this.labels.sort((a, b) => a.name.localeCompare(b.name));
		putLabel(this.labels[idx]).catch(() => {});
	}

	removeLabel(id: string): void {
		this.labels = this.labels.filter((l) => l.id !== id);
		this.notes = this.notes.map((n) =>
			n.labels.includes(id) ? { ...n, labels: n.labels.filter((l) => l !== id) } : n
		);
		this.mirrorToLS();
		deleteLabel(id).catch(() => {});
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
		this.labels = [...data.labels].sort((a, b) => a.name.localeCompare(b.name));
	}

	// Hard resync: re-read from localStorage mirror + IDB without re-seeding.
	// Used by the refresh button. Does NOT reload the page or trigger theme switch.
	async hardResync() {
		let notes: Note[] = [];
		let labels: Label[] = [];

		// 1. localStorage mirror first (sync, always up-to-date).
		if (typeof localStorage !== "undefined") {
			try {
				const mNotes = localStorage.getItem(LS_NOTES_MIRROR);
				if (mNotes) {
					const parsed = stripMirrorPayload(mNotes);
					if (parsed) notes = parsed;
				}
				const mLabels = localStorage.getItem(LS_LABELS_MIRROR);
				if (mLabels) labels = JSON.parse(mLabels) as Label[];
			} catch {}
		}

		// 2. If localStorage empty, try IDB.
		if (notes.length === 0) {
			try {
				const [dbNotes, dbLabels] = await Promise.all([getAllNotes(), getAllLabels()]);
				notes = dbNotes;
				if (labels.length === 0) labels = dbLabels;
			} catch {}
		}

		// 3. If still empty and never seeded, seed.
		const seededFlag = typeof localStorage !== "undefined" ? localStorage.getItem("gkc-seeded") : null;
		if (notes.length === 0 && labels.length === 0 && !seededFlag) {
			localStorage.setItem("gkc-seeded", "1");
			const seed = this.seedNotes();
			this.notes = seed;
			this.mirrorToLS();
			Promise.all(seed.map((n) => putNote(n))).catch(() => {});
		} else if (notes.length > 0) {
			this.notes = notes.sort((a, b) => b.updatedAt - a.updatedAt);
			if (labels.length > 0) this.labels = labels.sort((a, b) => a.name.localeCompare(b.name));
		}
		this.purgeOldTrash();
	}

	// Persistence helpers --------------------------------------------------

	private mirrorToLS() {
		if (typeof localStorage === 'undefined') return;
		try {
			const notesSnapshot = this.notes.map((n) => noteForLocalStorage(n));
			const labelsSnapshot = JSON.parse(JSON.stringify(this.labels));
			localStorage.setItem(LS_NOTES_MIRROR, JSON.stringify(notesSnapshot));
			localStorage.setItem(LS_LABELS_MIRROR, JSON.stringify(labelsSnapshot));
		} catch (err) {
			console.error('[notes] mirrorToLS error:', err);
		}
	}

	private syncPushTimer: ReturnType<typeof setTimeout> | null = null;
	private mirrorTimer: ReturnType<typeof setTimeout> | null = null;
	private dirty = false; // tracks if notes changed since last sync

	private persist(id: string) {
		const n = this.notes.find((x) => x.id === id);
		if (!n) return;
		putNote(n).catch((err) => console.error('[notes] putNote error:', err));
		// Debounce the localStorage mirror.
		if (this.mirrorTimer) clearTimeout(this.mirrorTimer);
		this.mirrorTimer = setTimeout(() => {
			this.mirrorToLS();
		}, 300);
		// Mark dirty and schedule a cloud sync (5s debounce).
		this.dirty = true;
		this.scheduleSyncPush();
	}

	private scheduleSyncPush() {
		if (this.syncPushTimer) clearTimeout(this.syncPushTimer);
		this.syncPushTimer = setTimeout(async () => {
			if (!this.dirty) return;
			this.dirty = false;
			await this.syncWithCloud();
		}, 5000);
	}

	// Manual sync — caller shows UI feedback (spinning cloud icon).
	async syncWithCloudManual(): Promise<boolean> {
		return this.doSync();
	}

	// Auto sync — silent, no UI feedback.
	async syncWithCloud(): Promise<boolean> {
		return this.doSync();
	}

	// Core sync — surgical updates, only touches notes that actually changed.
	private async doSync(): Promise<boolean> {
		if (!syncStore.isLoggedIn) return false;
		const localNotes = JSON.parse(JSON.stringify(this.notes));
		const localLabels = JSON.parse(JSON.stringify(this.labels));
		try {
			const result = await syncStore.sync(localNotes, localLabels);
			if (!result.success || !result.notes) return false;

			const remoteMap = new Map<string, Note>();
			for (const n of result.notes as Note[]) remoteMap.set(n.id, n);

			let updatedCount = 0;

			for (let i = 0; i < this.notes.length; i++) {
				const remote = remoteMap.get(this.notes[i].id);
				if (remote) {
					remoteMap.delete(this.notes[i].id);
					if (remote.updatedAt > this.notes[i].updatedAt) {
						this.notes[i] = mergeTwoNotes(this.notes[i], remote);
						updatedCount++;
					} else if (remote.updatedAt < this.notes[i].updatedAt) {
						// keep local but ensure images not lost if remote had blobs
						this.notes[i] = mergeTwoNotes(remote, this.notes[i]);
					}
				}
			}

			const newNotes = Array.from(remoteMap.values());

			const remoteLabelsSorted = (result.labels || []).sort((a, b) => a.name.localeCompare(b.name));
			const labelsChanged = JSON.stringify(remoteLabelsSorted) !== JSON.stringify(this.labels);

			if (updatedCount === 0 && newNotes.length === 0 && !labelsChanged) {
				return true;
			}

			if (newNotes.length > 0) {
				this.notes = [...this.notes, ...newNotes];
			}

			if (newNotes.length > 0 || updatedCount > 0) {
				this.notes = this.notes.sort((a, b) => b.updatedAt - a.updatedAt);
			}

			if (labelsChanged) {
				this.labels = remoteLabelsSorted;
			}

			this.mirrorToLS();
			bulkPutNotes(this.notes).catch(() => {});
			bulkPutLabels(this.labels).catch(() => {});
			return true;
		} finally {
			finishSyncCloudIndicator(syncStore);
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
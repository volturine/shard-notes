// Offline-first persistence with IndexedDB primary + localStorage fallback.
// Full image blobs live in a dedicated IDB store (not in LS mirrors).

import { openDB, type IDBPDatabase } from 'idb';
import type { Note, Label, NoteImage } from '$lib/types';
import { noteForLocalStorage } from '$lib/noteStorage';
import { blobToDataUrl, dataUrlToBlob } from '$lib/imageBlob';

const DB_NAME = 'google-keep-clone';
const DB_VERSION = 3;
const NOTES_STORE = 'notes';
const LABELS_STORE = 'labels';
const IMAGES_STORE = 'note-images';

const LS_NOTES_KEY = 'gkc-notes';
const LS_LABELS_KEY = 'gkc-labels';

type ImageRow = {
	noteId: string;
	id: string;
	mime: string;
	name?: string;
	createdAt: number;
	blob?: Blob;
	/** @deprecated legacy rows */
	dataUrl?: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;
let dbAvailable = true;
const putChains = new Map<string, Promise<void>>();

function imageKey(noteId: string, imageId: string): string {
	return `${noteId}::${imageId}`;
}

function getDB(): Promise<IDBPDatabase> {
	if (!dbAvailable) return Promise.reject(new Error('IDB unavailable'));
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(NOTES_STORE)) {
					db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains(LABELS_STORE)) {
					db.createObjectStore(LABELS_STORE, { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains(IMAGES_STORE)) {
					db.createObjectStore(IMAGES_STORE);
				}
			}
		});
		dbPromise.catch(() => {
			dbAvailable = false;
		});
	}
	return dbPromise;
}

function lsRead<T>(key: string): T[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T[]) : [];
	} catch {
		return [];
	}
}

function lsWrite<T>(key: string, items: T[]): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(key, JSON.stringify(items));
	} catch (err) {
		console.error('[idb] lsWrite failed (quota?):', key, err);
	}
}

function lsUpsertNote(note: Note): void {
	const items = lsRead<Note>(LS_NOTES_KEY);
	const light = noteForLocalStorage(note) as Note;
	const idx = items.findIndex((x) => x.id === note.id);
	if (idx >= 0) items[idx] = light;
	else items.push(light);
	lsWrite(LS_NOTES_KEY, items);
}

function lsUpsert<T extends { id: string }>(key: string, item: T): T[] {
	const items = lsRead<T>(key);
	const idx = items.findIndex((x) => x.id === item.id);
	if (idx >= 0) items[idx] = item;
	else items.push(item);
	lsWrite(key, items);
	return items;
}

function lsRemove<T extends { id: string }>(key: string, id: string): T[] {
	const items = lsRead<T>(key).filter((x) => x.id !== id);
	lsWrite(key, items);
	return items;
}

function noteLeanForIdb(note: Note): Note {
	return detachNote(note);
}

/** Plain objects only — Svelte $state proxies break structuredClone / IDB. */
function detachNote(note: Note): Note {
	return {
		id: String(note.id),
		title: String(note.title ?? ''),
		body: String(note.body ?? ''),
		items: (note.items ?? []).map((i) => ({
			id: String(i.id),
			text: String(i.text ?? ''),
			checked: Boolean(i.checked)
		})),
		kind: note.kind === 'list' ? 'list' : 'text',
		color: note.color,
		pinned: Boolean(note.pinned),
		archived: Boolean(note.archived),
		trashed: Boolean(note.trashed),
		trashedAt: note.trashedAt ?? null,
		createdAt: Number(note.createdAt),
		updatedAt: Number(note.updatedAt),
		reminder: note.reminder ?? null,
		labels: [...(note.labels ?? [])],
		images: (note.images ?? []).map((img) => ({
			id: String(img.id),
			mime: String(img.mime ?? 'image/jpeg'),
			name: img.name != null ? String(img.name) : undefined,
			createdAt: Number(img.createdAt),
			dataUrl: ''
		}))
	};
}

function plainImages(note: Note): NoteImage[] {
	return (note.images ?? []).map((img) => ({
		id: String(img.id),
		mime: String(img.mime ?? 'image/jpeg'),
		dataUrl: String(img.dataUrl ?? ''),
		name: img.name != null ? String(img.name) : undefined,
		createdAt: Number(img.createdAt)
	}));
}

async function blobFromStoredValue(val: unknown): Promise<Blob | null> {
	if (val instanceof Blob) return val;
	if (val && typeof val === 'object' && 'blob' in val && (val as ImageRow).blob instanceof Blob) {
		return (val as ImageRow).blob!;
	}
	return null;
}

async function hydrateOneImage(
	db: IDBPDatabase,
	noteId: string,
	meta: NoteImage
): Promise<NoteImage | null> {
	if (meta.dataUrl && meta.dataUrl.length > 20) {
		return {
			id: meta.id,
			mime: meta.mime,
			dataUrl: meta.dataUrl,
			name: meta.name,
			createdAt: meta.createdAt
		};
	}
	const key = imageKey(noteId, meta.id);
	const stored = await db.get(IMAGES_STORE, key);
	const blob = await blobFromStoredValue(stored);
	if (blob) {
		const dataUrl = await blobToDataUrl(blob);
		return { id: meta.id, mime: meta.mime || blob.type, dataUrl, name: meta.name, createdAt: meta.createdAt };
	}
	if (stored && typeof stored === 'object') {
		return rowToNoteImage(stored as ImageRow);
	}
	return null;
}

async function rowToNoteImage(row: ImageRow): Promise<NoteImage | null> {
	if (row.blob) {
		const dataUrl = await blobToDataUrl(row.blob);
		return { id: row.id, mime: row.mime, dataUrl, name: row.name, createdAt: row.createdAt };
	}
	if (row.dataUrl && row.dataUrl.length > 20) {
		return { id: row.id, mime: row.mime, dataUrl: row.dataUrl, name: row.name, createdAt: row.createdAt };
	}
	return null;
}

async function hydrateNoteImages(db: IDBPDatabase, note: Note): Promise<Note> {
	const metas = note.images ?? [];
	const hydrated: NoteImage[] = [];

	for (const meta of metas) {
		const img = await hydrateOneImage(db, note.id, meta);
		if (img) hydrated.push(img);
	}

	if (hydrated.length === 0) {
		const keys = await db.getAllKeys(IMAGES_STORE);
		for (const key of keys) {
			const k = String(key);
			if (!k.startsWith(`${note.id}::`)) continue;
			const imageId = k.slice(note.id.length + 2);
			const meta: NoteImage = {
				id: imageId,
				mime: 'image/jpeg',
				dataUrl: '',
				createdAt: note.updatedAt
			};
			const img = await hydrateOneImage(db, note.id, meta);
			if (img) hydrated.push(img);
		}
	}

	return { ...note, images: hydrated };
}

async function writeImageBlobs(db: IDBPDatabase, note: Note): Promise<void> {
	const imgs = plainImages(note);
	const entries: { key: string; blob: Blob }[] = [];
	for (const img of imgs) {
		if (!img.dataUrl) continue;
		const blob = await dataUrlToBlob(img.dataUrl);
		entries.push({ key: imageKey(note.id, img.id), blob });
	}

	const prefix = `${note.id}::`;
	const keys = await db.getAllKeys(IMAGES_STORE);
	const toDelete = keys.filter((k) => String(k).startsWith(prefix));

	const tx = db.transaction(IMAGES_STORE, 'readwrite');
	const store = tx.store;
	for (const key of toDelete) {
		store.delete(key);
	}
	for (const { key, blob } of entries) {
		store.put(blob, key);
	}
	await tx.done;
}

async function deleteImageBlobsForNote(db: IDBPDatabase, noteId: string): Promise<void> {
	const prefix = `${noteId}::`;
	const keys = await db.getAllKeys(IMAGES_STORE);
	const tx = db.transaction(IMAGES_STORE, 'readwrite');
	for (const key of keys) {
		if (String(key).startsWith(prefix)) await tx.store.delete(key);
	}
	await tx.done;
}

export async function getAllNotes(): Promise<Note[]> {
	if (dbAvailable) {
		try {
			const db = await getDB();
			const lean = (await db.getAll(NOTES_STORE)) as Note[];
			if (lean.length > 0) {
				const full = await Promise.all(lean.map((n) => hydrateNoteImages(db, n)));
				lsWrite(LS_NOTES_KEY, full.map((n) => noteForLocalStorage(n) as Note));
				return full;
			}
		} catch (err) {
			console.error('[idb] getAllNotes:', err);
		}
	}
	return lsRead<Note>(LS_NOTES_KEY);
}

async function putNoteInner(note: Note): Promise<void> {
	const plain = detachNote(note);
	lsUpsertNote(plain);
	if (!dbAvailable) {
		throw new Error('IndexedDB is not available in this browser tab');
	}
	const db = await getDB();
	await db.put(NOTES_STORE, plain);
	await writeImageBlobs(db, note);
}

export async function putNote(note: Note): Promise<void> {
	const prev = putChains.get(note.id) ?? Promise.resolve();
	const run = prev
		.catch(() => {})
		.then(() => putNoteInner(note));
	putChains.set(note.id, run);
	try {
		await run;
	} catch (err) {
		console.error('[idb] putNote failed:', note.id, err);
		throw err;
	} finally {
		if (putChains.get(note.id) === run) putChains.delete(note.id);
	}
}

export async function deleteNote(id: string): Promise<void> {
	lsRemove<Note>(LS_NOTES_KEY, id);
	if (dbAvailable) {
		try {
			const db = await getDB();
			await db.delete(NOTES_STORE, id);
			await deleteImageBlobsForNote(db, id);
		} catch {
			/* ignore */
		}
	}
}

export async function getAllLabels(): Promise<Label[]> {
	if (dbAvailable) {
		try {
			const db = await getDB();
			const fromDB = (await db.getAll(LABELS_STORE)) as Label[];
			if (fromDB.length > 0) {
				lsWrite(LS_LABELS_KEY, fromDB);
				return fromDB;
			}
		} catch {
			/* fall through */
		}
	}
	return lsRead<Label>(LS_LABELS_KEY);
}

export async function putLabel(label: Label): Promise<void> {
	lsUpsert(LS_LABELS_KEY, label);
	if (dbAvailable) {
		try {
			const db = await getDB();
			await db.put(LABELS_STORE, label);
		} catch {
			/* ignore */
		}
	}
}

export async function deleteLabel(id: string): Promise<void> {
	lsRemove<Label>(LS_LABELS_KEY, id);
	if (dbAvailable) {
		try {
			const db = await getDB();
			await db.delete(LABELS_STORE, id);
		} catch {
			/* ignore */
		}
	}
}

export async function bulkPutNotes(notes: Note[]): Promise<void> {
	lsWrite(LS_NOTES_KEY, notes.map((n) => noteForLocalStorage(n) as Note));
	if (dbAvailable) {
		try {
			const db = await getDB();
			for (const n of notes) {
				const plain = detachNote(n);
				await db.put(NOTES_STORE, plain);
				await writeImageBlobs(db, n);
			}
		} catch (err) {
			console.error('[idb] bulkPutNotes:', err);
		}
	}
}

export async function bulkPutLabels(labels: Label[]): Promise<void> {
	lsWrite(LS_LABELS_KEY, labels);
	if (dbAvailable) {
		try {
			const db = await getDB();
			const tx = db.transaction(LABELS_STORE, 'readwrite');
			await Promise.all(labels.map((l) => tx.store.put(l)));
			await tx.done;
		} catch {
			/* ignore */
		}
	}
}

export async function clearAllNotes(): Promise<void> {
	lsWrite(LS_NOTES_KEY, []);
	if (dbAvailable) {
		try {
			const db = await getDB();
			await db.clear(NOTES_STORE);
			await db.clear(IMAGES_STORE);
		} catch {
			/* ignore */
		}
	}
}

export async function clearAllLabels(): Promise<void> {
	lsWrite(LS_LABELS_KEY, []);
	if (dbAvailable) {
		try {
			const db = await getDB();
			await db.clear(LABELS_STORE);
		} catch {
			/* ignore */
		}
	}
}
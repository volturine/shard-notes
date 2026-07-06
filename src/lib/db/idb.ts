// Offline-first persistence with IndexedDB primary + localStorage fallback.
// Full image blobs live in a dedicated IDB store (not in LS mirrors).

import { openDB, type IDBPDatabase } from 'idb';
import type { Note, Label, NoteImage } from '$lib/types';
import { noteForLocalStorage } from '$lib/noteStorage';

const DB_NAME = 'google-keep-clone';
const DB_VERSION = 2;
const NOTES_STORE = 'notes';
const LABELS_STORE = 'labels';
const IMAGES_STORE = 'note-images';

const LS_NOTES_KEY = 'gkc-notes';
const LS_LABELS_KEY = 'gkc-labels';

type ImageRow = NoteImage & { noteId: string };

let dbPromise: Promise<IDBPDatabase> | null = null;
let dbAvailable = true;

function imageKey(noteId: string, imageId: string): string {
	return `${noteId}::${imageId}`;
}

function getDB(): Promise<IDBPDatabase> {
	if (!dbAvailable) return Promise.reject(new Error('IDB unavailable'));
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion) {
				if (!db.objectStoreNames.contains(NOTES_STORE)) {
					db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains(LABELS_STORE)) {
					db.createObjectStore(LABELS_STORE, { keyPath: 'id' });
				}
				if (oldVersion < 2 && !db.objectStoreNames.contains(IMAGES_STORE)) {
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
	const images = (note.images ?? []).map((img) => ({
		id: img.id,
		mime: img.mime,
		name: img.name,
		createdAt: img.createdAt,
		dataUrl: img.dataUrl?.length ? '' : ''
	}));
	return { ...note, images };
}

async function hydrateNoteImages(db: IDBPDatabase, note: Note): Promise<Note> {
	const metas = note.images ?? [];
	const hydrated: NoteImage[] = [];

	for (const meta of metas) {
		if (meta.dataUrl && meta.dataUrl.length > 20) {
			hydrated.push(meta);
			continue;
		}
		const row = (await db.get(IMAGES_STORE, imageKey(note.id, meta.id))) as ImageRow | undefined;
		if (row?.dataUrl) {
			hydrated.push({
				id: row.id,
				mime: row.mime,
				dataUrl: row.dataUrl,
				name: row.name,
				createdAt: row.createdAt
			});
		}
	}

	if (hydrated.length === 0) {
		const keys = await db.getAllKeys(IMAGES_STORE);
		for (const key of keys) {
			const k = String(key);
			if (!k.startsWith(`${note.id}::`)) continue;
			const row = (await db.get(IMAGES_STORE, key)) as ImageRow | undefined;
			if (row?.dataUrl) {
				hydrated.push({
					id: row.id,
					mime: row.mime,
					dataUrl: row.dataUrl,
					name: row.name,
					createdAt: row.createdAt
				});
			}
		}
	}

	return { ...note, images: hydrated };
}

async function writeImageBlobs(db: IDBPDatabase, note: Note): Promise<void> {
	const prefix = `${note.id}::`;
	const keys = await db.getAllKeys(IMAGES_STORE);
	const tx = db.transaction(IMAGES_STORE, 'readwrite');
	const store = tx.store;
	for (const key of keys) {
		if (String(key).startsWith(prefix)) await store.delete(key);
	}
	for (const img of note.images ?? []) {
		if (!img.dataUrl) continue;
		const row: ImageRow = { noteId: note.id, ...img };
		await store.put(row, imageKey(note.id, img.id));
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

export async function putNote(note: Note): Promise<void> {
	lsUpsertNote(note);
	if (!dbAvailable) return;
	try {
		const db = await getDB();
		await db.put(NOTES_STORE, noteLeanForIdb(note));
		await writeImageBlobs(db, note);
	} catch (err) {
		console.error('[idb] putNote failed:', note.id, err);
		throw err;
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
				await db.put(NOTES_STORE, noteLeanForIdb(n));
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
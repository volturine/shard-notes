// Offline-first persistence with IndexedDB primary + localStorage fallback.
//
// Why the fallback: iOS Safari (especially Private Browsing, but also some
// normal-mode contexts on HTTP origins) either throws on IndexedDB open or
// silently drops data on reload. localStorage is reliable on iOS across
// reloads in normal mode and at least survives the session in private mode.
// We dual-write so reads can fall back without data loss.

import { openDB, type IDBPDatabase } from 'idb';
import type { Note, Label } from '$lib/types';

const DB_NAME = 'google-keep-clone';
const DB_VERSION = 1;
const NOTES_STORE = 'notes';
const LABELS_STORE = 'labels';

const LS_NOTES_KEY = 'gkc-notes';
const LS_LABELS_KEY = 'gkc-labels';

let dbPromise: Promise<IDBPDatabase> | null = null;
let dbAvailable = true; // flipped to false if openDB ever rejects

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
			}
		});
		// If open fails (e.g. iOS private browsing), mark IDB unavailable so
		// all subsequent ops skip straight to the localStorage fallback.
		dbPromise.catch(() => {
			dbAvailable = false;
		});
	}
	return dbPromise;
}

// --- localStorage helpers (always sync, always available on browsers) ---
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
	} catch {
		/* quota / private mode — best effort */
	}
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

// --- Notes ---
export async function getAllNotes(): Promise<Note[]> {
	// Try IDB first.
	if (dbAvailable) {
		try {
			const db = await getDB();
			const fromDB = (await db.getAll(NOTES_STORE)) as Note[];
			if (fromDB.length > 0) {
				// Mirror to localStorage so the fallback stays warm.
				lsWrite(LS_NOTES_KEY, fromDB);
				return fromDB;
			}
		} catch {
			/* fall through to localStorage */
		}
	}
	// Fallback: read from localStorage.
	return lsRead<Note>(LS_NOTES_KEY);
}

export async function putNote(note: Note): Promise<void> {
	// Always write to localStorage (reliable on iOS).
	lsUpsert(LS_NOTES_KEY, note);
	// Best-effort write to IDB.
	if (dbAvailable) {
		try {
			const db = await getDB();
			await db.put(NOTES_STORE, note);
		} catch {
			/* IDB unavailable — localStorage has it */
		}
	}
}

export async function deleteNote(id: string): Promise<void> {
	lsRemove<Note>(LS_NOTES_KEY, id);
	if (dbAvailable) {
		try {
			const db = await getDB();
			await db.delete(NOTES_STORE, id);
		} catch {
			/* ignore */
		}
	}
}

// --- Labels ---
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

// --- Bulk ops (used by import/export) ---
export async function bulkPutNotes(notes: Note[]): Promise<void> {
	lsWrite(LS_NOTES_KEY, notes);
	if (dbAvailable) {
		try {
			const db = await getDB();
			const tx = db.transaction(NOTES_STORE, 'readwrite');
			await Promise.all(notes.map((n) => tx.store.put(n)));
			await tx.done;
		} catch {
			/* ignore */
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
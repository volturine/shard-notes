// Device persistence. IndexedDB is the durable source of truth; localStorage is handled
// separately as a blob-free fast-boot mirror by noteStorage.ts.

import { openDB, type IDBPDatabase } from 'idb';
import type { Label, Note, NoteImage } from '$lib/types';
import { blobToDataUrl, dataUrlToBlob } from '$lib/imageBlob';
import { normalizeNote } from '$lib/checklistBody';

const DB_NAME = 'google-keep-clone';
const DB_VERSION = 3;
const NOTES_STORE = 'notes';
const LABELS_STORE = 'labels';
const IMAGES_STORE = 'note-images';

type ImageRow = {
	noteId: string;
	id: string;
	mime: string;
	name?: string;
	createdAt: number;
	blob?: Blob;
	/** Legacy image rows from pre-blob builds. */
	dataUrl?: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;
const noteChains = new Map<string, Promise<void>>();

function imageKey(noteId: string, imageId: string): string {
	return `${noteId}::${imageId}`;
}

function getDB(): Promise<IDBPDatabase> {
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
	}
	return dbPromise;
}

/** Plain, validated data only: never hand Svelte proxies to IndexedDB.
 *  Image bytes live in IMAGES_STORE — note rows keep empty dataUrl placeholders. */
function detachNote(note: Note): Note {
	const n = normalizeNote(note);
	return {
		...n,
		images: (n.images ?? []).map((image) => ({
			...image,
			dataUrl: ''
		}))
	};
}

function snapshotNote(note: Note): Note {
	const snapshot = detachNote(note);
	snapshot.images = (note.images ?? []).map((image) => ({
		id: String(image.id),
		mime: String(image.mime || 'image/jpeg'),
		name: image.name == null ? undefined : String(image.name),
		createdAt: Number(image.createdAt),
		dataUrl: String(image.dataUrl ?? '')
	}));
	return snapshot;
}

export function normalizeLabel(value: Label): Label {
	const createdAt = Number(value.createdAt) || Date.now();
	return {
		id: String(value.id),
		name: String(value.name ?? ''),
		createdAt,
		updatedAt: Number(value.updatedAt) || createdAt
	};
}

async function imageFromStoredValue(
	db: IDBPDatabase,
	noteId: string,
	meta: NoteImage
): Promise<NoteImage | null> {
	if (meta.dataUrl?.length > 20) return meta;
	const stored = await db.get(IMAGES_STORE, imageKey(noteId, meta.id));
	if (stored instanceof Blob) {
		return { ...meta, mime: meta.mime || stored.type, dataUrl: await blobToDataUrl(stored) };
	}
	const legacy = stored as ImageRow | undefined;
	if (legacy?.blob instanceof Blob) {
		return { ...meta, mime: meta.mime || legacy.mime, dataUrl: await blobToDataUrl(legacy.blob) };
	}
	if (legacy && typeof legacy.dataUrl === 'string' && legacy.dataUrl.length > 20) {
		return { ...meta, mime: meta.mime || legacy.mime, dataUrl: legacy.dataUrl };
	}
	return null;
}

async function hydrateNoteImages(db: IDBPDatabase, note: Note): Promise<Note> {
	const images: Array<NoteImage | null> = [];
	for (const meta of note.images ?? []) {
		images.push(await imageFromStoredValue(db, note.id, meta));
	}
	return { ...note, images: images.filter((image): image is NoteImage => image !== null) };
}

async function prepareImageBlobs(note: Note): Promise<Array<{ key: string; blob: Blob }>> {
	const entries: Array<{ key: string; blob: Blob }> = [];
	for (const image of note.images ?? []) {
		if (!image.dataUrl) continue;
		entries.push({ key: imageKey(note.id, image.id), blob: await dataUrlToBlob(image.dataUrl) });
	}
	return entries;
}

/** Note metadata and all image blobs commit in one transaction or not at all. */
async function putNoteSnapshot(note: Note): Promise<void> {
	const db = await getDB();
	const blobs = await prepareImageBlobs(note);
	const existingKeys = (await db.getAllKeys(IMAGES_STORE)).filter((key) =>
		String(key).startsWith(`${note.id}::`)
	);
	const lean = detachNote(note);
	const tx = db.transaction([NOTES_STORE, IMAGES_STORE], 'readwrite');
	for (const key of existingKeys) tx.objectStore(IMAGES_STORE).delete(key);
	for (const { key, blob } of blobs) tx.objectStore(IMAGES_STORE).put(blob, key);
	tx.objectStore(NOTES_STORE).put(lean);
	await tx.done;
}

function enqueueNote<T>(noteId: string, operation: () => Promise<T>): Promise<T> {
	const previous = noteChains.get(noteId) ?? Promise.resolve();
	const run = previous.catch(() => undefined).then(operation);
	const completion = run.then(() => undefined, () => undefined);
	noteChains.set(noteId, completion);
	return run.finally(() => {
		if (noteChains.get(noteId) === completion) noteChains.delete(noteId);
	});
}

export async function getAllNotes(): Promise<Note[]> {
	const db = await getDB();
	const notes = (await db.getAll(NOTES_STORE)) as Note[];
	const hydrated: Note[] = [];
	for (const note of notes) {
		hydrated.push(await hydrateNoteImages(db, detachNote(note)));
	}
	return hydrated;
}

export function putNote(note: Note): Promise<void> {
	const snapshot = snapshotNote(note);
	return enqueueNote(snapshot.id, () => putNoteSnapshot(snapshot));
}

export function deleteNote(id: string): Promise<void> {
	return enqueueNote(id, async () => {
		const db = await getDB();
		const imageKeys = (await db.getAllKeys(IMAGES_STORE)).filter((key) =>
			String(key).startsWith(`${id}::`)
		);
		const tx = db.transaction([NOTES_STORE, IMAGES_STORE], 'readwrite');
		tx.objectStore(NOTES_STORE).delete(id);
		for (const key of imageKeys) tx.objectStore(IMAGES_STORE).delete(key);
		await tx.done;
	});
}

export async function getAllLabels(): Promise<Label[]> {
	const db = await getDB();
	return ((await db.getAll(LABELS_STORE)) as Label[]).map(normalizeLabel);
}

export async function putLabel(label: Label): Promise<void> {
	const db = await getDB();
	await db.put(LABELS_STORE, normalizeLabel(label));
}

export async function deleteLabel(id: string): Promise<void> {
	const db = await getDB();
	await db.delete(LABELS_STORE, id);
}

export async function bulkPutNotes(notes: Note[]): Promise<void> {
	for (const note of notes) {
		await putNote(note);
	}
}

export async function bulkPutLabels(labels: Label[]): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(LABELS_STORE, 'readwrite');
	for (const label of labels) tx.store.put(normalizeLabel(label));
	await tx.done;
}

export async function clearAllNotes(): Promise<void> {
	const db = await getDB();
	const tx = db.transaction([NOTES_STORE, IMAGES_STORE], 'readwrite');
	tx.objectStore(NOTES_STORE).clear();
	tx.objectStore(IMAGES_STORE).clear();
	await tx.done;
}

export async function clearAllLabels(): Promise<void> {
	const db = await getDB();
	await db.clear(LABELS_STORE);
}

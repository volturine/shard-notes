// Device persistence. IndexedDB is the durable source of truth; localStorage is handled
// separately as a blob-free fast-boot mirror by noteStorage.ts.

import { openDB, type IDBPDatabase } from 'idb';
import type { LinkPreview } from '$lib/linkPreview';
import type { Label, Note, NoteImage } from '$lib/types';
import { blobToDataUrl, dataUrlToBlob } from '$lib/imageBlob';

const DB_NAME = 'google-keep-clone';
const DB_VERSION = 4;
const NOTES_STORE = 'notes';
const LABELS_STORE = 'labels';
const IMAGES_STORE = 'note-images';
const LINK_PREVIEWS_STORE = 'link-previews';

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
				if (!db.objectStoreNames.contains(LINK_PREVIEWS_STORE)) {
					db.createObjectStore(LINK_PREVIEWS_STORE, { keyPath: 'url' });
				}
			}
		});
	}
	return dbPromise;
}

/** Plain clone of an attachment — never hand Svelte proxies to IndexedDB. */
function plainImage(image: NoteImage): NoteImage {
	return {
		id: String(image.id),
		mime: String(image.mime || 'application/octet-stream'),
		dataUrl: typeof image.dataUrl === 'string' ? image.dataUrl : '',
		createdAt: Number(image.createdAt) || 0,
		...(image.name != null && image.name !== '' ? { name: String(image.name) } : {})
	};
}

function plainLinkPreview(preview: LinkPreview): LinkPreview {
	return {
		url: String(preview.url),
		hostname: String(preview.hostname),
		title: String(preview.title),
		...(preview.description ? { description: String(preview.description) } : {}),
		...(preview.image ? { image: String(preview.image) } : {}),
		...(preview.icon ? { icon: String(preview.icon) } : {})
	};
}

/**
 * Fully plain Note for IDB. Spreading `$state` notes leaves nested proxies
 * (labels/images/linkPreviews) which throw DataCloneError on put.
 */
function plainNote(note: Note): Note {
	const images = (note.images ?? []).map(plainImage);
	const linkPreviews = (note.linkPreviews ?? []).map(plainLinkPreview);
	return {
		id: String(note.id),
		title: String(note.title ?? ''),
		body: String(note.body ?? ''),
		color: note.color,
		pinned: Boolean(note.pinned),
		archived: Boolean(note.archived),
		trashed: Boolean(note.trashed),
		trashedAt: note.trashedAt == null ? null : Number(note.trashedAt),
		createdAt: Number(note.createdAt) || 0,
		updatedAt: Number(note.updatedAt) || 0,
		reminder: note.reminder == null ? null : Number(note.reminder),
		labels: Array.from(note.labels ?? [], (id) => String(id)),
		images,
		...(linkPreviews.length ? { linkPreviews } : {})
	};
}

/** Plain, validated data only: never hand Svelte proxies to IndexedDB.
 *  Image bytes live in IMAGES_STORE — note rows keep empty dataUrl placeholders. */
function detachNote(note: Note): Note {
	const plain = plainNote(note);
	return {
		...plain,
		images: (plain.images ?? []).map((image) => ({ ...image, dataUrl: '' }))
	};
}

function snapshotNote(note: Note): Note {
	return plainNote(note);
}

async function imageFromStoredValue(
	db: IDBPDatabase,
	noteId: string,
	meta: NoteImage
): Promise<NoteImage | null> {
	if (meta.dataUrl?.length > 20) return plainImage(meta);
	const stored = await db.get(IMAGES_STORE, imageKey(noteId, meta.id));
	if (!(stored instanceof Blob)) return null;
	return plainImage({ ...meta, mime: meta.mime || stored.type, dataUrl: await blobToDataUrl(stored) });
}

async function hydrateNoteImages(db: IDBPDatabase, note: Note): Promise<Note> {
	const images: Array<NoteImage | null> = [];
	for (const meta of note.images ?? []) {
		images.push(await imageFromStoredValue(db, note.id, meta));
	}
	return { ...plainNote(note), images: images.filter((image): image is NoteImage => image !== null) };
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
	const desiredKeys = new Set((note.images ?? []).map((image) => imageKey(note.id, image.id)));
	const lean = detachNote(note);
	const tx = db.transaction([NOTES_STORE, IMAGES_STORE], 'readwrite');
	// A metadata-only note is normal during asynchronous hydration. Keep its
	// existing blobs; only an attachment removed from the current list is deleted.
	for (const key of existingKeys) {
		if (!desiredKeys.has(String(key))) tx.objectStore(IMAGES_STORE).delete(key);
	}
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

/** Fast metadata pass: note rows are lean and attachment blobs remain in IDB. */
export async function getAllNotesMetadata(): Promise<Note[]> {
	const db = await getDB();
	return ((await db.getAll(NOTES_STORE)) as Note[]).map(plainNote);
}

/** Hydrate every attachment for one note. Callers schedule this with bounded concurrency. */
export async function hydrateNoteAttachments(note: Note): Promise<Note> {
	const db = await getDB();
	return hydrateNoteImages(db, note);
}

/** Legacy full-read helper for callers that explicitly need all attachment bytes now. */
export async function getAllNotes(): Promise<Note[]> {
	const notes = await getAllNotesMetadata();
	const hydrated: Note[] = [];
	for (const note of notes) hydrated.push(await hydrateNoteAttachments(note));
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
	return (await db.getAll(LABELS_STORE)) as Label[];
}

export async function putLabel(label: Label): Promise<void> {
	const db = await getDB();
	await db.put(LABELS_STORE, {
		id: String(label.id),
		name: String(label.name),
		createdAt: Number(label.createdAt) || 0,
		updatedAt: Number(label.updatedAt) || Number(label.createdAt) || 0
	});
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
	for (const label of labels) {
		tx.store.put({
			id: String(label.id),
			name: String(label.name),
			createdAt: Number(label.createdAt) || 0,
			updatedAt: Number(label.updatedAt) || Number(label.createdAt) || 0
		});
	}
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

/** Shared link-preview cache: one fetch per URL, reused across notes. */
export async function getCachedLinkPreview(url: string): Promise<LinkPreview | undefined> {
	const db = await getDB();
	const row = await db.get(LINK_PREVIEWS_STORE, url);
	if (!row || typeof row !== 'object') return undefined;
	const { url: cachedUrl, hostname, title, description, image, icon } = row as LinkPreview;
	if (typeof cachedUrl !== 'string' || typeof hostname !== 'string' || typeof title !== 'string') return undefined;
	return plainLinkPreview({
		url: cachedUrl,
		hostname,
		title,
		...(typeof description === 'string' ? { description } : {}),
		...(typeof image === 'string' ? { image } : {}),
		...(typeof icon === 'string' ? { icon } : {})
	});
}

export async function putCachedLinkPreview(preview: LinkPreview): Promise<void> {
	const db = await getDB();
	await db.put(LINK_PREVIEWS_STORE, {
		...plainLinkPreview(preview),
		fetchedAt: Date.now()
	});
}

export async function getAllCachedLinkPreviews(): Promise<LinkPreview[]> {
	const db = await getDB();
	const rows = await db.getAll(LINK_PREVIEWS_STORE);
	return rows.flatMap((row) => {
		if (!row || typeof row !== 'object') return [];
		const { url, hostname, title, description, image, icon } = row as LinkPreview;
		if (typeof url !== 'string' || typeof hostname !== 'string' || typeof title !== 'string') return [];
		return [plainLinkPreview({
			url,
			hostname,
			title,
			...(typeof description === 'string' ? { description } : {}),
			...(typeof image === 'string' ? { image } : {}),
			...(typeof icon === 'string' ? { icon } : {})
		})];
	});
}

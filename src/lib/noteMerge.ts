// Merge local mirror rows with IndexedDB notes; never drop image blobs.
import type { Note, NoteImage } from './types';

function hasImageData(images: NoteImage[] | undefined): boolean {
	return (images ?? []).some((i) => (i.dataUrl?.length ?? 0) > 0);
}

export function mergeTwoNotes(a: Note, b: Note): Note {
	const newer = a.updatedAt >= b.updatedAt ? a : b;
	const older = newer === a ? b : a;
	const images = hasImageData(newer.images)
		? (newer.images ?? [])
		: hasImageData(older.images)
			? (older.images ?? [])
			: (newer.images ?? older.images ?? []);
	return {
		...newer,
		images,
		updatedAt: Math.max(a.updatedAt, b.updatedAt)
	};
}

export function mergeNoteLists(mirror: Note[], fromDb: Note[]): Note[] {
	const map = new Map<string, Note>();
	for (const n of mirror) map.set(n.id, n);
	for (const db of fromDb) {
		const existing = map.get(db.id);
		map.set(db.id, existing ? mergeTwoNotes(existing, db) : db);
	}
	return Array.from(map.values());
}
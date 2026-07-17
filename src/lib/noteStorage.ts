import type { Label, Note } from './types';

/** Canonical fast-boot mirrors. IndexedDB remains the durable device store. */
export const NOTES_MIRROR_KEY = 'gkc-notes-mirror';
export const LABELS_MIRROR_KEY = 'gkc-labels-mirror';

type MirroredNote = Omit<Note, 'images'> & { hasImages?: boolean };

/** Note shape safe for localStorage: attachment bytes never enter the mirror. */
export function noteForLocalStorage(note: Note): MirroredNote {
	const { images, ...rest } = note;
	return images?.length ? { ...rest, hasImages: true } : rest;
}

function parseArray<T>(raw: string | null): T[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
}

function readJson<T>(key: string): T[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		return parseArray<T>(localStorage.getItem(key));
	} catch (err) {
		console.error('[storage] read mirror failed:', key, err);
		return [];
	}
}

function writeJson<T>(key: string, value: T[]): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch (err) {
		console.error('[storage] write mirror failed:', key, err);
	}
}

export function readNotesMirror(): Note[] {
	return readJson<MirroredNote>(NOTES_MIRROR_KEY).map((note) => {
		const { hasImages: _hasImages, ...rest } = note;
		return { ...rest, images: [] };
	});
}

export function writeNotesMirror(notes: Note[]): void {
	writeJson(NOTES_MIRROR_KEY, notes.map(noteForLocalStorage));
}

export function readLabelsMirror(): Label[] {
	return readJson<Label>(LABELS_MIRROR_KEY);
}

export function writeLabelsMirror(labels: Label[]): void {
	writeJson(LABELS_MIRROR_KEY, labels);
}

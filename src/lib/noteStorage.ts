import type { Label, Note } from './types';
import { normalizeNote } from './checklistBody';

/** Canonical fast-boot mirror. IDB remains the durable device store. */
export const NOTES_MIRROR_KEY = 'gkc-notes-mirror';
export const LABELS_MIRROR_KEY = 'gkc-labels-mirror';

// One-time recovery sources written by older builds. Never write these again.
const LEGACY_NOTES_KEY = 'gkc-notes';
const LEGACY_LABELS_KEY = 'gkc-labels';

type MirroredNote = Omit<Note, 'images'> & { hasImages?: boolean };

/** Note shape safe for localStorage: image blobs/data URLs never enter the mirror. */
export function noteForLocalStorage(note: Note): MirroredNote {
	const { images, ...rest } = note;
	return images?.length ? { ...rest, hasImages: true } : rest;
}

function parseArray<T>(raw: string | null): T[] | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as T[]) : null;
	} catch {
		return null;
	}
}

export function stripMirrorPayload(raw: string): Note[] | null {
	const parsed = parseArray<MirroredNote & Record<string, unknown>>(raw);
	if (!parsed) return null;
	return parsed
		.filter((note) => note && typeof note.id === 'string')
		.map((note) => {
			const { hasImages: _hasImages, ...rest } = note;
			return normalizeNote({ ...rest, images: [] });
		});
}

function readJson<T>(canonical: string, legacy: string): T[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const canonicalValue = parseArray<T>(localStorage.getItem(canonical));
		if (canonicalValue) return canonicalValue;
		const legacyValue = parseArray<T>(localStorage.getItem(legacy));
		if (!legacyValue) return [];
		// Migrate only after a successful parse; never delete the recovery copy here.
		localStorage.setItem(canonical, JSON.stringify(legacyValue));
		return legacyValue;
	} catch (err) {
		console.error('[storage] read mirror failed:', canonical, err);
		return [];
	}
}

function writeJson<T>(key: string, value: T[]): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch (err) {
		// Keep the previous mirror intact; IDB remains the primary device copy.
		console.error('[storage] write mirror failed:', key, err);
	}
}

export function readNotesMirror(): Note[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(NOTES_MIRROR_KEY);
		const canonical = raw ? stripMirrorPayload(raw) : null;
		if (canonical) return canonical;
		const legacy = localStorage.getItem(LEGACY_NOTES_KEY);
		const recovered = legacy ? stripMirrorPayload(legacy) : null;
		if (recovered) writeNotesMirror(recovered);
		return recovered ?? [];
	} catch (err) {
		console.error('[storage] read notes mirror failed:', err);
		return [];
	}
}

export function writeNotesMirror(notes: Note[]): void {
	writeJson(NOTES_MIRROR_KEY, notes.map(noteForLocalStorage));
}

export function readLabelsMirror(): Label[] {
	return readJson<Label>(LABELS_MIRROR_KEY, LEGACY_LABELS_KEY);
}

export function writeLabelsMirror(labels: Label[]): void {
	writeJson(LABELS_MIRROR_KEY, labels);
}

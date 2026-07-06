import type { Note } from './types';

/** Note shape safe for localStorage (no image blobs). */
export function noteForLocalStorage(note: Note): Note & { hasImages?: boolean } {
	const { images, ...rest } = note;
	const hasImages = (images?.length ?? 0) > 0;
	return hasImages ? { ...rest, hasImages } : rest;
}

export function stripMirrorPayload(raw: string): Note[] | null {
	if (raw.length > 2_000_000) return null;
	try {
		const parsed = JSON.parse(raw) as (Note & { hasImages?: boolean })[];
		if (!Array.isArray(parsed)) return null;
		return parsed.map((n) => {
			const { hasImages: _h, images: _i, ...rest } = n;
			return { ...rest, images: [] };
		});
	} catch {
		return null;
	}
}

export function clearOversizedNoteStorage(): void {
	if (typeof localStorage === 'undefined') return;
	for (const key of ['gkc-notes-mirror', 'gkc-notes', 'gkc-labels-mirror', 'gkc-labels']) {
		try {
			const v = localStorage.getItem(key);
			if (v && v.length > 2_000_000) localStorage.removeItem(key);
		} catch {
			/* ignore */
		}
	}
}
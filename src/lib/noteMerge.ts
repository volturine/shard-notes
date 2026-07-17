// Deterministic, local-first merge helpers. A matching timestamp intentionally keeps the
// first argument: callers pass the currently edited/local value first, avoiding surprise
// overwrites when two devices happen to write in the same millisecond.
import type { Label, Note, NoteImage } from './types';

function mergeImages(preferred: NoteImage[] = [], fallback: NoteImage[] = [], includeMissing = false): NoteImage[] {
	const fallbackById = new Map(fallback.map((image) => [image.id, image]));
	const merged = preferred.map((image) => {
		if (image.dataUrl?.length) return image;
		const stored = fallbackById.get(image.id);
		return stored?.dataUrl?.length ? { ...image, dataUrl: stored.dataUrl } : image;
	});
	if (!includeMissing) return merged;
	const ids = new Set(merged.map((image) => image.id));
	return [...merged, ...fallback.filter((image) => !ids.has(image.id))];
}

export function mergeTwoNotes(primary: Note, secondary: Note): Note {
	const newer = primary.updatedAt >= secondary.updatedAt ? primary : secondary;
	const older = newer === primary ? secondary : primary;
	const images = mergeImages(newer.images, older.images, primary.updatedAt === secondary.updatedAt);
	return { ...newer, images, updatedAt: Math.max(primary.updatedAt, secondary.updatedAt) };
}

export function mergeNoteLists(primary: Note[], secondary: Note[]): Note[] {
	const byId = new Map<string, Note>();
	for (const note of primary) byId.set(note.id, note);
	for (const note of secondary) {
		const existing = byId.get(note.id);
		byId.set(note.id, existing ? mergeTwoNotes(existing, note) : note);
	}
	return Array.from(byId.values());
}

function labelTime(label: Label): number {
	return Number(label.updatedAt) || Number(label.createdAt) || 0;
}

export function mergeTwoLabels(primary: Label, secondary: Label): Label {
	return labelTime(primary) >= labelTime(secondary) ? primary : secondary;
}

export function mergeLabelLists(primary: Label[], secondary: Label[]): Label[] {
	const byId = new Map<string, Label>();
	for (const label of primary) byId.set(label.id, label);
	for (const label of secondary) {
		const existing = byId.get(label.id);
		byId.set(label.id, existing ? mergeTwoLabels(existing, label) : label);
	}
	return Array.from(byId.values());
}

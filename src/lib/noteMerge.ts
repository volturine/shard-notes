// Deterministic, local-first merge helpers. A matching timestamp intentionally keeps the
// first argument: callers pass the currently edited/local value first, avoiding surprise
// overwrites when two devices happen to write in the same millisecond.
import type { Label, Note, NoteImage } from './types';

function hasImageData(images: NoteImage[] | undefined): boolean {
	return (images ?? []).some((image) => image.dataUrl?.length > 0);
}

export function mergeTwoNotes(primary: Note, secondary: Note): Note {
	const newer = primary.updatedAt >= secondary.updatedAt ? primary : secondary;
	const older = newer === primary ? secondary : primary;
	const images = hasImageData(newer.images)
		? (newer.images ?? [])
		: hasImageData(older.images)
			? (older.images ?? [])
			: (newer.images ?? older.images ?? []);
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

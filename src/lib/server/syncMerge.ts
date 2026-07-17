// Server-side conflict rules. Keep this intentionally small: records are immutable snapshots
// selected by updatedAt; equal times keep the incoming/local record deterministically.

export interface SyncNote {
	id: string;
	updatedAt: number;
	[key: string]: unknown;
}

export interface SyncLabel {
	id: string;
	createdAt: number;
	updatedAt: number;
	[key: string]: unknown;
}

function labelTime(label: SyncLabel): number {
	return Number(label.updatedAt);
}

function validRecord(value: unknown): value is { id: string } {
	return !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}

export function mergeNotes(incoming: SyncNote[], stored: SyncNote[]): SyncNote[] {
	const byId = new Map<string, SyncNote>();
	for (const note of stored.filter(validRecord)) byId.set(note.id, note);
	for (const note of incoming.filter(validRecord)) {
		const existing = byId.get(note.id);
		if (!existing || Number(note.updatedAt) >= Number(existing.updatedAt)) byId.set(note.id, note);
	}
	return Array.from(byId.values());
}

export function mergeLabels(incoming: SyncLabel[], stored: SyncLabel[]): SyncLabel[] {
	const byId = new Map<string, SyncLabel>();
	for (const label of stored.filter(validRecord)) byId.set(label.id, label);
	for (const label of incoming.filter(validRecord)) {
		const existing = byId.get(label.id);
		if (!existing || labelTime(label) >= labelTime(existing)) byId.set(label.id, label);
	}
	return Array.from(byId.values());
}

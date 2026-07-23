import type { KanbanBoard } from '$lib/kanban';
import type { Label, Note, NoteImage } from '$lib/types';
import { sha256 } from '$lib/syncHash';

/** Note image metadata on the wire — bytes live in a separate attachment record. */
export type SyncImageRef = {
	id: string;
	mime: string;
	name?: string;
	createdAt: number;
	hash: string;
};

export type SyncNote = Omit<Note, 'images'> & { images?: SyncImageRef[] };

export type SyncAttachment = {
	id: string;
	mime: string;
	name?: string;
	createdAt: number;
	hash: string;
	dataUrl: string;
};

export type SyncRecordPayload =
	| { kind: 'note'; value: SyncNote }
	| { kind: 'attachment'; value: SyncAttachment }
	| { kind: 'label'; value: Label }
	| { kind: 'board'; value: KanbanBoard }
	| { kind: 'note-tombstone'; id: string; deletedAt: number }
	| { kind: 'label-tombstone'; id: string; deletedAt: number }
	| { kind: 'board-tombstone'; id: string; deletedAt: number };

export type SyncRecord = { key: string; payload: SyncRecordPayload; fingerprint: string };

function validTombstones(value: Record<string, number>): [string, number][] {
	return Object.entries(value)
		.filter(([id, deletedAt]) => typeof id === 'string' && Number.isFinite(deletedAt) && deletedAt > 0)
		.sort(([left], [right]) => left.localeCompare(right));
}

function object(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function versioned(value: unknown): value is { id: string; updatedAt: number } {
	if (!object(value)) return false;
	const record = value as { id?: unknown; updatedAt?: unknown };
	return typeof record.id === 'string' && typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt);
}

async function imageHash(dataUrl: string): Promise<string> {
	return sha256(dataUrl);
}

/** Strip inline bytes from a note and emit a separate attachment payload for each photo/file. */
export async function splitNoteForSync(note: Note): Promise<{ note: SyncNote; attachments: SyncAttachment[] }> {
	const attachments: SyncAttachment[] = [];
	const images: SyncImageRef[] = [];
	for (const image of note.images ?? []) {
		if (!image?.id || typeof image.dataUrl !== 'string' || !image.dataUrl.length) continue;
		const hash = await imageHash(image.dataUrl);
		const meta: SyncImageRef = {
			id: image.id,
			mime: image.mime || 'application/octet-stream',
			createdAt: Number(image.createdAt) || 0,
			hash,
			...(image.name ? { name: image.name } : {})
		};
		images.push(meta);
		attachments.push({ ...meta, dataUrl: image.dataUrl });
	}
	const { images: _drop, ...rest } = note;
	return { note: { ...rest, ...(images.length ? { images } : {}) }, attachments };
}

export function attachmentToImage(attachment: SyncAttachment): NoteImage {
	return {
		id: attachment.id,
		mime: attachment.mime,
		dataUrl: attachment.dataUrl,
		createdAt: attachment.createdAt,
		...(attachment.name ? { name: attachment.name } : {})
	};
}

/** Reattach local/remote bytes onto a note that may only carry image refs. */
export function hydrateNoteImages(note: Note | SyncNote, attachments: Map<string, NoteImage>): Note {
	const images = (note.images ?? []).map((image) => {
		const fallback = attachments.get(image.id);
		const dataUrl = ('dataUrl' in image && typeof image.dataUrl === 'string' && image.dataUrl.length)
			? image.dataUrl
			: (fallback?.dataUrl ?? '');
		return {
			id: image.id,
			mime: image.mime || fallback?.mime || 'application/octet-stream',
			dataUrl,
			createdAt: Number(image.createdAt) || fallback?.createdAt || 0,
			...((image.name || fallback?.name) ? { name: image.name || fallback?.name } : {})
		} satisfies NoteImage;
	});
	return { ...(note as Note), images };
}

/**
 * Converts local state into independently encrypted sync records.
 * Photos are global attachment records; notes only reference them by id+hash.
 */
export async function buildSyncRecords(
	notes: Note[],
	labels: Label[],
	boards: KanbanBoard[],
	tombstones: Record<string, number> = {},
	labelTombstones: Record<string, number> = {},
	boardTombstones: Record<string, number> = {}
): Promise<SyncRecord[]> {
	const values: { key: string; payload: SyncRecordPayload }[] = [];
	const seenAttachments = new Set<string>();

	for (const note of notes.filter((item) => (Number(tombstones[item.id]) || 0) < item.updatedAt)) {
		const split = await splitNoteForSync(note);
		values.push({ key: `note:${split.note.id}`, payload: { kind: 'note', value: split.note } });
		for (const attachment of split.attachments) {
			if (seenAttachments.has(attachment.id)) continue;
			seenAttachments.add(attachment.id);
			values.push({ key: `attachment:${attachment.id}`, payload: { kind: 'attachment', value: attachment } });
		}
	}

	for (const label of labels.filter((item) => (Number(labelTombstones[item.id]) || 0) < item.updatedAt)) {
		values.push({ key: `label:${label.id}`, payload: { kind: 'label', value: label } });
	}
	for (const board of boards.filter((item) => (Number(boardTombstones[item.id]) || 0) < item.updatedAt)) {
		values.push({ key: `board:${board.id}`, payload: { kind: 'board', value: board } });
	}
	for (const [id, deletedAt] of validTombstones(tombstones)) {
		values.push({ key: `note-tombstone:${id}`, payload: { kind: 'note-tombstone', id, deletedAt } });
	}
	for (const [id, deletedAt] of validTombstones(labelTombstones)) {
		values.push({ key: `label-tombstone:${id}`, payload: { kind: 'label-tombstone', id, deletedAt } });
	}
	for (const [id, deletedAt] of validTombstones(boardTombstones)) {
		values.push({ key: `board-tombstone:${id}`, payload: { kind: 'board-tombstone', id, deletedAt } });
	}

	return Promise.all(values.map(async ({ key, payload }) => ({ key, payload, fingerprint: await sha256(payload) })));
}

export function fingerprintMap(records: SyncRecord[]): Record<string, string> {
	return Object.fromEntries(records.map((record) => [record.key, record.fingerprint]));
}

export function changedRecords(records: SyncRecord[], baseline: Record<string, string>): SyncRecord[] {
	return records.filter((record) => baseline[record.key] !== record.fingerprint);
}

function isImageRef(value: unknown): value is SyncImageRef {
	if (!object(value)) return false;
	const image = value as Partial<SyncImageRef>;
	return typeof image.id === 'string'
		&& typeof image.mime === 'string'
		&& typeof image.hash === 'string'
		&& typeof image.createdAt === 'number';
}

function isAttachment(value: unknown): value is SyncAttachment {
	if (!object(value)) return false;
	const attachment = value as Partial<SyncAttachment>;
	return typeof attachment.id === 'string'
		&& typeof attachment.mime === 'string'
		&& typeof attachment.hash === 'string'
		&& typeof attachment.createdAt === 'number'
		&& typeof attachment.dataUrl === 'string'
		&& attachment.dataUrl.length > 0;
}

function isSyncNote(value: unknown): value is SyncNote {
	if (!versioned(value)) return false;
	const note = value as { images?: unknown };
	if (note.images == null) return true;
	return Array.isArray(note.images) && note.images.every((image) => isImageRef(image) || (
		object(image) && typeof image.id === 'string' && typeof (image as { dataUrl?: unknown }).dataUrl === 'string'
	));
}

/** Reject malformed decrypted records instead of letting a bad envelope alter local state. */
export function isSyncRecordPayload(value: unknown): value is SyncRecordPayload {
	if (!object(value) || typeof value.kind !== 'string') return false;
	if (value.kind === 'note') return isSyncNote(value.value);
	if (value.kind === 'attachment') return isAttachment(value.value);
	if ((value.kind === 'label' || value.kind === 'board') && versioned(value.value)) return true;
	const tombstone = value as { id?: unknown; deletedAt?: unknown };
	return (value.kind === 'note-tombstone' || value.kind === 'label-tombstone' || value.kind === 'board-tombstone')
		&& typeof tombstone.id === 'string' && typeof tombstone.deletedAt === 'number' && Number.isFinite(tombstone.deletedAt) && tombstone.deletedAt > 0;
}

/**
 * Reads pre-delta encrypted snapshots already stored by this same account. Expands inline
 * photos into attachment records so later title-only edits stay small.
 */
export async function legacySnapshotPayloads(value: unknown): Promise<SyncRecordPayload[] | null> {
	if (!object(value) || !Array.isArray(value.notes) || !Array.isArray(value.labels) || !Array.isArray(value.boards)) return null;
	const snapshot = value as {
		notes: unknown[]; labels: unknown[]; boards: unknown[];
		tombstones?: unknown; labelTombstones?: unknown; boardTombstones?: unknown;
	};
	const records: SyncRecordPayload[] = [];
	for (const raw of snapshot.notes) {
		if (!versioned(raw)) continue;
		const note = raw as Note;
		if (Array.isArray(note.images) && note.images.some((image) => typeof image?.dataUrl === 'string' && image.dataUrl.length > 0)) {
			const split = await splitNoteForSync(note);
			records.push({ kind: 'note', value: split.note });
			for (const attachment of split.attachments) records.push({ kind: 'attachment', value: attachment });
		} else {
			records.push({ kind: 'note', value: note as SyncNote });
		}
	}
	for (const label of snapshot.labels.filter(versioned)) records.push({ kind: 'label', value: label as Label });
	for (const board of snapshot.boards.filter(versioned)) records.push({ kind: 'board', value: board as KanbanBoard });
	for (const [kind, tombstones] of [
		['note-tombstone', snapshot.tombstones],
		['label-tombstone', snapshot.labelTombstones],
		['board-tombstone', snapshot.boardTombstones]
	] as const) {
		if (!object(tombstones)) continue;
		for (const [id, deletedAt] of Object.entries(tombstones)) {
			if (typeof deletedAt === 'number' && Number.isFinite(deletedAt) && deletedAt > 0) {
				records.push({ kind, id, deletedAt } as SyncRecordPayload);
			}
		}
	}
	return records;
}

/** Approximate serialized byte size of outgoing records — used by tests for title-only edits. */
export function approximatePayloadBytes(records: SyncRecord[]): number {
	return records.reduce((total, record) => total + JSON.stringify(record.payload).length, 0);
}

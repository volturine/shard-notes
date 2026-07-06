import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';

// POST /api/sync/sync
// Body: { syncCode: string, notes: Note[], labels: Label[] }
// Returns: { notes: Note[], labels: Label[], updatedAt: number }
//
// Bidirectional sync: merges client notes with server notes by updatedAt.
// For each note ID: the version with the higher updatedAt wins.
// Notes that exist only on client are added to server, and vice versa.

interface NoteLike {
	id: string;
	updatedAt: number;
	[key: string]: unknown;
}

interface LabelLike {
	id: string;
	createdAt: number;
	[key: string]: unknown;
}

function mergeNotes(local: NoteLike[], remote: NoteLike[]): NoteLike[] {
	const map = new Map<string, NoteLike>();
	for (const n of remote) map.set(n.id, n);
	for (const n of local) {
		const existing = map.get(n.id);
		if (!existing || n.updatedAt > existing.updatedAt) {
			map.set(n.id, n);
		}
	}
	return Array.from(map.values());
}

function mergeLabels(local: LabelLike[], remote: LabelLike[]): LabelLike[] {
	const map = new Map<string, LabelLike>();
	for (const l of remote) map.set(l.id, l);
	for (const l of local) {
		const existing = map.get(l.id);
		if (!existing || l.createdAt > existing.createdAt) {
			map.set(l.id, l);
		}
	}
	return Array.from(map.values());
}

export const POST: RequestHandler = async ({ request }) => {
	const { syncCode, notes, labels } = await request.json();

	if (!syncCode || typeof syncCode !== 'string') {
		return json({ error: 'Sync code is required' }, { status: 400 });
	}

	const data = readSyncData();
	const user = Object.values(data).find((u) => u.syncCode === syncCode);

	if (!user) {
		return json({ error: 'Invalid sync code' }, { status: 404 });
	}

	const remoteNotes = (user.notes || []) as NoteLike[];
	const remoteLabels = (user.labels || []) as LabelLike[];

	const mergedNotes = mergeNotes(notes || [], remoteNotes);
	const mergedLabels = mergeLabels(labels || [], remoteLabels);

	user.notes = mergedNotes;
	user.labels = mergedLabels;
	user.updatedAt = Date.now();
	writeSyncData(data);

	return json({
		notes: mergedNotes,
		labels: mergedLabels,
		updatedAt: user.updatedAt
	});
};

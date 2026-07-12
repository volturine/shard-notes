import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { mergeLabels, mergeNotes, type SyncLabel, type SyncNote } from '$lib/server/syncMerge';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';

function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

// POST /api/sync/sync — full bidirectional record merge. Notes include image data so a
// successfully completed sync is a complete device backup, not a metadata-only replica.
export const POST: RequestHandler = async ({ request }) => {
	let body: { syncCode?: unknown; notes?: unknown; labels?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (typeof body.syncCode !== 'string' || !body.syncCode) {
		return json({ error: 'Sync code is required' }, { status: 400 });
	}
	if (!isArray(body.notes) || !isArray(body.labels)) {
		return json({ error: 'Notes and labels must be arrays' }, { status: 400 });
	}

	try {
		const data = readSyncData();
		const user = Object.values(data).find((entry) => entry.syncCode === body.syncCode);
		if (!user) return json({ error: 'Invalid sync code' }, { status: 404 });

		const notes = mergeNotes(body.notes as SyncNote[], user.notes as SyncNote[]);
		const labels = mergeLabels(body.labels as SyncLabel[], user.labels as SyncLabel[]);
		user.notes = notes;
		user.labels = labels;
		user.updatedAt = Date.now();
		writeSyncData(data);
		return json({ notes, labels, updatedAt: user.updatedAt });
	} catch (err) {
		console.error('[sync] merge failed:', err);
		return json({ error: 'Sync storage is temporarily unavailable' }, { status: 503 });
	}
};

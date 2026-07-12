import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { mergeLabels, mergeNotes, type SyncLabel, type SyncNote } from '$lib/server/syncMerge';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';
import { withoutTombstoned } from '$lib/server/syncDelta';

// Legacy endpoint retained as a safe merge alias; it never blindly overwrites account data.
export const POST: RequestHandler = async ({ request }) => {
	let body: { syncCode?: unknown; notes?: unknown; labels?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (typeof body.syncCode !== 'string' || !body.syncCode) return json({ error: 'Sync code is required' }, { status: 400 });
	if (!Array.isArray(body.notes) || !Array.isArray(body.labels)) return json({ error: 'Notes and labels must be arrays' }, { status: 400 });
	try {
		const data = readSyncData();
		const user = Object.values(data).find((entry) => entry.syncCode === body.syncCode);
		if (!user) return json({ error: 'Invalid sync code' }, { status: 404 });
		user.notes = withoutTombstoned(
			mergeNotes(body.notes as SyncNote[], user.notes as SyncNote[]),
			user.tombstones ?? {}
		);
		user.labels = mergeLabels(body.labels as SyncLabel[], user.labels as SyncLabel[]);
		user.updatedAt = Date.now();
		writeSyncData(data);
		return json({ success: true, notes: user.notes, labels: user.labels, updatedAt: user.updatedAt });
	} catch (err) {
		console.error('[sync] push merge failed:', err);
		return json({ error: 'Sync storage is temporarily unavailable' }, { status: 503 });
	}
};

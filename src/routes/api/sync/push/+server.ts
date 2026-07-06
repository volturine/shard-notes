import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';

// POST /api/sync/push
// Body: { syncCode: string, notes: Note[], labels: Label[] }
// Stores the notes/labels on the server for the given sync code.

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

	user.notes = notes || [];
	user.labels = labels || [];
	user.updatedAt = Date.now();
	writeSyncData(data);

	return json({ success: true, updatedAt: user.updatedAt });
};

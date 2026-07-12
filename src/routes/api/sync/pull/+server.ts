import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readSyncData } from '$lib/server/syncStore';

export const POST: RequestHandler = async ({ request }) => {
	let body: { syncCode?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (typeof body.syncCode !== 'string' || !body.syncCode) return json({ error: 'Sync code is required' }, { status: 400 });
	try {
		const user = Object.values(readSyncData()).find((entry) => entry.syncCode === body.syncCode);
		if (!user) return json({ error: 'Invalid sync code' }, { status: 404 });
		return json({ notes: user.notes, labels: user.labels, updatedAt: user.updatedAt });
	} catch (err) {
		console.error('[sync] pull failed:', err);
		return json({ error: 'Sync storage is temporarily unavailable' }, { status: 503 });
	}
};

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';

export const POST: RequestHandler = async ({ request }) => {
	let body: { username?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (typeof body.username !== 'string' || !body.username.trim()) {
		return json({ error: 'Username is required' }, { status: 400 });
	}
	try {
		const data = readSyncData();
		const username = body.username.trim().toLowerCase();
		if (data[username]) {
			return json({ error: 'An account with this username already exists. Use your sync code on Link device.' }, { status: 409 });
		}
		let syncCode = '';
		do {
			syncCode = String(Math.floor(100000 + Math.random() * 900000));
		} while (Object.values(data).some((user) => user.syncCode === syncCode));
		data[username] = { syncCode, notes: [], labels: [], updatedAt: Date.now() };
		writeSyncData(data);
		return json({ syncCode, username });
	} catch (err) {
		console.error('[sync] register failed:', err);
		return json({ error: 'Sync storage is temporarily unavailable' }, { status: 503 });
	}
};

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';

// POST /api/sync/register
// Body: { username: string }
// Returns: { syncCode: string } — a 6-digit code to link other devices.
// If the username already exists, returns the existing sync code.

export const POST: RequestHandler = async ({ request }) => {
	const { username } = await request.json();

	if (!username || typeof username !== 'string' || username.trim().length < 1) {
		return json({ error: 'Username is required' }, { status: 400 });
	}

	const data = readSyncData();
	const key = username.trim().toLowerCase();

	if (data[key]) {
		// Username exists — return existing sync code.
		return json({ syncCode: data[key].syncCode, username: key });
	}

	// Generate a unique 6-digit sync code.
	let syncCode = '';
	do {
		syncCode = String(Math.floor(100000 + Math.random() * 900000));
	} while (Object.values(data).some((u) => u.syncCode === syncCode));

	data[key] = {
		syncCode,
		notes: [],
		labels: [],
		updatedAt: Date.now()
	};
	writeSyncData(data);

	return json({ syncCode, username: key });
};

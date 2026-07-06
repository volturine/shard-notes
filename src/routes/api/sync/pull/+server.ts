import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readSyncData } from '$lib/server/syncStore';

// POST /api/sync/pull
// Body: { syncCode: string }
// Returns: { notes: Note[], labels: Label[], updatedAt: number }

export const POST: RequestHandler = async ({ request }) => {
	const { syncCode } = await request.json();

	if (!syncCode || typeof syncCode !== 'string') {
		return json({ error: 'Sync code is required' }, { status: 400 });
	}

	const data = readSyncData();
	const user = Object.values(data).find((u) => u.syncCode === syncCode);

	if (!user) {
		return json({ error: 'Invalid sync code' }, { status: 404 });
	}

	return json({
		notes: user.notes || [],
		labels: user.labels || [],
		updatedAt: user.updatedAt || 0
	});
};

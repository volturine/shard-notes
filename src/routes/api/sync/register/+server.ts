import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';
import { syncSecretHash } from '$lib/server/syncAuth';

export const POST: RequestHandler = async ({ request }) => {
	let body: { accountId?: unknown; authSecret?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (typeof body.accountId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(body.accountId)) {
		return json({ error: 'Invalid account identity' }, { status: 400 });
	}
	if (typeof body.authSecret !== 'string' || body.authSecret.length < 32) {
		return json({ error: 'Invalid account credential' }, { status: 400 });
	}
	try {
		const data = readSyncData();
		if (data[body.accountId]) return json({ error: 'This sync account already exists on this device.' }, { status: 409 });
		data[body.accountId] = {
			credentialHash: syncSecretHash(body.authSecret),
			envelopes: [],
			nextSeq: 0,
			updatedAt: Date.now()
		};
		writeSyncData(data);
		return json({ accountId: body.accountId });
	} catch (err) {
		console.error('[sync] register failed:', err);
		return json({ error: 'Sync storage is temporarily unavailable' }, { status: 503 });
	}
};

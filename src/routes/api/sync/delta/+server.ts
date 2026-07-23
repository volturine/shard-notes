import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { applyOpaqueUploads } from '$lib/server/syncRelay';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';
import { sameSyncSecret } from '$lib/server/syncAuth';

const MAX_ENVELOPE_BYTES = 100_000_000;
const MAX_ENVELOPES_PER_REQUEST = 2_000;
const DEFAULT_DOWNLOAD_LIMIT = 12;
type OpaqueEnvelope = { id: string; ciphertext: string; slot: string };

function isOpaqueEnvelope(value: unknown): value is OpaqueEnvelope {
	return !!value && typeof value === 'object'
		&& typeof (value as OpaqueEnvelope).id === 'string'
		&& typeof (value as OpaqueEnvelope).ciphertext === 'string'
		&& typeof (value as OpaqueEnvelope).slot === 'string'
		&& (value as OpaqueEnvelope).id.length <= 128
		&& (value as OpaqueEnvelope).ciphertext.length <= MAX_ENVELOPE_BYTES
		&& /^[A-Za-z0-9_-]+$/.test((value as OpaqueEnvelope).id)
		&& /^[a-f0-9]{64}$/.test((value as OpaqueEnvelope).slot)
		&& /^[A-Za-z0-9_-]+$/.test((value as OpaqueEnvelope).ciphertext);
}

/** Current-state opaque relay: each keyed slot holds one latest ciphertext only. */
export const POST: RequestHandler = async ({ request }) => {
	let body: { accountId?: unknown; authSecret?: unknown; cursor?: unknown; envelopes?: unknown; limit?: unknown };
	try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, { status: 400 }); }
	if (typeof body.accountId !== 'string' || typeof body.authSecret !== 'string') return json({ error: 'Sync account credentials are required' }, { status: 400 });
	const cursor = typeof body.cursor === 'number' && Number.isInteger(body.cursor) && body.cursor >= 0 ? body.cursor : 0;
	const envelopes = body.envelopes == null ? [] : body.envelopes;
	if (!Array.isArray(envelopes) || envelopes.length > MAX_ENVELOPES_PER_REQUEST || !envelopes.every(isOpaqueEnvelope)) return json({ error: 'Invalid encrypted envelope batch' }, { status: 400 });
	const limit = typeof body.limit === 'number' && Number.isInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, 50) : DEFAULT_DOWNLOAD_LIMIT;
	try {
		const data = readSyncData();
		const user = data[body.accountId];
		if (!user || !sameSyncSecret(user.credentialHash, body.authSecret)) return json({ error: 'Invalid sync account credentials' }, { status: 404 });
		const before = JSON.stringify(user.envelopes);
		const reset = user.envelopes.length === 0 && cursor > 0;
		const priorMax = Math.max(0, ...(user.envelopes ?? []).map((envelope) => envelope.seq));
		const applied = applyOpaqueUploads(user.envelopes, Math.max(Number(user.nextSeq) || 0, priorMax), cursor, envelopes, limit);
		user.envelopes = applied.envelopes;
		user.nextSeq = applied.nextSeq;
		if (JSON.stringify(user.envelopes) !== before) {
			user.updatedAt = Date.now();
			writeSyncData(data);
		}
		return json({ cursor: applied.nextCursor, envelopes: applied.remote, hasMore: applied.hasMore, reset });
	} catch (error) {
		console.error('[sync] current-state relay failed:', error);
		return json({ error: 'Sync storage is temporarily unavailable' }, { status: 503 });
	}
};

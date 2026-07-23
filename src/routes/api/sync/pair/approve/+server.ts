import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { pairingSessions } from '$lib/server/pairingSessions';
export const POST: RequestHandler = async ({ request }) => {
 let body: { sessionId?: unknown; grant?: unknown }; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, { status: 400 }); }
 const grant = body.grant as { ciphertext?: unknown } | undefined;
 if (typeof body.sessionId !== 'string' || !grant || typeof grant.ciphertext !== 'string' || !/^[A-Za-z0-9_-]+$/.test(grant.ciphertext)) return json({ error: 'Invalid encrypted rendezvous grant' }, { status: 400 });
 const result = pairingSessions.submitGrant(body.sessionId, { ciphertext: grant.ciphertext }); return result.success ? json({ ok: true }) : json({ error: 'Rendezvous no longer active' }, { status: 404 });
};

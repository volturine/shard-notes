import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { pairingSessions } from '$lib/server/pairingSessions';

export const POST: RequestHandler = async ({ request }) => {
	let body: { sessionId?: unknown };
	try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, { status: 400 }); }
	if (typeof body.sessionId !== 'string' || !body.sessionId) return json({ error: 'Invalid pairing request' }, { status: 400 });
	return json(pairingSessions.poll(body.sessionId));
};

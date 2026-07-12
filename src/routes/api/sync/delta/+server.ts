import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { mergeLabels, mergeNotes, type SyncLabel, type SyncNote } from '$lib/server/syncMerge';
import { mergeTombstones, planDelta, type ManifestRecord, type TombstoneMap } from '$lib/server/syncDelta';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';

type DeltaUser = { notes: SyncNote[]; labels: SyncLabel[]; tombstones?: TombstoneMap; updatedAt: number };
type Manifest = { notes: ManifestRecord[]; labels: ManifestRecord[]; tombstones?: TombstoneMap };

function validManifest(value: unknown): value is Manifest {
	return !!value && typeof value === 'object'
		&& Array.isArray((value as Manifest).notes) && Array.isArray((value as Manifest).labels);
}

function response(data: unknown): Response {
	const body = JSON.stringify(data);
	return new Response(body, { headers: { 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(body).byteLength) } });
}

/**
 * POST /api/sync/delta
 * Phase 1: send tiny manifests; server returns only remote changes + ids it needs.
 * Phase 2: send only those requested full records; server merges atomically and returns canonicals.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { syncCode?: unknown; manifest?: unknown; notes?: unknown; labels?: unknown; tombstones?: unknown };
	try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, { status: 400 }); }
	if (typeof body.syncCode !== 'string' || !body.syncCode) return json({ error: 'Sync code is required' }, { status: 400 });

	try {
		const data = readSyncData();
		const user = Object.values(data).find((entry) => entry.syncCode === body.syncCode) as (DeltaUser & { syncCode: string }) | undefined;
		if (!user) return json({ error: 'Invalid sync code' }, { status: 404 });
		user.tombstones ??= {};

		if (validManifest(body.manifest)) {
			const notePlan = planDelta(body.manifest.notes, user.notes, body.manifest.tombstones, user.tombstones);
			const labelPlan = planDelta(
				body.manifest.labels,
				user.labels.map((label) => ({ ...label, updatedAt: Number(label.updatedAt) || Number(label.createdAt) }))
			);
			return response({
				notes: notePlan.download,
				labels: labelPlan.download,
				tombstones: notePlan.downloadTombstones,
				uploadNoteIds: notePlan.uploadIds,
				uploadLabelIds: labelPlan.uploadIds,
				uploadTombstones: notePlan.uploadTombstones
			});
		}

		if (!Array.isArray(body.notes) || !Array.isArray(body.labels) || !body.tombstones || typeof body.tombstones !== 'object') {
			return json({ error: 'Delta upload requires notes, labels, and tombstones' }, { status: 400 });
		}
		const incomingTombstones = body.tombstones as TombstoneMap;
		user.tombstones = mergeTombstones(user.tombstones, incomingTombstones);
		user.notes = mergeNotes(body.notes as SyncNote[], user.notes)
			.filter((note) => (Number(user.tombstones?.[note.id]) || 0) < Number(note.updatedAt));
		user.labels = mergeLabels(body.labels as SyncLabel[], user.labels);
		user.updatedAt = Date.now();
		writeSyncData(data);

		const noteIds = new Set((body.notes as SyncNote[]).map((note) => note.id));
		const labelIds = new Set((body.labels as SyncLabel[]).map((label) => label.id));
		return response({
			notes: user.notes.filter((note) => noteIds.has(note.id)),
			labels: user.labels.filter((label) => labelIds.has(label.id)),
			tombstones: Object.fromEntries(Object.entries(user.tombstones).filter(([id]) => noteIds.has(id) || id in incomingTombstones))
		});
	} catch (err) {
		console.error('[sync] delta failed:', err);
		return json({ error: 'Sync storage is temporarily unavailable' }, { status: 503 });
	}
};

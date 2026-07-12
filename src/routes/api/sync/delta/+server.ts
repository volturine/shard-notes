import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { mergeLabels, mergeNotes, type SyncLabel, type SyncNote } from '$lib/server/syncMerge';
import { mergeTombstones, planDelta, type ManifestRecord, type TombstoneMap } from '$lib/server/syncDelta';
import { sha256 } from '$lib/syncHash';
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
			const serverNotes = await Promise.all(user.notes.map(async (note) => ({ ...note, hash: await sha256(note) })));
			const serverLabels = await Promise.all(user.labels.map(async (label) => ({ ...label, updatedAt: Number(label.updatedAt) || Number(label.createdAt), hash: await sha256(label) })));
			const notePlan = planDelta(body.manifest.notes, serverNotes, body.manifest.tombstones, user.tombstones);
			const labelPlan = planDelta(body.manifest.labels, serverLabels);
			const stripHash = <T extends { hash?: string }>(record: T) => {
				const { hash: _hash, ...plain } = record;
				return plain;
			};
			const knownImageIds = Object.fromEntries(notePlan.uploadIds.map((noteId) => {
				const stored = user.notes.find((note) => note.id === noteId);
				const storedImages = ((stored?.images as Array<{ id: string; dataUrl?: string }> | undefined) ?? []);
				return [noteId, storedImages.filter((image) => (image.dataUrl?.length ?? 0) > 20).map((image) => image.id)];
			}));
			return response({
				notes: notePlan.download.map(stripHash),
				labels: labelPlan.download.map(stripHash),
				tombstones: notePlan.downloadTombstones,
				uploadNoteIds: notePlan.uploadIds,
				knownImageIds,
				uploadLabelIds: labelPlan.uploadIds,
				uploadTombstones: notePlan.uploadTombstones
			});
		}

		if (!Array.isArray(body.notes) || !Array.isArray(body.labels) || !body.tombstones || typeof body.tombstones !== 'object') {
			return json({ error: 'Delta upload requires notes, labels, and tombstones' }, { status: 400 });
		}
		const incomingTombstones = body.tombstones as TombstoneMap;
		const declaredHashes = (body as { hashes?: { notes?: Record<string, string>; labels?: Record<string, string> } }).hashes;
		for (const note of body.notes as SyncNote[]) {
			if (!declaredHashes?.notes?.[note.id] || declaredHashes.notes[note.id] !== await sha256(note)) return json({ error: `Note hash verification failed for ${note.id}` }, { status: 409 });
		}
		for (const label of body.labels as SyncLabel[]) {
			if (!declaredHashes?.labels?.[label.id] || declaredHashes.labels[label.id] !== await sha256(label)) return json({ error: `Label hash verification failed for ${label.id}` }, { status: 409 });
		}
		const storedById = new Map(user.notes.map((note) => [note.id, note]));
		const hydratedNotes = (body.notes as SyncNote[]).map((note) => {
			const incomingImages = ((note.images as Array<{ id: string; dataUrl?: string }> | undefined) ?? []);
			return {
				...note,
				images: incomingImages.map((image) => {
					if ((image.dataUrl?.length ?? 0) > 20) return image;
					const storedImages = ((storedById.get(note.id)?.images as Array<{ id: string; dataUrl?: string }> | undefined) ?? []);
					const stored = storedImages.find((candidate) => candidate.id === image.id);
					if (!stored?.dataUrl) throw new Error(`Missing image payload for ${note.id}/${image.id}`);
					return { ...image, dataUrl: stored.dataUrl };
				})
			};
		}) as SyncNote[];
		user.tombstones = mergeTombstones(user.tombstones, incomingTombstones);
		user.notes = mergeNotes(hydratedNotes, user.notes)
			.filter((note) => (Number(user.tombstones?.[note.id]) || 0) < Number(note.updatedAt));
		user.labels = mergeLabels(body.labels as SyncLabel[], user.labels);
		user.updatedAt = Date.now();
		writeSyncData(data);

		const noteIds = new Set((body.notes as SyncNote[]).map((note) => note.id));
		const labelIds = new Set((body.labels as SyncLabel[]).map((label) => label.id));
		return response({
			notes: [],
			labels: [],
			ack: {
				notes: Object.fromEntries(await Promise.all((body.notes as SyncNote[]).map(async (note) => [note.id, await sha256(note)]))),
				labels: Object.fromEntries(await Promise.all((body.labels as SyncLabel[]).map(async (label) => [label.id, await sha256(label)])))
			},
			tombstones: Object.fromEntries(Object.entries(user.tombstones).filter(([id]) => noteIds.has(id) || id in incomingTombstones))
		});
	} catch (err) {
		console.error('[sync] delta failed:', err);
		return json({ error: 'Sync storage is temporarily unavailable' }, { status: 503 });
	}
};

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { mergeLabels, mergeNotes, type SyncLabel, type SyncNote } from '$lib/server/syncMerge';
import { mergeTombstones, planDelta, type ManifestRecord, type TombstoneMap } from '$lib/server/syncDelta';
import { sha256 } from '$lib/syncHash';
import { readSyncData, writeSyncData } from '$lib/server/syncStore';
import { canonicalizeSyncNote } from '$lib/server/canonicalImages';

type SyncBoard = SyncNote & { name: string; columns: unknown[] };
type DeltaUser = {
	notes: SyncNote[];
	labels: SyncLabel[];
	boards?: SyncBoard[];
	tombstones?: TombstoneMap;
	labelTombstones?: TombstoneMap;
	boardTombstones?: TombstoneMap;
	updatedAt: number;
};
type ImageManifest = { id: string; hash: string };
type Manifest = {
	notes: (ManifestRecord & { images?: ImageManifest[] })[];
	labels: ManifestRecord[];
	boards?: ManifestRecord[];
	tombstones?: TombstoneMap;
	labelTombstones?: TombstoneMap;
	boardTombstones?: TombstoneMap;
};

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
	let body: {
		syncCode?: unknown;
		manifest?: unknown;
		notes?: unknown;
		labels?: unknown;
		boards?: unknown;
		tombstones?: unknown;
		labelTombstones?: unknown;
		boardTombstones?: unknown;
		hashes?: unknown;
	};
	try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, { status: 400 }); }
	if (typeof body.syncCode !== 'string' || !body.syncCode) return json({ error: 'Sync code is required' }, { status: 400 });

	try {
		const data = readSyncData();
		const user = Object.values(data).find((entry) => entry.syncCode === body.syncCode) as (DeltaUser & { syncCode: string }) | undefined;
		if (!user) return json({ error: 'Invalid sync code' }, { status: 404 });
		user.tombstones ??= {};
		user.labelTombstones ??= {};
		user.boardTombstones ??= {};
		user.boards ??= [];

		if (validManifest(body.manifest)) {
			const serverNotes = await Promise.all(user.notes.map(async (note) => ({ ...note, hash: await sha256(note) })));
			const serverLabels = await Promise.all(user.labels.map(async (label) => ({ ...label, updatedAt: Number(label.updatedAt) || Number(label.createdAt), hash: await sha256(label) })));
			const serverBoards = await Promise.all(user.boards.map(async (board) => ({ ...board, hash: await sha256(board) })));
			const notePlan = planDelta(body.manifest.notes, serverNotes, body.manifest.tombstones, user.tombstones);
			const labelPlan = planDelta(body.manifest.labels, serverLabels, body.manifest.labelTombstones, user.labelTombstones);
			const boardPlan = planDelta(body.manifest.boards ?? [], serverBoards, body.manifest.boardTombstones, user.boardTombstones);
			const stripHash = <T extends { hash?: string }>(record: T) => {
				const { hash: _hash, ...plain } = record;
				return plain;
			};
			const manifestByNoteId = new Map(body.manifest.notes.map((note) => [note.id, note]));
			const knownImageIds = Object.fromEntries(await Promise.all(notePlan.uploadIds.map(async (noteId) => {
				const stored = user.notes.find((note) => note.id === noteId);
				const offered = new Map((manifestByNoteId.get(noteId)?.images ?? []).map((image) => [image.id, image.hash]));
				const storedImages = ((stored?.images as Array<{ id: string; dataUrl?: string }> | undefined) ?? []);
				const known = await Promise.all(storedImages.filter((image) => !!image.dataUrl && offered.has(image.id)).map(async (image) =>
					(await sha256(image.dataUrl)) === offered.get(image.id) ? image.id : null
				));
				return [noteId, known.filter((id): id is string => id !== null)];
			})));
			return response({
				notes: notePlan.download.map(stripHash),
				labels: labelPlan.download.map(stripHash),
				boards: boardPlan.download.map(stripHash),
				tombstones: notePlan.downloadTombstones,
				labelTombstones: labelPlan.downloadTombstones,
				boardTombstones: boardPlan.downloadTombstones,
				uploadNoteIds: notePlan.uploadIds,
				uploadLabelIds: labelPlan.uploadIds,
				uploadBoardIds: boardPlan.uploadIds,
				knownImageIds,
				uploadTombstones: notePlan.uploadTombstones,
				uploadLabelTombstones: labelPlan.uploadTombstones,
				uploadBoardTombstones: boardPlan.uploadTombstones
			});
		}

		if (!Array.isArray(body.notes) || !Array.isArray(body.labels) || !body.tombstones || typeof body.tombstones !== 'object') {
			return json({ error: 'Delta upload requires notes, labels, and tombstones' }, { status: 400 });
		}
		const incomingBoards = Array.isArray(body.boards) ? body.boards as SyncBoard[] : [];
		const incomingTombstones = body.tombstones as TombstoneMap;
		const incomingLabelTombstones = body.labelTombstones && typeof body.labelTombstones === 'object'
			? body.labelTombstones as TombstoneMap
			: {};
		const incomingBoardTombstones = body.boardTombstones && typeof body.boardTombstones === 'object'
			? body.boardTombstones as TombstoneMap
			: {};
		const declaredHashes = body.hashes as { notes?: Record<string, string>; labels?: Record<string, string>; boards?: Record<string, string> } | undefined;
		for (const note of body.notes as SyncNote[]) {
			if (!declaredHashes?.notes?.[note.id] || declaredHashes.notes[note.id] !== await sha256(note)) return json({ error: `Note hash verification failed for ${note.id}` }, { status: 409 });
		}
		for (const label of body.labels as SyncLabel[]) {
			if (!declaredHashes?.labels?.[label.id] || declaredHashes.labels[label.id] !== await sha256(label)) return json({ error: `Label hash verification failed for ${label.id}` }, { status: 409 });
		}
		for (const board of incomingBoards) {
			if (!declaredHashes?.boards?.[board.id] || declaredHashes.boards[board.id] !== await sha256(board)) return json({ error: `Board hash verification failed for ${board.id}` }, { status: 409 });
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
		const canonicalized = hydratedNotes.map(canonicalizeSyncNote);
		const canonicalNotes = canonicalized.map((result) => result.note);
		const convertedNotes = canonicalized.filter((result) => result.changed).map((result) => result.note);
		user.tombstones = mergeTombstones(user.tombstones, incomingTombstones);
		user.labelTombstones = mergeTombstones(user.labelTombstones, incomingLabelTombstones);
		user.boardTombstones = mergeTombstones(user.boardTombstones, incomingBoardTombstones);
		user.notes = mergeNotes(canonicalNotes, user.notes)
			.filter((note) => (Number(user.tombstones?.[note.id]) || 0) < Number(note.updatedAt));
		user.labels = mergeLabels(body.labels as SyncLabel[], user.labels)
			.filter((label) => (Number(user.labelTombstones?.[label.id]) || 0) < Number(label.updatedAt));
		user.boards = mergeNotes(incomingBoards, user.boards)
			.filter((board) => (Number(user.boardTombstones?.[board.id]) || 0) < Number(board.updatedAt)) as SyncBoard[];
		user.updatedAt = Date.now();
		writeSyncData(data);

		const noteIds = new Set((body.notes as SyncNote[]).map((note) => note.id));
		const labelIds = new Set((body.labels as SyncLabel[]).map((label) => label.id));
		const boardIds = new Set(incomingBoards.map((board) => board.id));
		return response({
			notes: convertedNotes,
			labels: [],
			boards: [],
			ack: {
				notes: Object.fromEntries(await Promise.all((body.notes as SyncNote[]).map(async (note) => [note.id, await sha256(note)]))),
				labels: Object.fromEntries(await Promise.all((body.labels as SyncLabel[]).map(async (label) => [label.id, await sha256(label)]))),
				boards: Object.fromEntries(await Promise.all(incomingBoards.map(async (board) => [board.id, await sha256(board)])))
			},
			tombstones: Object.fromEntries(Object.entries(user.tombstones).filter(([id]) => noteIds.has(id) || id in incomingTombstones)),
			labelTombstones: Object.fromEntries(Object.entries(user.labelTombstones).filter(([id]) => labelIds.has(id) || id in incomingLabelTombstones)),
			boardTombstones: Object.fromEntries(Object.entries(user.boardTombstones).filter(([id]) => boardIds.has(id) || id in incomingBoardTombstones))
		});
	} catch (err) {
		console.error('[sync] delta failed:', err);
		return json({ error: 'Sync storage is temporarily unavailable' }, { status: 503 });
	}
};

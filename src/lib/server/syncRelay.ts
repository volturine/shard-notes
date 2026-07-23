import type { EncryptedEnvelope } from '$lib/server/syncStore';

/** A keyed opaque slot generated client-side from a record identity. */
export type OpaqueUpload = { id: string; ciphertext: string; slot: string };

/**
 * Current-state relay. The server never sees plaintext record identities; it only
 * replaces the previous ciphertext in an opaque slot and relays the newest value.
 */
export function applyOpaqueUploads(
	stored: EncryptedEnvelope[],
	nextSeq: number,
	cursor: number,
	uploads: OpaqueUpload[],
	downloadLimit = 0
): { envelopes: EncryptedEnvelope[]; remote: EncryptedEnvelope[]; nextCursor: number; hasMore: boolean; nextSeq: number } {
	const remoteAll = stored.filter((envelope) => envelope.seq > cursor);
	const remote = downloadLimit > 0 ? remoteAll.slice(0, downloadLimit) : remoteAll;
	let envelopes = [...stored];
	const seen = new Set(envelopes.map((envelope) => envelope.id));
	let sequence = Math.max(nextSeq, ...envelopes.map((envelope) => envelope.seq), 0);
	let added = false;
	for (const upload of uploads) {
		if (seen.has(upload.id)) continue;
		envelopes = envelopes.filter((envelope) => envelope.slot !== upload.slot);
		sequence += 1;
		envelopes.push({ seq: sequence, id: upload.id, ciphertext: upload.ciphertext, slot: upload.slot });
		seen.add(upload.id);
		added = true;
	}
	const afterRemote = remote.length ? remote[remote.length - 1].seq : cursor;
	const nextCursor = Math.max(afterRemote, added ? sequence : afterRemote);
	return { envelopes, remote, nextCursor, hasMore: remoteAll.length > remote.length, nextSeq: sequence };
}

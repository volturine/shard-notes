import { describe, expect, it } from 'vitest';
import { applyOpaqueUploads } from './syncRelay';

const slot = (char: string) => char.repeat(64);

describe('current-state opaque relay', () => {
	it('does not echo a device’s own uploads back in the same response', () => {
		const result = applyOpaqueUploads([{ seq: 1, id: 'old', slot: slot('a'), ciphertext: 'remote' }], 1, 1, [{ id: 'mine', slot: slot('b'), ciphertext: 'local' }]);
		expect(result.remote).toEqual([]);
		expect(result.nextCursor).toBe(2);
	});

	it('streams current records in limited fractions', () => {
		const stored = [
			{ seq: 1, id: 'a', slot: slot('a'), ciphertext: 'a' },
			{ seq: 2, id: 'b', slot: slot('b'), ciphertext: 'b' },
			{ seq: 3, id: 'c', slot: slot('c'), ciphertext: 'c' }
		];
		const first = applyOpaqueUploads(stored, 3, 0, [], 2);
		expect(first.remote.map((envelope) => envelope.id)).toEqual(['a', 'b']);
		expect(first.hasMore).toBe(true);
		expect(first.nextCursor).toBe(2);
	});

	it('keeps only the newest ciphertext for a record slot', () => {
		const first = applyOpaqueUploads([], 0, 0, [{ id: 'old', slot: slot('a'), ciphertext: 'first' }]);
		const second = applyOpaqueUploads(first.envelopes, first.nextSeq, 1, [{ id: 'new', slot: slot('a'), ciphertext: 'replacement' }]);
		expect(second.envelopes).toEqual([{ seq: 2, id: 'new', slot: slot('a'), ciphertext: 'replacement' }]);
		expect(second.nextSeq).toBe(2);
		expect(applyOpaqueUploads(second.envelopes, second.nextSeq, 1, []).remote.map((item) => item.id)).toEqual(['new']);
	});
});

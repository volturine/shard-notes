import { describe, expect, it } from 'vitest';
import { extractHttpUrls } from './linkPreview';

describe('extractHttpUrls', () => {
	it('returns distinct HTTP(S) links in their note order', () => {
		expect(extractHttpUrls('Read https://example.com/a then http://example.org/b. Again: https://example.com/a')).toEqual([
			'https://example.com/a',
			'http://example.org/b'
		]);
	});

	it('does not treat checklist syntax or bare domains as previews', () => {
		expect(extractHttpUrls('[ ] example.com\n[x] https://docs.example.com/guide')).toEqual([
			'https://docs.example.com/guide'
		]);
	});
});

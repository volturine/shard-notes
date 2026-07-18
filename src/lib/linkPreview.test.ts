import { describe, expect, it } from 'vitest';
import { extractHttpUrls, isUsableLinkPreview, normalizePreviewUrl } from './linkPreview';

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

	it('does not cap the number of distinct links', () => {
		const body = [1, 2, 3, 4, 5].map((n) => `https://example.com/${n}`).join('\n');
		expect(extractHttpUrls(body)).toHaveLength(5);
	});
});

describe('normalizePreviewUrl', () => {
	it('strips hash but keeps path so pages stay distinct', () => {
		expect(normalizePreviewUrl('https://github.com/org/repo#readme')).toBe('https://github.com/org/repo');
		expect(normalizePreviewUrl('https://github.com/org/other')).toBe('https://github.com/org/other');
	});
});

describe('isUsableLinkPreview', () => {
	it('rejects hostname-as-title cards with no assets', () => {
		expect(
			isUsableLinkPreview({
				url: 'https://github.com/org/repo',
				hostname: 'github.com',
				title: 'github.com'
			})
		).toBe(false);
	});

	it('accepts real titles and hostname titles that still have an icon/image', () => {
		expect(
			isUsableLinkPreview({
				url: 'https://github.com/org/repo',
				hostname: 'github.com',
				title: 'GitHub - org/repo: cool stuff',
				image: 'https://opengraph.githubassets.com/abc/org/repo',
				icon: 'https://github.com/favicon.ico'
			})
		).toBe(true);
		expect(
			isUsableLinkPreview({
				url: 'https://github.com/org/repo',
				hostname: 'github.com',
				title: 'github.com',
				icon: 'https://github.com/favicon.ico'
			})
		).toBe(true);
	});
});

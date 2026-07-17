const HTTP_URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

export type LinkPreview = {
	url: string;
	hostname: string;
	title: string;
	description?: string;
	image?: string;
};

function cleanUrl(raw: string): string {
	return raw.replace(/[.,!?;:]+$/, '').replace(/\)+$/, '');
}

/** Returns unique HTTP(S) URLs in the order they appear in a note. */
export function extractHttpUrls(text: string): string[] {
	const urls: string[] = [];
	const seen = new Set<string>();

	for (const match of text.matchAll(HTTP_URL_RE)) {
		const value = cleanUrl(match[0]);
		try {
			const url = new URL(value);
			if ((url.protocol !== 'http:' && url.protocol !== 'https:') || seen.has(url.href)) continue;
			seen.add(url.href);
			urls.push(url.href);
		} catch {
			// Ignore malformed text that happened to begin with http(s).
		}
	}

	return urls;
}

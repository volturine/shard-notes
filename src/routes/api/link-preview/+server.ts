import { json } from '@sveltejs/kit';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { RequestHandler } from './$types';
import type { LinkPreview } from '$lib/linkPreview';

const MAX_HTML_BYTES = 300_000;
const MAX_REDIRECTS = 3;

function isBlockedIp(address: string): boolean {
	if (isIP(address) === 4) {
		const [a, b] = address.split('.').map(Number);
		return a === 0 || a === 10 || a === 127 || a >= 224 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168);
	}

	const normalized = address.toLowerCase();
	if (normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true;
	const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	return ipv4Mapped ? isBlockedIp(ipv4Mapped[1]) : false;
}

async function safeHttpUrl(value: string): Promise<URL> {
	const url = new URL(value);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP(S) links can be previewed');
	if (url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
		throw new Error('This link cannot be previewed');
	}

	const addresses = await lookup(url.hostname, { all: true, verbatim: true });
	if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) {
		throw new Error('This link cannot be previewed');
	}
	return url;
}

async function readLimitedBody(response: Response): Promise<string> {
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_HTML_BYTES) throw new Error('Preview page is too large');
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

function decodeHtml(value: string): string {
	return value
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&#(x[\da-f]+|\d+);/gi, (_, entity: string) => String.fromCodePoint(
			entity[0].toLowerCase() === 'x' ? Number.parseInt(entity.slice(1), 16) : Number.parseInt(entity, 10)
		));
}

function attribute(tag: string, name: string): string | null {
	const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
	return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function metaContent(html: string, key: string): string | null {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		const property = attribute(tag, 'property')?.toLowerCase();
		const name = attribute(tag, 'name')?.toLowerCase();
		if (property === key || name === key) return attribute(tag, 'content');
	}
	return null;
}

function cleanText(value: string | null | undefined, limit: number): string | undefined {
	if (!value) return undefined;
	const text = decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
	return text ? text.slice(0, limit) : undefined;
}

function absoluteHttpUrl(value: string | null, base: URL): string | undefined {
	if (!value) return undefined;
	try {
		const url = new URL(decodeHtml(value), base);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
	} catch {
		return undefined;
	}
}

function parsePreview(html: string, pageUrl: URL): LinkPreview {
	const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
	const title = cleanText(metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title') ?? titleTag, 160) ?? pageUrl.hostname;
	const description = cleanText(metaContent(html, 'og:description') ?? metaContent(html, 'twitter:description') ?? metaContent(html, 'description'), 240);
	const image = absoluteHttpUrl(metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image'), pageUrl);
	return { url: pageUrl.href, hostname: pageUrl.hostname.replace(/^www\./, ''), title, ...(description ? { description } : {}), ...(image ? { image } : {}) };
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const supplied = url.searchParams.get('url');
	if (!supplied || supplied.length > 2_048) return json({ error: 'A valid link is required' }, { status: 400 });

	try {
		let pageUrl = await safeHttpUrl(supplied);
		for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
			const response = await fetch(pageUrl, {
				redirect: 'manual',
				signal: AbortSignal.timeout(8_000),
				headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Shard link preview' }
			});
			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get('location');
				if (!location || redirect === MAX_REDIRECTS) throw new Error('Too many redirects');
				pageUrl = await safeHttpUrl(new URL(location, pageUrl).href);
				continue;
			}
			if (!response.ok) throw new Error(`The page returned ${response.status}`);
			if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) throw new Error('The link is not an HTML page');
			const contentLength = Number(response.headers.get('content-length') ?? 0);
			if (contentLength > MAX_HTML_BYTES) throw new Error('Preview page is too large');
			return json(parsePreview(await readLimitedBody(response), pageUrl), { headers: { 'cache-control': 'public, max-age=3600' } });
		}
		throw new Error('Too many redirects');
	} catch (error) {
		console.warn('[link-preview]', error instanceof Error ? error.message : error);
		return json({ error: 'Preview unavailable' }, { status: 422 });
	}
};

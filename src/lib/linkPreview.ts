import { getCachedLinkPreview, putCachedLinkPreview } from '$lib/db/idb';

const HTTP_URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

export type LinkPreview = {
	url: string;
	hostname: string;
	title: string;
	description?: string;
	image?: string;
	icon?: string;
};

function cleanUrl(raw: string): string {
	return raw.replace(/[.,!?;:]+$/, '').replace(/\)+$/, '');
}

/** Stable cache key for a link (strip hash; keep path/query so pages differ). */
export function normalizePreviewUrl(value: string): string | null {
	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		url.hash = '';
		return url.href;
	} catch {
		return null;
	}
}

/** Returns unique HTTP(S) URLs in the order they appear in a note. */
export function extractHttpUrls(text: string): string[] {
	const urls: string[] = [];
	const seen = new Set<string>();

	for (const match of text.matchAll(HTTP_URL_RE)) {
		const value = cleanUrl(match[0]);
		const href = normalizePreviewUrl(value);
		if (!href || seen.has(href)) continue;
		seen.add(href);
		urls.push(href);
	}

	return urls;
}

/**
 * True when saved metadata is a real unfurl (not hostname-as-title with no assets).
 * Hostname-only cards are failed unfurls and should be re-fetched.
 */
export function isUsableLinkPreview(preview: LinkPreview | null | undefined): preview is LinkPreview {
	if (!preview?.title) return false;
	const host = preview.hostname?.toLowerCase?.() ?? '';
	const title = preview.title.trim().toLowerCase();
	if (!title) return false;
	if (host && (title === host || title === `www.${host}`)) {
		return Boolean(preview.image || preview.icon);
	}
	return true;
}

const memoryCache = new Map<string, LinkPreview>();
const inflight = new Map<string, Promise<LinkPreview | null>>();

function clonePreview(preview: LinkPreview, url = preview.url): LinkPreview {
	return {
		url,
		hostname: preview.hostname,
		title: preview.title,
		...(preview.description ? { description: preview.description } : {}),
		...(preview.image ? { image: preview.image } : {}),
		...(preview.icon ? { icon: preview.icon } : {})
	};
}

/** Remember a usable preview in memory + IndexedDB so every note can reuse it. */
export function rememberLinkPreview(preview: LinkPreview): void {
	if (!isUsableLinkPreview(preview)) return;
	const key = normalizePreviewUrl(preview.url);
	if (!key) return;
	const stored = clonePreview(preview, key);
	memoryCache.set(key, stored);
	void putCachedLinkPreview(stored).catch(() => undefined);
}

/** Seed the shared cache from note-attached previews (e.g. after load/sync). */
export function rememberLinkPreviews(previews: Iterable<LinkPreview | null | undefined>): void {
	for (const preview of previews) {
		if (preview) rememberLinkPreview(preview);
	}
}

async function readCached(key: string): Promise<LinkPreview | null> {
	const mem = memoryCache.get(key);
	if (isUsableLinkPreview(mem)) return clonePreview(mem, key);

	try {
		const stored = await getCachedLinkPreview(key);
		if (isUsableLinkPreview(stored)) {
			const next = clonePreview(stored, key);
			memoryCache.set(key, next);
			return next;
		}
	} catch {
		// IDB unavailable (SSR / private mode) — fall through to network.
	}
	return null;
}

/**
 * Resolve metadata for a link: shared cache first (memory → IDB), then one network pull.
 * Successful results are saved and reused across notes.
 */
export async function fetchLinkPreview(url: string, signal?: AbortSignal): Promise<LinkPreview | null> {
	const key = normalizePreviewUrl(url);
	if (!key) return null;
	if (signal?.aborted) return null;

	const cached = await readCached(key);
	if (cached) return cached;

	const existing = inflight.get(key);
	if (existing) {
		const shared = await existing;
		return shared ? clonePreview(shared, key) : null;
	}

	const request = (async (): Promise<LinkPreview | null> => {
		try {
			const response = await fetch(`/api/link-preview?url=${encodeURIComponent(key)}`, { signal });
			if (!response.ok) return null;
			const data = await response.json() as LinkPreview;
			if (!isUsableLinkPreview(data)) return null;
			const preview = clonePreview(data, key);
			memoryCache.set(key, preview);
			void putCachedLinkPreview(preview).catch(() => undefined);
			return preview;
		} catch {
			return null;
		} finally {
			inflight.delete(key);
		}
	})();

	inflight.set(key, request);
	return request;
}

/** Look up a cached preview without hitting the network. */
export async function peekLinkPreview(url: string): Promise<LinkPreview | null> {
	const key = normalizePreviewUrl(url);
	if (!key) return null;
	return readCached(key);
}

// Service worker — caches the app shell so iOS reloads are instant.
// When iOS reloads the standalone web app, this serves the cached HTML/CSS/JS
// immediately instead of fetching from the network.

const CACHE_NAME = 'keep-clone-v1';
const APP_SHELL = [
	'/',
	'/manifest.json',
	'/icon-192.png',
	'/icon-512.png',
	'/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
		).then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	// Only handle GET requests.
	if (req.method !== 'GET') return;

	const url = new URL(req.url);

	// Don't intercept API calls (sync) — always go to network.
	if (url.pathname.startsWith('/api/')) return;

	// For navigation requests (page loads), try network first, fall back to cache.
	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req)
				.then((res) => {
					const copy = res.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
					return res;
				})
				.catch(() => caches.match(req).then((res) => res || caches.match('/')))
		);
		return;
	}

	// For other requests (CSS, JS, images), try cache first, then network.
	event.respondWith(
		caches.match(req).then((cached) => {
			if (cached) return cached;
			return fetch(req).then((res) => {
				if (res.ok && url.origin === self.location.origin) {
					const copy = res.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
				}
				return res;
			});
		})
	);
});
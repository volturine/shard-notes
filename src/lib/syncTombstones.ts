// Small durable delete manifest. Tombstones prevent a permanently deleted note from being
// resurrected by an older device during delta sync.
const KEY = 'gkc-note-tombstones';

export type Tombstones = Record<string, number>;

export function readTombstones(): Tombstones {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(KEY);
		const parsed = raw ? JSON.parse(raw) : {};
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		return Object.fromEntries(Object.entries(parsed).filter(([, at]) => Number(at) > 0).map(([id, at]) => [id, Number(at)]));
	} catch (err) {
		console.error('[sync] could not read delete tombstones:', err);
		return {};
	}
}

export function writeTombstones(tombstones: Tombstones): void {
	if (typeof localStorage === 'undefined') return;
	try { localStorage.setItem(KEY, JSON.stringify(tombstones)); }
	catch (err) { console.error('[sync] could not save delete tombstones:', err); }
}

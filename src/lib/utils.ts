// Small utility helpers shared across components and stores.

/** Generate a reasonably unique id (crypto when available, fallback to Math.random). */
export function uid(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Format epoch ms as a human-friendly relative-ish string. */
export function formatReminder(ts: number | null): string {
	if (ts == null) return '';
	const d = new Date(ts);
	const now = new Date();
	const sameDay = d.toDateString() === now.toDateString();
	const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	if (sameDay) return `Today, ${time}`;
	const tomorrow = new Date(now);
	tomorrow.setDate(now.getDate() + 1);
	if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
	return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

/** Days a trashed note has been sitting in the trash. */
export function daysSinceTrashed(trashedAt: number | null): number {
	if (trashedAt == null) return Infinity;
	return (Date.now() - trashedAt) / (1000 * 60 * 60 * 24);
}

export const TRASH_PURGE_DAYS = 7;

/** Convert epoch ms to a datetime-local input value (local time, YYYY-MM-DDTHH:mm). */
export function toDatetimeLocal(ts: number | null): string {
	if (ts == null) return '';
	const d = new Date(ts);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert a datetime-local input value to epoch ms. */
export function fromDatetimeLocal(value: string): number | null {
	if (!value) return null;
	const t = new Date(value).getTime();
	return Number.isNaN(t) ? null : t;
}

/** Deep-clone a note for editing without mutating the stored one. */
export function cloneNote(note: import('$lib/types').Note): import('$lib/types').Note {
	return {
		...note,
		items: note.items.map((i) => ({ ...i })),
		labels: [...note.labels],
		images: note.images ? note.images.map((i) => ({ ...i })) : []
	};
}

/** Download a JSON backup file in the browser. */
export function downloadJSON(data: unknown, filename: string): void {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
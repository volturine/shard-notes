import type { Note } from './types';

/** Lines like `[ ] task`, `[] task`, `[x] done`, `- [ ] item` */
export const CHECK_RE = /^\s*(?:[-*•]\s+)?\[([xX ]?)\]\s*(.*)$/;

export type BodySegment =
	| { type: 'text'; text: string; lineIndex: number }
	| { type: 'check'; checked: boolean; text: string; lineIndex: number };

export function parseBody(body: string): BodySegment[] {
	if (body === '') return [{ type: 'text', text: '', lineIndex: 0 }];
	return body.split('\n').map((line, lineIndex) => {
		const m = line.match(CHECK_RE);
		if (m) {
			const checked = m[1].trim().toLowerCase() === 'x';
			return { type: 'check' as const, checked, text: m[2] ?? '', lineIndex };
		}
		return { type: 'text' as const, text: line, lineIndex };
	});
}

export function toggleLineAt(body: string, lineIndex: number): string {
	const lines = body.split('\n');
	const line = lines[lineIndex];
	if (!line || !CHECK_RE.test(line)) return body;
	if (/\[[xX]\]/.test(line)) {
		lines[lineIndex] = line.replace(/\[[xX]\]/, '[ ]');
	} else {
		lines[lineIndex] = line.replace(/\[\s*\]/, '[x]');
	}
	return lines.join('\n');
}

export function noteAttachments(note: Note) {
	return note.images ?? [];
}

/** @deprecated use noteAttachments */
export const noteImages = noteAttachments;

export function noteToPlainText(note: Note): string {
	const atts = noteAttachments(note);
	const imgs = atts.filter((a) => a.mime.startsWith('image/')).length;
	const files = atts.length - imgs;
	const parts: string[] = [];
	if (imgs) parts.push(`${imgs} image(s)`);
	if (files) parts.push(`${files} file(s)`);
	const suffix = parts.length ? `\n[${parts.join(', ')}]` : '';
	return `${note.title}\n${note.body ?? ''}${suffix}`.trim();
}

/**
 * Sanitize notes from storage/sync into the current model.
 * Still folds pre-checklist `kind: 'list'` + `items` into body lines once.
 */
export function normalizeNote(raw: Record<string, unknown> | Note): Note {
	const n = raw as Note & {
		items?: { id?: string; text?: string; checked?: boolean }[];
		kind?: string;
	};
	let body = String(n.body ?? '');
	if (n.kind === 'list' && Array.isArray(n.items) && n.items.length > 0 && !body.trim()) {
		body = n.items
			.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text ?? ''}`)
			.join('\n');
	}
	return {
		id: String(n.id),
		title: String(n.title ?? ''),
		body,
		color: n.color ?? 'default',
		pinned: Boolean(n.pinned),
		archived: Boolean(n.archived),
		trashed: Boolean(n.trashed),
		trashedAt: n.trashedAt ?? null,
		createdAt: Number(n.createdAt),
		updatedAt: Number(n.updatedAt),
		reminder: n.reminder ?? null,
		labels: [...(n.labels ?? [])],
		images: (n.images ?? []).map((image) => ({
			id: String(image.id),
			mime: String(image.mime || 'image/jpeg'),
			name: image.name == null ? undefined : String(image.name),
			createdAt: Number(image.createdAt ?? 0),
			dataUrl: String(image.dataUrl ?? '')
		}))
	};
}

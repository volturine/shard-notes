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

export function noteToPlainText(note: Note): string {
	const attachments = noteAttachments(note);
	const images = attachments.filter((attachment) => attachment.mime.startsWith('image/')).length;
	const files = attachments.length - images;
	const parts = [images && `${images} image(s)`, files && `${files} file(s)`].filter(Boolean);
	const suffix = parts.length ? `\n[${parts.join(', ')}]` : '';
	return `${note.title}\n${note.body}${suffix}`.trim();
}

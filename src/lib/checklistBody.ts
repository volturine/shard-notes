import type { Note } from './types';

/** Lines like `[ ] task`, `[] task`, `[x] done`, `- [ ] item` */
const CHECK_RE = /^\s*(?:[-*•]\s+)?\[([xX ]?)\]\s*(.*)$/;

export type BodyLine =
	| { type: 'text'; text: string; lineIndex: number }
	| { type: 'check'; checked: boolean; text: string; lineIndex: number };

/** Unified body: legacy list notes are shown as checklist lines in body. */
export function effectiveBody(note: Note): string {
	if (note.kind === 'list' && note.items.length > 0) {
		return note.items.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text}`).join('\n');
	}
	return note.body ?? '';
}

export function parseBody(body: string): BodyLine[] {
	return body.split('\n').map((line, lineIndex) => {
		const m = line.match(CHECK_RE);
		if (m) {
			const checked = m[1].trim().toLowerCase() === 'x';
			return { type: 'check', checked, text: m[2] ?? '', lineIndex };
		}
		return { type: 'text', text: line, lineIndex };
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

export function noteToPlainText(note: Note): string {
	const body = effectiveBody(note);
	return `${note.title}\n${body}`.trim();
}
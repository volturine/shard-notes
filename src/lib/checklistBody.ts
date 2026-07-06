import type { Note } from './types';

/** Lines like `[ ] task`, `[] task`, `[x] done`, `- [ ] item` */
const CHECK_RE = /^\s*(?:[-*•]\s+)?\[([xX ]?)\]\s*(.*)$/;

export type BodySegment =
	| { type: 'text'; text: string; lineIndex: number }
	| { type: 'check'; checked: boolean; text: string; lineIndex: number }
	| { type: 'code'; lang: string; code: string; key: string };

/** @deprecated use BodySegment */
export type BodyLine = Extract<BodySegment, { type: 'text' } | { type: 'check' }>;

const FENCE_RE = /```([^\n]*)\n([\s\S]*?)```/g;

/** Unified body: legacy list notes are shown as checklist lines in body. */
export function effectiveBody(note: Note): string {
	if (note.kind === 'list' && note.items.length > 0) {
		return note.items.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text}`).join('\n');
	}
	return note.body ?? '';
}

function parseTextChunk(chunk: string, lineOffset: number): BodySegment[] {
	return chunk.split('\n').map((line, i) => {
		const lineIndex = lineOffset + i;
		const m = line.match(CHECK_RE);
		if (m) {
			const checked = m[1].trim().toLowerCase() === 'x';
			return { type: 'check' as const, checked, text: m[2] ?? '', lineIndex };
		}
		return { type: 'text' as const, text: line, lineIndex };
	});
}

export function parseBody(body: string): BodySegment[] {
	const segments: BodySegment[] = [];
	let last = 0;
	let codeIndex = 0;
	FENCE_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = FENCE_RE.exec(body)) !== null) {
		if (m.index > last) {
			const chunk = body.slice(last, m.index);
			const lineOffset = segments.length ? segments[segments.length - 1].lineIndex + 1 : 0;
			segments.push(...parseTextChunk(chunk, lineOffset));
		}
		segments.push({
			type: 'code',
			lang: m[1].trim(),
			code: m[2].replace(/\n$/, ''),
			key: `code-${codeIndex++}`
		});
		last = m.index + m[0].length;
	}
	if (last < body.length) {
		const lineOffset = segments.filter((s) => s.type !== 'code').length;
		segments.push(...parseTextChunk(body.slice(last), lineOffset));
	}
	if (segments.length === 0 && body === '') {
		return [{ type: 'text', text: '', lineIndex: 0 }];
	}
	return segments;
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

export function insertCodeBlock(body: string): string {
	const fence = '```\n\n```';
	if (!body.trim()) return fence;
	if (body.endsWith('\n')) return `${body}${fence}`;
	return `${body}\n\n${fence}`;
}

export function noteImages(note: Note) {
	return note.images ?? [];
}

export function noteToPlainText(note: Note): string {
	const body = effectiveBody(note);
	const imgs = noteImages(note).length ? `\n[${noteImages(note).length} image(s)]` : '';
	return `${note.title}\n${body}${imgs}`.trim();
}
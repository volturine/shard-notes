<script lang="ts">
	import { CHECK_RE } from '$lib/checklistBody';

	let {
		body = $bindable(''),
		oninput,
		placeholder = '',
		focusSignal = 0
	}: {
		body?: string;
		oninput?: () => void;
		placeholder?: string;
		focusSignal?: number;
	} = $props();

	type Line = { id: number; text: string; checked: boolean; isCheck: boolean };

	let lineIdCounter = 0;
	function newLine(text = '', isCheck = false, checked = false): Line {
		return { id: lineIdCounter++, text, isCheck, checked };
	}

	function parseBodyToLines(body: string): Line[] {
		if (!body) return [newLine()];
		let inCode = false;
		return body.split('\n').map((text) => {
			if (text.trim().startsWith('```')) {
				inCode = !inCode;
				return newLine(text, false);
			}
			if (inCode) return newLine(text, false);
			const m = text.match(CHECK_RE);
			if (m) return newLine(m[2] ?? '', true, m[1].trim().toLowerCase() === 'x');
			return newLine(text, false);
		});
	}

	function serializeLines(lines: Line[]): string {
		return lines
			.map((l) => (l.isCheck ? `${l.checked ? '[x]' : '[ ]'} ${l.text}` : l.text))
			.join('\n');
	}

	let lines = $state<Line[]>([newLine()]);
	let container: HTMLDivElement | null = $state(null);
	let pendingFocus = $state<number | null>(null);
	let pendingCursor = $state<number | null>(null);

	let lastBody = '';
	$effect(() => {
		if (body !== lastBody) {
			lastBody = body;
			lines = parseBodyToLines(body);
		}
	});

	function syncBody() {
		const newBody = serializeLines(lines);
		lastBody = newBody;
		body = newBody;
		oninput?.();
	}

	function onLineInput(i: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const value = input.value;

		// Plain text line → auto-convert to checklist when user types [ ] / [x]
		if (!lines[i].isCheck) {
			const m = value.match(CHECK_RE);
			if (m) {
				lines[i].isCheck = true;
				lines[i].checked = m[1].trim().toLowerCase() === 'x';
				lines[i].text = m[2] ?? '';
				syncBody();
				return;
			}
		}

		lines[i].text = value;
		syncBody();
	}

	function toggleCheck(i: number, e: MouseEvent) {
		e.stopPropagation();
		lines[i].checked = !lines[i].checked;
		syncBody();
	}

	function onLineKeydown(e: KeyboardEvent, i: number) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const line = lines[i];

			if (line.isCheck && line.text.trim() === '') {
				// Empty checklist + Enter → remove checkbox, become plain text
				lines[i].isCheck = false;
				lines[i].checked = false;
				syncBody();
				pendingFocus = i;
				pendingCursor = 0;
			} else if (line.isCheck) {
				// Checklist with text + Enter → new pre-populated checklist line
				lines.splice(i + 1, 0, newLine('', true));
				syncBody();
				pendingFocus = i + 1;
				pendingCursor = 0;
			} else {
				// Plain text + Enter → new plain text line
				lines.splice(i + 1, 0, newLine());
				syncBody();
				pendingFocus = i + 1;
				pendingCursor = 0;
			}
		} else if (e.key === 'Backspace' && i > 0) {
			const input = e.target as HTMLInputElement;
			if (input.selectionStart === 0 && input.selectionEnd === 0) {
				e.preventDefault();
				// Merge with previous line
				const prevLine = lines[i - 1];
				const prevLen = prevLine.text.length;
				prevLine.text += lines[i].text;
				lines.splice(i, 1);
				syncBody();
				pendingFocus = i - 1;
				pendingCursor = prevLen;
			}
		}
	}

	// Focus pending line after DOM update
	$effect(() => {
		if (pendingFocus !== null) {
			const idx = pendingFocus;
			const cursor = pendingCursor;
			pendingFocus = null;
			pendingCursor = null;
			queueMicrotask(() => {
				const el = container?.querySelector(`[data-line="${idx}"]`) as HTMLInputElement;
				if (el) {
					el.focus();
					if (cursor !== null) el.setSelectionRange(cursor, cursor);
				}
			});
		}
	});

	// Focus first line when focusSignal changes (title Enter → body)
	$effect(() => {
		if (focusSignal > 0) {
			queueMicrotask(() => {
				const el = container?.querySelector('[data-line="0"]') as HTMLInputElement;
				if (el) el.focus();
			});
		}
	});
</script>

<div bind:this={container} class="block w-full text-sm leading-relaxed text-[var(--gkc-text)]">
	{#each lines as line, i (line.id)}
		<div class="flex items-start gap-2 py-0.5">
			{#if line.isCheck}
				<button
					type="button"
					data-checklist-toggle
					class="mt-0.5 h-4 w-4 shrink-0 rounded border border-black/40 dark:border-white/40 flex items-center justify-center text-[10px]"
					style={line.checked ? 'background: rgba(0,0,0,0.1)' : ''}
					onclick={(e) => toggleCheck(i, e)}
					aria-label="Toggle item"
				>
					{#if line.checked}✓{/if}
				</button>
			{/if}
			<input
				type="text"
				data-line={i}
				value={line.text}
				oninput={(e) => onLineInput(i, e)}
				onkeydown={(e) => onLineKeydown(e, i)}
				placeholder={i === 0 && lines.length === 1 && !line.isCheck ? placeholder : ''}
				class="flex-1 min-w-0 bg-transparent outline-none placeholder:text-[var(--gkc-text-muted)] {line.checked ? 'line-through opacity-50' : ''}"
			/>
		</div>
	{/each}
</div>

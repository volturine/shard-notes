<script lang="ts">
	import { tick } from 'svelte';
	import { CHECK_RE, formatCheckLine, parseCheckLine } from '$lib/checklistBody';

	const MAX_TASK_INDENT = 1;

	let {
		body = $bindable(''),
		oninput,
		placeholder = '',
		focusSignal = 0,
		focusLine = null,
		onFocusTask,
		onExitTaskFocus
	}: {
		body?: string;
		oninput?: () => void;
		placeholder?: string;
		focusSignal?: number;
		focusLine?: number | null;
		onFocusTask?: (line: number) => void;
		onExitTaskFocus?: () => void;
	} = $props();

	type Line = { id: number; text: string; checked: boolean; isCheck: boolean; indent: number };

	let lineIdCounter = 0;
	function newLine(text = '', isCheck = false, checked = false, indent = 0): Line {
		return { id: lineIdCounter++, text, isCheck, checked, indent: Math.max(0, Math.min(MAX_TASK_INDENT, indent)) };
	}

	function parseBodyToLines(raw: string): Line[] {
		if (!raw) return [newLine()];
		return raw.split('\n').map((text) => {
			const check = parseCheckLine(text);
			if (check) return newLine(check.text, true, check.checked, check.indent);
			return newLine(text, false);
		});
	}

	function serializeLines(rows: Line[]): string {
		return rows
			.map((l) => (l.isCheck ? formatCheckLine(l.indent, l.checked, l.text) : l.text))
			.join('\n');
	}

	let lines = $state<Line[]>([newLine()]);
	let container: HTMLDivElement | null = $state(null);
	let pendingFocus = $state<number | null>(null);
	let pendingCursor = $state<number | null>(null);
	let focusedRootId = $state<number | null>(null);
	let draftSubtaskId = $state<number | null>(null);
	let handledFocusSignal = 0;

	let lastBody = '';
	$effect(() => {
		if (body !== lastBody) {
			lastBody = body;
			lines = parseBodyToLines(body);
		}
	});

	function syncBody() {
		// A newly added blank sub-task is UI-only until the user enters text.
		const newBody = serializeLines(lines.filter((line) => line.id !== draftSubtaskId));
		lastBody = newBody;
		body = newBody;
		oninput?.();
	}

	function onLineInput(i: number, e: Event) {
		const input = e.target as HTMLTextAreaElement;
		const value = input.value;

		// Plain text line → auto-convert to checklist when user types [ ] / [x]
		if (!lines[i].isCheck) {
			const m = value.match(CHECK_RE);
			if (m) {
				const check = parseCheckLine(value);
				lines[i].isCheck = true;
				lines[i].checked = check?.checked ?? false;
				lines[i].indent = check?.indent ?? 0;
				lines[i].text = check?.text ?? '';
				syncBody();
				return;
			}
		}

		lines[i].text = value;
		if (lines[i].id === draftSubtaskId && value.trim()) draftSubtaskId = null;
		syncBody();
	}

	function toggleCheck(i: number, e: MouseEvent) {
		e.stopPropagation();
		lines[i].checked = !lines[i].checked;
		syncBody();
	}

	function indentLine(i: number, delta: number) {
		const line = lines[i];
		if (!line.isCheck) return false;
		const next = Math.max(0, Math.min(MAX_TASK_INDENT, line.indent + delta));
		if (next === line.indent) return false;
		// Sub-task can only be one level deeper than the previous checklist item.
		if (delta > 0) {
			const prev = [...lines.slice(0, i)].reverse().find((row) => row.isCheck);
			const maxAllowed = prev ? prev.indent + 1 : 0;
			line.indent = Math.min(next, maxAllowed, MAX_TASK_INDENT);
		} else {
			line.indent = next;
		}
		return true;
	}

	function onLineKeydown(e: KeyboardEvent, i: number) {
		if (e.key === 'Tab' && lines[i].isCheck) {
			e.preventDefault();
			if (indentLine(i, e.shiftKey ? -1 : 1)) {
				syncBody();
				pendingFocus = i;
				const input = e.target as HTMLTextAreaElement;
				pendingCursor = input.selectionStart;
			}
			return;
		}

		if (e.key === 'Enter') {
			e.preventDefault();
			const line = lines[i];
			const input = e.target as HTMLTextAreaElement;
			const start = input.selectionStart;
			const end = input.selectionEnd;

			if (line.isCheck && line.text.trim() === '') {
				if (line.id === draftSubtaskId) {
					lines.splice(i, 1);
					draftSubtaskId = null;
					pendingFocus = Math.max(0, i - 1);
					pendingCursor = null;
					return;
				}
				if (line.indent > 0) {
					// Empty sub-task + Enter → outdent one level
					line.indent -= 1;
					syncBody();
					pendingFocus = i;
					pendingCursor = 0;
				} else {
					// Empty top-level checklist + Enter → plain text
					line.isCheck = false;
					line.checked = false;
					line.indent = 0;
					syncBody();
					pendingFocus = i;
					pendingCursor = 0;
				}
			} else {
				// Split at the cursor: text after it moves to the newly-created line.
				const before = line.text.slice(0, start);
				const after = line.text.slice(end);
				line.text = before;
				// A split with trailing text turns that remainder into a direct sub-task.
				// At the end of a task (or within a sub-task), Enter stays at the same level.
				const splitIntoSubtask = line.isCheck && line.indent === 0 && after.length > 0;
				if (line.isCheck) {
					lines.splice(i + 1, 0, newLine(after, true, false, splitIntoSubtask ? 1 : line.indent));
				} else {
					lines.splice(i + 1, 0, newLine(after));
				}
				syncBody();
				pendingFocus = i + 1;
				pendingCursor = 0;
			}
			return;
		}

		if (e.key === 'Backspace' && i > 0) {
			const input = e.target as HTMLTextAreaElement;
			if (input.selectionStart === 0 && input.selectionEnd === 0) {
				e.preventDefault();
				const line = lines[i];
				// At start of indented task: outdent before merging
				if (line.isCheck && line.indent > 0) {
					line.indent -= 1;
					syncBody();
					pendingFocus = i;
					pendingCursor = 0;
					return;
				}
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

	function parentTaskIndex(index: number): number {
		const line = lines[index];
		if (!line?.isCheck || line.indent === 0) return index;
		for (let i = index - 1; i >= 0; i--) {
			if (lines[i].isCheck && lines[i].indent === 0) return i;
		}
		return index;
	}

	function addSubtask(rootIndex: number) {
		const root = lines[rootIndex];
		// Two levels only: a sub-task cannot have sub-tasks.
		if (!root?.isCheck || root.indent !== 0) return;
		if (draftSubtaskId !== null) {
			const existingIndex = lines.findIndex((line) => line.id === draftSubtaskId);
			if (existingIndex >= 0) {
				pendingFocus = existingIndex;
				pendingCursor = 0;
				return;
			}
			// Discard a stale draft marker and make a fresh editable row.
			draftSubtaskId = null;
		}
		let insertAt = rootIndex + 1;
		while (insertAt < lines.length && (!lines[insertAt].isCheck || lines[insertAt].indent > root.indent)) {
			insertAt += 1;
		}
		const draft = newLine('', true, false, 1);
		lines.splice(insertAt, 0, draft);
		draftSubtaskId = draft.id;
		pendingFocus = insertAt;
		pendingCursor = 0;
	}

	async function focusLineAfterRender(idx: number, cursor: number | null) {
		await tick();
		requestAnimationFrame(() => {
			const el = container?.querySelector(`[data-line="${idx}"]`) as HTMLTextAreaElement;
			if (!el) return;
			const scroller = container?.closest('.scrollable') as HTMLElement | null;
			const scrollTop = scroller?.scrollTop ?? 0;
			try {
				el.focus({ preventScroll: true });
			} catch {
				el.focus();
			}
			if (cursor !== null) el.setSelectionRange(cursor, cursor);
			const restoreScroll = () => {
				if (scroller) scroller.scrollTop = scrollTop;
			};
			restoreScroll();
			requestAnimationFrame(restoreScroll);
			setTimeout(restoreScroll, 0);
		});
	}

	// Focus pending line after DOM update
		$effect(() => {
			if (pendingFocus !== null) {
				const idx = pendingFocus;
				const cursor = pendingCursor;
				pendingFocus = null;
				pendingCursor = null;
				void focusLineAfterRender(idx, cursor);
			}
		});

	// Focus a tapped task, or leave the sub-view and restore the full note.
	$effect(() => {
		if (focusSignal <= 0 || focusSignal === handledFocusSignal) return;
		handledFocusSignal = focusSignal;
		if (focusLine === null) {
			const restoreLineId = focusedRootId;
			const fallbackLineId = focusedRootId;
			if (draftSubtaskId !== null) {
				lines = lines.filter((line) => line.id !== draftSubtaskId);
				draftSubtaskId = null;
			}
			focusedRootId = null;
			const restoreIndex = lines.findIndex((line) => line.id === restoreLineId);
			const fallbackIndex = lines.findIndex((line) => line.id === fallbackLineId);
			const index = restoreIndex >= 0 ? restoreIndex : fallbackIndex >= 0 ? fallbackIndex : 0;
			void focusLineAfterRender(index, lines[index]?.text.length ?? 0);
			return;
		}

		let targetLine = parentTaskIndex(Math.max(0, Math.min(focusLine, lines.length - 1)));
		const targetId = lines[targetLine]?.id;
		if (draftSubtaskId !== null) {
			lines = lines.filter((line) => line.id !== draftSubtaskId);
			draftSubtaskId = null;
		}
		targetLine = parentTaskIndex(Math.max(0, lines.findIndex((line) => line.id === targetId)));
		focusedRootId = lines[targetLine]?.isCheck ? lines[targetLine].id : null;
		void focusLineAfterRender(targetLine, lines[targetLine]?.text.length ?? 0);
	});

	const focusedRootIndent = $derived(
		focusedRootId === null ? 0 : (lines.find((line) => line.id === focusedRootId)?.indent ?? 0)
	);

	const visibleRows = $derived.by(() => {
		const all = lines.map((line, index) => ({ line, index }));
		if (focusedRootId === null) return all;
		const rootIndex = lines.findIndex((line) => line.id === focusedRootId);
		if (rootIndex < 0 || !lines[rootIndex].isCheck) return all;
		const root = lines[rootIndex];
		const rows = [{ line: root, index: rootIndex }];
		for (let index = rootIndex + 1; index < lines.length; index++) {
			const line = lines[index];
			if (line.isCheck && line.indent <= root.indent) break;
			if (line.isCheck && line.indent > root.indent) rows.push({ line, index });
		}
		return rows;
	});

	const focusedChildIds = $derived(
		focusedRootId === null ? new Set<number>() : new Set(visibleRows.slice(1).map(({ line }) => line.id))
	);
</script>

<div bind:this={container} class="block w-full min-w-0 text-sm leading-relaxed text-[var(--gkc-text)]">
	{#each lines as line, i (line.id)}
		{#if line.id === focusedRootId}
			<div class="relative -mx-6 my-1 bg-black/[0.04] px-6 py-1 dark:bg-white/[0.07]">
				{#each visibleRows as { line: focusedLine, index: focusedIndex } (focusedLine.id)}
					<div
						class="flex w-full min-w-0 items-start gap-2 py-0"
						style={focusedLine.indent > focusedRootIndent ? `padding-left: ${(focusedLine.indent - focusedRootIndent) * 1.25}rem` : undefined}
					>
						{#if focusedLine.isCheck}
							<button
								type="button"
								data-checklist-toggle
								class="mt-0.5 h-4 w-4 shrink-0 rounded border border-black/40 dark:border-white/40 flex items-center justify-center text-[10px]"
								class:h-3.5={focusedLine.indent > focusedRootIndent}
								class:w-3.5={focusedLine.indent > focusedRootIndent}
								style={focusedLine.checked ? 'background: rgba(0,0,0,0.1)' : ''}
								onclick={(e) => toggleCheck(focusedIndex, e)}
								aria-label={focusedLine.indent > focusedRootIndent ? 'Toggle sub-task' : 'Toggle item'}
							>
								{#if focusedLine.checked}✓{/if}
							</button>
						{/if}
						<textarea
							rows="1"
							data-line={focusedIndex}
							value={focusedLine.text}
							oninput={(e) => onLineInput(focusedIndex, e)}
							onkeydown={(e) => onLineKeydown(e, focusedIndex)}
							placeholder={focusedLine.indent > focusedRootIndent ? 'Sub-task' : 'Task'}
							class="flex-1 min-w-0 resize-none overflow-hidden bg-transparent outline-none placeholder:text-[var(--gkc-text-muted)] [field-sizing:content] {focusedLine.checked ? 'line-through opacity-50' : ''} {focusedLine.indent > focusedRootIndent ? 'text-[13px]' : 'text-[15px] font-medium'}"
						></textarea>
					</div>
					{#if focusedLine.id === focusedRootId}
						<div class="py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gkc-text-muted)]">Sub-tasks</div>
					{/if}
				{/each}
				{#if focusedRootIndent === 0}
					<button
						type="button"
						data-add-subtask
						class="mt-0 flex w-full items-center gap-2 rounded-lg py-0.5 pl-5 text-left text-[13px] text-[var(--gkc-text-muted)] transition-colors hover:bg-black/5 hover:text-[var(--gkc-text)] dark:hover:bg-white/10"
						onclick={() => addSubtask(visibleRows[0]?.index ?? -1)}
					>
						<span class="grid h-4 w-4 shrink-0 place-items-center rounded border border-current" aria-hidden="true">
							<svg viewBox="0 0 24 24" class="h-2.5 w-2.5 fill-none stroke-current" stroke-width="2" stroke-linecap="round">
								<path d="M12 5v14M5 12h14" />
							</svg>
						</span>
						Add sub-task
					</button>
				{/if}
				<button
					type="button"
					class="absolute bottom-1 right-2 grid h-6 w-6 place-items-center text-[var(--gkc-text-muted)] transition-colors hover:text-[var(--gkc-text)]"
					title="Collapse task focus"
					aria-label="Collapse task focus"
					onclick={() => onExitTaskFocus?.()}
				>
					<svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 15l6-6 6 6" />
					</svg>
				</button>
			</div>
		{:else if !focusedChildIds.has(line.id)}
			<div
				class="flex w-full min-w-0 items-start gap-2 py-0.5"
				style={line.isCheck && line.indent > 0 ? `padding-left: ${line.indent * 1.25}rem` : undefined}
			>
				{#if line.isCheck}
					<button
						type="button"
						data-checklist-toggle
						class="mt-0.5 h-4 w-4 shrink-0 rounded border border-black/40 dark:border-white/40 flex items-center justify-center text-[10px]"
						class:h-3.5={line.indent > 0}
						class:w-3.5={line.indent > 0}
						style={line.checked ? 'background: rgba(0,0,0,0.1)' : ''}
						onclick={(e) => toggleCheck(i, e)}
						aria-label={line.indent > 0 ? 'Toggle sub-task' : 'Toggle item'}
					>
						{#if line.checked}✓{/if}
					</button>
				{/if}
				<textarea
					rows="1"
					data-line={i}
					value={line.text}
					oninput={(e) => onLineInput(i, e)}
					onkeydown={(e) => onLineKeydown(e, i)}
					onclick={() => {
						if (line.isCheck) onFocusTask?.(parentTaskIndex(i));
					}}
					placeholder={i === 0 && lines.length === 1 && !line.isCheck ? placeholder : line.isCheck && !line.text ? 'Task' : ''}
					class="flex-1 min-w-0 resize-none overflow-hidden bg-transparent outline-none placeholder:text-[var(--gkc-text-muted)] [field-sizing:content] {line.checked ? 'line-through opacity-50' : ''} {line.indent > 0 ? 'text-[13px]' : ''}"
				></textarea>
			</div>
		{/if}
	{/each}
</div>

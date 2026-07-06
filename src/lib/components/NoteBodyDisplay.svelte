<script lang="ts">
	import type { Note } from '$lib/types';
	import { effectiveBody, parseBody, type BodyLine } from '$lib/checklistBody';
	import { notesStore } from '$lib/stores/notes.svelte';

	let {
		note,
		clamp = false
	}: {
		note: Note;
		clamp?: boolean;
	} = $props();

	const body = $derived(effectiveBody(note));
	const lines = $derived(parseBody(body));

	function toggle(line: BodyLine) {
		if (line.type !== 'check') return;
		notesStore.toggleBodyChecklistLine(note.id, line.lineIndex);
	}
</script>

<div
	class="text-sm text-[var(--gkc-text)] {clamp ? 'max-h-[200px] overflow-hidden' : ''}"
	style={clamp ? 'display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical;' : ''}
>
	{#each lines as line (line.lineIndex)}
		{#if line.type === 'check'}
			<div class="flex items-start gap-2 py-0.5">
				<button
					type="button"
					data-checklist-toggle
					class="mt-0.5 h-4 w-4 shrink-0 rounded border border-black/40 dark:border-white/40 flex items-center justify-center text-[10px]"
					style={line.checked ? 'background: rgba(0,0,0,0.1)' : ''}
					onclick={(e) => {
						e.stopPropagation();
						toggle(line);
					}}
					aria-label="Toggle item"
				>
					{#if line.checked}✓{/if}
				</button>
				<span class="flex-1 break-words {line.checked ? 'line-through opacity-50' : ''}">
					{line.text || '\u00a0'}
				</span>
			</div>
		{:else if line.text}
			<p class="whitespace-pre-wrap break-words py-0.5">{line.text}</p>
		{:else}
			<div class="h-2"></div>
		{/if}
	{/each}
</div>
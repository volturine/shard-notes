<script lang="ts">
	import type { Note } from '$lib/types';
	import PhotoFullscreen from '$lib/components/PhotoFullscreen.svelte';
	import { effectiveBody, parseBody, noteImages } from '$lib/checklistBody';
	import { notesStore } from '$lib/stores/notes.svelte';

	let {
		note,
		clamp = false
	}: {
		note: Note;
		clamp?: boolean;
	} = $props();

	const body = $derived(effectiveBody(note));
	const segments = $derived(parseBody(body));
	const images = $derived(noteImages(note));
	const shownImages = $derived(clamp ? images.slice(0, 4) : images);
	let focusedImageIndex = $state<number | null>(null);

	function focusImage(index: number, event: MouseEvent) {
		event.stopPropagation();
		focusedImageIndex = index;
	}

	function toggle(lineIndex: number) {
		notesStore.toggleBodyChecklistLine(note.id, lineIndex);
	}
</script>

{#if images.length > 0}
	<div class="mb-2 flex flex-wrap gap-1.5">
		{#each shownImages as img, index (img.id)}
			<button
				type="button"
				class="block touch-manipulation overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 {clamp ? 'h-10 w-10' : 'max-w-full'}"
				data-photo
				onclick={(event) => focusImage(index, event)}
				aria-label={`Open ${img.name ?? 'photo'}`}
			>
				<img
					src={img.dataUrl}
					alt={img.name ?? 'Photo'}
					class={clamp ? 'h-full w-full object-cover' : 'max-h-32 max-w-full rounded-lg object-cover'}
					loading="lazy"
				/>
			</button>
		{/each}
		{#if clamp && images.length > shownImages.length}
			<button type="button" class="h-10 min-w-10 rounded-md bg-black/10 px-2 text-xs font-medium text-[var(--gkc-text)] dark:bg-white/10" data-photo onclick={(event) => focusImage(shownImages.length, event)} aria-label={`Open ${images.length - shownImages.length} more photos`}>+{images.length - shownImages.length}</button>
		{/if}
	</div>
{/if}

<div
	class="text-sm text-[var(--gkc-text)] {clamp ? 'max-h-[200px] overflow-hidden' : ''}"
	style={clamp ? 'display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical;' : ''}
>
	{#each segments as seg (seg.type === 'code' ? seg.key : seg.lineIndex)}
		{#if seg.type === 'check'}
			<div class="flex items-start gap-2 py-0.5">
				<button
					type="button"
					data-checklist-toggle
					class="mt-0.5 h-4 w-4 shrink-0 rounded border border-black/40 dark:border-white/40 flex items-center justify-center text-[10px]"
					style={seg.checked ? 'background: rgba(0,0,0,0.1)' : ''}
					onclick={(e) => {
						e.stopPropagation();
						toggle(seg.lineIndex);
					}}
					aria-label="Toggle item"
				>
					{#if seg.checked}✓{/if}
				</button>
				<span class="flex-1 break-words {seg.checked ? 'line-through opacity-50' : ''}">
					{seg.text || '\u00a0'}
				</span>
			</div>
		{:else if seg.type === 'code'}
			<pre
				class="my-2 overflow-x-auto rounded-lg bg-black/10 p-2 text-xs leading-relaxed dark:bg-black/35"
			><code>{seg.code || '\u00a0'}</code></pre>
		{:else if seg.text}
			<p class="whitespace-pre-wrap break-words py-0.5">{seg.text}</p>
		{:else}
			<div class="h-2"></div>
		{/if}
	{/each}
</div>

<PhotoFullscreen {images} bind:activeIndex={focusedImageIndex} />
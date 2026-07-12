<script lang="ts">
	import type { Note, NoteImage } from '$lib/types';
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
	let focusedImage = $state<NoteImage | null>(null);

	function focusImage(image: NoteImage, event: MouseEvent) {
		event.stopPropagation();
		focusedImage = image;
	}

	function closeImage() {
		focusedImage = null;
	}

	function toggle(lineIndex: number) {
		notesStore.toggleBodyChecklistLine(note.id, lineIndex);
	}
</script>

{#if images.length > 0}
	<div class="mb-2 flex flex-wrap gap-2">
		{#each images as img (img.id)}
			<button
				type="button"
				class="block max-w-full touch-manipulation rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
				onclick={(event) => focusImage(img, event)}
				aria-label={`Open ${img.name ?? 'photo'}`}
			>
				<img
					src={img.dataUrl}
					alt={img.name ?? 'Photo'}
					class="max-h-32 max-w-full rounded-lg object-cover"
					loading="lazy"
				/>
			</button>
		{/each}
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

<svelte:window onkeydown={(event) => event.key === 'Escape' && closeImage()} />

{#if focusedImage}
	<button
		type="button"
		class="fixed inset-0 z-[80] cursor-zoom-out bg-black/85"
		onclick={closeImage}
		aria-label="Close focused photo"
	></button>
	<div class="pointer-events-none fixed inset-0 z-[81] flex items-center justify-center p-4">
		<div class="pointer-events-auto relative max-h-full max-w-full">
			<img src={focusedImage.dataUrl} alt={focusedImage.name ?? 'Photo'} class="max-h-[90vh] max-w-[94vw] rounded-lg object-contain shadow-2xl" />
			<button type="button" class="absolute -right-2 -top-2 h-10 w-10 rounded-full bg-black/75 text-xl text-white shadow-lg touch-manipulation" onclick={closeImage} aria-label="Close focused photo">✕</button>
		</div>
	</div>
{/if}
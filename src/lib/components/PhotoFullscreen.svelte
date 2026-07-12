<script lang="ts">
	import type { NoteImage } from '$lib/types';

	let {
		images,
		activeIndex = $bindable<number | null>(null)
	}: {
		images: NoteImage[];
		activeIndex?: number | null;
	} = $props();

	let touchStartX = 0;

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
	}

	function close() {
		activeIndex = null;
	}

	function move(offset: number) {
		if (activeIndex === null || images.length < 2) return;
		activeIndex = (activeIndex + offset + images.length) % images.length;
	}

	function previous() {
		move(-1);
	}

	function next() {
		move(1);
	}

	function handleKey(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
		if (event.key === 'ArrowLeft') previous();
		if (event.key === 'ArrowRight') next();
	}

	function onTouchStart(event: TouchEvent) {
		touchStartX = event.touches[0]?.clientX ?? 0;
	}

	function onTouchEnd(event: TouchEvent) {
		if (activeIndex === null || images.length < 2) return;
		const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
		if (Math.abs(deltaX) < 48) return;
		move(deltaX < 0 ? 1 : -1);
	}
</script>

<svelte:window onkeydown={handleKey} />

{#if activeIndex !== null && images[activeIndex]}
	<div use:portal>
	<button
		type="button"
		class="fixed inset-0 z-[80] cursor-zoom-out bg-black"
		onclick={close}
		aria-label="Close photo"
	></button>
	<div
		class="pointer-events-none fixed inset-0 z-[81] flex items-center justify-center"
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
	>
		<img
			src={images[activeIndex].dataUrl}
			alt={images[activeIndex].name ?? 'Photo'}
			class="pointer-events-auto max-h-[100dvh] max-w-full select-none object-contain"
			draggable="false"
		/>
	</div>
	<button type="button" class="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-[90] h-11 w-11 rounded-full bg-black/65 text-2xl leading-none text-white touch-manipulation" onclick={close} aria-label="Close photo">×</button>
	{#if images.length > 1}
		<div class="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[90] flex justify-center gap-2">
			<button type="button" class="rounded-full bg-black/65 px-4 py-2 text-sm font-medium text-white touch-manipulation" onclick={previous}>Previous</button>
			<button type="button" class="rounded-full bg-black/65 px-4 py-2 text-sm font-medium text-white touch-manipulation" onclick={next}>Next</button>
		</div>
	{/if}
	</div>
{/if}

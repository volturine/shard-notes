<script lang="ts">
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { KEEP_COLORS, KEEP_DARK_COLORS, type Note, type NoteColor } from '$lib/types';
	import { formatReminder } from '$lib/utils';
	import NoteBodyDisplay from './NoteBodyDisplay.svelte';

	let {
		note,
		onOpen
	}: {
		note: Note;
		onOpen: (id: string) => void;
	} = $props();

	function bgColor(c: NoteColor): string {
		return uiStore.effectiveDark ? KEEP_DARK_COLORS[c] : KEEP_COLORS[c];
	}

	function toggleArchive() {
		notesStore.toggleArchive(note.id);
	}
	function trash() {
		notesStore.trashNote(note.id);
	}

	function openUnlessAction(e: MouseEvent) {
		if (justDragged) { e.stopPropagation(); return; }
		const t = e.target as HTMLElement;
		if (t.closest('[data-checklist-toggle], [data-photo]')) return;
		onOpen(note.id);
	}

	const labelsForNote = $derived(
		note.labels
			.map((id) => notesStore.labels.find((l) => l.id === id))
			.filter((l): l is NonNullable<typeof l> => !!l)
	);

	// --- Swipe gestures (touch + trackpad/mouse via Pointer Events) ---
	let offsetX = $state(0);
	let dragging = $state(false);
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let decidedHorizontal = false;
	let pointerId: number | null = null;
	let justDragged = false;

	const SWIPE_THRESHOLD = 80;

	function onPointerDown(e: PointerEvent) {
		if (dragging) return;
		const target = e.target as HTMLElement;
		if (target.closest('[data-checklist-toggle], [data-photo], button, input, textarea')) return;
		// Capture the pointer so we keep getting move events even outside the card
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		pointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		startTime = Date.now();
		dragging = true;
		decidedHorizontal = false;
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (!decidedHorizontal) {
			if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
			decidedHorizontal = Math.abs(dx) > Math.abs(dy);
			if (!decidedHorizontal) {
				// Vertical gesture — release capture and let the card scroll
				(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
				dragging = false;
				return;
			}
			// Horizontal — prevent the card from scrolling vertically
			e.preventDefault();
		}
		e.preventDefault();
		offsetX = Math.max(-120, Math.min(120, dx));
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		const wasDrag = Math.abs(offsetX) >= SWIPE_THRESHOLD;
		const moved = Math.abs(offsetX) > 5;
		dragging = false;
		pointerId = null;

		if (wasDrag) {
			if (offsetX < 0) {
				offsetX = -300;
				setTimeout(() => toggleArchive(), 150);
			} else {
				offsetX = 300;
				setTimeout(() => trash(), 150);
			}
		} else {
			offsetX = 0;
		}

		// If the pointer moved at all, suppress the click that follows
		if (moved) {
			e.stopPropagation();
			// Also set a flag for the click handler
			justDragged = true;
			setTimeout(() => { justDragged = false; }, 50);
		}
	}

	function onPointerCancel(e: PointerEvent) {
		if (e.pointerId !== pointerId) return;
		dragging = false;
		pointerId = null;
		offsetX = 0;
	}
</script>

<div class="relative overflow-hidden rounded-lg">
	{#if offsetX < 0}
		<div class="absolute inset-0 flex items-center justify-end rounded-lg bg-green-500 pr-4 text-white">
			<svg viewBox="0 0 24 24" class="h-6 w-6 fill-current"><path d="M20 6h-8V4H4v2H2v4h20V6h-2zM4 12v8h16v-8H4z"/></svg>
		</div>
	{:else if offsetX > 0}
		<div class="absolute inset-0 flex items-center justify-start rounded-lg bg-red-500 pl-4 text-white">
			<svg viewBox="0 0 24 24" class="h-6 w-6 fill-current"><path d="M6 7h12v13H6zM9 4h6v2h2v2H7V6h2zM10 10v6M14 10v6" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
		</div>
	{/if}

	<article
		class="relative z-[1] flex w-full max-h-[320px] cursor-pointer flex-col overflow-y-auto overflow-x-hidden rounded-lg border border-black/5 shadow-sm transition-shadow dark:border-white/10"
		style="background-color: {bgColor(note.color)}; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; touch-action: pan-y; {offsetX !== 0 || dragging ? `transform: translate3d(${offsetX}px, 0, 0);` : 'transform: none;'} will-change: transform; transition: {dragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.2s'};"
		class:shadow-md={note.pinned}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerCancel}
		onclick={openUnlessAction}
	>
		{#if note.reminder != null}
			<div
				class="flex items-center gap-1 rounded-t-lg bg-black/5 px-3 py-1 text-xs text-[var(--gkc-text-muted)] dark:bg-white/5"
			>
				<span>⏰</span>
				<span>{formatReminder(note.reminder)}</span>
			</div>
		{/if}

		<div class="block min-h-0 flex-1 w-full p-3 pb-2 text-left">
			{#if note.title}
				<h3 class="mb-1 text-sm font-medium leading-snug text-[var(--gkc-text)]">{note.title}</h3>
			{/if}
			<NoteBodyDisplay {note} clamp={false} />
		</div>

		{#if labelsForNote.length}
			<div class="flex flex-wrap gap-1 px-3 pb-3 pt-1">
				{#each labelsForNote as label (label.id)}
					<span
						class="rounded px-1.5 py-0.5 text-[10px] font-medium bg-black/5 text-[var(--gkc-text-muted)] dark:bg-white/10"
					>
						{label.name}
					</span>
				{/each}
			</div>
		{/if}
	</article>
</div>
<script lang="ts">
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import {
		KEEP_COLORS,
		KEEP_DARK_COLORS,
		type Note,
		type NoteColor
	} from '$lib/types';
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

	function restore() {
		notesStore.restoreNote(note.id);
	}
	function deleteForever() {
		notesStore.deleteNoteForever(note.id);
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
	let decidedHorizontal = false;
	let pointerId: number | null = null;
	let justDragged = false;
	const SWIPE_THRESHOLD = 80;

	function onPointerDown(e: PointerEvent) {
		if (dragging) return;
		const target = e.target as HTMLElement;
		if (target.closest('[data-checklist-toggle], [data-photo], button, input, textarea')) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		pointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
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
				(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
				dragging = false;
				return;
			}
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
				setTimeout(() => deleteForever(), 150);
			} else {
				offsetX = 300;
				setTimeout(() => restore(), 150);
			}
		} else {
			offsetX = 0;
		}

		if (moved) {
			e.stopPropagation();
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

<div class="group relative overflow-hidden rounded-lg">
	<!-- Swipe backgrounds -->
	{#if offsetX < 0}
		<div class="absolute inset-0 flex items-center justify-end rounded-lg bg-red-600 pr-4 text-white">
			<svg viewBox="0 0 24 24" class="h-6 w-6 fill-none stroke-current" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" /></svg>
		</div>
	{:else if offsetX > 0}
		<div class="absolute inset-0 flex items-center justify-start rounded-lg bg-blue-500 pl-4 text-white">
			<svg viewBox="0 0 24 24" class="h-6 w-6 fill-none stroke-current" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
		</div>
	{/if}

	<!-- Action icons: always visible on touch devices, hover on desktop -->
	<div class="absolute right-2 top-2 z-[2] flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
		<button
			type="button"
			onclick={(e) => { e.stopPropagation(); restore(); }}
			class="grid h-8 w-8 place-items-center rounded-full bg-black/10 text-blue-600 backdrop-blur-sm transition-colors hover:bg-black/20 dark:text-blue-400 dark:bg-white/10 dark:hover:bg-white/20"
			aria-label="Restore note"
			title="Restore"
		>
			<svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
		</button>
		<button
			type="button"
			onclick={(e) => { e.stopPropagation(); deleteForever(); }}
			class="grid h-8 w-8 place-items-center rounded-full bg-black/10 text-red-600 backdrop-blur-sm transition-colors hover:bg-black/20 dark:text-red-400 dark:bg-white/10 dark:hover:bg-white/20"
			aria-label="Delete forever"
			title="Delete forever"
		>
			<svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" /></svg>
		</button>
	</div>

	<article
		class="relative z-[1] flex w-full max-h-[320px] cursor-pointer flex-col overflow-y-auto overflow-x-hidden rounded-lg border border-black/5 shadow-sm transition-shadow dark:border-white/10"
		style="background-color: {bgColor(note.color)}; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; touch-action: pan-y; {offsetX !== 0 || dragging ? `transform: translate3d(${offsetX}px, 0, 0);` : 'transform: none;'} will-change: transform; transition: {dragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.2s'};"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerCancel}
		onclick={(e) => { if (justDragged) { e.stopPropagation(); return; } onOpen(note.id); }}
	>
		{#if note.reminder != null}
			<div class="flex items-center gap-1 rounded-t-lg bg-black/5 px-3 py-1 text-xs text-[var(--gkc-text-muted)] dark:bg-white/5">
				<span>⏰</span>
				<span>{formatReminder(note.reminder)}</span>
			</div>
		{/if}

		<div class="block min-h-0 flex-1 w-full p-3 pb-2 text-left opacity-60">
			{#if note.title}
				<h3 class="mb-1 text-sm font-medium leading-snug text-[var(--gkc-text)]">{note.title}</h3>
			{/if}
			<NoteBodyDisplay {note} clamp={false} />
		</div>

		{#if labelsForNote.length}
			<div class="flex flex-wrap gap-1 px-3 pb-3 pt-1">
				{#each labelsForNote as label (label.id)}
					<span class="rounded px-1.5 py-0.5 text-[10px] font-medium bg-black/5 text-[var(--gkc-text-muted)] dark:bg-white/10">
						{label.name}
					</span>
				{/each}
			</div>
		{/if}
	</article>
</div>

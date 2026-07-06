<script lang="ts">
	import { fade } from 'svelte/transition';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import {
		KEEP_COLORS,
		KEEP_DARK_COLORS,
		type Note,
		type NoteColor
	} from '$lib/types';
	import { formatReminder } from '$lib/utils';

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

	// --- Swipe gestures: left = delete forever, right = restore ---
	let offsetX = $state(0);
	let dragging = $state(false);
	let startX = 0;
	let startY = 0;
	let decidedHorizontal = false;
	const SWIPE_THRESHOLD = 80;

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const t = e.touches[0];
		startX = t.clientX;
		startY = t.clientY;
		dragging = true;
		decidedHorizontal = false;
	}

	function onTouchMove(e: TouchEvent) {
		if (!dragging || e.touches.length !== 1) return;
		const t = e.touches[0];
		const dx = t.clientX - startX;
		const dy = t.clientY - startY;
		if (!decidedHorizontal) {
			if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
				decidedHorizontal = Math.abs(dx) > Math.abs(dy);
				if (!decidedHorizontal) { dragging = false; return; }
			} else return;
		}
		if (decidedHorizontal) {
			e.preventDefault();
			offsetX = dx;
		}
	}

	function onTouchEnd() {
		if (!dragging) return;
		dragging = false;
		if (Math.abs(offsetX) >= SWIPE_THRESHOLD) {
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
	}
</script>

<div class="relative overflow-hidden rounded-lg">
	{#if offsetX < 0}
		<div class="absolute inset-0 flex items-center justify-end rounded-lg bg-red-600 pr-4 text-white">
			<span class="text-xs font-medium">Delete</span>
		</div>
	{:else if offsetX > 0}
		<div class="absolute inset-0 flex items-center justify-start rounded-lg bg-blue-500 pl-4 text-white">
			<span class="text-xs font-medium">Restore</span>
		</div>
	{/if}

	<article
		class="relative rounded-lg border border-black/5 shadow-sm touch-pan-y dark:border-white/10"
		style="background-color: {bgColor(note.color)}; transform: translate3d({offsetX}px, 0, 0); will-change: transform; transition: {dragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)'};"
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		ontouchend={onTouchEnd}
	>
		{#if note.reminder != null}
			<div class="flex items-center gap-1 rounded-t-lg bg-black/5 px-3 py-1 text-xs text-[var(--gkc-text-muted)] dark:bg-white/5">
				<span>⏰</span>
				<span>{formatReminder(note.reminder)}</span>
			</div>
		{/if}

		<button type="button" onclick={() => onOpen(note.id)} class="block w-full cursor-pointer p-3 text-left opacity-60">
			{#if note.title}
				<h3 class="mb-1 text-sm font-medium leading-snug text-[var(--gkc-text)]">{note.title}</h3>
			{/if}
			{#if note.kind === 'text'}
				<p class="whitespace-pre-wrap break-words text-sm text-[var(--gkc-text)]">{note.body}</p>
			{:else}
				<ul class="flex flex-col gap-1">
					{#each note.items as item (item.id)}
						<li class="flex items-center gap-2 text-sm">
							<span class="h-4 w-4 shrink-0 rounded border border-black/30 dark:border-white/30 flex items-center justify-center text-xs">
								{#if item.checked}✓{/if}
							</span>
							<span class="flex-1 break-words text-[var(--gkc-text)] {item.checked ? 'line-through opacity-50' : ''}">{item.text}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</button>

		<!-- Trash actions -->
		<div class="flex items-center gap-2 px-3 pb-2">
			<button type="button" onclick={() => restore()} class="rounded px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-black/5 dark:hover:bg-white/10">Restore</button>
			<button type="button" onclick={() => deleteForever()} class="rounded px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-black/5 dark:hover:bg-white/10">Delete forever</button>
		</div>
	</article>
</div>
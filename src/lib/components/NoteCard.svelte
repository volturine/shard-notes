<script lang="ts">
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import {
		KEEP_COLORS,
		KEEP_DARK_COLORS,
		type Note,
		type NoteColor
	} from '$lib/types';
	import { noteToPlainText } from '$lib/checklistBody';
	import { formatReminder } from '$lib/utils';
	import NoteBodyDisplay from './NoteBodyDisplay.svelte';
	import ColorPalette from './ColorPalette.svelte';
	import ReminderPicker from './ReminderPicker.svelte';
	import LabelMenu from './LabelMenu.svelte';

	let {
		note,
		onOpen
	}: {
		note: Note;
		onOpen: (id: string) => void;
	} = $props();

	let paletteOpen = $state(false);
	let reminderOpen = $state(false);
	let labelOpen = $state(false);
	let copyFlash = $state(false);

	function bgColor(c: NoteColor): string {
		return uiStore.effectiveDark ? KEEP_DARK_COLORS[c] : KEEP_COLORS[c];
	}

	function togglePin() {
		notesStore.togglePin(note.id);
	}
	function toggleArchive() {
		notesStore.toggleArchive(note.id);
	}
	function trash() {
		notesStore.trashNote(note.id);
	}
	function setColor(c: NoteColor) {
		notesStore.setColor(note.id, c);
		paletteOpen = false;
	}
	function setReminder(ts: number | null) {
		notesStore.setReminder(note.id, ts);
	}
	async function copyText() {
		const text = noteToPlainText(note);
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy'); } catch {}
			document.body.removeChild(ta);
		}
		copyFlash = true;
		setTimeout(() => { copyFlash = false; }, 1500);
	}

	function openUnlessAction(e: MouseEvent) {
		const t = e.target as HTMLElement;
		if (t.closest('[data-card-action]')) return;
		if (t.closest('[data-checklist-toggle]')) return;
		onOpen(note.id);
	}

	const labelsForNote = $derived(
		note.labels
			.map((id) => notesStore.labels.find((l) => l.id === id))
			.filter((l): l is NonNullable<typeof l> => !!l)
	);

	// --- iOS-style swipe gestures ---
	let offsetX = $state(0);
	let dragging = $state(false);
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let decidedHorizontal = false;

	const SWIPE_THRESHOLD = 80;
	const SWIPE_REVEAL = 70;

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const t = e.touches[0];
		startX = t.clientX;
		startY = t.clientY;
		startTime = Date.now();
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
				if (!decidedHorizontal) {
					dragging = false;
					return;
				}
			} else {
				return;
			}
		}

		if (decidedHorizontal) {
			e.preventDefault();
			offsetX = dx;
		}
	}

	function onTouchEnd(e: TouchEvent) {
		if (!dragging) return;
		dragging = false;

		if (Math.abs(offsetX) >= SWIPE_THRESHOLD) {
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
	}
</script>

<div class="relative overflow-hidden rounded-lg">
	<!-- Swipe action backgrounds -->
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
		class="group relative z-[1] w-full cursor-pointer rounded-lg border border-black/5 shadow-sm transition-shadow touch-pan-y dark:border-white/10"
		style="background-color: {bgColor(note.color)}; transform: translate3d({offsetX}px, 0, 0); will-change: transform; transition: {dragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.2s'};"
		class:shadow-md={note.pinned}
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		ontouchend={onTouchEnd}
		onclick={openUnlessAction}
	>
		<!-- Reminder banner -->
		{#if note.reminder != null}
			<div
				class="flex items-center gap-1 rounded-t-lg bg-black/5 px-3 py-1 text-xs text-[var(--gkc-text-muted)] dark:bg-white/5"
			>
				<span>⏰</span>
				<span>{formatReminder(note.reminder)}</span>
			</div>
		{/if}

		<div class="block w-full text-left p-3 pb-2">
			{#if note.title}
				<h3 class="mb-1 text-sm font-medium leading-snug text-[var(--gkc-text)]">{note.title}</h3>
			{/if}
			<NoteBodyDisplay {note} clamp={true} />
		</div>

		<!-- Labels chips — above the action bar, near bottom -->
		{#if labelsForNote.length}
			<div class="flex flex-wrap gap-1 px-3 pb-1 pt-1">
				{#each labelsForNote as label (label.id)}
					<span
						class="rounded px-1.5 py-0.5 text-[10px] font-medium bg-black/5 text-[var(--gkc-text-muted)] dark:bg-white/10"
					>
						{label.name}
					</span>
				{/each}
			</div>
		{/if}

		<!-- Footer actions — hover/touch overlay -->
		<div
			data-card-action
			class="flex items-center gap-0.5 px-2 py-1 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
		>
			<!-- Pin: filled when pinned, outline when not -->
			<button data-card-action class="icon-btn h-7 w-7 p-1.5" title="Pin note" onclick={(e) => { e.stopPropagation(); togglePin(); }} aria-label="Pin">
				<svg viewBox="0 0 24 24" class="h-4 w-4 {note.pinned ? 'fill-current' : 'fill-none stroke-current'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14 2l8 8-4 1-3 7-3-3-4 4-1-1 4-4-3-3 7-3z" fill="{note.pinned ? 'currentColor' : 'none'}" stroke="{note.pinned ? 'none' : 'currentColor'}"/>
				</svg>
			</button>

			<div class="relative" data-card-action>
				<button
					data-card-action
					class="icon-btn h-7 w-7 p-1.5"
					title="Color"
					onclick={(e) => { e.stopPropagation(); paletteOpen = !paletteOpen; reminderOpen = false; labelOpen = false; }}
					aria-label="Color"
				>
					<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.4 0 2-1 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .9-1.8 2-1.8h2c2.2 0 4-1.8 4-4 0-4.4-4.5-7.7-9-7.7zm-5 10c-.8 0-1.5-.7-1.5-1.5S6.2 9 7 9s1.5.7 1.5 1.5S7.8 12 7 12zm3-4c-.8 0-1.5-.7-1.5-1.5S9.2 5 10 5s1.5.7 1.5 1.5S10.8 8 10 8zm4 0c-.8 0-1.5-.7-1.5-1.5S13.2 5 14 5s1.5.7 1.5 1.5S14.8 8 14 8zm3 4c-.8 0-1.5-.7-1.5-1.5S16.2 9 17 9s1.5.7 1.5 1.5S17.8 12 17 12z"/></svg>
				</button>
				{#if paletteOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="fixed inset-0 z-40" onclick={() => { paletteOpen = false; }} role="presentation"></div>
					<div transition:fade={{ duration: 100 }} class="absolute left-0 bottom-9 z-50">
						<ColorPalette color={note.color} onSelect={setColor} />
					</div>
				{/if}
			</div>

			<div class="relative" data-card-action>
				<button
					data-card-action
					class="icon-btn h-7 w-7 p-1.5"
					title="Reminder"
					onclick={(e) => { e.stopPropagation(); reminderOpen = !reminderOpen; paletteOpen = false; labelOpen = false; }}
					aria-label="Reminder"
				>
					<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
				</button>
				{#if reminderOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="fixed inset-0 z-40" onclick={() => { reminderOpen = false; }} role="presentation"></div>
					<div transition:fade={{ duration: 100 }} class="absolute left-0 bottom-9 z-50">
						<ReminderPicker
							reminder={note.reminder}
							onApply={(r) => setReminder(r)}
							onClose={() => { reminderOpen = false; }}
						/>
					</div>
				{/if}
			</div>

			<button data-card-action class="icon-btn h-7 w-7 p-1.5 relative" title="Copy" onclick={(e) => { e.stopPropagation(); copyText(); }} aria-label="Copy">
				{#if copyFlash}
					<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current text-green-500"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
				{:else}
					<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
				{/if}
			</button>

			<div class="relative" data-card-action>
				<button
					data-card-action
					class="icon-btn h-7 w-7 p-1.5"
					title="Labels"
					onclick={(e) => { e.stopPropagation(); labelOpen = !labelOpen; paletteOpen = false; reminderOpen = false; }}
					aria-label="Labels"
				>
					<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current"><path d="M20 12l-8 8-9-9V4h7l10 10zM5 6.5C5 5.7 5.7 5 6.5 5S8 5.7 8 6.5 7.3 8 6.5 8 5 7.3 5 6.5z"/></svg>
				</button>
				{#if labelOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="fixed inset-0 z-40" onclick={() => { labelOpen = false; }} role="presentation"></div>
					<div transition:fade={{ duration: 100 }} class="absolute right-0 bottom-9 z-50">
						<LabelMenu noteId={note.id} onClose={() => { labelOpen = false; }} />
					</div>
				{/if}
			</div>

			<button data-card-action class="icon-btn h-7 w-7 p-1.5" title="Archive" onclick={(e) => { e.stopPropagation(); toggleArchive(); }} aria-label="Archive">
				<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current"><path d="M20 6h-8V4H4v2H2v4h20V6h-2zM4 12v8h16v-8H4z"/></svg>
			</button>

			<button data-card-action class="icon-btn h-7 w-7 p-1.5" title="Delete" onclick={(e) => { e.stopPropagation(); trash(); }} aria-label="Delete">
				<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current"><path d="M6 7h12v13H6zM9 4h6v2h2v2H7V6h2zM10 10v6M14 10v6" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
			</button>
		</div>
	</article>
</div>

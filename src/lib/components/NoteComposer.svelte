<script lang="ts">
	import { fly } from 'svelte/transition';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import type { NoteColor, NoteImage } from '$lib/types';
	import { KEEP_COLORS, KEEP_DARK_COLORS } from '$lib/types';
	import NoteEditorFooter from './NoteEditorFooter.svelte';
	import ColorPalette from './ColorPalette.svelte';
	import LabelMenu from './LabelMenu.svelte';

	let bodyEl: HTMLTextAreaElement | null = $state(null);

	let expanded = $state(false);
	let title = $state('');
	let body = $state('');
	let color = $state<NoteColor>('default');
	let images = $state<NoteImage[]>([]);
	let draftId = $state<string | null>(null);
	let paletteOpen = $state(false);
	let labelOpen = $state(false);

	$effect(() => {
		if (uiStore.composerFocused) {
			expanded = true;
			uiStore.composerFocused = false;
			queueMicrotask(() => bodyEl?.focus());
		}
	});

	function bgColor(c: NoteColor): string {
		return uiStore.effectiveDark ? KEEP_DARK_COLORS[c] : KEEP_COLORS[c];
	}

	function hasContent(): boolean {
		return !!(title.trim() || body.trim() || images.length > 0);
	}

	function ensureDraft(): string {
		if (draftId) return draftId;
		const n = notesStore.createNote({
			title: title.trim(),
			body: body.trim(),
			items: [],
			kind: 'text',
			color,
			images: [...images]
		});
		draftId = n.id;
		return n.id;
	}

	function syncDraft() {
		if (!draftId) return;
		notesStore.updateNote(draftId, {
			title: title.trim(),
			body: body.trim(),
			color,
			images: [...images],
			items: [],
			kind: 'text'
		});
	}

	let syncTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleSync() {
		if (!draftId && !hasContent()) return;
		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = setTimeout(() => {
			if (!hasContent()) return;
			ensureDraft();
			syncDraft();
		}, 300);
	}

	function reset() {
		if (syncTimer) clearTimeout(syncTimer);
		if (draftId) {
			const n = notesStore.notes.find((x) => x.id === draftId);
			const empty = !n?.title?.trim() && !n?.body?.trim() && !(n?.images?.length);
			if (empty) notesStore.trashNote(draftId);
		}
		expanded = false;
		title = '';
		body = '';
		color = 'default';
		images = [];
		draftId = null;
		paletteOpen = false;
		labelOpen = false;
	}

	function closeAndSave() {
		if (syncTimer) clearTimeout(syncTimer);
		if (hasContent()) {
			if (draftId) syncDraft();
			else {
				notesStore.createNote({
					title: title.trim(),
					body: body.trim(),
					items: [],
					kind: 'text',
					color,
					images: [...images]
				});
			}
		} else if (draftId) {
			notesStore.trashNote(draftId);
		}
		title = '';
		body = '';
		color = 'default';
		images = [];
		draftId = null;
		expanded = false;
		paletteOpen = false;
		labelOpen = false;
	}

	function onImagesChange() {
		if (!hasContent()) return;
		ensureDraft();
		syncDraft();
	}

	function openTags() {
		if (!hasContent()) return;
		ensureDraft();
		labelOpen = true;
	}
</script>

<section
	class="mx-auto w-full max-w-2xl rounded-lg border border-black/10 shadow-sm dark:border-white/10"
	class:shadow-md={expanded}
	style="background-color: {bgColor(color)}"
>
	{#if expanded}
		<div transition:fly={{ y: -8, duration: 120 }} class="flex flex-col">
			<div class="p-3 pb-0">
				<input
					bind:value={title}
					oninput={scheduleSync}
					type="text"
					placeholder="Title"
					class="mb-2 w-full bg-transparent text-base font-medium text-[var(--gkc-text)] focus:outline-none placeholder:text-[var(--gkc-text-muted)]"
				/>
				<textarea
					bind:this={bodyEl}
					bind:value={body}
					oninput={scheduleSync}
					rows="3"
					placeholder="Take a note… [ ] checklist · ``` for code"
					class="min-h-[6rem] w-full resize-none bg-transparent text-sm text-[var(--gkc-text)] focus:outline-none placeholder:text-[var(--gkc-text-muted)]"
				></textarea>
			</div>

			<NoteEditorFooter
				bind:images
				bind:body
				noteId={draftId}
				showCopy={false}
				showDelete={false}
				onOpenColor={() => { paletteOpen = true; }}
				onOpenTags={openTags}
				onImagesChange={onImagesChange}
				onClose={closeAndSave}
			/>
		</div>
	{:else}
		<button
			type="button"
			onclick={() => {
				expanded = true;
				queueMicrotask(() => bodyEl?.focus());
			}}
			class="flex w-full touch-manipulation items-center gap-3 px-4 py-3 text-left text-sm text-[var(--gkc-text-muted)]"
		>
			<span>Take a note…</span>
		</button>
	{/if}
</section>

{#if paletteOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-[60] bg-black/30" onclick={() => { paletteOpen = false; }} role="presentation"></div>
	<div class="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
		<ColorPalette
			color={color}
			onSelect={(c) => {
				color = c;
				if (draftId) notesStore.updateNote(draftId, { color: c });
				paletteOpen = false;
			}}
		/>
	</div>
{/if}

{#if labelOpen && draftId}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-[60] bg-black/30" onclick={() => { labelOpen = false; }} role="presentation"></div>
	<div class="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
		<LabelMenu noteId={draftId} onClose={() => { labelOpen = false; }} />
	</div>
{/if}
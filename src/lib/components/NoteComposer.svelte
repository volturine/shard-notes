<script lang="ts">
	import { fly } from 'svelte/transition';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { uid } from '$lib/utils';
	import type { ChecklistItem, NoteColor } from '$lib/types';
	import { KEEP_COLORS, KEEP_DARK_COLORS } from '$lib/types';

	let titleEl: HTMLInputElement | null = $state(null);
	let bodyEl: HTMLTextAreaElement | null = $state(null);
	let itemInputEl: HTMLInputElement | null = $state(null);

	let expanded = $state(false);
	let title = $state('');
	let body = $state('');
	let kind = $state<'text' | 'list'>('text');
	let color = $state<NoteColor>('default');
	let paletteOpen = $state(false);
	let items = $state<ChecklistItem[]>([]);

	// Native drag reordering of items in the composer.
	let dragId: string | null = null;

	// Auto-expand when the global composer-focus signal is set.
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

	function reset() {
		expanded = false;
		title = '';
		body = '';
		kind = 'text';
		color = 'default';
		paletteOpen = false;
		items = [];
	}

	function save() {
		const hasContent = title.trim() || body.trim();
		if (!hasContent) {
			reset();
			return;
		}
		notesStore.createNote({
			title: title.trim(),
			body: body.trim(),
			items: [],
			kind: 'text',
			color
		});
		reset();
	}

	function addItem() {
		if (!itemInputEl) return;
		const text = itemInputEl.value.trim();
		if (!text) return;
		items = [...items, { id: uid(), text, checked: false }];
		itemInputEl.value = '';
		itemInputEl.focus();
	}

	function removeItem(id: string) {
		items = items.filter((i) => i.id !== id);
	}

	function toggleItem(id: string) {
		items = items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
	}

	function toggleKind() {
		kind = kind === 'text' ? 'list' : 'text';
		// Move existing text body into a first checklist item when switching to list.
		if (kind === 'list' && body.trim() && items.length === 0) {
			items = [{ id: uid(), text: body.trim(), checked: false }];
			body = '';
		} else if (kind === 'text' && items.length > 0 && !body.trim()) {
			body = items.map((i) => i.text).join('\n');
			items = [];
		}
	}

	function onDragStart(e: DragEvent, id: string) {
		dragId = id;
	}
	function onDrop(e: DragEvent, targetId: string) {
		e.preventDefault();
		const fromId = dragId;
		dragId = null;
		if (!fromId || fromId === targetId) return;
		const fromIdx = items.findIndex((i) => i.id === fromId);
		const toIdx = items.findIndex((i) => i.id === targetId);
		if (fromIdx === -1 || toIdx === -1) return;
		const copy = [...items];
		const [moved] = copy.splice(fromIdx, 1);
		copy.splice(toIdx, 0, moved);
		items = copy;
	}

	function collapsethenSave() {
		save();
	}
</script>

<section
	class="mx-auto w-full max-w-2xl rounded-lg border border-black/10 shadow-sm dark:border-white/10"
	class:shadow-md={expanded}
	style="background-color: {bgColor(color)}"
>
	{#if expanded}
		<div transition:fly={{ y: -8, duration: 120 }}>
			<div class="p-3">
				{#if titleEl ?? false}
				{/if}
				<input
					bind:this={titleEl}
					bind:value={title}
					type="text"
					placeholder="Title"
					class="mb-2 w-full bg-transparent text-base font-medium text-[var(--gkc-text)] focus:outline-none placeholder:text-[var(--gkc-text-muted)]"
				/>

				<textarea
					bind:this={bodyEl}
					bind:value={body}
					rows="3"
					placeholder="Take a note… [ ] checklist lines"
					class="w-full resize-none bg-transparent text-sm text-[var(--gkc-text)] focus:outline-none placeholder:text-[var(--gkc-text-muted)]"
				></textarea>
			</div>

			<div class="relative flex items-center justify-between gap-2 pb-2 pl-3 pr-2">
				<div class="flex items-center gap-1">
					<!-- Color -->
					<button
						class="icon-btn h-9 w-9 p-2"
						title="Color"
						onclick={() => (paletteOpen = !paletteOpen)}
						aria-label="Color"
					>🎨</button>
					{#if paletteOpen}
						<div transition:fly={{ y: -4, duration: 100 }} class="absolute z-30 mt-1">
							<div class="grid grid-cols-6 gap-1 rounded-lg border border-[var(--gkc-border)] bg-[var(--gkc-surface)] p-2 shadow-lg">
								{#each Object.keys(KEEP_COLORS) as c (c)}
									<button
										type="button"
										onclick={() => { color = c as NoteColor; paletteOpen = false; }}
										class="h-6 w-6 rounded-full border border-black/10 dark:border-white/10"
										style="background-color: {bgColor(c as NoteColor)}"
										aria-label="Set color {c}"
									></button>
								{/each}
							</div>
						</div>
					{/if}
			</div>
			<button
					type="button"
					onclick={collapsethenSave}
					class="rounded px-3 py-1.5 text-sm font-medium text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10"
				>
					Close
				</button>
			</div>
		</div>
	{:else}
		<button
			type="button"
			onclick={() => {
				expanded = true;
				queueMicrotask(() => bodyEl?.focus());
			}}
			class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[var(--gkc-text-muted)]"
		>
			<span>Take a note…</span>
		</button>
	{/if}
</section>
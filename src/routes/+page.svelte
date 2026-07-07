<script lang="ts">
	import NoteComposer from '$lib/components/NoteComposer.svelte';
	import NoteCard from '$lib/components/NoteCard.svelte';
	import MasonryGrid from '$lib/components/MasonryGrid.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { useOpenEditor } from '$lib/editorContext';

	const openEditor = useOpenEditor();

	const pinned = $derived(notesStore.pinnedNotes);
	const others = $derived(notesStore.unpinnedNotes);

	const search = $derived(uiStore.search.trim().toLowerCase());

	const filteredPinned = $derived(search ? notesStore.search(uiStore.search, pinned) : pinned);
	const filteredOthers = $derived(search ? notesStore.search(uiStore.search, others) : others);
</script>

<div class="pt-4 pb-8">
	<div class="notes-content mb-6">
		<NoteComposer />
	</div>

	{#if filteredPinned.length > 0}
		<div class="notes-content">
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]">
				Pinned
			</h2>
		</div>
	{/if}

	{#if filteredPinned.length > 0}
		<div class="notes-content mb-8">
			{#if uiStore.layout === 'grid'}
				<MasonryGrid notes={filteredPinned} onOpen={openEditor} />
			{:else}
				<div class="masonry masonry-list">
					{#each filteredPinned as note (note.id)}
						<div>
							<NoteCard {note} onOpen={openEditor} />
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if filteredOthers.length > 0 || filteredPinned.length === 0}
		{#if filteredPinned.length > 0}
			<div class="notes-content">
				<h2 class="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]">
					Others
				</h2>
			</div>
		{/if}
	{/if}

	{#if filteredOthers.length === 0 && filteredPinned.length === 0}
		<div class="notes-content mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]">
			<div class="mb-2 text-5xl">🗒️</div>
			<div class="text-sm">No notes here yet.</div>
		</div>
	{:else if filteredOthers.length > 0}
		<div class="notes-content">
			{#if uiStore.layout === 'grid'}
				<MasonryGrid notes={filteredOthers} onOpen={openEditor} />
			{:else}
				<div class="masonry masonry-list">
					{#each filteredOthers as note (note.id)}
						<div>
							<NoteCard {note} onOpen={openEditor} />
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
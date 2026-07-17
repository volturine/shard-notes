<script lang="ts">
	import NoteCard from '$lib/components/NoteCard.svelte';
	import MasonryGrid from '$lib/components/MasonryGrid.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { useOpenEditor } from '$lib/editorContext';

	const openEditor = useOpenEditor();
	const archived = $derived(notesStore.archivedNotes);

	const headingClass = $derived('notes-content ' + (uiStore.layout === 'list' ? 'max-w-[720px] mx-auto' : ''));
</script>

<div class="pt-4 pb-8">
	<div class={headingClass}>
		<h1 class="mb-4 px-2 text-xl font-medium text-[var(--gkc-text)]">Archive</h1>
	</div>

	{#if archived.length === 0}
		<div class="notes-content mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]">
			<div class="mb-2 text-5xl">📦</div>
			<div class="text-sm">Your archived notes appear here.</div>
		</div>
	{:else}
		<div class="notes-content">
			{#if uiStore.layout === 'grid'}
				<MasonryGrid notes={archived} onOpen={openEditor} />
			{:else}
				<div class="masonry masonry-list">
					{#each archived as note (note.id)}
						<div>
							<NoteCard {note} onOpen={openEditor} />
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

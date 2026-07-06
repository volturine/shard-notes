<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import NoteCard from '$lib/components/NoteCard.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { useOpenEditor } from '$lib/editorContext';

	const openEditor = useOpenEditor();
	const archived = $derived(notesStore.archivedNotes);
</script>

<div class="w-full pt-4 sm:mx-auto sm:max-w-6xl">
	<h1 class="mb-4 ml-2 text-xl font-medium text-[var(--gkc-text)]">Archive</h1>

	{#if archived.length === 0}
		<div  class="mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]">
			<div class="mb-2 text-5xl">📦</div>
			<div class="text-sm">Your archived notes appear here.</div>
		</div>
	{:else}
		<div class="masonry {uiStore.layout === 'grid' ? 'masonry-grid' : 'masonry-list'}">
			{#each archived as note (note.id)}
				<div >
					<NoteCard {note} onOpen={openEditor} />
				</div>
			{/each}
		</div>
	{/if}
</div>
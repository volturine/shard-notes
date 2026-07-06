<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import TrashCard from '$lib/components/TrashCard.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { useOpenEditor } from '$lib/editorContext';

	const openEditor = useOpenEditor();
	const trashed = $derived(notesStore.trashedNotes);

	let confirmEmpty = $state(false);

	function emptyTrash() {
		notesStore.emptyTrash();
		confirmEmpty = false;
	}

</script>

<div class="w-full pt-4 sm:mx-auto sm:max-w-6xl">
	<div class="mb-4 flex items-center justify-between px-2">
		<h1 class="text-xl font-medium text-[var(--gkc-text)]">Trash</h1>
		{#if trashed.length > 0}
			<div class="flex items-center gap-2">
				{#if confirmEmpty}
					<div class="flex items-center gap-2">
						<span class="text-xs text-[var(--gkc-text-muted)]">Empty trash?</span>
						<button type="button" onclick={emptyTrash} class="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">Empty</button>
						<button type="button" onclick={() => (confirmEmpty = false)} class="rounded px-2 py-1 text-xs text-[var(--gkc-text-muted)] hover:bg-black/5 dark:hover:bg-white/10">Cancel</button>
					</div>
				{:else}
					<button type="button" onclick={() => (confirmEmpty = true)} class="rounded px-2 py-1 text-xs text-[var(--gkc-text-muted)] hover:bg-black/5 dark:hover:bg-white/10">Empty trash</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if trashed.length === 0}
		<div  class="mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]">
			<div class="mb-2 text-5xl">🗑️</div>
			<div class="text-sm">No notes in trash. Notes here are deleted forever after 7 days.</div>
		</div>
	{:else}
		<div class="masonry {uiStore.layout === 'grid' ? 'masonry-grid' : 'masonry-list'}">
			{#each trashed as note (note.id)}
				<div  class="">
					<TrashCard {note} onOpen={openEditor} />
				</div>
			{/each}
		</div>
	{/if}
</div>
<script lang="ts">
	import TrashCard from '$lib/components/TrashCard.svelte';
	import MasonryGrid from '$lib/components/MasonryGrid.svelte';
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

	const headingClass = $derived('notes-content ' + (uiStore.layout === 'list' ? 'max-w-[720px] mx-auto' : ''));
</script>

<div class="pt-4 pb-8">
	{#if trashed.length === 0}
		<div class="notes-content mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]">
			<div class="mb-2 text-5xl">🗑️</div>
			<div class="text-sm">No notes in trash. Notes here are deleted forever after 7 days.</div>
		</div>
	{:else}
		<div class={headingClass}>
			<div class="mb-3 flex items-center gap-3 px-2">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]">
					Trash
				</h2>
				<span class="text-xs text-[var(--gkc-text-muted)] opacity-60">{trashed.length}</span>
				<div class="flex-1"></div>
				{#if confirmEmpty}
					<span class="text-xs text-[var(--gkc-text-muted)]">Delete all?</span>
					<button type="button" onclick={emptyTrash} class="rounded-full bg-red-600/10 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white dark:text-red-400">Yes</button>
					<button type="button" onclick={() => (confirmEmpty = false)} class="rounded-full px-3 py-1 text-xs text-[var(--gkc-text-muted)] transition-colors hover:bg-black/5 dark:hover:bg-white/10">No</button>
				{:else}
					<button type="button" onclick={() => (confirmEmpty = true)} class="rounded-full px-3 py-1 text-xs text-[var(--gkc-text-muted)] transition-colors hover:bg-black/5 dark:hover:bg-white/10">Empty</button>
				{/if}
			</div>
		</div>

		<div class="notes-content">
			{#if uiStore.layout === 'grid'}
				<MasonryGrid notes={trashed} onOpen={openEditor} class="masonry-grid">
					{#snippet children(note)}
						<TrashCard {note} onOpen={openEditor} />
					{/snippet}
				</MasonryGrid>
			{:else}
				<div class="masonry masonry-list">
					{#each trashed as note (note.id)}
						<div>
							<TrashCard {note} onOpen={openEditor} />
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

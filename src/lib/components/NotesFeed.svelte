<script lang="ts">
	import type { Note } from '$lib/types';
	import type { Snippet } from 'svelte';
	import NoteCard from './NoteCard.svelte';
	import MasonryGrid from './MasonryGrid.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';

	/** Grid / list feed for notes pages — one place for layout branching. */
	let {
		notes,
		onOpen,
		class: className = '',
		children
	}: {
		notes: Note[];
		onOpen: (id: string) => void;
		class?: string;
		children?: Snippet<[Note]>;
	} = $props();
</script>

<div class="notes-content {className}">
	{#if uiStore.layout === 'grid'}
		<MasonryGrid {notes} {onOpen} {children} />
	{:else}
		<div class="masonry masonry-list">
			{#each notes as note (note.id)}
				<div>
					{#if children}
						{@render children(note)}
					{:else}
						<NoteCard {note} {onOpen} />
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import NoteCard from '$lib/components/NoteCard.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { useOpenEditor } from '$lib/editorContext';
	import { page } from '$app/state';

	const openEditor = useOpenEditor();

	// `/label/[label]` where [label] is the label id.
	const labelId = $derived(page.params.label);
	const label = $derived(notesStore.labels.find((l) => l.id === labelId));
	const notes = $derived(
		label ? notesStore.activeNotes.filter((n) => n.labels.includes(label.id)) : []
	);

	const pinned = $derived(notes.filter((n) => n.pinned));
	const others = $derived(notes.filter((n) => !n.pinned));
</script>

<div class="w-full pt-4 sm:mx-auto sm:max-w-6xl">
	<h1 class="mb-4 ml-2 text-xl font-medium text-[var(--gkc-text)]">
		{label ? label.name : 'Label'}
	</h1>

	{#if !label}
		<div
			
			class="mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]"
		>
			<div class="mb-2 text-5xl">🏷️</div>
			<div class="text-sm">Label not found.</div>
		</div>
	{:else if notes.length === 0}
		<div
			
			class="mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]"
		>
			<div class="mb-2 text-5xl">🏷️</div>
			<div class="text-sm">No notes with this label yet.</div>
		</div>
	{:else}
		{#if pinned.length > 0}
			<h2
				class="mb-2 ml-2 text-xs font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]"
			>
				Pinned
			</h2>
			<div class="masonry {uiStore.layout === 'grid' ? 'masonry-grid' : 'masonry-list'} mb-6">
				{#each pinned as note (note.id)}
					<div >
						<NoteCard {note} onOpen={openEditor} />
					</div>
				{/each}
			</div>
		{/if}

		{#if pinned.length > 0 && others.length > 0}
			<h2
				class="mb-2 ml-2 text-xs font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]"
			>
				Others
			</h2>
		{/if}

		{#if others.length > 0}
			<div class="masonry {uiStore.layout === 'grid' ? 'masonry-grid' : 'masonry-list'}">
				{#each others as note (note.id)}
					<div >
						<NoteCard {note} onOpen={openEditor} />
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
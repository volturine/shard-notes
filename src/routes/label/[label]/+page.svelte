<script lang="ts">
	import NoteCard from '$lib/components/NoteCard.svelte';
	import MasonryGrid from '$lib/components/MasonryGrid.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { useEditorActions } from '$lib/editorContext';
	import { page } from '$app/state';

	const { openNote: openEditor } = useEditorActions();

	const labelId = $derived(page.params.label);
	const label = $derived(notesStore.labels.find((l) => l.id === labelId));
	const notes = $derived(
		label ? notesStore.activeNotes.filter((n) => n.labels.includes(label.id)) : []
	);

	const pinned = $derived(notes.filter((n) => n.pinned));
	const others = $derived(notes.filter((n) => !n.pinned));

	const headingClass = $derived('notes-content ' + (uiStore.layout === 'list' ? 'max-w-[720px] mx-auto' : ''));
</script>

<div class="pt-4 pb-8">
	{#if !label}
		<div class="notes-content mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]">
			<div class="mb-2 text-5xl">🏷️</div>
			<div class="text-sm">Label not found.</div>
		</div>
	{:else if notes.length === 0}
		<div class="notes-content mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]">
			<div class="mb-2 text-5xl">🏷️</div>
			<div class="text-sm">No notes with this label yet.</div>
		</div>
	{:else}
		<div class={headingClass}>
			<h1 class="mb-4 px-2 text-xl font-medium text-[var(--gkc-text)]">{label.name}</h1>
		</div>

		{#if pinned.length > 0}
			<div class={headingClass}>
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]">
					Pinned
				</h2>
			</div>
			<div class="notes-content mb-6">
				{#if uiStore.layout === 'grid'}
					<MasonryGrid notes={pinned} onOpen={openEditor} />
				{:else}
					<div class="masonry masonry-list">
						{#each pinned as note (note.id)}
							<div>
								<NoteCard {note} onOpen={openEditor} />
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if pinned.length > 0 && others.length > 0}
			<div class={headingClass}>
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]">
					Others
				</h2>
			</div>
		{/if}

		{#if others.length > 0}
			<div class="notes-content">
				{#if uiStore.layout === 'grid'}
					<MasonryGrid notes={others} onOpen={openEditor} />
				{:else}
					<div class="masonry masonry-list">
						{#each others as note (note.id)}
							<div>
								<NoteCard {note} onOpen={openEditor} />
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

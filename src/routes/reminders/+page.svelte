<script lang="ts">
	import NoteCard from '$lib/components/NoteCard.svelte';
	import MasonryGrid from '$lib/components/MasonryGrid.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { useOpenEditor } from '$lib/editorContext';

	const openEditor = useOpenEditor();
	const reminders = $derived(notesStore.notesWithReminders);

	const headingClass = $derived('notes-content ' + (uiStore.layout === 'list' ? 'max-w-[720px] mx-auto' : ''));
</script>

<div class="pt-4 pb-8">
	{#if reminders.length === 0}
		<div class="notes-content mt-16 flex flex-col items-center justify-center text-[var(--gkc-text-muted)]">
			<div class="mb-2 text-5xl">⏰</div>
			<div class="text-sm">No reminders yet. Add one from a note (⏰).</div>
		</div>
	{:else}
		<div class={headingClass}>
			<h2 class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]">
				Reminders
			</h2>
		</div>
		<div class="notes-content">
			{#if uiStore.layout === 'grid'}
				<MasonryGrid notes={reminders} onOpen={openEditor} />
			{:else}
				<div class="masonry masonry-list">
					{#each reminders as note (note.id)}
						<div>
							<NoteCard {note} onOpen={openEditor} />
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<script lang="ts">
	import { notesStore } from '$lib/stores/notes.svelte';
	import NoteCard from '$lib/components/NoteCard.svelte';
	import { useOpenEditor } from '$lib/editorContext';

	const openEditor = useOpenEditor();
	const reminders = $derived(notesStore.notesWithReminders);
</script>

<div class="w-full pt-4 pb-8 sm:mx-auto sm:max-w-[1680px]">
	{#if reminders.length === 0}
		<p class="px-4 text-sm text-[var(--gkc-text-muted)]">No reminders yet. Add one from a note (⏰).</p>
	{:else}
		<div class="masonry masonry-grid">
			{#each reminders as note (note.id)}
				<div>
					<NoteCard
						{note}
						onOpen={(id) => openEditor(id)}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>
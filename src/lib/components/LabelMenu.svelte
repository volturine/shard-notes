<script lang="ts">
	import { notesStore } from '$lib/stores/notes.svelte';

	let {
		noteId,
		onClose
	}: {
		noteId: string;
		onClose: () => void;
	} = $props();

	let newName = $state('');
	let container: HTMLElement | null = $state(null);

	const note = $derived(notesStore.notes.find((n) => n.id === noteId));

	function toggle(id: string) {
		if (!note) return;
		notesStore.toggleLabel(noteId, id);
	}

	function createAndAssign() {
		const name = newName.trim();
		if (!name) return;
		const label = notesStore.createLabel(name);
		newName = '';
		if (label && note) notesStore.toggleLabel(noteId, label.id);
	}

	function handleWindowClick(e: MouseEvent) {
		if (container && !container.contains(e.target as HTMLElement)) {
			onClose();
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div
	bind:this={container}
	class="w-64 rounded-lg border border-[var(--gkc-border)] bg-[var(--gkc-surface)] p-3 shadow-xl"
>
	<div class="mb-2 text-sm font-medium text-[var(--gkc-text)]">Label as</div>

	<!-- Create new label -->
	<div class="mb-3 flex gap-1">
		<input
			type="text"
			bind:value={newName}
			placeholder="Create new label…"
			onkeydown={(e) => e.key === 'Enter' && createAndAssign()}
			class="w-full rounded-full border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-3 py-1.5 text-sm text-[var(--gkc-text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
		/>
		{#if newName.trim()}
			<button
				type="button"
				onclick={createAndAssign}
				class="rounded-full bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
			>+</button>
		{/if}
	</div>

	<!-- Label list with checkboxes -->
	<div class="flex max-h-48 flex-col gap-0.5 overflow-y-auto sidebar-scroll">
		{#if notesStore.labels.length === 0}
			<div class="py-3 text-center text-xs text-[var(--gkc-text-muted)]">
				No labels yet. Create one above.
			</div>
		{:else}
			{#each notesStore.labels as label (label.id)}
				{#if note}
					<button
						type="button"
						onclick={() => toggle(label.id)}
						class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10"
					>
						<span
							class="h-4 w-4 shrink-0 rounded border border-black/30 dark:border-white/30 flex items-center justify-center text-xs {note.labels.includes(label.id) ? 'bg-blue-500 border-blue-500 text-white' : ''}"
						>
							{#if note.labels.includes(label.id)}✓{/if}
						</span>
						<span class="truncate">{label.name}</span>
					</button>
				{/if}
			{/each}
		{/if}
	</div>
</div>
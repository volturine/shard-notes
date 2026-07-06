<script lang="ts">
	import { uiStore, type View } from '$lib/stores/ui.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let newLabelName = $state('');
	let editing = $state(false);

	function navigate(view: View, labelId: string | null = null) {
		uiStore.setView(view, labelId);
		if (view === 'notes') goto('/');
		else if (view === 'reminders') goto('/reminders');
		else if (view === 'archive') goto('/archive');
		else if (view === 'trash') goto('/trash');
		else if (view === 'label' && labelId) {
			const label = notesStore.labels.find((l) => l.id === labelId);
			if (label) goto(`/label/${label.id}`);
		}
	}

	function isActive(view: View, labelId: string | null = null): boolean {
		const p = page.url.pathname;
		if (view === 'notes') return p === '/';
		if (view === 'reminders') return p === '/reminders';
		if (view === 'archive') return p === '/archive';
		if (view === 'trash') return p === '/trash';
		if (view === 'label' && labelId) return p === `/label/${labelId}`;
		return false;
	}

	const navItems: { view: View; label: string; icon: string }[] = [
		{ view: 'notes', label: 'Notes', icon: '💡' },
		{ view: 'reminders', label: 'Reminders', icon: '⏰' },
		{ view: 'archive', label: 'Archive', icon: '📦' },
		{ view: 'trash', label: 'Trash', icon: '🗑️' }
	];

	const reminderCount = $derived(notesStore.notesWithReminders.length);
	const trashCount = $derived(notesStore.trashedNotes.length);

	function createLabel() {
		notesStore.createLabel(newLabelName);
		newLabelName = '';
		editing = false;
	}
</script>

<aside
	class="flex h-full flex-col gap-0.5 overflow-y-auto sidebar-scroll pt-2 pr-2"
	transition:fly={{ x: -20, duration: 120 }}
>
	{#each navItems as item (item.view)}
		<button
			type="button"
			onclick={() => navigate(item.view)}
			class="flex items-center gap-4 rounded-full px-6 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 {isActive(item.view) ? 'nav-active' : 'text-[var(--gkc-text-muted)]'}"
		>
			<span class="text-base">{item.icon}</span>
			<span>{item.label}</span>
			{#if item.view === 'reminders' && reminderCount > 0}
				<span class="ml-auto text-xs opacity-70">{reminderCount}</span>
			{/if}
			{#if item.view === 'trash' && trashCount > 0}
				<span class="ml-auto text-xs opacity-70">{trashCount}</span>
			{/if}
		</button>
	{/each}

	<div class="mt-3 px-6 text-xs font-semibold uppercase tracking-wider text-[var(--gkc-text-muted)]">
		Labels
	</div>

	{#each notesStore.labels as label (label.id)}
		<button
			type="button"
			onclick={() => navigate('label', label.id)}
			class="flex items-center gap-4 rounded-full px-6 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 {isActive('label', label.id) ? 'nav-active' : 'text-[var(--gkc-text-muted)]'}"
		>
			<span class="text-base">🏷️</span>
			<span class="truncate">{label.name}</span>
		</button>
	{/each}

	{#if editing}
		<div class="px-6 py-2">
			<input
				type="text"
				bind:value={newLabelName}
				placeholder="New label name…"
				onkeydown={(e) => e.key === 'Enter' && createLabel()}
				onblur={() => newLabelName.trim() && createLabel()}
				class="w-full rounded border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-2 py-1 text-sm text-[var(--gkc-text)] focus:outline-none"
			/>
		</div>
	{/if}

	<button
		type="button"
		onclick={() => (editing = true)}
		class="flex items-center gap-4 rounded-full px-6 py-2.5 text-sm font-medium text-[var(--gkc-text-muted)] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
	>
		<span class="text-base">＋</span>
		<span>Edit labels</span>
	</button>
</aside>
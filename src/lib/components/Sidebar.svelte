<script lang="ts">
	import { uiStore, type View } from '$lib/stores/ui.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let newLabelName = $state('');
	let labelsEditMode = $state(false);
	let draftNames = $state<Record<string, string>>({});
	let newLabelInput: HTMLInputElement | null = $state(null);

	function navigate(view: View, labelId: string | null = null) {
		if (labelsEditMode) return;
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

	function enterLabelsEdit() {
		labelsEditMode = true;
		draftNames = Object.fromEntries(notesStore.labels.map((l) => [l.id, l.name]));
		newLabelName = '';
		queueMicrotask(() => newLabelInput?.focus());
	}

	function exitLabelsEdit() {
		for (const label of notesStore.labels) {
			const next = (draftNames[label.id] ?? label.name).trim();
			if (next && next !== label.name) {
				notesStore.renameLabel(label.id, next);
			}
		}
		labelsEditMode = false;
		newLabelName = '';
	}

	function addLabel() {
		const created = notesStore.createLabel(newLabelName);
		if (created) {
			draftNames = { ...draftNames, [created.id]: created.name };
			newLabelName = '';
			queueMicrotask(() => newLabelInput?.focus());
		}
	}

	function onNewLabelKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addLabel();
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			exitLabelsEdit();
		}
	}

	function removeLabel(id: string) {
		notesStore.removeLabel(id);
		const next = { ...draftNames };
		delete next[id];
		draftNames = next;
	}

	function updateDraftName(id: string, name: string) {
		draftNames = { ...draftNames, [id]: name };
	}

	function toggleLabelsEdit() {
		if (labelsEditMode) exitLabelsEdit();
		else enterLabelsEdit();
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

	{#if labelsEditMode}
		<div class="flex flex-col gap-1 px-3 py-1" role="group" aria-label="Edit labels" data-labels-edit>
			{#each notesStore.labels as label (label.id)}
				<div class="flex items-center gap-2 rounded-full py-1 pl-3 pr-1">
					<span class="text-base shrink-0" aria-hidden="true">🏷️</span>
					<input
						type="text"
						value={draftNames[label.id] ?? label.name}
						oninput={(e) => updateDraftName(label.id, (e.currentTarget as HTMLInputElement).value)}
						class="min-w-0 flex-1 rounded border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-2 py-1.5 text-sm text-[var(--gkc-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
						aria-label="Rename {label.name}"
					/>
					<button
						type="button"
						class="icon-btn h-9 w-9 shrink-0 text-[var(--gkc-text-muted)] hover:text-red-600 dark:hover:text-red-400"
						title="Delete label"
						aria-label="Delete label {label.name}"
						onclick={() => removeLabel(label.id)}
					>
						<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current" aria-hidden="true">
							<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
						</svg>
					</button>
				</div>
			{/each}

			<div class="flex items-center gap-2 rounded-full py-1 pl-3 pr-1">
				<span class="text-base shrink-0" aria-hidden="true">＋</span>
				<input
					bind:this={newLabelInput}
					type="text"
					bind:value={newLabelName}
					placeholder="Create new label…"
					onkeydown={onNewLabelKey}
					class="min-w-0 flex-1 rounded border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-2 py-1.5 text-sm text-[var(--gkc-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
				/>
				<button
					type="button"
					class="shrink-0 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
					disabled={!newLabelName.trim()}
					onclick={addLabel}
				>
					Add
				</button>
			</div>
		</div>
	{:else}
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
	{/if}

	<button
		type="button"
		data-labels-edit
		onclick={toggleLabelsEdit}
		class="flex items-center gap-4 rounded-full px-6 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 {labelsEditMode ? 'nav-active' : 'text-[var(--gkc-text-muted)]'}"
	>
		<span class="text-base">{labelsEditMode ? '✓' : '＋'}</span>
		<span>{labelsEditMode ? 'Done' : 'Edit labels'}</span>
	</button>
</aside>
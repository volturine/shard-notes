<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore, type View } from '$lib/stores/ui.svelte';
	import type { Label } from '$lib/types';

	let newLabelName = $state('');
	let labelComposerOpen = $state(false);
	let editingLabelId = $state<string | null>(null);
	let editingName = $state('');
	let newLabelInput: HTMLInputElement | null = $state(null);
	let renameInput: HTMLInputElement | null = $state(null);

	const navItems: { view: View; label: string; icon: 'notes' | 'reminders' | 'archive' | 'trash' }[] = [
		{ view: 'notes', label: 'Notes', icon: 'notes' },
		{ view: 'reminders', label: 'Reminders', icon: 'reminders' },
		{ view: 'archive', label: 'Archive', icon: 'archive' },
		{ view: 'trash', label: 'Trash', icon: 'trash' }
	];

	const reminderCount = $derived(notesStore.notesWithReminders.length);
	const trashCount = $derived(notesStore.trashedNotes.length);
	const labelCounts = $derived(new Map(notesStore.labels.map((label) => [label.id, notesStore.notesForLabel(label.id).length])));

	function navigate(view: View, labelId: string | null = null) {
		uiStore.setView(view, labelId);
		if (view === 'notes') goto('/');
		else if (view === 'reminders') goto('/reminders');
		else if (view === 'archive') goto('/archive');
		else if (view === 'trash') goto('/trash');
		else if (view === 'label' && labelId) goto(`/label/${labelId}`);
	}

	function isActive(view: View, labelId: string | null = null): boolean {
		const path = page.url.pathname;
		if (view === 'notes') return path === '/';
		if (view === 'reminders') return path === '/reminders';
		if (view === 'archive') return path === '/archive';
		if (view === 'trash') return path === '/trash';
		return view === 'label' && !!labelId && path === `/label/${labelId}`;
	}

	function openLabelComposer() {
		labelComposerOpen = true;
		editingLabelId = null;
		newLabelName = '';
		queueMicrotask(() => newLabelInput?.focus());
	}

	function createLabel() {
		const label = notesStore.createLabel(newLabelName);
		if (!label) return;
		newLabelName = '';
		labelComposerOpen = false;
	}

	function startRename(label: Label) {
		labelComposerOpen = false;
		editingLabelId = label.id;
		editingName = label.name;
		queueMicrotask(() => {
			renameInput?.focus();
			renameInput?.select();
		});
	}

	function saveRename(label: Label) {
		const name = editingName.trim();
		if (name && name !== label.name) notesStore.renameLabel(label.id, name);
		editingLabelId = null;
	}

	function cancelRename() {
		editingLabelId = null;
	}

	function removeLabel(label: Label) {
		notesStore.removeLabel(label.id);
		if (isActive('label', label.id)) navigate('notes');
	}
</script>

<aside class="scrollable flex h-full flex-col gap-0.5 overflow-y-auto sidebar-scroll px-2 pb-4 pt-2" transition:fly={{ x: -20, duration: 120 }}>
	{#each navItems as item (item.view)}
		<button
			type="button"
			onclick={() => navigate(item.view)}
			class="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 {isActive(item.view) ? 'nav-active' : 'text-[var(--gkc-text-muted)]'}"
		>
			<span class="grid h-7 w-7 place-items-center text-[var(--gkc-text)]" aria-hidden="true">
				{#if item.icon === 'notes'}
					<svg viewBox="0 0 24 24" class="h-[18px] w-[18px] fill-none stroke-current" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M7 3.5h7.5L19 8v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
						<path d="M14.5 3.5V8H19M9 12h6M9 15.5h6" />
					</svg>
				{:else if item.icon === 'reminders'}
					<svg viewBox="0 0 24 24" class="h-[18px] w-[18px] fill-none stroke-current" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="13" r="7" />
						<path d="M12 10v3.5l2 1.5M9 3.5h6" />
					</svg>
				{:else if item.icon === 'archive'}
					<svg viewBox="0 0 24 24" class="h-[18px] w-[18px] fill-none stroke-current" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 7h16v3H4zM6 10v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8M10 14h4" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" class="h-[18px] w-[18px] fill-none stroke-current" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M8 7l1 12a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-12" />
					</svg>
				{/if}
			</span>
			<span>{item.label}</span>
			{#if item.view === 'reminders' && reminderCount > 0}
				<span class="ml-auto text-xs opacity-70">{reminderCount}</span>
			{:else if item.view === 'trash' && trashCount > 0}
				<span class="ml-auto text-xs opacity-70">{trashCount}</span>
			{/if}
		</button>
	{/each}

	<section class="mt-4" data-labels-edit aria-label="Labels">
		<div class="mb-1 flex items-center justify-between px-4">
			<span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gkc-text-muted)]">Labels</span>
			<button
				type="button"
				onclick={openLabelComposer}
				data-sidebar-stay-open
				class="grid h-7 w-7 place-items-center rounded-full text-[var(--gkc-text-muted)] transition-colors hover:bg-black/8 hover:text-[var(--gkc-text)] focus:outline-none focus:ring-2 focus:ring-black/10 dark:hover:bg-white/10 dark:focus:ring-white/15"
				aria-label="Create label"
				title="Create label"
			>
				<svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
					<path d="M12 5v14M5 12h14" />
				</svg>
			</button>
		</div>

		{#if labelComposerOpen}
			<div class="mb-1 flex items-center gap-2 rounded-xl bg-black/[0.045] px-3 py-2 dark:bg-white/[0.07]" data-sidebar-stay-open>
				<span class="text-sm text-[var(--gkc-text-muted)]" aria-hidden="true">#</span>
				<input
					bind:this={newLabelInput}
					bind:value={newLabelName}
					type="text"
					placeholder="New label"
					class="min-w-0 flex-1 bg-transparent text-sm text-[var(--gkc-text)] outline-none placeholder:text-[var(--gkc-text-muted)]"
					onkeydown={(event) => {
						if (event.key === 'Enter') createLabel();
						if (event.key === 'Escape') labelComposerOpen = false;
					}}
				/>
				<button type="button" onclick={createLabel} disabled={!newLabelName.trim()} class="text-sm font-medium text-[var(--gkc-text-muted)] transition-colors hover:text-[var(--gkc-text)] disabled:opacity-40">Add</button>
			</div>
		{/if}

		{#if notesStore.labels.length === 0 && !labelComposerOpen}
			<button type="button" onclick={openLabelComposer} class="w-full rounded-xl px-4 py-2 text-left text-sm text-[var(--gkc-text-muted)] transition-colors hover:bg-black/5 dark:hover:bg-white/10">
				Create your first label
			</button>
		{:else}
			<div class="flex flex-col gap-0.5">
				{#each notesStore.labels as label (label.id)}
					{#if editingLabelId === label.id}
						<div class="flex items-center gap-2 rounded-xl bg-black/[0.055] px-3 py-2 dark:bg-white/[0.08]" data-sidebar-stay-open>
							<span class="text-sm text-[var(--gkc-text-muted)]" aria-hidden="true">#</span>
							<input
								bind:this={renameInput}
								bind:value={editingName}
								type="text"
								class="min-w-0 flex-1 bg-transparent text-sm text-[var(--gkc-text)] outline-none"
								onblur={() => saveRename(label)}
								onkeydown={(event) => {
									if (event.key === 'Enter') saveRename(label);
									if (event.key === 'Escape') cancelRename();
								}}
							/>
							<button type="button" onclick={() => saveRename(label)} class="text-sm font-medium text-[var(--gkc-text-muted)] hover:text-[var(--gkc-text)]" aria-label={`Save ${label.name}`}>✓</button>
						</div>
					{:else}
						<div class="group relative">
							<button
								type="button"
								onclick={() => navigate('label', label.id)}
								class="flex w-full items-center gap-3 rounded-xl py-2.5 pl-4 pr-16 text-left text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 {isActive('label', label.id) ? 'nav-active' : 'text-[var(--gkc-text-muted)]'}"
							>
								<span class="grid h-7 w-7 shrink-0 place-items-center text-[var(--gkc-text-muted)]" aria-hidden="true">
									<svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
										<path d="M20.5 12.5 12 21l-8.5-8.5V4.5H12z" />
										<circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
									</svg>
								</span>
								<span class="min-w-0 flex-1 truncate">{label.name}</span>
								{#if (labelCounts.get(label.id) ?? 0) > 0}
									<span class="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] tabular-nums dark:bg-white/[0.1]">{labelCounts.get(label.id)}</span>
								{/if}
							</button>
							<div class="absolute right-2 top-1/2 flex -translate-y-1/2 gap-0.5" data-sidebar-stay-open>
								<button type="button" onclick={() => startRename(label)} class="grid h-7 w-7 place-items-center rounded-full text-[var(--gkc-text-muted)] hover:bg-black/10 hover:text-[var(--gkc-text)] dark:hover:bg-white/10" aria-label={`Rename ${label.name}`} title="Rename">
									<svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-none stroke-current" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
									</svg>
								</button>
								<button type="button" onclick={() => removeLabel(label)} class="grid h-7 w-7 place-items-center rounded-full text-[var(--gkc-text-muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400" aria-label={`Delete ${label.name}`} title="Delete">
									<svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-none stroke-current" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
										<path d="M6 6l12 12M18 6 6 18" />
									</svg>
								</button>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</section>
</aside>

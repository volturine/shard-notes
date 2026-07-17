<script lang="ts">
	import { uiStore } from '$lib/stores/ui.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { downloadJSON } from '$lib/utils';
	import { syncStore } from '$lib/stores/sync.svelte';
	import SyncModal from './SyncModal.svelte';

	let fileInputEl: HTMLInputElement | null = $state(null);
	let settingsOpen = $state(false);
	let syncOpen = $state(false);
	let quickSyncBusy = $state(false);

	function releaseCloudBtn(el: HTMLButtonElement) {
		el.blur();
		requestAnimationFrame(() => el.blur());
	}

	async function doQuickSync(e: MouseEvent) {
		if (quickSyncBusy) return;
		quickSyncBusy = true;
		const btn = e.currentTarget as HTMLButtonElement;
		try {
			await notesStore.syncWithCloudManual();
		} finally {
			quickSyncBusy = false;
			releaseCloudBtn(btn);
		}
	}

	function onCloudPointerUp(e: PointerEvent) {
		releaseCloudBtn(e.currentTarget as HTMLButtonElement);
	}

	async function exportBackup() {
		const data = await notesStore.exportBackup();
		downloadJSON(data, `shard-backup-${new Date().toISOString().slice(0, 10)}.json`);
		settingsOpen = false;
	}

	function importBackup(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = async () => {
			try {
				const data = JSON.parse(String(reader.result));
				await notesStore.importBackup(data);
				settingsOpen = false;
			} catch {
				/* ignore */
			}
		};
		reader.readAsText(file);
	}

	function handleKeydown(e: KeyboardEvent) {
		// 'c' or Ctrl+/ focuses composer
		if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
			const target = e.target as HTMLElement;
			if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
			e.preventDefault();
			uiStore.focusComposer();
		}
		if ((e.ctrlKey || e.metaKey) && e.key === '/') {
			e.preventDefault();
			uiStore.focusComposer();
		}
		// Escape closes settings
		if (e.key === 'Escape') {
			settingsOpen = false;
		}
	}

	// Close settings when clicking outside the settings dropdown.
	let settingsContainer: HTMLElement | null = $state(null);

	function handleWindowClick(e: MouseEvent) {
		if (!settingsOpen) return;
		const target = e.target as HTMLElement;
		if (settingsContainer && !settingsContainer.contains(target)) {
			settingsOpen = false;
		}
	}
</script>

<header
	class="flex h-14 shrink-0 items-center gap-1 px-2 sm:h-16 sm:gap-2 sm:px-3"
>
	<button
		class="icon-btn h-10 w-10 p-2"
		title="Toggle sidebar"
		onclick={() => uiStore.toggleSidebar()}
		aria-label="Toggle sidebar"
	>
		<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>
	</button>

	<div
		class="flex h-12 flex-1 items-center gap-2 rounded-full border border-[var(--gkc-border)] bg-[var(--gkc-surface)] px-4"
	>
		<span class="text-[var(--gkc-text-muted)]">🔍</span>
		<input
			bind:value={uiStore.search}
			type="text"
			placeholder="Search"
			class="flex-1 bg-transparent text-sm text-[var(--gkc-text)] focus:outline-none placeholder:text-[var(--gkc-text-muted)]"
		/>
		{#if uiStore.search}
			<button
				class="icon-btn h-8 w-8 p-1.5 text-sm text-[var(--gkc-text-muted)]"
				onclick={() => (uiStore.search = '')}
				aria-label="Clear search"
			>✕</button>
		{/if}
	</div>

	<button
		type="button"
		class="icon-btn icon-btn-plain h-10 w-10 p-2"
		title={syncStore.isLoggedIn ? 'Sync' : 'Set up sync'}
		onmousedown={(e) => e.preventDefault()}
		onpointerup={onCloudPointerUp}
		onclick={syncStore.isLoggedIn ? doQuickSync : () => { syncOpen = true; }}
		aria-label="Sync"
		aria-busy={quickSyncBusy}
	>
		<svg
			data-gkc-sync-icon
			viewBox="0 0 24 24"
			class="h-5 w-5 fill-current"
			aria-hidden="true"
		>
			<path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
		</svg>
	</button>

	<button
		class="icon-btn h-10 w-10 p-2"
		title="Toggle layout"
		onclick={() => uiStore.toggleLayout()}
		aria-label="Toggle layout"
	>
		{#if uiStore.layout === 'grid'}
			<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
		{:else}
			<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
		{/if}
	</button>

	<div class="relative" bind:this={settingsContainer}>
		<button
			class="icon-btn h-10 w-10 p-2"
			title="Settings"
			onclick={() => (settingsOpen = !settingsOpen)}
			aria-label="Settings"
		>
			<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M19.14 12.94a7.49 7.49 0 000-1.88l2.03-1.58-2-3.46-2.39.97a7.49 7.49 0 00-1.63-.94l-.36-2.55h-4l-.36 2.55a7.49 7.49 0 00-1.63.94l-2.39-.97-2 3.46 2.03 1.58a7.49 7.49 0 000 1.88l-2.03 1.58 2 3.46 2.39-.97a7.49 7.49 0 001.63.94l.36 2.55h4l.36-2.55a7.49 7.49 0 001.63-.94l2.39.97 2-3.46-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z"/></svg>
		</button>
		{#if settingsOpen}
			<div class="absolute right-0 top-12 z-30 w-48 rounded-lg border border-[var(--gkc-border)] bg-[var(--gkc-surface)] py-1 shadow-lg">
				<button type="button" onclick={() => { syncOpen = true; settingsOpen = false; }} class="block w-full px-3 py-1.5 text-left text-sm text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10">
					☁️ Sync settings
				</button>
				<div class="my-1 border-t border-[var(--gkc-border)]"></div>
				<button type="button" onclick={() => { uiStore.toggleDark(); }} class="block w-full px-3 py-1.5 text-left text-sm text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10">
					{#if uiStore.effectiveDark}☀️ Light mode{:else}🌙 Dark mode{/if}
				</button>
				<button type="button" onclick={exportBackup} class="block w-full px-3 py-1.5 text-left text-sm text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10">Export JSON backup</button>
				<button type="button" onclick={() => fileInputEl?.click()} class="block w-full px-3 py-1.5 text-left text-sm text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10">Import JSON backup</button>
			</div>
		{/if}
	</div>

	<div
		class="hidden h-9 w-9 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 items-center justify-center text-sm font-bold text-white sm:flex"
		title="You"
	>
		K
	</div>

	<input bind:this={fileInputEl} type="file" accept="application/json" onchange={importBackup} class="hidden" />
</header>

<svelte:window onkeydown={handleKeydown} onclick={handleWindowClick} />

{#if syncOpen}
	<SyncModal onClose={() => { syncOpen = false; }} />
{/if}
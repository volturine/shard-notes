<script lang="ts">
	import '../app.css';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { syncStore } from '$lib/stores/sync.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Topbar from '$lib/components/Topbar.svelte';
	import NoteEditor from '$lib/components/NoteEditor.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { provideEditorActions } from '$lib/editorContext';
	import { fade, fly } from 'svelte/transition';
	import { untrack } from 'svelte';
	import { onMount } from 'svelte';
	import { attachSyncCloudIndicator } from '$lib/syncCloudIndicator';

	let { children } = $props();

	onMount(() => {
		attachSyncCloudIndicator(syncStore);
	});

	let editingId = $state<string | null>(null);

	$effect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.classList.toggle('dark', uiStore.effectiveDark);
		}
	});

	// Initialize notes store once — untrack so reactive reads inside init()
	// don't cause this effect to re-run on every notes change.
	$effect(() => {
		untrack(() => {
			notesStore.init().then(() => {
				// Auto-sync on load if logged in.
				if (syncStore.isLoggedIn) {
					setTimeout(() => notesStore.syncWithCloud(), 3000);
				}
			});
		});
	});

	// Auto-sync when the page becomes visible again (tab switch, app resume on iOS).
	$effect(() => {
		const handler = () => {
			if (document.visibilityState === 'visible' && syncStore.isLoggedIn) {
				notesStore.syncWithCloud();
			}
		};
		document.addEventListener('visibilitychange', handler);
		return () => document.removeEventListener('visibilitychange', handler);
	});

	// Service worker: register in production, actively UNREGISTER in dev.
	// The SW caches assets which conflicts with Vite HMR in dev mode.
	$effect(() => {
		if ('serviceWorker' in navigator) {
			if (import.meta.env.PROD) {
				navigator.serviceWorker.register('/sw.js').catch(() => {});
			} else {
				// Dev mode: kill any stale service workers from previous production builds.
				navigator.serviceWorker.getRegistrations().then((regs) => {
					for (const reg of regs) reg.unregister();
				}).catch(() => {});
			}
		}
	});

	// Detect mobile (under 768px). SSR is disabled so window is always available.
	let isMobile = $state(window.innerWidth < 768);

	$effect(() => {
		let resizeTimer: ReturnType<typeof setTimeout> | null = null;
		const check = () => {
			// Debounce — iOS fires resize events when keyboard shows/hides.
			// We don't want to immediately re-render on every resize.
			if (resizeTimer) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				isMobile = window.innerWidth < 768;
			}, 150);
		};
		check();
		window.addEventListener('resize', check);
		return () => {
			window.removeEventListener('resize', check);
			if (resizeTimer) clearTimeout(resizeTimer);
		};
	});

	// On mobile, force sidebar closed on initial load so it never flashes.
	let didInitialClose = $state(false);
	$effect(() => {
		if (!didInitialClose) {
			if (isMobile) uiStore.sidebarOpen = false;
			didInitialClose = true;
		}
	});

	function openEditor(id: string) {
		editingId = id;
	}

	function startNewNote() {
		const n = notesStore.createNote({
			title: '',
			body: '',
			items: [],
			kind: 'text'
		});
		editingId = n.id;
	}

	provideEditorActions({ openNote: openEditor, startNewNote });

	$effect(() => {
		if (uiStore.composerFocused) {
			uiStore.composerFocused = false;
			startNewNote();
		}
	});

	function closeEditor() {
		editingId = null;
	}

	function handleSidebarClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select')) return;
		if (target.closest('[data-labels-edit]')) return;
		if (target.closest('button')) {
			if (isMobile) {
				setTimeout(() => { uiStore.sidebarOpen = false; }, 100);
			}
		}
	}
</script>

<svelte:head>
	<title>Shard</title>
</svelte:head>

<div class="app-shell flex h-screen w-screen overflow-hidden bg-[var(--gkc-bg)] text-[var(--gkc-text)]" style="height: 100vh;">
	{#if isMobile}
		{#if uiStore.sidebarOpen}
			<button
				type="button"
				aria-label="Close sidebar"
				class="fixed inset-0 z-20 bg-black/30"
				onclick={() => { uiStore.sidebarOpen = false; }}
				transition:fade={{ duration: 150 }}
			></button>
			<div
				class="fixed left-0 top-0 z-30 h-full w-72 border-r border-[var(--gkc-border)] bg-[var(--gkc-surface)]"
				transition:fly={{ x: -288, duration: 200 }}
				role="navigation"
				aria-label="Sidebar"
				onclick={handleSidebarClick}
			>
				<Sidebar />
			</div>
		{/if}
	{:else}
		{#if uiStore.sidebarOpen}
			<div class="w-64 shrink-0 border-r border-[var(--gkc-border)]">
				<Sidebar />
			</div>
		{/if}
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		<Topbar />
		<main class="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-20 md:pb-6">
			{@render children()}
		</main>
	</div>
</div>

<BottomNav />
<NoteEditor noteId={editingId} onClose={closeEditor} />
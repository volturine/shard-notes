<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { syncStore } from '$lib/stores/sync.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';

	let {
		onClose
	}: {
		onClose: () => void;
	} = $props();

	let mode = $state<'menu' | 'register' | 'link' | 'linked'>(syncStore.isLoggedIn ? 'linked' : 'menu');
	let username = $state('');
	let syncCodeInput = $state('');
	let error = $state('');
	let loading = $state(false);
	let syncing = $state(false);
	let syncPending = $state(false);
	let syncSuccess = $state(false);
	let syncRequestId = 0;

	function formatBytes(bytes: number): string {
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function progressPercent(loaded: number, total: number | null): number {
		return total && total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
	}

	async function doRegister() {
		if (!username.trim()) {
			error = 'Enter a username';
			return;
		}
		error = '';
		loading = true;
		const result = await syncStore.register(username.trim());
		loading = false;
		if (result.success) {
			mode = 'linked';
			const synced = await notesStore.syncWithCloudManual();
			if (!synced) error = syncStore.lastError || 'Account created, but the first sync failed';
		} else {
			error = result.error || 'Registration failed';
			if (result.accountExists) {
				mode = 'register';
			}
		}
	}

	async function doLink() {
		if (!syncCodeInput.trim()) {
			error = 'Enter your sync code';
			return;
		}
		error = '';
		loading = true;
		const result = await syncStore.linkDevice(syncCodeInput.trim());
		loading = false;
		if (result.success) {
			const synced = await notesStore.syncWithCloudManual();
			mode = 'linked';
			if (!synced) error = syncStore.lastError || 'Device linked, but the first sync failed';
		} else {
			error = result.error || 'Invalid sync code';
		}
	}

	function finishSync(id: number, success: boolean) {
		if (id !== syncRequestId) return;
		syncPending = false;
		syncing = false;
		if (success) {
			syncSuccess = true;
			setTimeout(() => { syncSuccess = false; }, 3000);
		} else if (!syncStore.isLoggedIn) {
			error = 'Not logged in';
		} else {
			error = syncStore.lastError || 'Sync failed — check your connection';
		}
	}

	function doSync() {
		if (syncPending) return;
		error = '';
		syncSuccess = false;
		syncing = true;
		syncPending = true;
		const id = ++syncRequestId;

		// Settings gets the same short feedback as the topbar. It must not look stuck
		// while a large photo upload continues over a slow iPhone/Tailscale connection.
		setTimeout(() => {
			if (id === syncRequestId) syncing = false;
		}, 2000);
		setTimeout(() => {
			if (id !== syncRequestId || !syncPending) return;
			syncRequestId++;
			syncPending = false;
			syncing = false;
			error = 'Sync timed out after 60 seconds';
		}, 62_000);

		void notesStore.syncWithCloudManual()
			.then((success) => finishSync(id, success))
			.catch(() => finishSync(id, false));
	}

	function doLogout() {
		syncStore.logout();
		mode = 'menu';
	}

	let copied = $state(false);

	async function copySyncCode() {
		if (!syncStore.account?.syncCode) return;
		const text = syncStore.account.syncCode;
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
			} else {
				throw new Error('clipboard API unavailable');
			}
		} catch {
			try {
				const ta = document.createElement('textarea');
				ta.value = text;
				ta.style.position = 'fixed';
				ta.style.opacity = '0';
				document.body.appendChild(ta);
				ta.focus();
				ta.select();
				document.execCommand('copy');
				document.body.removeChild(ta);
			} catch { /* ignore */ }
		}
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKey} />

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
	onclick={onClose}
	transition:fade={{ duration: 150 }}
>
	<div
		class="relative w-full max-w-md rounded-xl border border-[var(--gkc-border)] bg-[var(--gkc-surface)] p-6 shadow-2xl"
		transition:fly={{ y: 20, duration: 200 }}
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-medium text-[var(--gkc-text)]">☁️ Sync</h2>
			<button onclick={onClose} class="icon-btn h-8 w-8 p-1.5 text-[var(--gkc-text-muted)]" aria-label="Close">✕</button>
		</div>

		{#if syncStore.isLoggedIn && mode !== 'menu'}
			<!-- Already linked -->
			<div class="space-y-4">
				<div class="rounded-lg bg-black/5 p-3 dark:bg-white/5">
					<div class="text-xs text-[var(--gkc-text-muted)]">Sync code</div>
					<div class="mt-1 flex items-center justify-between">
						<code class="text-lg font-bold tracking-wider text-[var(--gkc-text)]">{syncStore.account?.syncCode}</code>
						<button onclick={copySyncCode} class="rounded px-2 py-1 text-xs {copied ? 'text-green-600 dark:text-green-400 font-medium' : 'text-[var(--gkc-text-muted)]'} hover:bg-black/10 dark:hover:bg-white/10">
							{copied ? '✓ Copied!' : 'Copy'}
						</button>
					</div>
					{#if syncStore.account?.username}
						<div class="mt-1 text-xs text-[var(--gkc-text-muted)]">@{syncStore.account.username}</div>
					{/if}
				</div>

				<!-- Sync status -->
				<div class="text-sm">
					{#if syncStore.progress}
						{@const progress = syncStore.progress}
						{@const percent = progressPercent(progress.loadedBytes, progress.totalBytes)}
						<div class="mb-1 flex items-center justify-between text-[var(--gkc-text-muted)]">
							<span>{progress.phase === 'upload' ? 'Uploading backup' : 'Downloading merged backup'}</span>
							<span>{formatBytes(progress.loadedBytes)}{progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)} (${percent}%)` : ''}</span>
						</div>
						<div class="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
							<div class="h-full rounded-full bg-blue-600 transition-[width] duration-150" style={`width: ${progress.totalBytes ? percent : 100}%`}></div>
						</div>
					{:else if syncing}
						<div class="flex items-center gap-2 text-[var(--gkc-text-muted)]"><span class="animate-spin">☁️</span><span>Preparing sync…</span></div>
					{:else if syncPending}
						<span class="text-[var(--gkc-text-muted)]">Server is merging your backup…</span>
					{:else if syncSuccess}
						<span class="text-green-600 dark:text-green-400">✓ Synced</span>
					{:else}
						<span class="text-[var(--gkc-text-muted)]">Last sync: {syncStore.lastSync ? new Date(syncStore.lastSync).toLocaleString() : 'never'}</span>
					{/if}
				</div>

				<!-- Single sync button -->
				<button
					onclick={doSync}
					disabled={syncPending || loading}
					class="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				>
					{syncing ? 'Syncing…' : syncPending ? 'Sync in background…' : '🔄 Sync now'}
				</button>

				{#if error}
					<div class="text-sm text-red-600 dark:text-red-400">{error}</div>
				{/if}

				<!-- Info -->
				<div class="rounded-lg bg-black/5 p-3 text-xs text-[var(--gkc-text-muted)] dark:bg-white/5">
					<p class="mb-1">Enter this sync code on other devices to link them.</p>
					<p>Sync automatically merges notes from all devices — newest edit wins.</p>
				</div>

				<button onclick={doLogout} class="w-full rounded-lg px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-black/5 dark:hover:bg-white/10">
					Unlink this device
				</button>
			</div>
		{:else if mode === 'menu'}
			<!-- Choose: register or link -->
			<div class="space-y-3">
				<p class="text-sm text-[var(--gkc-text-muted)]">Sync your notes across devices. Register to get a sync code, or enter a code from another device.</p>
				<button
					onclick={() => { mode = 'register'; error = ''; }}
					class="w-full rounded-lg bg-blue-600 px-3 py-3 text-sm font-medium text-white hover:bg-blue-700"
				>Create account / Get sync code</button>
				<button
					onclick={() => { mode = 'link'; error = ''; }}
					class="w-full rounded-lg border border-[var(--gkc-border)] px-3 py-3 text-sm font-medium text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10"
				>Link existing device with code</button>
			</div>
		{:else if mode === 'register'}
			<!-- Register -->
			<div class="space-y-3">
				<label class="block">
					<span class="mb-1 block text-sm text-[var(--gkc-text-muted)]">Username</span>
					<input
						bind:value={username}
						type="text"
						placeholder="Enter a username"
						class="w-full rounded-lg border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-3 py-2 text-sm text-[var(--gkc-text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
						onkeydown={(e) => e.key === 'Enter' && doRegister()}
					/>
				</label>
				{#if error}
					<div class="text-sm text-red-600 dark:text-red-400">{error}</div>
					{#if error.includes('already exists')}
						<button
							type="button"
							onclick={() => { mode = 'link'; error = ''; }}
							class="w-full rounded-lg border border-[var(--gkc-border)] px-3 py-2 text-sm font-medium text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10"
						>
							Link with my sync code →
						</button>
					{/if}
				{/if}
				<button
					onclick={doRegister}
					disabled={loading}
					class="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				>{loading ? 'Creating…' : 'Get my sync code'}</button>
				<button onclick={() => { mode = 'menu'; error = ''; }} class="w-full text-xs text-[var(--gkc-text-muted)] hover:underline">← Back</button>
			</div>
		{:else if mode === 'link'}
			<!-- Link device -->
			<div class="space-y-3">
				<label class="block">
					<span class="mb-1 block text-sm text-[var(--gkc-text-muted)]">Sync code</span>
					<input
						bind:value={syncCodeInput}
						type="text"
						placeholder="6-digit code"
						maxlength="6"
						class="w-full rounded-lg border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-3 py-2 text-lg font-bold tracking-widest text-center text-[var(--gkc-text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
						onkeydown={(e) => e.key === 'Enter' && doLink()}
					/>
				</label>
				{#if error}<div class="text-sm text-red-600 dark:text-red-400">{error}</div>{/if}
				<button
					onclick={doLink}
					disabled={loading}
					class="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				>{loading ? 'Linking…' : 'Link device & sync'}</button>
				<button onclick={() => { mode = 'menu'; error = ''; }} class="w-full text-xs text-[var(--gkc-text-muted)] hover:underline">← Back</button>
			</div>
		{/if}
	</div>
</div>

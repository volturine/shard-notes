// Client-side sync account and status. Sync status is persisted separately so the UI does
// not say "never" just because the page was reloaded after a successful sync.

import type { Label, Note } from '$lib/types';

const LS_SYNC_KEY = 'gkc-sync-account';
const LS_SYNC_STATUS_KEY = 'gkc-sync-status';

interface SyncAccount {
	username: string;
	syncCode: string;
}

interface SyncStatus {
	lastSync: number;
}

class SyncStore {
	account = $state<SyncAccount | null>(null);
	lastSync = $state(0);
	lastError = $state<string | null>(null);

	// Non-reactive callbacks avoid re-rendering the note grid for cloud feedback.
	onSyncStart: (() => void) | null = null;
	onSyncEnd: (() => void) | null = null;

	constructor() {
		if (typeof localStorage === 'undefined') return;
		try {
			const rawAccount = localStorage.getItem(LS_SYNC_KEY);
			if (rawAccount) this.account = JSON.parse(rawAccount) as SyncAccount;
			const rawStatus = localStorage.getItem(LS_SYNC_STATUS_KEY);
			if (rawStatus) {
				const status = JSON.parse(rawStatus) as SyncStatus;
				this.lastSync = Number(status.lastSync) || 0;
			}
		} catch (err) {
			console.error('[sync] could not restore local status:', err);
		}
	}

	get isLoggedIn(): boolean {
		return this.account !== null;
	}

	private saveAccount(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			if (this.account) localStorage.setItem(LS_SYNC_KEY, JSON.stringify(this.account));
			else localStorage.removeItem(LS_SYNC_KEY);
		} catch (err) {
			console.error('[sync] could not save account:', err);
		}
	}

	private saveStatus(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(LS_SYNC_STATUS_KEY, JSON.stringify({ lastSync: this.lastSync }));
		} catch (err) {
			console.error('[sync] could not save status:', err);
		}
	}

	async register(username: string): Promise<{
		success: boolean;
		syncCode?: string;
		error?: string;
		accountExists?: boolean;
	}> {
		try {
			const res = await fetch('/api/sync/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username })
			});
			const data = await res.json();
			if (!res.ok) {
				return { success: false, error: data.error || 'Registration failed', accountExists: res.status === 409 };
			}
			this.account = { username: data.username, syncCode: data.syncCode };
			this.lastError = null;
			this.saveAccount();
			return { success: true, syncCode: data.syncCode };
		} catch (err) {
			const error = err instanceof Error ? err.message : 'Network error';
			return { success: false, error };
		}
	}

	async linkDevice(syncCode: string): Promise<{ success: boolean; error?: string }> {
		try {
			const res = await fetch('/api/sync/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ syncCode, notes: [], labels: [] })
			});
			const data = await res.json();
			if (!res.ok) return { success: false, error: data.error || 'Invalid sync code' };
			this.account = { username: '', syncCode };
			this.lastError = null;
			this.saveAccount();
			return { success: true };
		} catch (err) {
			return { success: false, error: err instanceof Error ? err.message : 'Network error' };
		}
	}

	/** Full-size photos can make a cloud backup take longer on mobile/Tailscale. */
	async sync(
		notes: Note[],
		labels: Label[],
		indicate = false
	): Promise<{ success: boolean; notes?: Note[]; labels?: Label[]; error?: string }> {
		if (!this.account) return { success: false, error: 'Not logged in' };
		if (indicate) this.onSyncStart?.();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 60_000);
		try {
			const res = await fetch('/api/sync/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ syncCode: this.account.syncCode, notes, labels }),
				signal: controller.signal
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				const error = data.error || `Sync request failed (${res.status})`;
				this.lastError = error;
				return { success: false, error };
			}
			this.lastSync = Date.now();
			this.lastError = null;
			this.saveStatus();
			return { success: true, notes: data.notes, labels: data.labels };
		} catch (err) {
			const error = err instanceof DOMException && err.name === 'AbortError'
				? 'Sync timed out after 60 seconds'
				: err instanceof Error
					? `Sync network error: ${err.message}`
					: 'Sync network error';
			this.lastError = error;
			return { success: false, error };
		} finally {
			clearTimeout(timeout);
			if (indicate) this.onSyncEnd?.();
		}
	}

	logout(): void {
		this.account = null;
		this.lastError = null;
		this.saveAccount();
	}
}

export const syncStore = new SyncStore();

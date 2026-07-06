// Client-side sync store — manages the sync code, username, and bidirectional sync logic.

import type { Note, Label } from '$lib/types';

const LS_SYNC_KEY = 'gkc-sync-account';

interface SyncAccount {
	username: string;
	syncCode: string;
}

class SyncStore {
	account = $state<SyncAccount | null>(null);
	lastSync = $state(0);

	// Non-reactive callback — set by the Topbar to spin the cloud icon.
	// This avoids any $state changes that would trigger re-renders.
	onSyncStart: (() => void) | null = null;
	onSyncEnd: (() => void) | null = null;

	constructor() {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(LS_SYNC_KEY);
			if (raw) this.account = JSON.parse(raw);
		} catch { /* ignore */ }
	}

	get isLoggedIn(): boolean {
		return this.account !== null;
	}

	private saveAccount() {
		if (typeof localStorage === 'undefined') return;
		try {
			if (this.account) {
				localStorage.setItem(LS_SYNC_KEY, JSON.stringify(this.account));
			} else {
				localStorage.removeItem(LS_SYNC_KEY);
			}
		} catch { /* ignore */ }
	}

	async register(username: string): Promise<{ success: boolean; syncCode?: string; error?: string }> {
		try {
			const res = await fetch('/api/sync/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username })
			});
			const data = await res.json();
			if (!res.ok) return { success: false, error: data.error };
			this.account = { username: data.username, syncCode: data.syncCode };
			this.saveAccount();
			return { success: true, syncCode: data.syncCode };
		} catch {
			return { success: false, error: 'Network error' };
		}
	}

	async linkDevice(syncCode: string): Promise<{ success: boolean; error?: string }> {
		try {
			const res = await fetch('/api/sync/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ syncCode, notes: [], labels: [] })
			});
			if (!res.ok) {
				const data = await res.json();
				return { success: false, error: data.error || 'Invalid sync code' };
			}
			this.account = { username: '', syncCode };
			this.saveAccount();
			return { success: true };
		} catch {
			return { success: false, error: 'Network error' };
		}
	}

	/** Single sync method. No reactive state — caller controls UI feedback. */
	async sync(notes: Note[], labels: Label[]): Promise<{ success: boolean; notes?: Note[]; labels?: Label[]; error?: string }> {
		if (!this.account) return { success: false, error: 'Not logged in' };
		this.onSyncStart?.();
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10000);
			const res = await fetch('/api/sync/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ syncCode: this.account.syncCode, notes, labels }),
				signal: controller.signal
			});
			clearTimeout(timeout);
			const data = await res.json();
			if (!res.ok) return { success: false, error: data.error };
			this.lastSync = Date.now();
			return { success: true, notes: data.notes, labels: data.labels };
		} catch {
			return { success: false, error: 'Network error' };
		}
	}

	logout() {
		this.account = null;
		this.saveAccount();
	}
}

export const syncStore = new SyncStore();

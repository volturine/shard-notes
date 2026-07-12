// Client-side account, sync status, and real transfer progress for full-size photo backups.

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

export interface SyncProgress {
	phase: 'upload' | 'download';
	loadedBytes: number;
	totalBytes: number | null;
}

type SyncResult = { success: boolean; notes?: Note[]; labels?: Label[]; error?: string };

class SyncStore {
	account = $state<SyncAccount | null>(null);
	lastSync = $state(0);
	lastError = $state<string | null>(null);
	progress = $state<SyncProgress | null>(null);

	// Non-reactive callbacks avoid re-rendering the note grid for cloud feedback.
	onSyncStart: (() => void) | null = null;
	onSyncEnd: (() => void) | null = null;

	constructor() {
		if (typeof localStorage === 'undefined') return;
		try {
			const rawAccount = localStorage.getItem(LS_SYNC_KEY);
			if (rawAccount) this.account = JSON.parse(rawAccount) as SyncAccount;
			const rawStatus = localStorage.getItem(LS_SYNC_STATUS_KEY);
			if (rawStatus) this.lastSync = Number((JSON.parse(rawStatus) as SyncStatus).lastSync) || 0;
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

	async register(username: string): Promise<{ success: boolean; syncCode?: string; error?: string; accountExists?: boolean }> {
		try {
			const res = await fetch('/api/sync/register', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username })
			});
			const data = await res.json();
			if (!res.ok) return { success: false, error: data.error || 'Registration failed', accountExists: res.status === 409 };
			this.account = { username: data.username, syncCode: data.syncCode };
			this.lastError = null;
			this.saveAccount();
			return { success: true, syncCode: data.syncCode };
		} catch (err) {
			return { success: false, error: err instanceof Error ? err.message : 'Network error' };
		}
	}

	async linkDevice(syncCode: string): Promise<{ success: boolean; error?: string }> {
		try {
			const res = await fetch('/api/sync/sync', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ syncCode, notes: [], labels: [] })
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

	private sendSyncRequest(payload: string, uploadBytes: number, indicate: boolean): Promise<SyncResult> {
		return new Promise((resolve) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', '/api/sync/sync');
			xhr.timeout = 60_000;
			xhr.setRequestHeader('Content-Type', 'application/json');

			if (indicate) {
				this.progress = { phase: 'upload', loadedBytes: 0, totalBytes: uploadBytes };
				xhr.upload.onprogress = (event) => {
					this.progress = {
						phase: 'upload', loadedBytes: event.loaded,
						totalBytes: event.lengthComputable ? event.total : uploadBytes
					};
				};
				xhr.upload.onloadend = () => {
					this.progress = { phase: 'download', loadedBytes: 0, totalBytes: null };
				};
				xhr.onprogress = (event) => {
					this.progress = {
						phase: 'download', loadedBytes: event.loaded,
						totalBytes: event.lengthComputable ? event.total : null
					};
				};
			}

			xhr.onload = () => {
				let data: Record<string, unknown> = {};
				try { data = JSON.parse(xhr.responseText || '{}') as Record<string, unknown>; } catch { /* handled below */ }
				if (xhr.status < 200 || xhr.status >= 300) {
					resolve({ success: false, error: typeof data.error === 'string' ? data.error : `Sync request failed (${xhr.status})` });
					return;
				}
				resolve({ success: true, notes: data.notes as Note[], labels: data.labels as Label[] });
			};
			xhr.onerror = () => resolve({ success: false, error: 'Sync network error' });
			xhr.ontimeout = () => resolve({ success: false, error: 'Sync timed out after 60 seconds' });
			xhr.onabort = () => resolve({ success: false, error: 'Sync was cancelled' });
			xhr.send(payload);
		});
	}

	/** XMLHttpRequest provides real upload/download byte events; fetch does not on iOS Safari. */
	async sync(notes: Note[], labels: Label[], indicate = false): Promise<SyncResult> {
		if (!this.account) return { success: false, error: 'Not logged in' };
		if (indicate) this.onSyncStart?.();
		const payload = JSON.stringify({ syncCode: this.account.syncCode, notes, labels });
		const uploadBytes = new Blob([payload]).size;
		try {
			const result = await this.sendSyncRequest(payload, uploadBytes, indicate);
			if (!result.success) {
				this.lastError = result.error || 'Sync failed';
				return result;
			}
			this.lastSync = Date.now();
			this.lastError = null;
			this.saveStatus();
			return result;
		} catch (err) {
			const error = err instanceof Error ? `Sync network error: ${err.message}` : 'Sync network error';
			this.lastError = error;
			return { success: false, error };
		} finally {
			if (indicate) this.progress = null;
			if (indicate) this.onSyncEnd?.();
		}
	}

	logout(): void {
		this.account = null;
		this.lastError = null;
		this.progress = null;
		this.saveAccount();
	}
}

export const syncStore = new SyncStore();

// Client-side account, sync status, and real transfer progress for full-size photo backups.

import type { KanbanBoard } from '$lib/kanban';
import type { Label, Note } from '$lib/types';
import { sha256 } from '$lib/syncHash';

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

type SyncResult = {
	success: boolean;
	notes?: Note[];
	labels?: Label[];
	boards?: KanbanBoard[];
	tombstones?: Record<string, number>;
	labelTombstones?: Record<string, number>;
	boardTombstones?: Record<string, number>;
	data?: Record<string, unknown>;
	error?: string;
};

class SyncStore {
	account = $state<SyncAccount | null>(null);
	lastSync = $state(0);
	lastError = $state<string | null>(null);
	progress = $state<SyncProgress | null>(null);

	// Non-reactive callbacks avoid re-rendering the note grid for cloud feedback.
	onSyncStart: (() => void) | null = null;
	onSyncEnd: (() => void) | null = null;
	/** Registered by the central data store so board edits share its debounced sync. */
	onLocalDataChange: (() => void) | null = null;

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

	requestAutoSync(): void {
		this.onLocalDataChange?.();
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
			const res = await fetch('/api/sync/delta', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ syncCode, manifest: { notes: [], labels: [], boards: [] } })
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				return { success: false, error: data.error || 'Invalid sync code' };
			}
			this.account = { username: '', syncCode };
			this.lastError = null;
			this.saveAccount();
			return { success: true };
		} catch (err) {
			return { success: false, error: err instanceof Error ? err.message : 'Network error' };
		}
	}

	private sendSyncRequest(path: string, payload: string, uploadBytes: number, indicate: boolean): Promise<SyncResult> {
		return new Promise((resolve) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', path);
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
				resolve({
					success: true,
					notes: data.notes as Note[],
					labels: data.labels as Label[],
					boards: data.boards as KanbanBoard[],
					tombstones: data.tombstones as Record<string, number> | undefined,
					labelTombstones: data.labelTombstones as Record<string, number> | undefined,
					boardTombstones: data.boardTombstones as Record<string, number> | undefined,
					data
				});
			};
			xhr.onerror = () => resolve({ success: false, error: 'Sync network error' });
			xhr.ontimeout = () => resolve({ success: false, error: 'Sync timed out after 60 seconds' });
			xhr.onabort = () => resolve({ success: false, error: 'Sync was cancelled' });
			xhr.send(payload);
		});
	}

	/** Two-phase delta sync: manifests first, then only changed records/photos. */
	async sync(
		notes: Note[],
		labels: Label[],
		tombstones: Record<string, number> = {},
		labelTombstones: Record<string, number> = {},
		boards: KanbanBoard[] = [],
		boardTombstones: Record<string, number> = {},
		indicate = false
	): Promise<SyncResult> {
		if (!this.account) return { success: false, error: 'Not logged in' };
		if (indicate) this.onSyncStart?.();
		try {
			const noteHashes = Object.fromEntries(await Promise.all(notes.map(async (note) => [note.id, await sha256(note)])));
			const labelHashes = Object.fromEntries(await Promise.all(labels.map(async (label) => [label.id, await sha256(label)])));
			const boardHashes = Object.fromEntries(await Promise.all(boards.map(async (board) => [board.id, await sha256(board)])));
			const imageManifests = Object.fromEntries(await Promise.all(notes.map(async (note) => [
				note.id,
				await Promise.all((note.images ?? []).map(async (image) => ({ id: image.id, hash: await sha256(image.dataUrl) })))
			])));
			const manifestPayload = JSON.stringify({
				syncCode: this.account.syncCode,
				manifest: {
					notes: notes.map(({ id, updatedAt }) => ({ id, updatedAt, hash: noteHashes[id], images: imageManifests[id] })),
					labels: labels.map(({ id, updatedAt }) => ({ id, updatedAt, hash: labelHashes[id] })),
					boards: boards.map(({ id, updatedAt }) => ({ id, updatedAt, hash: boardHashes[id] })),
					tombstones,
					labelTombstones,
					boardTombstones
				}
			});
			const plan = await this.sendSyncRequest('/api/sync/delta', manifestPayload, new Blob([manifestPayload]).size, indicate);
			if (!plan.success || !plan.data) return this.fail(plan);

			const uploadNoteIds = new Set((plan.data.uploadNoteIds as string[] | undefined) ?? []);
			const uploadLabelIds = new Set((plan.data.uploadLabelIds as string[] | undefined) ?? []);
			const uploadBoardIds = new Set((plan.data.uploadBoardIds as string[] | undefined) ?? []);
			const uploadTombstones = (plan.data.uploadTombstones as Record<string, number> | undefined) ?? {};
			const uploadLabelTombstones = (plan.data.uploadLabelTombstones as Record<string, number> | undefined) ?? {};
			const uploadBoardTombstones = (plan.data.uploadBoardTombstones as Record<string, number> | undefined) ?? {};
			const knownImageIds = (plan.data.knownImageIds as Record<string, string[]> | undefined) ?? {};
			const uploadNotes = notes.filter((note) => uploadNoteIds.has(note.id)).map((note) => ({
				...note,
				images: (note.images ?? []).map((image) => knownImageIds[note.id]?.includes(image.id) ? { ...image, dataUrl: '' } : image)
			}));
			const uploadLabels = labels.filter((label) => uploadLabelIds.has(label.id));
			const uploadBoards = boards.filter((board) => uploadBoardIds.has(board.id));
			let canonical: SyncResult = { success: true, notes: [], labels: [], boards: [], tombstones: {} };
			if (uploadNotes.length || uploadLabels.length || uploadBoards.length || Object.keys(uploadTombstones).length || Object.keys(uploadLabelTombstones).length || Object.keys(uploadBoardTombstones).length) {
				const uploadNoteHashes = Object.fromEntries(await Promise.all(uploadNotes.map(async (note) => [note.id, await sha256(note)])));
				const uploadLabelHashes = Object.fromEntries(await Promise.all(uploadLabels.map(async (label) => [label.id, await sha256(label)])));
				const uploadBoardHashes = Object.fromEntries(await Promise.all(uploadBoards.map(async (board) => [board.id, await sha256(board)])));
				const uploadPayload = JSON.stringify({
					syncCode: this.account.syncCode,
					notes: uploadNotes,
					labels: uploadLabels,
					boards: uploadBoards,
					tombstones: uploadTombstones,
					labelTombstones: uploadLabelTombstones,
					boardTombstones: uploadBoardTombstones,
					hashes: {
						notes: Object.fromEntries(uploadNotes.map((note) => [note.id, uploadNoteHashes[note.id]])),
						labels: Object.fromEntries(uploadLabels.map((label) => [label.id, uploadLabelHashes[label.id]])),
						boards: Object.fromEntries(uploadBoards.map((board) => [board.id, uploadBoardHashes[board.id]]))
					}
				});
				canonical = await this.sendSyncRequest('/api/sync/delta', uploadPayload, new Blob([uploadPayload]).size, indicate);
				if (!canonical.success) return this.fail(canonical);
				const ack = canonical.data?.ack as { notes?: Record<string, string>; labels?: Record<string, string>; boards?: Record<string, string> } | undefined;
				for (const note of uploadNotes) if (ack?.notes?.[note.id] !== uploadNoteHashes[note.id]) return this.fail({ success: false, error: `Server hash acknowledgement failed for note ${note.id}` });
				for (const label of uploadLabels) if (ack?.labels?.[label.id] !== uploadLabelHashes[label.id]) return this.fail({ success: false, error: `Server hash acknowledgement failed for label ${label.id}` });
				for (const board of uploadBoards) if (ack?.boards?.[board.id] !== uploadBoardHashes[board.id]) return this.fail({ success: false, error: `Server hash acknowledgement failed for board ${board.id}` });
			}

			this.lastSync = Date.now();
			this.lastError = null;
			this.saveStatus();
			return {
				success: true,
				notes: [...(plan.notes ?? []), ...(canonical.notes ?? [])],
				labels: [...(plan.labels ?? []), ...(canonical.labels ?? [])],
				boards: [...(plan.boards ?? []), ...(canonical.boards ?? [])],
				tombstones: { ...(plan.tombstones ?? {}), ...(canonical.tombstones ?? {}) },
				labelTombstones: { ...(plan.labelTombstones ?? {}), ...(canonical.labelTombstones ?? {}) },
				boardTombstones: { ...(plan.boardTombstones ?? {}), ...(canonical.boardTombstones ?? {}) }
			};
		} catch (err) {
			return this.fail({ success: false, error: err instanceof Error ? `Sync network error: ${err.message}` : 'Sync network error' });
		} finally {
			if (indicate) this.progress = null;
			if (indicate) this.onSyncEnd?.();
		}
	}

	private fail(result: SyncResult): SyncResult {
		this.lastError = result.error || 'Sync failed';
		return { success: false, error: this.lastError };
	}

	logout(): void {
		this.account = null;
		this.lastError = null;
		this.progress = null;
		this.saveAccount();
	}
}

export const syncStore = new SyncStore();

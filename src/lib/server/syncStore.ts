// Server-side sync storage — stores user data as JSON on disk.
// Simple and portable; works with SvelteKit's dev server and any Node adapter.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface SyncUser {
	syncCode: string;
	notes: unknown[];
	labels: unknown[];
	updatedAt: number;
}

interface SyncData {
	[username: string]: SyncUser;
}

const DATA_DIR = 'sync-data';
const DATA_FILE = join(DATA_DIR, 'users.json');

function ensureDataFile(): void {
	if (!existsSync(DATA_DIR)) {
		mkdirSync(DATA_DIR, { recursive: true });
	}
	if (!existsSync(DATA_FILE)) {
		writeFileSync(DATA_FILE, '{}', 'utf-8');
	}
}

export function readSyncData(): SyncData {
	try {
		ensureDataFile();
		const raw = readFileSync(DATA_FILE, 'utf-8');
		return JSON.parse(raw) as SyncData;
	} catch {
		return {};
	}
}

export function writeSyncData(data: SyncData): void {
	try {
		ensureDataFile();
		writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
	} catch {
		// best effort
	}
}

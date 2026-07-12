// Server-side sync storage. Each write is temp-file + atomic rename: a process crash leaves
// either the old complete JSON or the new complete JSON, never a truncated account file.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface SyncUser {
	syncCode: string;
	notes: unknown[];
	labels: unknown[];
	updatedAt: number;
}

export interface SyncData {
	[username: string]: SyncUser;
}

const DATA_DIR = 'sync-data';
const DATA_FILE = join(DATA_DIR, 'users.json');

function ensureDataFile(): void {
	if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
	if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, '{}\n', { encoding: 'utf-8', flag: 'wx' });
}

export function readSyncData(): SyncData {
	ensureDataFile();
	const parsed: unknown = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Sync data file is not a JSON object');
	}
	return parsed as SyncData;
}

export function writeSyncData(data: SyncData): void {
	ensureDataFile();
	const temp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
	try {
		writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
		renameSync(temp, DATA_FILE);
	} catch (err) {
		try {
			if (existsSync(temp)) unlinkSync(temp);
		} catch (cleanupErr) {
			console.error('[sync] failed to remove temporary file:', cleanupErr);
		}
		throw err;
	}
}

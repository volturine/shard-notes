import type { Note } from '$lib/types';
import { uid } from '$lib/utils';

export interface KanbanColumn {
	id: string;
	/** null is the fixed backlog; every other column is exactly one note tag. */
	labelId: string | null;
}

export interface KanbanBoard {
	id: string;
	name: string;
	columns: KanbanColumn[];
	/** Last configuration edit; this is the board's delta-sync version. */
	updatedAt: number;
}

export function createKanbanBoard(name = 'Untitled board'): KanbanBoard {
	const now = Date.now();
	return {
		id: uid(),
		name: name.trim() || 'Untitled board',
		columns: [{ id: uid(), labelId: null }],
		updatedAt: now
	};
}

/**
 * A tag column contains notes with that tag. The backlog contains notes that
 * have none of this board's tag columns, while leaving unrelated tags alone.
 */
export function columnNotes(board: KanbanBoard, column: KanbanColumn, notes: Note[]): Note[] {
	const columnLabelId = column.labelId;
	if (columnLabelId !== null) return notes.filter((note) => note.labels.includes(columnLabelId));
	const boardLabelIds = new Set(
		board.columns.flatMap((candidate) => (candidate.labelId === null ? [] : [candidate.labelId]))
	);
	return notes.filter((note) => !note.labels.some((labelId) => boardLabelIds.has(labelId)));
}

/** Server records win equal timestamps, matching the sync protocol's hash-conflict rule. */
export function mergeKanbanBoards(
	local: KanbanBoard[],
	remote: KanbanBoard[],
	tombstones: Record<string, number> = {}
): KanbanBoard[] {
	const byId = new Map(local.map((board) => [board.id, board]));
	for (const board of remote) {
		const current = byId.get(board.id);
		if (!current || board.updatedAt >= current.updatedAt) byId.set(board.id, board);
	}
	return [...byId.values()].filter((board) => (Number(tombstones[board.id]) || 0) < board.updatedAt);
}

/**
 * Moving is deliberately label-only: remove the exact source tag and add the
 * destination tag. Labels outside the board are never changed.
 */
export function moveNoteLabels(labels: string[], sourceLabelId: string | null, destinationLabelId: string | null): string[] {
	const withoutSource = sourceLabelId === null ? [...labels] : labels.filter((labelId) => labelId !== sourceLabelId);
	return destinationLabelId !== null && !withoutSource.includes(destinationLabelId)
		? [...withoutSource, destinationLabelId]
		: withoutSource;
}

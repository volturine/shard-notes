import { describe, expect, it } from 'vitest';
import { columnNotes, mergeKanbanBoards, moveNoteLabels, type KanbanBoard } from './kanban';
import type { Note } from './types';

const board: KanbanBoard = {
	id: 'board',
	name: 'Work',
	updatedAt: 10,
	columns: [
		{ id: 'backlog', labelId: null },
		{ id: 'todo', labelId: 'todo-label' },
		{ id: 'done', labelId: 'done-label' }
	]
};

function note(id: string, labels: string[]): Note {
	return {
		id,
		title: id,
		body: '',
		color: 'default',
		pinned: false,
		archived: false,
		trashed: false,
		trashedAt: null,
		createdAt: 1,
		updatedAt: 1,
		reminder: null,
		labels
	};
}

describe('Kanban board tag mapping', () => {
	it('puts notes without this board’s tags in the backlog, even when they use other labels', () => {
		const notes = [note('unlabelled', []), note('personal', ['personal-label']), note('todo', ['todo-label'])];

		expect(columnNotes(board, board.columns[0], notes).map((item) => item.id)).toEqual(['unlabelled', 'personal']);
		expect(columnNotes(board, board.columns[1], notes).map((item) => item.id)).toEqual(['todo']);
	});

	it('moves only the exact source column tag and retains unrelated labels', () => {
		expect(moveNoteLabels(['personal-label', 'todo-label'], 'todo-label', 'done-label')).toEqual([
			'personal-label',
			'done-label'
		]);
		expect(moveNoteLabels(['personal-label', 'todo-label'], 'todo-label', null)).toEqual(['personal-label']);
		expect(moveNoteLabels(['personal-label'], null, 'todo-label')).toEqual(['personal-label', 'todo-label']);
	});

	it('takes the newer board from sync and never revives a tombstoned board', () => {
		const remote: KanbanBoard = { ...board, name: 'Remote work', updatedAt: 20 };
		expect(mergeKanbanBoards([board], [remote], {})).toEqual([remote]);
		expect(mergeKanbanBoards([remote], [board], { board: 30 })).toEqual([]);
	});
});

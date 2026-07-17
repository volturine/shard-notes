import { describe, expect, it } from 'vitest';
import { mergeTwoNotes } from './noteMerge';
import type { Note, NoteImage } from './types';

function image(id: string, dataUrl: string): NoteImage {
	return { id, name: `${id}.jpg`, mime: 'image/jpeg', dataUrl };
}

function note(updatedAt: number, images: NoteImage[]): Note {
	return {
		id: 'note',
		title: '',
		body: '',
		items: [],
		kind: 'text',
		color: 'default',
		pinned: false,
		archived: false,
		trashed: false,
		trashedAt: null,
		createdAt: 1,
		updatedAt,
		reminder: null,
		labels: [],
		images
	};
}

describe('mergeTwoNotes image hydration', () => {
	it('repairs each missing image independently when equal versions are reconciled', () => {
		const partial = note(10, [image('one', 'data:one')]);
		const complete = note(10, [image('one', 'data:one'), image('two', 'data:two')]);

		expect(mergeTwoNotes(partial, complete).images).toEqual(complete.images);
	});

	it('hydrates an empty matching payload without resurrecting images removed by a newer note', () => {
		const stored = note(10, [image('one', 'data:one'), image('removed', 'data:removed')]);
		const newer = note(11, [image('one', '')]);

		expect(mergeTwoNotes(newer, stored).images).toEqual([image('one', 'data:one')]);
	});
});

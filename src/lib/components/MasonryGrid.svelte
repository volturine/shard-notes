<script lang="ts">
	import type { Note } from '$lib/types';
	import NoteCard from './NoteCard.svelte';

	let {
		notes,
		onOpen,
		class: className = ''
	}: {
		notes: Note[];
		onOpen: (id: string) => void;
		class?: string;
	} = $props();

	let colCount = $state(2);

	$effect(() => {
		const update = () => {
			const w = window.innerWidth;
			colCount = w >= 1100 ? 5 : w >= 768 ? 4 : w >= 600 ? 3 : 2;
		};
		update();
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	});

	/** Rough height for shortest-column packing (cards are clamped in NoteCard). */
	function estimateHeight(note: Note): number {
		let h = 20;
		if (note.reminder != null) h += 26;
		if (note.title) h += 22;
		const body = note.body ?? '';
		const lineEstimate = Math.min(8, body.split('\n').length + 1) * 18;
		h += Math.min(200, Math.max(36, lineEstimate));
		if (note.labels?.length) h += 26;
		return Math.min(h, 300);
	}

	const columns = $derived.by(() => {
		const n = notes.length === 1 ? 1 : colCount;
		const cols: Note[][] = Array.from({ length: n }, () => []);
		const heights: number[] = Array(n).fill(0);
		for (const note of notes) {
			let minIdx = 0;
			for (let i = 1; i < n; i++) {
				if (heights[i] < heights[minIdx]) minIdx = i;
			}
			cols[minIdx].push(note);
			heights[minIdx] += estimateHeight(note) + 10;
		}
		return cols;
	});
</script>

<div class="masonry-balanced {className}" style="--masonry-cols: {colCount}">
	{#each columns as col, i (i)}
		<div class="masonry-balanced-col">
			{#each col as note (note.id)}
				<NoteCard {note} {onOpen} />
			{/each}
		</div>
	{/each}
</div>
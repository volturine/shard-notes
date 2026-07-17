import { uiStore } from '$lib/stores/ui.svelte';

/** Content shell class: full width in grid; 720px centered in list (matches masonry-list). */
export function notesShellClass(): string {
	return uiStore.layout === 'list' ? 'notes-content notes-content--list' : 'notes-content';
}

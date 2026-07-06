// Shared context so child pages can request opening the note editor modal
// without relying on slotted children prop args (which SvelteKit ignores).
import { getContext, setContext } from 'svelte';

type OpenEditor = (id: string) => void;

const KEY = Symbol('openEditor');

export function provideOpenEditor(fn: OpenEditor): void {
	setContext<OpenEditor>(KEY, fn);
}

export function useOpenEditor(): OpenEditor {
	const fn = getContext<OpenEditor>(KEY);
	if (!fn) {
		return () => {};
	}
	return fn;
}
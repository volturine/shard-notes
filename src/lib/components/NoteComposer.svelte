<script lang="ts">
	import { useEditorActions } from '$lib/editorContext';

	const { startNewNote } = useEditorActions();
</script>

<section class="mx-auto w-full max-w-2xl">
	<button
		type="button"
		onclick={() => startNewNote()}
		class="flex w-full touch-manipulation items-center gap-3 rounded-lg border border-black/10 bg-[var(--gkc-surface)] px-4 py-3 text-left text-sm text-[var(--gkc-text-muted)] shadow-sm active:bg-black/5 dark:border-white/10 dark:active:bg-white/10"
	>
		Take a note…
	</button>
</section>
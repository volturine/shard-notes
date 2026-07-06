<script lang="ts">
	import { KEEP_COLORS, KEEP_COLOR_ORDER, type NoteColor } from '$lib/types';

	let {
		color,
		onSelect
	}: {
		color: NoteColor;
		onSelect: (c: NoteColor) => void;
	} = $props();
</script>

<div class="grid grid-cols-6 gap-2 p-2">
	{#each KEEP_COLOR_ORDER as c (c)}
		<button
			type="button"
			onclick={() => onSelect(c)}
			class="h-7 w-7 rounded-full border border-black/10 transition-transform hover:scale-110 dark:border-white/10"
			style="background-color: {KEEP_COLORS[c]}"
			aria-label="Set color {c}"
			title={c}
		>
			{#if c === color}
				<span class="flex h-full w-full items-center justify-center text-xs text-black/60 dark:text-white/70">✓</span>
			{/if}
		</button>
	{/each}
</div>
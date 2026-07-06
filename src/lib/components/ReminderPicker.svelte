<script lang="ts">
	import { toDatetimeLocal, fromDatetimeLocal } from '$lib/utils';

	let {
		reminder,
		onClose,
		onApply
	}: {
		reminder: number | null;
		onClose: () => void;
		onApply?: (value: number | null) => void;
	} = $props();

	let value = $state(toDatetimeLocal(reminder));

	$effect(() => {
		value = toDatetimeLocal(reminder);
	});

	function apply(ts: number | null) {
		onApply?.(ts);
		onClose();
	}

	const presets = [
		{ label: 'Today 6:00 PM', get: () => atToday(18, 0) },
		{ label: 'Tomorrow 8:00 AM', get: () => atTomorrow(8, 0) },
		{ label: 'Next week 9:00 AM', get: () => atOffsetDays(7, 9, 0) }
	];

	function atToday(h: number, m: number): number {
		const d = new Date();
		d.setHours(h, m, 0, 0);
		return d.getTime();
	}
	function atTomorrow(h: number, m: number): number {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		d.setHours(h, m, 0, 0);
		return d.getTime();
	}
	function atOffsetDays(days: number, h: number, m: number): number {
		const d = new Date();
		d.setDate(d.getDate() + days);
		d.setHours(h, m, 0, 0);
		return d.getTime();
	}

	function save() {
		apply(fromDatetimeLocal(value));
	}
	function clear() {
		apply(null);
	}
</script>

<div class="w-64 rounded-lg border border-[var(--gkc-border)] bg-[var(--gkc-surface)] p-3 shadow-lg">
	<div class="mb-2 text-sm font-medium text-[var(--gkc-text)]">Add reminder</div>
	<div class="mb-3 flex flex-col gap-1">
		{#each presets as p}
			<button
				type="button"
				onclick={() => apply(p.get())}
				class="rounded px-2 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
			>
				{p.label}
			</button>
		{/each}
	</div>
	<input
		type="datetime-local"
		bind:value
		class="mb-3 w-full rounded border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-2 py-1 text-sm text-[var(--gkc-text)]"
	/>
	<div class="flex items-center justify-between">
		<button
			type="button"
			onclick={clear}
			class="rounded px-2 py-1 text-sm text-[var(--gkc-text-muted)] hover:bg-black/5 dark:hover:bg-white/10"
		>
			Remove
		</button>
		<button
			type="button"
			onclick={save}
			class="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
		>
			Save
		</button>
	</div>
</div>
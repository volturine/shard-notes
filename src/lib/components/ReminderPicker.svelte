<script lang="ts">
	let {
		reminder,
		onClose,
		onApply
	}: {
		reminder: number | null;
		onClose: () => void;
		onApply?: (value: number | null) => void;
	} = $props();

	function pad(n: number): string {
		return String(n).padStart(2, '0');
	}

	function toDateInput(ts: number | null): string {
		if (ts == null) {
			const d = new Date();
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		}
		const d = new Date(ts);
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	function toTimeInput(ts: number | null): string {
		if (ts == null) {
			return '09:00';
		}
		const d = new Date(ts);
		return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	let dateVal = $state(toDateInput(reminder));
	let timeVal = $state(toTimeInput(reminder));

	function apply(ts: number | null) {
		onApply?.(ts);
		onClose();
	}

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

	const presets = [
		{ label: 'Today, 6:00 PM', get: () => atToday(18, 0) },
		{ label: 'Tomorrow, 8:00 AM', get: () => atTomorrow(8, 0) },
		{ label: 'Next week, 9:00 AM', get: () => atOffsetDays(7, 9, 0) }
	];

	function save() {
		if (!dateVal || !timeVal) {
			apply(null);
			return;
		}
		const d = new Date(`${dateVal}T${timeVal}`);
		const ts = d.getTime();
		if (Number.isNaN(ts)) {
			apply(null);
			return;
		}
		apply(ts);
	}

	function clear() {
		apply(null);
	}
</script>

<div class="w-72 rounded-lg border border-[var(--gkc-border)] bg-[var(--gkc-surface)] p-3 shadow-xl">
	<div class="mb-3 text-sm font-medium text-[var(--gkc-text)]">Add reminder</div>

	<!-- Quick presets -->
	<div class="mb-3 flex flex-col gap-1">
		{#each presets as p}
			<button
				type="button"
				onclick={() => apply(p.get())}
				class="rounded px-2 py-1.5 text-left text-sm text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10"
			>
				{p.label}
			</button>
		{/each}
	</div>

	<!-- Custom date + time -->
	<div class="mb-3 flex flex-col gap-2">
		<label class="text-xs text-[var(--gkc-text-muted)]">Pick date & time</label>
		<input
			type="date"
			bind:value={dateVal}
			class="w-full rounded border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-2 py-1.5 text-sm text-[var(--gkc-text)] outline-none focus:ring-2 focus:ring-blue-500"
		/>
		<input
			type="time"
			bind:value={timeVal}
			class="w-full rounded border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-2 py-1.5 text-sm text-[var(--gkc-text)] outline-none focus:ring-2 focus:ring-blue-500"
		/>
	</div>

	<div class="flex items-center justify-between">
		<button
			type="button"
			onclick={clear}
			class="rounded px-3 py-1.5 text-sm text-[var(--gkc-text-muted)] hover:bg-black/5 dark:hover:bg-white/10"
		>
			Remove
		</button>
		<button
			type="button"
			onclick={save}
			class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
		>
			Save
		</button>
	</div>
</div>

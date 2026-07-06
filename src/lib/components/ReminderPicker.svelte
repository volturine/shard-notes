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

	// Initialize from existing reminder or now+1h default
	function initDate(ts: number | null): Date {
		if (ts == null) {
			const d = new Date();
			d.setHours(d.getHours() + 1, 0, 0, 0);
			return d;
		}
		return new Date(ts);
	}

	let selected = $state(initDate(reminder));

	// Quick presets
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

	// Date offset buttons
	function shiftDay(delta: number) {
		const d = new Date(selected);
		d.setDate(d.getDate() + delta);
		selected = d;
	}

	const dateLabel = $derived(
		selected.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
	);

	// Time spinner
	const hours24 = $derived(selected.getHours());
	const minutes = $derived(selected.getMinutes());

	const displayHour = $derived(
		hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24
	);
	const ampm = $derived(hours24 >= 12 ? 'PM' : 'AM');

	function shiftHour(delta: number) {
		const d = new Date(selected);
		d.setHours(d.getHours() + delta);
		selected = d;
	}
	function shiftMinute(delta: number) {
		const d = new Date(selected);
		d.setMinutes(d.getMinutes() + delta);
		selected = d;
	}
	function toggleAmPm() {
		const d = new Date(selected);
		const h = d.getHours();
		d.setHours(h < 12 ? h + 12 : h - 12);
		selected = d;
	}

	function save() {
		apply(selected.getTime());
	}
	function clear() {
		apply(null);
	}
</script>

<div class="w-72 rounded-2xl border border-[var(--gkc-border)] bg-[var(--gkc-surface)] p-5 shadow-2xl">
	<div class="mb-4 text-base font-medium text-[var(--gkc-text)]">Add reminder</div>

	<!-- Quick presets -->
	<div class="mb-4 flex flex-col gap-1">
		{#each presets as p}
			<button
				type="button"
				onclick={() => apply(p.get())}
				class="rounded-lg px-3 py-2 text-left text-sm text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10"
			>
				{p.label}
			</button>
		{/each}
	</div>

	<div class="mb-4 border-t border-[var(--gkc-border)] pt-4">
		<div class="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--gkc-text-muted)]">Pick date & time</div>

		<!-- Date picker: simple day shuttle -->
		<div class="mb-4 flex items-center justify-between">
			<button type="button" class="icon-btn h-8 w-8 p-2" onclick={() => shiftDay(-1)} aria-label="Previous day">
				<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
			</button>
			<div class="text-sm font-medium text-[var(--gkc-text)]">{dateLabel}</div>
			<button type="button" class="icon-btn h-8 w-8 p-2" onclick={() => shiftDay(1)} aria-label="Next day">
				<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
			</button>
		</div>

		<!-- Time spinner: hour / minute / ampm -->
		<div class="flex items-center justify-center gap-2">
			<!-- Hour -->
			<div class="flex flex-col items-center">
				<button type="button" class="icon-btn h-8 w-10" onclick={() => shiftHour(1)} aria-label="Hour up">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M7 14l5-5 5 5z"/></svg>
				</button>
				<div class="my-1 w-12 rounded-lg bg-[var(--gkc-bg)] py-2 text-center text-xl font-semibold tabular-nums text-[var(--gkc-text)]">
					{String(displayHour).padStart(2, '0')}
				</div>
				<button type="button" class="icon-btn h-8 w-10" onclick={() => shiftHour(-1)} aria-label="Hour down">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M7 10l5 5 5-5z"/></svg>
				</button>
			</div>

			<div class="pb-6 text-xl font-semibold text-[var(--gkc-text)]">:</div>

			<!-- Minute -->
			<div class="flex flex-col items-center">
				<button type="button" class="icon-btn h-8 w-10" onclick={() => shiftMinute(15)} aria-label="Minute up">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M7 14l5-5 5 5z"/></svg>
				</button>
				<div class="my-1 w-12 rounded-lg bg-[var(--gkc-bg)] py-2 text-center text-xl font-semibold tabular-nums text-[var(--gkc-text)]">
					{String(minutes).padStart(2, '0')}
				</div>
				<button type="button" class="icon-btn h-8 w-10" onclick={() => shiftMinute(-15)} aria-label="Minute down">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M7 10l5 5 5-5z"/></svg>
				</button>
			</div>

			<!-- AM/PM -->
			<button type="button" class="mb-6 ml-2 rounded-lg bg-[var(--gkc-bg)] px-3 py-2 text-sm font-semibold text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10" onclick={toggleAmPm}>
				{ampm}
			</button>
		</div>
	</div>

	<div class="flex items-center justify-between border-t border-[var(--gkc-border)] pt-4">
		<button
			type="button"
			onclick={clear}
			class="rounded-lg px-3 py-2 text-sm text-[var(--gkc-text-muted)] hover:bg-black/5 dark:hover:bg-white/10"
		>
			Remove
		</button>
		<button
			type="button"
			onclick={save}
			class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
		>
			Save
		</button>
	</div>
</div>

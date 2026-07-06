<script lang="ts">
	import { formatReminder } from '$lib/utils';

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

	function apply(ts: number | null) {
		onApply?.(ts);
		onClose();
	}

	// Date offset buttons
	function shiftDay(delta: number) {
		const d = new Date(selected);
		d.setDate(d.getDate() + delta);
		selected = d;
	}

	const dateLabel = $derived(
		selected.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
	);

	function formatFull(d: Date): string {
		const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
		return `${d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} at ${time}`;
	}

	const willSaveLabel = $derived(formatFull(selected));

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
	<div class="mb-3 text-base font-medium text-[var(--gkc-text)]">Reminder</div>

	<!-- Current reminder on the note -->
	<div class="mb-4 rounded-xl border border-[var(--gkc-border)] bg-[var(--gkc-bg)] px-3 py-2.5">
		<div class="text-[10px] font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]">
			On this note
		</div>
		{#if reminder != null}
			<div class="mt-1 flex items-start gap-2 text-sm font-medium text-[var(--gkc-text)]">
				<span class="shrink-0" aria-hidden="true">⏰</span>
				<span>{formatReminder(reminder)}</span>
			</div>
		{:else}
			<div class="mt-1 text-sm text-[var(--gkc-text-muted)]">No reminder set</div>
		{/if}
	</div>

	<!-- Live preview of what Save will apply -->
	<div class="mb-4 rounded-xl bg-blue-600/10 px-3 py-2.5 dark:bg-blue-500/15">
		<div class="text-[10px] font-semibold uppercase tracking-wide text-[var(--gkc-text-muted)]">
			Will remind you
		</div>
		<div class="mt-1 flex items-start gap-2 text-sm font-semibold text-[var(--gkc-text)]">
			<span class="shrink-0" aria-hidden="true">⏰</span>
			<span>{willSaveLabel}</span>
		</div>
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

		<!-- Time spinner: hour : minute AM/PM — colon & AM aligned to digit row -->
		<div class="flex justify-center gap-1">
			<div class="flex flex-col items-center">
				<button type="button" class="icon-btn h-8 w-11 shrink-0" onclick={() => shiftHour(1)} aria-label="Hour up">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M7 14l5-5 5 5z"/></svg>
				</button>
				<div class="flex h-11 w-12 items-center justify-center rounded-lg bg-[var(--gkc-bg)] text-xl font-semibold tabular-nums text-[var(--gkc-text)]">
					{String(displayHour).padStart(2, '0')}
				</div>
				<button type="button" class="icon-btn h-8 w-11 shrink-0" onclick={() => shiftHour(-1)} aria-label="Hour down">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M7 10l5 5 5-5z"/></svg>
				</button>
			</div>

			<div class="flex h-[4.75rem] w-4 shrink-0 items-center justify-center self-center pt-1 text-xl font-semibold leading-none text-[var(--gkc-text)]">
				:
			</div>

			<div class="flex flex-col items-center">
				<button type="button" class="icon-btn h-8 w-11 shrink-0" onclick={() => shiftMinute(15)} aria-label="Minute up">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M7 14l5-5 5 5z"/></svg>
				</button>
				<div class="flex h-11 w-12 items-center justify-center rounded-lg bg-[var(--gkc-bg)] text-xl font-semibold tabular-nums text-[var(--gkc-text)]">
					{String(minutes).padStart(2, '0')}
				</div>
				<button type="button" class="icon-btn h-8 w-11 shrink-0" onclick={() => shiftMinute(-15)} aria-label="Minute down">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M7 10l5 5 5-5z"/></svg>
				</button>
			</div>

			<div class="flex h-[4.75rem] shrink-0 items-center justify-center self-center pt-1">
				<button
					type="button"
					class="rounded-lg bg-[var(--gkc-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--gkc-text)] hover:bg-black/5 dark:hover:bg-white/10"
					onclick={toggleAmPm}
				>
					{ampm}
				</button>
			</div>
		</div>
	</div>

	<div class="flex items-center border-t border-[var(--gkc-border)] pt-4 {reminder != null ? 'justify-between' : 'justify-end'}">
		{#if reminder != null}
			<button
				type="button"
				onclick={clear}
				class="rounded-lg px-3 py-2 text-sm text-[var(--gkc-text-muted)] hover:bg-black/5 dark:hover:bg-white/10"
			>
				Remove
			</button>
		{/if}
		<button
			type="button"
			onclick={save}
			class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
		>
			Save
		</button>
	</div>
</div>

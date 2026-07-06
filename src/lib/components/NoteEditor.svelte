<script lang="ts">
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { formatReminder } from '$lib/utils';
	import { effectiveBody, noteToPlainText } from '$lib/checklistBody';
	import type { NoteColor } from '$lib/types';
	import { KEEP_COLORS, KEEP_DARK_COLORS } from '$lib/types';
	import ColorPalette from './ColorPalette.svelte';
	import ReminderPicker from './ReminderPicker.svelte';
	import LabelMenu from './LabelMenu.svelte';

	let {
		noteId = $bindable(),
		onClose
	}: {
		noteId: string | null;
		onClose: () => void;
	} = $props();

	const note = $derived(noteId ? notesStore.notes.find((n) => n.id === noteId) : null);
	const isOpen = $derived(noteId !== null && note !== null);

	let title = $state('');
	let body = $state('');
	let paletteOpen = $state(false);
	let reminderOpen = $state(false);
	let labelOpen = $state(false);
	let copyFlash = $state(false);

	let syncedId: string | null = null;
	$effect(() => {
		if (!note) return;
		if (syncedId !== note.id) {
			syncedId = note.id;
			title = note.title;
			body = effectiveBody(note);
		}
	});

	$effect(() => {
		if (!isOpen) {
			syncedId = null;
			paletteOpen = false;
			reminderOpen = false;
			labelOpen = false;
		}
	});

	function bgColor(c: NoteColor): string {
		return uiStore.effectiveDark ? KEEP_DARK_COLORS[c] : KEEP_COLORS[c];
	}

	function commit(patch: Record<string, unknown>) {
		if (!note) return;
		notesStore.updateNote(note.id, patch);
	}

	let timer: ReturnType<typeof setTimeout> | null = null;
	function scheduleCommit() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			if (!note) return;
			commit({ title, body, items: [], kind: 'text' });
		}, 250);
	}

	function close() {
		if (timer) clearTimeout(timer);
		if (note) {
			commit({ title, body, items: [], kind: 'text' });
		}
		onClose();
	}

	async function copyText() {
		if (!note) return;
		const text = noteToPlainText({ ...note, title, body });
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy'); } catch {}
			document.body.removeChild(ta);
		}
		copyFlash = true;
		setTimeout(() => { copyFlash = false; }, 1500);
	}
</script>

{#if isOpen && note}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') close();
		}}
	>
		<div
			class="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl"
			style="background-color: {bgColor(note.color)};"
			role="dialog"
			aria-modal="true"
		>
			{#if note.reminder != null}
				<div class="flex items-center gap-1 bg-black/5 px-4 py-1.5 text-xs text-[var(--gkc-text-muted)] dark:bg-white/5">
					<span>⏰</span>
					<span>{formatReminder(note.reminder)}</span>
				</div>
			{/if}

			<div class="flex-1 overflow-y-auto px-6 pt-5">
				<input
					type="text"
					placeholder="Title"
					bind:value={title}
					oninput={scheduleCommit}
					class="mb-3 w-full bg-transparent text-xl font-medium text-[var(--gkc-text)] placeholder:text-[var(--gkc-text-muted)] outline-none"
				/>

				<textarea
					placeholder="Take a note… Use [ ] or [] for checklist lines"
					bind:value={body}
					oninput={scheduleCommit}
					class="min-h-[200px] w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--gkc-text)] placeholder:text-[var(--gkc-text-muted)] outline-none"
				></textarea>
			</div>

			<div class="flex shrink-0 items-center gap-1 border-t border-black/5 px-4 py-2 dark:border-white/10">
				<!-- Pin: filled when pinned, outline when not -->
				<button
					type="button"
					class="icon-btn h-9 w-9 p-2"
					title={note.pinned ? 'Unpin' : 'Pin'}
					onclick={() => commit({ pinned: !note.pinned })}
					aria-label="Pin"
				>
					<svg viewBox="0 0 24 24" class="h-5 w-5 {note.pinned ? 'fill-current' : 'fill-none stroke-current'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2l8 8-4 1-3 7-3-3-4 4-1-1 4-4-3-3 7-3z" fill="{note.pinned ? 'currentColor' : 'none'}" stroke="{note.pinned ? 'none' : 'currentColor'}"/>
					</svg>
				</button>

				<button type="button" class="icon-btn h-9 w-9 p-2" title="Color" onclick={() => { paletteOpen = !paletteOpen; reminderOpen = false; labelOpen = false; }} aria-label="Color">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.4 0 2-1 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .9-1.8 2-1.8h2c2.2 0 4-1.8 4-4 0-4.4-4.5-7.7-9-7.7zm-5 10c-.8 0-1.5-.7-1.5-1.5S6.2 9 7 9s1.5.7 1.5 1.5S7.8 12 7 12zm3-4c-.8 0-1.5-.7-1.5-1.5S9.2 5 10 5s1.5.7 1.5 1.5S10.8 8 10 8zm4 0c-.8 0-1.5-.7-1.5-1.5S13.2 5 14 5s1.5.7 1.5 1.5S14.8 8 14 8zm3 4c-.8 0-1.5-.7-1.5-1.5S16.2 9 17 9s1.5.7 1.5 1.5S17.8 12 17 12z"/></svg>
				</button>

				<button type="button" class="icon-btn h-9 w-9 p-2" title="Reminder" onclick={() => { reminderOpen = !reminderOpen; paletteOpen = false; labelOpen = false; }} aria-label="Reminder">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
				</button>

				<!-- Copy with feedback -->
				<button type="button" class="icon-btn h-9 w-9 p-2" title="Copy" onclick={copyText} aria-label="Copy">
					{#if copyFlash}
						<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current text-green-500"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
					{/if}
				</button>

				<button type="button" class="icon-btn h-9 w-9 p-2" title="Labels" onclick={() => { labelOpen = !labelOpen; paletteOpen = false; reminderOpen = false; }} aria-label="Labels">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M20 12l-8 8-9-9V4h7l10 10zM5 6.5C5 5.7 5.7 5 6.5 5S8 5.7 8 6.5 7.3 8 6.5 8 5 7.3 5 6.5z"/></svg>
				</button>

				<div class="flex-1"></div>

				<button type="button" class="icon-btn h-9 w-9 p-2" title="Archive" onclick={() => { notesStore.archiveNote(note.id); close(); }} aria-label="Archive">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M20 6h-8V4H4v2H2v4h20V6h-2zM4 12v8h16v-8H4z"/></svg>
				</button>
				<button type="button" class="icon-btn h-9 w-9 p-2" title="Delete" onclick={() => { notesStore.trashNote(note.id); close(); }} aria-label="Delete">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M6 7h12v13H6zM9 4h6v2h2v2H7V6h2zM10 10v6M14 10v6" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
				</button>
				<button type="button" class="icon-btn h-9 w-9 p-2" title="Close" onclick={close} aria-label="Close">
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
				</button>
			</div>
		</div>
	</div>

	<!-- Popups render at the viewport level so they're never clipped by the dialog -->
	{#if paletteOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-[60]" onclick={() => { paletteOpen = false; }} role="presentation"></div>
		<div class="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
			<ColorPalette color={note.color} onSelect={(c) => { commit({ color: c }); paletteOpen = false; }} />
		</div>
	{/if}

	{#if reminderOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-[60]" onclick={() => { reminderOpen = false; }} role="presentation"></div>
		<div class="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
			<ReminderPicker
				reminder={note.reminder}
				onApply={(r) => commit({ reminder: r })}
				onClose={() => { reminderOpen = false; }}
			/>
		</div>
	{/if}

	{#if labelOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-[60]" onclick={() => { labelOpen = false; }} role="presentation"></div>
		<div class="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
			<LabelMenu noteId={note.id} onClose={() => { labelOpen = false; }} />
		</div>
	{/if}
{/if}

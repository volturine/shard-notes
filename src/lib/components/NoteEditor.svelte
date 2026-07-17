<script lang="ts">
	import { notesStore } from '$lib/stores/notes.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { effectiveBody, noteToPlainText, noteImages } from '$lib/checklistBody';
	import type { NoteColor, NoteImage } from '$lib/types';
	import { KEEP_COLORS, KEEP_DARK_COLORS } from '$lib/types';
	import ColorPalette from './ColorPalette.svelte';
	import ReminderPicker from './ReminderPicker.svelte';
	import LabelMenu from './LabelMenu.svelte';
	import NoteEditorFooter from './NoteEditorFooter.svelte';
	import BodyEditor from './BodyEditor.svelte';

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
	let images = $state<NoteImage[]>([]);
	let draftDirty = false;
	let focusBodySignal = $state(0);

	let syncedId: string | null = null;
	$effect(() => {
		if (!note) return;
		if (syncedId !== note.id) {
			syncedId = note.id;
			title = note.title;
			body = effectiveBody(note);
			images = noteImages(note).map((i) => ({ ...i }));
			draftDirty = false;
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

	function closePopups() {
		paletteOpen = false;
		reminderOpen = false;
		labelOpen = false;
	}

	function bgColor(c: NoteColor): string {
		return uiStore.effectiveDark ? KEEP_DARK_COLORS[c] : KEEP_COLORS[c];
	}

	function commit(patch: Record<string, unknown>) {
		if (!note) return;
		notesStore.updateNote(note.id, patch);
	}

	let timer: ReturnType<typeof setTimeout> | null = null;
	function scheduleCommit() {
		draftDirty = true;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			if (!note) return;
			commit({ title, body, items: [], kind: 'text', images });
		}, 250);
	}

	function commitNow(nextImages?: NoteImage[]) {
		if (!note) return;
		draftDirty = true;
		commit({ title, body, items: [], kind: 'text', images: nextImages ?? images });
	}

	async function close() {
		if (timer) clearTimeout(timer);
		if (note && draftDirty) {
			commit({ title, body, items: [], kind: 'text', images });
			try {
				await notesStore.flushNote(note.id, { title, body, items: [], kind: 'text', images });
			} catch (err) {
				console.error('[NoteEditor] flush failed:', err);
			}
		}
		if (note) notesStore.discardIfEmpty(note.id);
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
		class="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/40 p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') close();
		}}
	>
		<div
			class="flex h-[72dvh] max-h-[90dvh] min-h-[50dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl"
			style="background-color: {bgColor(note.color)};"
			role="dialog"
			aria-modal="true"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<header
				class="flex shrink-0 items-center gap-2 border-b border-black/5 px-2 py-2 dark:border-white/10"
			>
				<button
					type="button"
					class="icon-btn h-10 w-10 p-2"
					title="Back"
					onclick={close}
					aria-label="Back"
				>
					<svg viewBox="0 0 24 24" class="h-6 w-6 fill-none stroke-current" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M15 18l-6-6 6-6" />
					</svg>
				</button>

				<div class="flex-1" aria-hidden="true"></div>

				<div class="flex items-center gap-0.5">
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
					<button
						type="button"
						class="icon-btn h-9 w-9 p-2"
						title="Archive"
						onclick={() => { notesStore.toggleArchive(note.id); close(); }}
						aria-label="Archive"
					>
						<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M20 6h-8V4H4v2H2v4h20V6h-2zM4 12v8h16v-8H4z"/></svg>
					</button>
					<button
						type="button"
						class="icon-btn h-9 w-9 p-2 {note.reminder != null ? 'text-blue-600 dark:text-blue-400' : ''}"
						title="Reminder"
						onclick={() => { closePopups(); reminderOpen = true; }}
						aria-label="Reminder"
					>
						<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
					</button>
				</div>
			</header>

			<div class="scrollable min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pt-4 pb-3">
				<input
					type="text"
					placeholder="Title"
					bind:value={title}
					oninput={scheduleCommit}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							focusBodySignal++;
						}
					}}
					class="mb-3 block w-full bg-transparent text-xl font-medium text-[var(--gkc-text)] placeholder:text-[var(--gkc-text-muted)] outline-none"
				/>

				<BodyEditor
					bind:body
					oninput={scheduleCommit}
					placeholder="Take a note… [ ] checklist · ``` for code blocks"
					focusSignal={focusBodySignal}
				/>
			</div>

			<NoteEditorFooter
				bind:images
				bind:body
				noteId={note.id}
				showCopy={true}
				showDelete={true}
				{copyFlash}
				onOpenColor={() => { closePopups(); paletteOpen = true; }}
				onOpenTags={() => { closePopups(); labelOpen = true; }}
				onCopy={() => void copyText()}
				onDelete={() => { notesStore.trashNote(note.id); close(); }}
				onImagesChange={(imgs) => commitNow(imgs)}
			/>
		</div>
	</div>

	<!-- Popups render at the viewport level so they're never clipped by the dialog -->
	{#if paletteOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-[60] bg-black/30" onclick={() => { paletteOpen = false; }} role="presentation"></div>
		<div class="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
			<ColorPalette color={note.color} onSelect={(c) => { commit({ color: c }); paletteOpen = false; }} />
		</div>
	{/if}

	{#if reminderOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-[60] bg-black/30" onclick={() => { reminderOpen = false; }} role="presentation"></div>
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
		<div class="fixed inset-0 z-[60] bg-black/30" onclick={() => { labelOpen = false; }} role="presentation"></div>
		<div class="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
			<LabelMenu noteId={note.id} onClose={() => { labelOpen = false; }} />
		</div>
	{/if}
{/if}

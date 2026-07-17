<script lang="ts">
	import PhotoFullscreen from '$lib/components/PhotoFullscreen.svelte';
	import type { NoteImage } from '$lib/types';
	import {
		fileToNoteImage,
		isImageAttachment,
		fileIconLabel,
		formatBytes,
		dataUrlByteLength,
		openAttachment
	} from '$lib/noteImages';
	import { notesStore } from '$lib/stores/notes.svelte';
	import { sha256 } from '$lib/syncHash';
	import { formatStorageError } from '$lib/imageBlob';

	let {
		images = $bindable<NoteImage[]>([]),
		body = $bindable(''),
		noteId = null as string | null,
		showCopy = false,
		showDelete = false,
		copyFlash = false,
		onOpenColor,
		onOpenTags,
		onCopy,
		onDelete,
		onImagesChange,
		onClose
	}: {
		images?: NoteImage[];
		body?: string;
		noteId?: string | null;
		showCopy?: boolean;
		showDelete?: boolean;
		copyFlash?: boolean;
		onOpenColor?: () => void;
		onOpenTags?: () => void;
		onCopy?: () => void;
		onDelete?: () => void;
		onImagesChange?: (images: NoteImage[]) => void;
		onClose?: () => void;
	} = $props();

	let moreOpen = $state(false);
	let focusedImageIndex = $state<number | null>(null);
	let attachError = $state('');

	const photos = $derived(images.filter(isImageAttachment));
	const files = $derived(images.filter((a) => !isImageAttachment(a)));
	const photoIndexById = $derived(new Map(photos.map((p, i) => [p.id, i])));

	function toggleMore(e: MouseEvent) {
		e.stopPropagation();
		moreOpen = !moreOpen;
	}

	/**
	 * Attach is a normal button. Each press creates a fresh <input type=file>
	 * inside the same user gesture, opens it, then throws it away.
	 * Nothing sticky lives in the footer — cancel cannot leave a half-dead control.
	 */
	function openAttach() {
		attachError = '';
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		// Off-screen but not display:none (iOS blocks programmatic open on those).
		input.setAttribute('aria-hidden', 'true');
		Object.assign(input.style, {
			position: 'fixed',
			left: '0',
			top: '0',
			width: '1px',
			height: '1px',
			opacity: '0',
			pointerEvents: 'none',
			zIndex: '-1'
		});
		document.body.appendChild(input);

		let done = false;
		const openedAt = Date.now();
		const cleanup = () => {
			if (done) return;
			done = true;
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVis);
			queueMicrotask(() => {
				try {
					input.remove();
				} catch {
					/* ignore */
				}
			});
		};

		// Ignore focus blips while the sheet is still opening.
		const onFocus = () => {
			if (Date.now() - openedAt < 400) return;
			cleanup();
		};
		const onVis = () => {
			if (document.visibilityState !== 'visible') return;
			if (Date.now() - openedAt < 400) return;
			cleanup();
		};

		input.addEventListener(
			'change',
			() => {
				const picked = Array.from(input.files ?? []);
				cleanup();
				if (picked.length > 0) void addFiles(picked);
			},
			{ once: true }
		);

		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVis);

		input.click();
	}

	async function addFiles(picked: File[]) {
		attachError = '';
		try {
			const added = await Promise.all(picked.map(fileToNoteImage));
			const knownHashes = new Set(await Promise.all(images.map((image) => sha256(image.dataUrl))));
			const unique: NoteImage[] = [];
			for (const att of added) {
				const hash = await sha256(att.dataUrl);
				if (knownHashes.has(hash)) continue;
				knownHashes.add(hash);
				unique.push(att);
			}
			if (unique.length === 0) return;
			const next = [...images, ...unique];
			images = next;
			onImagesChange?.(next);
			if (noteId) {
				try {
					await notesStore.flushNote(noteId, { images: next });
				} catch (err) {
					console.error('[footer] attachment flush:', err);
					attachError = `Could not save attachment: ${formatStorageError(err)}`;
				}
			}
		} catch (err) {
			attachError = err instanceof Error ? err.message : 'Could not add file';
		}
	}

	function removeAttachment(id: string) {
		const next = images.filter((i) => i.id !== id);
		images = next;
		onImagesChange?.(next);
		if (noteId) {
			notesStore.flushNote(noteId, { images: next }).catch((err) => {
				console.error('[footer] remove attachment flush:', err);
			});
		}
	}

	function openTags(e: MouseEvent) {
		e.stopPropagation();
		moreOpen = false;
		if (!noteId) {
			attachError = 'Save the note first to add tags';
			return;
		}
		onOpenTags?.();
	}

	function openPhoto(id: string) {
		const idx = photoIndexById.get(id);
		if (idx != null) focusedImageIndex = idx;
	}
</script>

{#if attachError}
	<p class="px-3 pb-1 text-xs text-red-600 dark:text-red-400">{attachError}</p>
{/if}

{#if photos.length > 0}
	<div class="scrollable grid max-h-44 grid-cols-3 gap-2 overflow-y-auto px-3 pb-2 sm:grid-cols-4">
		{#each photos as img (img.id)}
			<div class="relative">
				<button
					type="button"
					class="block aspect-square w-full overflow-hidden rounded-lg touch-manipulation"
					onclick={() => openPhoto(img.id)}
					aria-label={`Open ${img.name ?? 'photo'}`}
				>
					<img src={img.dataUrl} alt={img.name ?? 'Photo'} class="h-full w-full object-cover" />
				</button>
				<button
					type="button"
					class="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white touch-manipulation"
					onclick={() => removeAttachment(img.id)}
					aria-label="Remove photo"
				>✕</button>
			</div>
		{/each}
	</div>
{/if}

{#if files.length > 0}
	<ul class="scrollable max-h-36 space-y-1.5 overflow-y-auto px-3 pb-2">
		{#each files as file (file.id)}
			<li class="flex items-center gap-2 rounded-lg border border-black/10 bg-black/5 px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
				<span
					class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-black/10 text-[10px] font-bold tracking-wide text-[var(--gkc-text)] dark:bg-white/10"
					aria-hidden="true"
				>{fileIconLabel(file.mime, file.name)}</span>
				<button
					type="button"
					class="min-w-0 flex-1 text-left touch-manipulation"
					onclick={() => void openAttachment(file)}
					aria-label={`Open ${file.name ?? 'file'}`}
				>
					<div class="truncate text-sm text-[var(--gkc-text)]">{file.name || 'Attachment'}</div>
					<div class="text-[10px] text-[var(--gkc-text-muted)]">{formatBytes(dataUrlByteLength(file.dataUrl))}</div>
				</button>
				<button
					type="button"
					class="shrink-0 rounded-full px-1.5 py-0.5 text-xs text-[var(--gkc-text-muted)] touch-manipulation"
					onclick={() => removeAttachment(file.id)}
					aria-label="Remove file"
				>✕</button>
			</li>
		{/each}
	</ul>
{/if}

<PhotoFullscreen images={photos} bind:activeIndex={focusedImageIndex} />

<footer
	class="relative flex shrink-0 items-center justify-between border-t border-black/5 px-3 py-2 dark:border-white/10"
	onclick={(e) => e.stopPropagation()}
>
	<div class="flex items-center gap-1">
		<button
			type="button"
			class="icon-btn h-10 w-10 p-2 touch-manipulation"
			title="Attach"
			onclick={openAttach}
			aria-label="Attach"
		>
			<svg
				viewBox="0 0 24 24"
				class="h-5 w-5 fill-none stroke-current"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
			</svg>
		</button>
		<button
			type="button"
			class="icon-btn h-10 w-10 p-2 touch-manipulation"
			title="Tags"
			onclick={openTags}
			aria-label="Tags"
		>
			<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M20 12l-8 8-9-9V4h7l10 10zM5 6.5C5 5.7 5.7 5 6.5 5S8 5.7 8 6.5 7.3 8 6.5 8 5 7.3 5 6.5z"/></svg>
		</button>
	</div>

	<div class="relative">
		<button
			type="button"
			class="icon-btn h-10 w-10 p-2 touch-manipulation"
			title="More"
			onclick={toggleMore}
			aria-label="More options"
			aria-expanded={moreOpen}
		>
			<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>
		</button>
	</div>
</footer>

{#if moreOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-[62] bg-black/20" onclick={() => { moreOpen = false; }} role="presentation"></div>
	<div
		class="fixed z-[63] left-1/2 bottom-[max(1.25rem,env(safe-area-inset-bottom))] w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--gkc-border)] bg-[var(--gkc-surface)] py-1 shadow-xl"
		role="menu"
		onclick={(e) => e.stopPropagation()}
	>
		<button
			type="button"
			class="flex w-full touch-manipulation items-center gap-2 px-4 py-3 text-left text-sm text-[var(--gkc-text)] active:bg-black/5 dark:active:bg-white/10"
			role="menuitem"
			onclick={() => { moreOpen = false; onOpenColor?.(); }}
		>
			<span class="w-5 text-center">🎨</span> Color
		</button>
		{#if showCopy}
			<button
				type="button"
				class="flex w-full touch-manipulation items-center gap-2 px-4 py-3 text-left text-sm text-[var(--gkc-text)] active:bg-black/5 dark:active:bg-white/10"
				role="menuitem"
				onclick={() => { moreOpen = false; onCopy?.(); }}
			>
				<span class="w-5 text-center">{copyFlash ? '✓' : '📋'}</span> Copy note
			</button>
		{/if}
		{#if showDelete}
			<button
				type="button"
				class="flex w-full touch-manipulation items-center gap-2 px-4 py-3 text-left text-sm text-red-600 dark:text-red-400 active:bg-black/5 dark:active:bg-white/10"
				role="menuitem"
				onclick={() => { moreOpen = false; onDelete?.(); }}
			>
				<span class="w-5 text-center">🗑</span> Delete
			</button>
		{/if}
		{#if onClose}
			<button
				type="button"
				class="flex w-full touch-manipulation items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--gkc-text)] active:bg-black/5 dark:active:bg-white/10"
				role="menuitem"
				onclick={() => { moreOpen = false; onClose(); }}
			>
				<span class="w-5 text-center">✓</span> Done
			</button>
		{/if}
	</div>
{/if}

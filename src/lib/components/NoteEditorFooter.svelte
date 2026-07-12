<script lang="ts">
	import PhotoFullscreen from '$lib/components/PhotoFullscreen.svelte';
	import type { NoteImage } from '$lib/types';
	import { insertCodeBlock } from '$lib/checklistBody';
	import { fileToNoteImage } from '$lib/noteImages';
	import { notesStore } from '$lib/stores/notes.svelte';
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
	let imageError = $state('');
	let fileInput: HTMLInputElement | null = $state(null);

	function toggleMore(e: MouseEvent) {
		e.stopPropagation();
		moreOpen = !moreOpen;
	}

	function addCodeBlock() {
		body = insertCodeBlock(body);
		onImagesChange?.(images);
	}

	async function onPickImage(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (files.length === 0) return;
		imageError = '';
		try {
			const addedImages = await Promise.all(files.map(fileToNoteImage));
			const nextImages = [...images, ...addedImages];
			images = nextImages;
			onImagesChange?.(nextImages);
			if (noteId) {
				try {
					await notesStore.flushNote(noteId, { images: nextImages });
				} catch (err) {
					console.error('[footer] image flush:', err);
					imageError = `Could not save photo: ${formatStorageError(err)}`;
				}
			}
		} catch (err) {
			imageError = err instanceof Error ? err.message : 'Could not add image';
		}
	}

	function removeImage(id: string) {
		const nextImages = images.filter((i) => i.id !== id);
		images = nextImages;
		onImagesChange?.(nextImages);
		if (noteId) {
			notesStore.flushNote(noteId, { images: nextImages }).catch((err) => {
				console.error('[footer] remove image flush:', err);
			});
		}
	}

	function openTags(e: MouseEvent) {
		e.stopPropagation();
		moreOpen = false;
		if (!noteId) {
			imageError = 'Save the note first to add tags';
			return;
		}
		onOpenTags?.();
	}
</script>

{#if imageError}
	<p class="px-3 pb-1 text-xs text-red-600 dark:text-red-400">{imageError}</p>
{/if}

{#if images.length > 0}
	<div class="flex flex-wrap gap-2 px-3 pb-2">
		{#each images as img, index (img.id)}
			<div class="relative">
				<button type="button" class="block max-w-full rounded-lg touch-manipulation" onclick={() => focusedImageIndex = index} aria-label={`Open ${img.name ?? 'photo'}`}>
					<img src={img.dataUrl} alt={img.name ?? 'Photo'} class="max-h-40 max-w-full rounded-lg object-cover" />
				</button>
				<button
					type="button"
					class="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white touch-manipulation"
					onclick={() => removeImage(img.id)}
					aria-label="Remove photo"
				>✕</button>
			</div>
		{/each}
	</div>
{/if}

<PhotoFullscreen {images} bind:activeIndex={focusedImageIndex} />

<footer
	class="relative flex shrink-0 items-center justify-between border-t border-black/5 px-3 py-2 dark:border-white/10"
	onclick={(e) => e.stopPropagation()}
>
	<div class="flex items-center gap-1">
		<input bind:this={fileInput} type="file" accept="image/*" multiple class="hidden" onchange={onPickImage} />
		<button type="button" class="icon-btn h-10 w-10 p-2 touch-manipulation" title="Add photo" onclick={() => fileInput?.click()} aria-label="Add photo">
			<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
		</button>
		<button type="button" class="icon-btn h-10 w-10 p-2 touch-manipulation" title="Insert code block" onclick={addCodeBlock} aria-label="Code block">
			<svg viewBox="0 0 24 24" class="h-5 w-5 fill-none stroke-current" stroke-width="2"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>
		</button>
		<button type="button" class="icon-btn h-10 w-10 p-2 touch-manipulation" title="Tags" onclick={openTags} aria-label="Tags">
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
<script lang="ts">
	import AttachmentFullscreen from '$lib/components/AttachmentFullscreen.svelte';
	import PhotoFullscreen from '$lib/components/PhotoFullscreen.svelte';
	import type { Note, NoteImage } from '$lib/types';
	import { parseBody, noteAttachments } from '$lib/checklistBody';
	import { extractHttpUrls, isUsableLinkPreview } from '$lib/linkPreview';
	import LinkPreview from './LinkPreview.svelte';
	import { isImageAttachment, isInlinePreviewable, fileIconLabel, openAttachment } from '$lib/noteImages';
	import { notesStore } from '$lib/stores/notes.svelte';

	let { note }: { note: Note } = $props();

	const segments = $derived(parseBody(note.body ?? ''));
	const attachments = $derived(noteAttachments(note));
	const photos = $derived(attachments.filter(isImageAttachment));
	const files = $derived(attachments.filter((a) => !isImageAttachment(a)));
	const links = $derived(extractHttpUrls(note.body ?? ''));
	const previewsByUrl = $derived(
		new Map((note.linkPreviews ?? []).filter(isUsableLinkPreview).map((preview) => [preview.url, preview]))
	);
	let focusedImageIndex = $state<number | null>(null);
	let focusedAttachment = $state<NoteImage | null>(null);

	function focusImage(index: number, event: MouseEvent) {
		event.stopPropagation();
		focusedImageIndex = index;
	}

	function openFile(event: MouseEvent, id: string) {
		event.stopPropagation();
		const file = files.find((f) => f.id === id);
		if (!file) return;
		if (isInlinePreviewable(file)) focusedAttachment = file;
		else void openAttachment(file);
	}

	function toggle(lineIndex: number) {
		notesStore.toggleBodyChecklistLine(note.id, lineIndex);
	}
</script>

<div class="text-sm text-[var(--gkc-text)]">
	{#each segments as seg (seg.lineIndex)}
		{#if seg.type === 'check'}
			<div class="flex items-start gap-2 py-0.5">
				<button
					type="button"
					data-checklist-toggle
					class="mt-0.5 h-4 w-4 shrink-0 rounded border border-black/40 dark:border-white/40 flex items-center justify-center text-[10px]"
					style={seg.checked ? 'background: rgba(0,0,0,0.1)' : ''}
					onclick={(e) => {
						e.stopPropagation();
						toggle(seg.lineIndex);
					}}
					aria-label="Toggle item"
				>
					{#if seg.checked}✓{/if}
				</button>
				<span class="flex-1 break-words {seg.checked ? 'line-through opacity-50' : ''}">
					{seg.text || '\u00a0'}
				</span>
			</div>
		{:else if seg.text}
			<p class="whitespace-pre-wrap break-words py-0.5">{seg.text}</p>
		{:else}
			<div class="h-2"></div>
		{/if}
	{/each}
</div>

{#if links.length > 0}
	<div class="mt-2 flex flex-col gap-2">
		{#each links as url (url)}
			<LinkPreview {url} metadata={previewsByUrl.get(url)} />
		{/each}
	</div>
{/if}

{#if photos.length > 0}
	<div class="mt-2 flex flex-wrap gap-1.5">
		{#each photos as img, index (img.id)}
			<button
				type="button"
				class="block max-w-full touch-manipulation overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				data-photo
				onclick={(event) => focusImage(index, event)}
				aria-label={`Open ${img.name ?? 'photo'}`}
			>
				<img
					src={img.dataUrl}
					alt={img.name ?? 'Photo'}
					class="max-h-32 max-w-full rounded-lg object-cover"
					loading="lazy"
				/>
			</button>
		{/each}
	</div>
{/if}

{#if files.length > 0}
	<div class="mt-2 flex flex-col gap-1">
		{#each files as file (file.id)}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md border border-black/10 bg-black/5 px-2 py-1.5 text-left touch-manipulation dark:border-white/10 dark:bg-white/5"
				data-file
				onclick={(event) => openFile(event, file.id)}
				aria-label={`Open ${file.name ?? 'file'}`}
			>
				<span
					class="grid h-7 w-7 shrink-0 place-items-center rounded bg-black/10 text-[9px] font-bold text-[var(--gkc-text)] dark:bg-white/10"
				>{fileIconLabel(file.mime, file.name)}</span>
				<span class="min-w-0 flex-1 truncate text-xs text-[var(--gkc-text)]">{file.name || 'File'}</span>
			</button>
		{/each}
	</div>
{/if}

<PhotoFullscreen images={photos} bind:activeIndex={focusedImageIndex} />
<AttachmentFullscreen attachment={focusedAttachment} onClose={() => { focusedAttachment = null; }} />

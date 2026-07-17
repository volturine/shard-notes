<script lang="ts">
	import type { NoteImage } from '$lib/types';
	import { dataUrlToBlob } from '$lib/imageBlob';

	let {
		attachment = null,
		onClose
	}: {
		attachment?: NoteImage | null;
		onClose: () => void;
	} = $props();

	let sourceUrl = $state<string | null>(null);

	const mime = $derived(attachment?.mime || 'application/octet-stream');
	const isAudio = $derived(mime.startsWith('audio/'));
	const isVideo = $derived(mime.startsWith('video/'));
	const isText = $derived(mime.startsWith('text/') || mime === 'application/json');
	const isPdf = $derived(mime === 'application/pdf');

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
	}

	$effect(() => {
		const dataUrl = attachment?.dataUrl;
		if (!dataUrl) {
			sourceUrl = null;
			return;
		}

		let current = true;
		let url: string | null = null;
		void dataUrlToBlob(dataUrl).then((blob) => {
			if (!current) return;
			url = URL.createObjectURL(blob);
			sourceUrl = url;
		});

		return () => {
			current = false;
			if (url) URL.revokeObjectURL(url);
			if (sourceUrl === url) sourceUrl = null;
		};
	});

	function close() {
		onClose();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if attachment}
	<div use:portal>
		<div class="fixed inset-0 z-[80] flex flex-col bg-[var(--gkc-bg)] text-[var(--gkc-text)]">
			<header class="flex shrink-0 items-center gap-3 border-b border-[var(--gkc-border)] px-3 py-2">
				<button
					type="button"
					class="icon-btn h-10 w-10 p-2"
					onclick={close}
					aria-label="Close file"
				>
					<svg viewBox="0 0 24 24" class="h-6 w-6 fill-none stroke-current" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
				</button>
				<div class="min-w-0 flex-1 truncate text-sm font-medium">{attachment.name || 'Attachment'}</div>
			</header>

			{#if !sourceUrl}
				<div class="grid flex-1 place-items-center text-sm text-[var(--gkc-text-muted)]">Opening file…</div>
			{:else if isAudio}
				<div class="grid flex-1 place-items-center p-6"><audio class="w-full max-w-lg" controls src={sourceUrl}></audio></div>
			{:else if isVideo}
				<div class="flex flex-1 items-center justify-center bg-black"><video class="max-h-full max-w-full" controls playsinline src={sourceUrl}></video></div>
			{:else if isPdf || isText}
				<iframe class="h-full w-full flex-1 border-0 bg-white" title={attachment.name || 'Attachment'} src={sourceUrl}></iframe>
			{/if}
		</div>
	</div>
{/if}

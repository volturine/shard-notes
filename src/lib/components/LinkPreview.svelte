<script lang="ts">
	import type { LinkPreview } from '$lib/linkPreview';

	let { url }: { url: string } = $props();

	let preview = $state<LinkPreview | null>(null);
	let loading = $state(true);

	const fallback = $derived.by(() => {
		try {
			const parsed = new URL(url);
			return { hostname: parsed.hostname.replace(/^www\./, ''), title: parsed.hostname };
		} catch {
			return { hostname: url, title: url };
		}
	});

	$effect(() => {
		const controller = new AbortController();
		preview = null;
		loading = true;

		void fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
			.then(async (response) => response.ok ? response.json() as Promise<LinkPreview> : null)
			.then((data) => { preview = data; })
			.catch(() => { preview = null; })
			.finally(() => { loading = false; });

		return () => controller.abort();
	});

	function keepCardClosed(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<a
	class="mt-2 flex overflow-hidden rounded-lg border border-black/10 bg-black/[0.035] text-left no-underline transition-colors hover:bg-black/[0.07] focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/[0.045] dark:hover:bg-white/[0.09]"
	data-link
	href={url}
	target="_blank"
	rel="noreferrer noopener"
	onclick={keepCardClosed}
	aria-label={`Open ${preview?.title ?? fallback.title}`}
>
	{#if preview?.image}
		<img class="h-20 w-24 shrink-0 object-cover" src={preview.image} alt="" />
	{:else}
		<div class="grid h-20 w-20 shrink-0 place-items-center bg-black/[0.06] text-xl dark:bg-white/[0.08]" aria-hidden="true">↗</div>
	{/if}
	<div class="min-w-0 flex-1 px-3 py-2">
		<div class="truncate text-sm font-medium text-[var(--gkc-text)]">{preview?.title ?? fallback.title}</div>
		{#if preview?.description}
			<div class="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--gkc-text-muted)]">{preview.description}</div>
		{:else if loading}
			<div class="mt-1 h-2.5 w-2/3 animate-pulse rounded bg-black/10 dark:bg-white/10"></div>
		{/if}
		<div class="mt-1 truncate text-[11px] text-[var(--gkc-text-muted)]">{preview?.hostname ?? fallback.hostname}</div>
	</div>
</a>

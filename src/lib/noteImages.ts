import { uid } from './utils';
import type { NoteImage } from './types';
import { extractDngJpeg, isDngFile, jpegName } from './dngCanonical';
import { dataUrlToBlob } from './imageBlob';

/** Browser-renderable image (preview / fullscreen). Excludes raw DNG before convert. */
export function isImageMime(mime: string): boolean {
	const m = (mime || '').toLowerCase();
	if (!m.startsWith('image/')) return false;
	if (m.includes('dng') || m === 'image/tiff' || m === 'image/x-adobe-dng') return false;
	return true;
}

export function isImageAttachment(att: Pick<NoteImage, 'mime'>): boolean {
	return isImageMime(att.mime);
}

/** Approximate byte size from a data URL (for UI only). */
export function dataUrlByteLength(dataUrl: string): number {
	const i = dataUrl.indexOf(',');
	const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
	return Math.floor((b64.length * 3) / 4);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileIconLabel(mime: string, name?: string): string {
	const m = (mime || '').toLowerCase();
	const ext = (name?.split('.').pop() || '').toLowerCase();
	if (m.includes('pdf') || ext === 'pdf') return 'PDF';
	if (m.includes('zip') || m.includes('compressed') || ext === 'zip' || ext === 'rar') return 'ZIP';
	if (m.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac'].includes(ext)) return 'AUD';
	if (m.startsWith('video/') || ['mp4', 'mov', 'webm'].includes(ext)) return 'VID';
	if (m.includes('sheet') || m.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'XLS';
	if (m.includes('word') || ['doc', 'docx'].includes(ext)) return 'DOC';
	if (m.includes('text') || ['txt', 'md', 'json'].includes(ext)) return 'TXT';
	return (ext || 'FILE').slice(0, 4).toUpperCase();
}

/**
 * Store any file as a note attachment (data URL).
 * DNG → embedded JPEG for preview; other images kept full-res; non-images as-is.
 * No size cap (same as photos).
 */
export async function fileToNoteImage(file: File): Promise<NoteImage> {
	let image: Blob = file;
	let mime = file.type || 'application/octet-stream';
	let name = file.name;
	if (isDngFile(file)) {
		const jpeg = Uint8Array.from(extractDngJpeg(await file.arrayBuffer()));
		image = new Blob([jpeg.buffer], { type: 'image/jpeg' });
		mime = 'image/jpeg';
		name = jpegName(file.name);
	} else if (!mime || mime === 'application/octet-stream') {
		// Best-effort mime from extension when browser omits type
		const ext = name.split('.').pop()?.toLowerCase();
		const byExt: Record<string, string> = {
			pdf: 'application/pdf',
			txt: 'text/plain',
			md: 'text/markdown',
			json: 'application/json',
			csv: 'text/csv',
			zip: 'application/zip',
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			webp: 'image/webp',
			gif: 'image/gif',
			heic: 'image/heic',
			mp3: 'audio/mpeg',
			mp4: 'video/mp4'
		};
		if (ext && byExt[ext]) mime = byExt[ext];
	}
	const dataUrl = await readBlobAsDataUrl(image);
	return {
		id: uid(),
		mime,
		dataUrl,
		name,
		createdAt: Date.now()
	};
}

/** Open / share / download an attachment.
 *  iOS Safari ignores download on data: URLs (flicker only) — use blob URLs + Web Share. */
export async function openAttachment(att: NoteImage): Promise<void> {
	const blob = await dataUrlToBlob(att.dataUrl);
	const name = att.name?.trim() || 'attachment';
	const mime = att.mime || blob.type || 'application/octet-stream';
	const file = new File([blob], name, { type: mime });

	// iOS / Android: share sheet includes "Save to Files"
	if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
		try {
			if (navigator.canShare({ files: [file] })) {
				await navigator.share({ files: [file], title: name });
				return;
			}
		} catch (err) {
			// User cancelled share sheet — stop; don't fall through to a broken open.
			if (err instanceof Error && err.name === 'AbortError') return;
		}
	}

	const url = URL.createObjectURL(blob);
	const revoke = () => {
		try {
			URL.revokeObjectURL(url);
		} catch {
			/* ignore */
		}
	};

	// PDF / text / image: open blob URL (works where data: + target=_blank fails)
	const viewable =
		mime === 'application/pdf' || mime.startsWith('text/') || isImageMime(mime);
	if (viewable) {
		const opened = window.open(url, '_blank', 'noopener,noreferrer');
		if (opened) {
			setTimeout(revoke, 120_000);
			return;
		}
	}

	// Desktop download fallback
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(revoke, 60_000);
}

function readBlobAsDataUrl(file: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
		reader.readAsDataURL(file);
	});
}

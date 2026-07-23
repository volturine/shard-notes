/** Downscale browser-renderable images for always-resident previews. Full bytes stay in IDB. */

const THUMB_MAX_EDGE = 480;
const THUMB_QUALITY = 0.72;

export async function makeImageThumbDataUrl(dataUrl: string): Promise<string | null> {
	if (!dataUrl.startsWith('data:image/') || dataUrl.startsWith('data:image/svg')) return null;
	try {
		const img = await loadImage(dataUrl);
		const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(img.width, img.height));
		const width = Math.max(1, Math.round(img.width * scale));
		const height = Math.max(1, Math.round(img.height * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(img, 0, 0, width, height);
		return canvas.toDataURL('image/jpeg', THUMB_QUALITY);
	} catch {
		return null;
	}
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Could not decode image for thumbnail'));
		img.src = src;
	});
}

/** Prefer a small resident thumb; fall back to full data only when it is already in memory. */
export function displayImageSrc(image: { dataUrl?: string; thumbUrl?: string }): string {
	if (image.thumbUrl) return image.thumbUrl;
	return image.dataUrl || '';
}

import { uid } from './utils';
import type { NoteImage } from './types';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 2_500_000;

/** Resize and compress a picked image for storage in the note. */
export async function fileToNoteImage(file: File): Promise<NoteImage> {
	if (!file.type.startsWith('image/')) {
		throw new Error('Only image files are supported');
	}
	const dataUrl = await compressImageFile(file);
	if (dataUrl.length > MAX_BYTES) {
		throw new Error('Image is too large after compression (max ~2.5MB)');
	}
	return {
		id: uid(),
		mime: 'image/jpeg',
		dataUrl,
		name: file.name,
		createdAt: Date.now()
	};
}

function compressImageFile(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			let { width, height } = img;
			const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
			width = Math.round(width * scale);
			height = Math.round(height * scale);
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(new Error('Canvas not available'));
				return;
			}
			ctx.drawImage(img, 0, 0, width, height);
			resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Could not load image'));
		};
		img.src = url;
	});
}
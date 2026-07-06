import { uid } from './utils';
import type { NoteImage } from './types';

/** Per-image cap (original file size). */
const MAX_FILE_BYTES = 14 * 1024 * 1024;

/** Store full-resolution image as data URL (no downscale). */
export async function fileToNoteImage(file: File): Promise<NoteImage> {
	if (!file.type.startsWith('image/')) {
		throw new Error('Only image files are supported');
	}
	if (file.size > MAX_FILE_BYTES) {
		throw new Error('Image must be under 14MB');
	}
	const dataUrl = await readAsDataUrl(file);
	return {
		id: uid(),
		mime: file.type || 'image/jpeg',
		dataUrl,
		name: file.name,
		createdAt: Date.now()
	};
}

function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error('Could not read image'));
		reader.readAsDataURL(file);
	});
}
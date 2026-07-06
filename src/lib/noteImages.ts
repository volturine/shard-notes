import { uid } from './utils';
import type { NoteImage } from './types';

/** Store full-resolution image as data URL (no compression or size cap). */
export async function fileToNoteImage(file: File): Promise<NoteImage> {
	const dataUrl = await readFileAsDataUrl(file);
	return {
		id: uid(),
		mime: file.type || 'image/jpeg',
		dataUrl,
		name: file.name,
		createdAt: Date.now()
	};
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
		reader.readAsDataURL(file);
	});
}
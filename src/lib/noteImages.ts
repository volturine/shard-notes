import { uid } from './utils';
import type { NoteImage } from './types';
import { extractDngJpeg, isDngFile, jpegName } from './dngCanonical';

/** Store a browser-displayable full-resolution image with no size cap. */
export async function fileToNoteImage(file: File): Promise<NoteImage> {
	let image: Blob = file;
	let mime = file.type || 'image/jpeg';
	let name = file.name;
	if (isDngFile(file)) {
		const jpeg = Uint8Array.from(extractDngJpeg(await file.arrayBuffer()));
		image = new Blob([jpeg.buffer], { type: 'image/jpeg' });
		mime = 'image/jpeg';
		name = jpegName(file.name);
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

function readBlobAsDataUrl(file: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
		reader.readAsDataURL(file);
	});
}
/** Convert data URLs ↔ Blob for IndexedDB (Safari handles Blob better than huge strings). */

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
	const res = await fetch(dataUrl);
	return res.blob();
}

export function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error('Could not read image blob'));
		reader.readAsDataURL(blob);
	});
}

export function formatStorageError(err: unknown): string {
	if (err instanceof DOMException) {
		if (err.name === 'QuotaExceededError') {
			return 'Storage full on this device — free space or remove old notes/attachments.';
		}
		if (err.name === 'DataCloneError') {
			return 'Browser could not store this data — refresh and try again.';
		}
		return err.message || err.name;
	}
	if (err instanceof Error) return err.message;
	return 'Unknown storage error';
}
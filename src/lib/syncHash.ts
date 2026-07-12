// Deterministic SHA-256 for sync equality checks. Object keys are sorted so browser and server
// hash the same record regardless of object construction order.
export function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	const object = value as Record<string, unknown>;
	return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
}

export async function sha256(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(stableStringify(value));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

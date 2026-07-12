/** DOM-only cloud indicator. Visual feedback is deliberately bounded: a slow network request
 * must never leave a touch UI looking permanently pressed or busy. */

const ROOT_CLASS = 'gkc-sync-active';
const MIN_SPIN_MS = 900;
const MAX_SPIN_MS = 2_000;

let inFlight = 0;
let spinStartedAt = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;

function setSpin(on: boolean): void {
	if (typeof document === 'undefined') return;
	document.documentElement.classList.toggle(ROOT_CLASS, on);
}

function clearTimers(): void {
	if (hideTimer) clearTimeout(hideTimer);
	if (maxTimer) clearTimeout(maxTimer);
	hideTimer = null;
	maxTimer = null;
}

function scheduleSpinOff(): void {
	if (hideTimer) clearTimeout(hideTimer);
	const delay = Math.max(0, MIN_SPIN_MS - (Date.now() - spinStartedAt));
	hideTimer = setTimeout(() => {
		hideTimer = null;
		if (inFlight <= 0) setSpin(false);
	}, delay);
}

export function attachSyncCloudIndicator(store: {
	onSyncStart: (() => void) | null;
	onSyncEnd: (() => void) | null;
}): void {
	store.onSyncStart = () => {
		clearTimers();
		inFlight++;
		spinStartedAt = Date.now();
		setSpin(true);
		// Feedback only: never imply an indefinitely running action in the top bar.
		maxTimer = setTimeout(() => {
			maxTimer = null;
			setSpin(false);
		}, MAX_SPIN_MS);
	};
	store.onSyncEnd = () => {
		inFlight = Math.max(0, inFlight - 1);
		if (inFlight === 0) {
			if (maxTimer) clearTimeout(maxTimer);
			maxTimer = null;
			scheduleSpinOff();
		}
	};
}

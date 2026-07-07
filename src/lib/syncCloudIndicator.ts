/** DOM-only cloud sync indicator — no Svelte $state, so notes grid never re-renders. */

const ROOT_CLASS = 'gkc-sync-active';
const MIN_SPIN_MS = 900;

let inFlight = 0;
let spinStartedAt = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function setSpin(on: boolean) {
	if (typeof document === 'undefined') return;
	document.documentElement.classList.toggle(ROOT_CLASS, on);
}

function scheduleSpinOff() {
	if (hideTimer) clearTimeout(hideTimer);
	const elapsed = Date.now() - spinStartedAt;
	const delay = Math.max(0, MIN_SPIN_MS - elapsed);
	hideTimer = setTimeout(() => {
		hideTimer = null;
		if (inFlight <= 0) {
			setSpin(false);
		} else {
			scheduleSpinOff();
		}
	}, delay);
}

export function attachSyncCloudIndicator(store: {
	onSyncStart: (() => void) | null;
	onSyncEnd: (() => void) | null;
}) {
	store.onSyncStart = () => {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		inFlight++;
		if (inFlight === 1) {
			spinStartedAt = Date.now();
			setSpin(true);
		}
	};
	store.onSyncEnd = () => {
		inFlight = Math.max(0, inFlight - 1);
		if (inFlight > 0) return;
		scheduleSpinOff();
	};
}

export function finishSyncCloudIndicator(store: {
	onSyncEnd: (() => void) | null;
}) {
	store.onSyncEnd?.();
}
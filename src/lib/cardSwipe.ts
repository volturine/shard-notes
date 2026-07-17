/** Shared pointer swipe for note cards (touch + trackpad + mouse). */

export type CardSwipeHandlers = {
	onPointerDown: (e: PointerEvent) => void;
	onPointerMove: (e: PointerEvent) => void;
	onPointerUp: (e: PointerEvent) => void;
	onPointerCancel: (e: PointerEvent) => void;
	/** True briefly after a drag so click does not open the note. */
	wasDrag: () => boolean;
	getOffsetX: () => number;
	isDragging: () => boolean;
};

export function createCardSwipe(opts: {
	onSwipeLeft: () => void;
	onSwipeRight: () => void;
	threshold?: number;
	/** Reactive sink so Svelte re-renders while dragging. */
	setVisual: (state: { offsetX: number; dragging: boolean }) => void;
}): CardSwipeHandlers {
	const threshold = opts.threshold ?? 80;
	let offsetX = 0;
	let dragging = false;
	let startX = 0;
	let startY = 0;
	let decidedHorizontal = false;
	let pointerId: number | null = null;
	let justDragged = false;

	function publish() {
		opts.setVisual({ offsetX, dragging });
	}

	function onPointerDown(e: PointerEvent) {
		if (dragging) return;
		const target = e.target as HTMLElement;
		if (target.closest('[data-checklist-toggle], [data-photo], [data-file], button, input, textarea')) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		pointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		dragging = true;
		decidedHorizontal = false;
		publish();
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (!decidedHorizontal) {
			if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
			decidedHorizontal = Math.abs(dx) > Math.abs(dy);
			if (!decidedHorizontal) {
				(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
				dragging = false;
				publish();
				return;
			}
			e.preventDefault();
		}
		e.preventDefault();
		offsetX = Math.max(-120, Math.min(120, dx));
		publish();
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		const wasDrag = Math.abs(offsetX) >= threshold;
		const moved = Math.abs(offsetX) > 5;
		dragging = false;
		pointerId = null;

		if (wasDrag) {
			if (offsetX < 0) {
				offsetX = -300;
				publish();
				setTimeout(() => opts.onSwipeLeft(), 150);
			} else {
				offsetX = 300;
				publish();
				setTimeout(() => opts.onSwipeRight(), 150);
			}
		} else {
			offsetX = 0;
			publish();
		}

		if (moved) {
			e.stopPropagation();
			justDragged = true;
			setTimeout(() => {
				justDragged = false;
			}, 50);
		}
	}

	function onPointerCancel(e: PointerEvent) {
		if (e.pointerId !== pointerId) return;
		dragging = false;
		pointerId = null;
		offsetX = 0;
		publish();
	}

	return {
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel,
		wasDrag: () => justDragged,
		getOffsetX: () => offsetX,
		isDragging: () => dragging
	};
}

/** Inline transform style for a swiping card. */
export function cardSwipeStyle(offsetX: number, dragging: boolean): string {
	const transform =
		offsetX !== 0 || dragging ? `transform: translate3d(${offsetX}px, 0, 0);` : 'transform: none;';
	const willChange = offsetX !== 0 || dragging ? 'will-change: transform;' : '';
	const transition = dragging
		? 'transition: none;'
		: 'transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.2s;';
	return `${transform} ${willChange} ${transition}`;
}

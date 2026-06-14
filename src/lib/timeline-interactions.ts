import { minutesToTime, timeToMinutes, type TimelineBlock } from '$lib/timeline';

type InteractModule = typeof import('interactjs');

export type TimelineBlockDragParams = {
	block: TimelineBlock;
	laneSelector: string;
	minuteHeight: number;
	onSelect: (id: string) => void;
	disabled?: boolean;
};

export type TimelineActualResizeParams = {
	block: TimelineBlock;
	edge: 'start' | 'end';
	target?: 'actual' | 'advertised';
	laneSelector: string;
	minuteHeight: number;
	onSelect: (id: string) => void;
	viewStartMinutes: number;
	disabled?: boolean;
};

export type TimelineBufferResizeParams = {
	block: TimelineBlock;
	edge: 'before' | 'after';
	laneSelector: string;
	minuteHeight: number;
	onSelect: (id: string) => void;
	viewStartMinutes: number;
	disabled?: boolean;
};

function roundedMinutes(deltaPixels: number, minuteHeight: number) {
	return Math.round(deltaPixels / minuteHeight / 5) * 5;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function eventClientPoint(event: {
	clientX?: number;
	clientY?: number;
	client?: { x?: number; y?: number };
}) {
	return {
		x: event.clientX ?? event.client?.x ?? 0,
		y: event.clientY ?? event.client?.y ?? 0
	};
}

function setDraggingClass(node: HTMLElement, active: boolean) {
	node.classList.toggle('cursor-grabbing', active);
}

function scrollDuringVerticalDrag(
	node: HTMLElement,
	event: { clientY?: number; client?: { y?: number } }
) {
	const container = node.closest<HTMLElement>('[data-timeline-scroll]');
	const point = eventClientPoint(event);
	const margin = 56;
	const amount = 28;

	if (container && container.scrollHeight > container.clientHeight) {
		const rect = container.getBoundingClientRect();
		if (point.y < rect.top + margin) {
			container.scrollTop = Math.max(0, container.scrollTop - amount);
		} else if (point.y > rect.bottom - margin) {
			container.scrollTop += amount;
		}
		return;
	}

	if (point.y < margin) {
		window.scrollBy(0, -amount);
	} else if (point.y > window.innerHeight - margin) {
		window.scrollBy(0, amount);
	}
}

export function timelineBlockDrag(node: HTMLElement, params: TimelineBlockDragParams) {
	let current = params;
	let interactable: ReturnType<InteractModule['default']> | null = null;
	let cancelled = false;
	let originStart = 0;
	let originEnd = 0;
	let originAdvertisedStart = 0;
	let originAdvertisedEnd = 0;
	let totalPixels = 0;

	function updateBlockFromDrag(event: {
		dy?: number;
		clientX?: number;
		clientY?: number;
		client?: { x?: number; y?: number };
	}) {
		totalPixels += event.dy ?? 0;

		const duration = originEnd - originStart;
		const delta = roundedMinutes(totalPixels, current.minuteHeight);
		const nextStart = clamp(originStart + delta, 0, 23 * 60 + 59 - duration);
		const appliedDelta = nextStart - originStart;
		const point = eventClientPoint(event);
		const lane = document
			.elementFromPoint(point.x, point.y)
			?.closest<HTMLElement>(current.laneSelector);
		const laneId = lane?.dataset.timelineLane;

		if (laneId) current.block.lane = laneId;
		current.block.start = minutesToTime(nextStart);
		current.block.end = minutesToTime(originEnd + appliedDelta);
		current.block.advertisedStart = minutesToTime(originAdvertisedStart + appliedDelta);
		current.block.advertisedEnd = minutesToTime(originAdvertisedEnd + appliedDelta);
	}

	async function setup() {
		const { default: interact } = await import('interactjs');
		if (cancelled) return;

		interactable = interact(node).draggable({
			enabled: !current.disabled,
			ignoreFrom: 'button,input,textarea,select,a,[data-no-drag]',
			listeners: {
				start() {
					if (current.disabled) return;
					originStart = timeToMinutes(current.block.start);
					originEnd = timeToMinutes(current.block.end);
					originAdvertisedStart = timeToMinutes(current.block.advertisedStart);
					originAdvertisedEnd = timeToMinutes(current.block.advertisedEnd);
					totalPixels = 0;
					current.onSelect(current.block.id);
					setDraggingClass(node, true);
				},
				move(event) {
					if (current.disabled) return;
					updateBlockFromDrag(event);
					current.onSelect(current.block.id);
				},
				end() {
					setDraggingClass(node, false);
				}
			}
		});
	}

	setup();

	return {
		update(next: TimelineBlockDragParams) {
			current = next;
			interactable?.draggable({ enabled: !next.disabled });
		},
		destroy() {
			cancelled = true;
			interactable?.unset();
		}
	};
}

export function timelineActualResizeHandle(node: HTMLElement, params: TimelineActualResizeParams) {
	let current = params;
	let interactable: ReturnType<InteractModule['default']> | null = null;
	let cancelled = false;
	let originStart = 0;
	let originEnd = 0;
	let pointerMinuteOffset = 0;

	function startKey() {
		return current.target === 'advertised' ? 'advertisedStart' : 'start';
	}

	function endKey() {
		return current.target === 'advertised' ? 'advertisedEnd' : 'end';
	}

	function pointerMinutes(event: { clientY?: number; client?: { y?: number } }) {
		const lane = node.closest<HTMLElement>(current.laneSelector);
		const laneTop = lane?.getBoundingClientRect().top ?? 0;
		const point = eventClientPoint(event);
		return current.viewStartMinutes + roundedMinutes(point.y - laneTop, current.minuteHeight);
	}

	function updateFromPointer(event: { clientY?: number; client?: { y?: number } }) {
		scrollDuringVerticalDrag(node, event);
		const nextMinute = pointerMinutes(event) - pointerMinuteOffset;

		if (current.edge === 'start') {
			const nextStart = clamp(nextMinute, 0, originEnd - 5);
			current.block[startKey()] = minutesToTime(nextStart);
			current.block[endKey()] = minutesToTime(originEnd);
		} else {
			const nextEnd = clamp(nextMinute, originStart + 5, 23 * 60 + 59);
			current.block[startKey()] = minutesToTime(originStart);
			current.block[endKey()] = minutesToTime(nextEnd);
		}
	}

	async function setup() {
		const { default: interact } = await import('interactjs');
		if (cancelled) return;

		interactable = interact(node).draggable({
			enabled: !current.disabled,
			listeners: {
				start(event) {
					if (current.disabled) return;
					originStart = timeToMinutes(current.block[startKey()]);
					originEnd = timeToMinutes(current.block[endKey()]);
					current.onSelect(current.block.id);
					pointerMinuteOffset = event
						? pointerMinutes(event) - (current.edge === 'start' ? originStart : originEnd)
						: 0;
					setDraggingClass(node, true);
				},
				move(event) {
					if (current.disabled) return;
					updateFromPointer(event);
				},
				end() {
					setDraggingClass(node, false);
				}
			}
		});
	}

	setup();

	return {
		update(next: TimelineActualResizeParams) {
			current = next;
			interactable?.draggable({ enabled: !next.disabled });
		},
		destroy() {
			cancelled = true;
			interactable?.unset();
		}
	};
}

export function timelineBufferResizeHandle(node: HTMLElement, params: TimelineBufferResizeParams) {
	let current = params;
	let interactable: ReturnType<InteractModule['default']> | null = null;
	let cancelled = false;
	let originStart = 0;
	let originEnd = 0;
	let originBuffer = 0;
	let pointerMinuteOffset = 0;

	function pointerMinutes(event: { clientY?: number; client?: { y?: number } }) {
		const lane = node.closest<HTMLElement>(current.laneSelector);
		const laneTop = lane?.getBoundingClientRect().top ?? 0;
		const point = eventClientPoint(event);
		return current.viewStartMinutes + roundedMinutes(point.y - laneTop, current.minuteHeight);
	}

	async function setup() {
		const { default: interact } = await import('interactjs');
		if (cancelled) return;

		interactable = interact(node).draggable({
			enabled: !current.disabled,
			listeners: {
				start(event) {
					if (current.disabled) return;
					originStart = timeToMinutes(current.block.start);
					originEnd = timeToMinutes(current.block.end);
					originBuffer =
						current.edge === 'before' ? current.block.bufferBefore : current.block.bufferAfter;
					current.onSelect(current.block.id);
					const originEdge =
						current.edge === 'before' ? originStart - originBuffer : originEnd + originBuffer;
					pointerMinuteOffset = event ? pointerMinutes(event) - originEdge : 0;
					setDraggingClass(node, true);
				},
				move(event) {
					if (current.disabled) return;
					scrollDuringVerticalDrag(node, event);
					const nextMinute = pointerMinutes(event) - pointerMinuteOffset;

					if (current.edge === 'before') {
						current.block.bufferBefore = Math.max(0, originStart - nextMinute);
					} else {
						current.block.bufferAfter = Math.max(0, nextMinute - originEnd);
					}
				},
				end() {
					setDraggingClass(node, false);
				}
			}
		});
	}

	setup();

	return {
		update(next: TimelineBufferResizeParams) {
			current = next;
			interactable?.draggable({ enabled: !next.disabled });
		},
		destroy() {
			cancelled = true;
			interactable?.unset();
		}
	};
}

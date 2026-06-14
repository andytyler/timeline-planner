import { minutesToTime, timeToMinutes, type TimelineBlock } from '$lib/timeline';

type InteractModule = typeof import('interactjs');

export type TimelineBlockDragParams = {
	block: TimelineBlock;
	laneSelector: string;
	minuteHeight: number;
	viewStartMinutes: number;
	onSelect: (id: string) => void;
	disabled?: boolean;
};

export type TimelineActualResizeParams = {
	block: TimelineBlock;
	edge: 'start' | 'end';
	minuteHeight: number;
	onSelect: (id: string) => void;
	disabled?: boolean;
};

export type TimelineBufferResizeParams = {
	block: TimelineBlock;
	edge: 'before' | 'after';
	minuteHeight: number;
	onSelect: (id: string) => void;
	disabled?: boolean;
};

function roundedMinutes(deltaPixels: number, minuteHeight: number) {
	return Math.round(deltaPixels / minuteHeight / 5) * 5;
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

export function timelineBlockDrag(node: HTMLElement, params: TimelineBlockDragParams) {
	let current = params;
	let interactable: ReturnType<InteractModule['default']> | null = null;
	let cancelled = false;

	async function setup() {
		const { default: interact } = await import('interactjs');
		if (cancelled) return;

		interactable = interact(node).draggable({
			allowFrom: '[data-block-drag-surface]',
			ignoreFrom: 'button,input,textarea,select,a,[data-no-drag]',
			listeners: {
				start() {
					if (current.disabled) return;
					current.onSelect(current.block.id);
					setDraggingClass(node, true);
				},
				end(event) {
					setDraggingClass(node, false);
					if (current.disabled) return;
					const point = eventClientPoint(event);
					const lane = document
						.elementFromPoint(point.x, point.y)
						?.closest<HTMLElement>(current.laneSelector);

					if (!lane) return;

					const laneId = lane.dataset.timelineLane;
					if (!laneId) return;

					const rect = lane.getBoundingClientRect();
					const duration = timeToMinutes(current.block.end) - timeToMinutes(current.block.start);
					const nextStart =
						current.viewStartMinutes + roundedMinutes(point.y - rect.top, current.minuteHeight);
					const nextEnd = nextStart + duration;
					const advertisedDuration =
						timeToMinutes(current.block.advertisedEnd) -
						timeToMinutes(current.block.advertisedStart);

					current.block.lane = laneId;
					current.block.start = minutesToTime(nextStart);
					current.block.end = minutesToTime(nextEnd);
					current.block.advertisedStart = minutesToTime(nextStart);
					current.block.advertisedEnd = minutesToTime(nextStart + advertisedDuration);
					current.onSelect(current.block.id);
				}
			}
		});
	}

	setup();

	return {
		update(next: TimelineBlockDragParams) {
			current = next;
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
	let totalPixels = 0;

	async function setup() {
		const { default: interact } = await import('interactjs');
		if (cancelled) return;

		interactable = interact(node).draggable({
			listeners: {
				start() {
					if (current.disabled) return;
					originStart = timeToMinutes(current.block.start);
					originEnd = timeToMinutes(current.block.end);
					totalPixels = 0;
					current.onSelect(current.block.id);
					setDraggingClass(node, true);
				},
				move(event) {
					if (current.disabled) return;
					totalPixels += event.dy ?? 0;
					const delta = roundedMinutes(totalPixels, current.minuteHeight);

					if (current.edge === 'start') {
						current.block.start = minutesToTime(
							Math.min(originEnd - 5, Math.max(0, originStart + delta))
						);
					} else {
						current.block.end = minutesToTime(
							Math.max(originStart + 5, Math.min(23 * 60 + 59, originEnd + delta))
						);
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
		update(next: TimelineActualResizeParams) {
			current = next;
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
	let origin = 0;
	let totalPixels = 0;

	async function setup() {
		const { default: interact } = await import('interactjs');
		if (cancelled) return;

		interactable = interact(node).draggable({
			listeners: {
				start() {
					if (current.disabled) return;
					origin =
						current.edge === 'before' ? current.block.bufferBefore : current.block.bufferAfter;
					totalPixels = 0;
					current.onSelect(current.block.id);
					setDraggingClass(node, true);
				},
				move(event) {
					if (current.disabled) return;
					totalPixels += event.dy ?? 0;
					const delta = roundedMinutes(totalPixels, current.minuteHeight);

					if (current.edge === 'before') {
						current.block.bufferBefore = Math.max(0, origin - delta);
					} else {
						current.block.bufferAfter = Math.max(0, origin + delta);
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
		},
		destroy() {
			cancelled = true;
			interactable?.unset();
		}
	};
}

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
			allowFrom: '[data-block-drag-surface]',
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
	let totalPixels = 0;

	async function setup() {
		const { default: interact } = await import('interactjs');
		if (cancelled) return;

		interactable = interact(node).draggable({
			enabled: !current.disabled,
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
	let origin = 0;
	let totalPixels = 0;

	async function setup() {
		const { default: interact } = await import('interactjs');
		if (cancelled) return;

		interactable = interact(node).draggable({
			enabled: !current.disabled,
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
			interactable?.draggable({ enabled: !next.disabled });
		},
		destroy() {
			cancelled = true;
			interactable?.unset();
		}
	};
}

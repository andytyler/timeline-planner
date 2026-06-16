import { minutesToTime, timeToMinutes, type TimelineBlock } from '$lib/timeline';

type InteractModule = typeof import('interactjs');

export type TimelineBlockDragParams = {
	block: TimelineBlock;
	laneSelector: string;
	minuteHeight: number;
	pixelToMinute?: (y: number) => number;
	onSelect: (id: string) => void;
	getDragBlocks?: (block: TimelineBlock) => TimelineBlock[];
	onChange?: (block: TimelineBlock) => void;
	disabled?: boolean;
};

type TimelineBlockDragOrigin = {
	block: TimelineBlock;
	start: number;
	end: number;
	advertisedStart: number;
	advertisedEnd: number;
	lane: string;
	laneIndex: number;
	duration: number;
};

export type TimelineActualResizeParams = {
	block: TimelineBlock;
	edge: 'start' | 'end';
	target?: 'actual' | 'advertised';
	laneSelector: string;
	minuteHeight: number;
	pixelToMinute?: (y: number) => number;
	onSelect: (id: string) => void;
	viewStartMinutes: number;
	onChange?: (block: TimelineBlock) => void;
	disabled?: boolean;
};

export type TimelineBufferResizeParams = {
	block: TimelineBlock;
	edge: 'before' | 'after';
	laneSelector: string;
	minuteHeight: number;
	pixelToMinute?: (y: number) => number;
	onSelect: (id: string) => void;
	viewStartMinutes: number;
	onResizeStart?: (block: TimelineBlock, edge: 'before' | 'after') => void;
	onChange?: (block: TimelineBlock) => void;
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

function isMilestone(block: TimelineBlock) {
	return block.type === 'milestone';
}

function actualEndMinutes(block: TimelineBlock) {
	return isMilestone(block) ? timeToMinutes(block.start) : timeToMinutes(block.end);
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
	let dragOrigins: TimelineBlockDragOrigin[] = [];
	let originLaneIds: string[] = [];
	let primaryLaneIndex = -1;
	let totalPixels = 0;
	let pointerMinuteOffset = 0;

	function laneIds() {
		return Array.from(document.querySelectorAll<HTMLElement>(current.laneSelector))
			.map((lane) => lane.dataset.timelineLane)
			.filter((lane): lane is string => Boolean(lane));
	}

	function draggableBlocks() {
		const selectedBlocks = current.getDragBlocks?.(current.block) ?? [current.block];
		if (!selectedBlocks.some((block) => block.id === current.block.id)) return [current.block];
		return selectedBlocks.length ? selectedBlocks : [current.block];
	}

	function laneDeltaFromPointer(event: {
		clientX?: number;
		clientY?: number;
		client?: { x?: number; y?: number };
	}) {
		if (primaryLaneIndex < 0) return 0;

		const point = eventClientPoint(event);
		const lane = document
			.elementFromPoint(point.x, point.y)
			?.closest<HTMLElement>(current.laneSelector);
		const laneId = lane?.dataset.timelineLane;
		const laneIndex = laneId ? originLaneIds.indexOf(laneId) : -1;

		return laneIndex >= 0 ? laneIndex - primaryLaneIndex : 0;
	}

	function pointerMinutes(event: { clientY?: number; client?: { y?: number } }) {
		const lane = node.closest<HTMLElement>(current.laneSelector);
		const laneTop = lane?.getBoundingClientRect().top ?? 0;
		const point = eventClientPoint(event);
		if (current.pixelToMinute) return current.pixelToMinute(point.y - laneTop);
		return roundedMinutes(point.y - laneTop, current.minuteHeight);
	}

	function clampedGroupDelta(delta: number) {
		let minimumDelta = Number.NEGATIVE_INFINITY;
		let maximumDelta = Number.POSITIVE_INFINITY;

		for (const origin of dragOrigins) {
			minimumDelta = Math.max(minimumDelta, -origin.start);
			maximumDelta = Math.min(maximumDelta, 23 * 60 + 59 - origin.duration - origin.start);
		}

		return clamp(delta, minimumDelta, maximumDelta);
	}

	function updateBlockFromDrag(event: {
		dy?: number;
		clientX?: number;
		clientY?: number;
		client?: { x?: number; y?: number };
	}) {
		totalPixels += event.dy ?? 0;

		const primaryOrigin =
			dragOrigins.find((origin) => origin.block.id === current.block.id) ?? dragOrigins[0];
		const rawDelta =
			current.pixelToMinute && primaryOrigin
				? pointerMinutes(event) - pointerMinuteOffset - primaryOrigin.start
				: roundedMinutes(totalPixels, current.minuteHeight);
		const delta = clampedGroupDelta(Math.round(rawDelta / 5) * 5);
		const laneDelta = laneDeltaFromPointer(event);

		for (const origin of dragOrigins) {
			const nextStart = origin.start + delta;
			const nextEnd = origin.end + delta;
			const nextLane =
				originLaneIds[clamp(origin.laneIndex + laneDelta, 0, originLaneIds.length - 1)];

			if (nextLane) origin.block.lane = nextLane;
			origin.block.start = minutesToTime(nextStart);
			origin.block.end = minutesToTime(isMilestone(origin.block) ? nextStart : nextEnd);
			if (isMilestone(origin.block)) {
				origin.block.advertisedStart = origin.block.start;
				origin.block.advertisedEnd = origin.block.start;
			} else {
				origin.block.advertisedStart = minutesToTime(origin.advertisedStart + delta);
				origin.block.advertisedEnd = minutesToTime(origin.advertisedEnd + delta);
			}
		}
		current.onChange?.(current.block);
	}

	async function setup() {
		const { default: interact } = await import('interactjs');
		if (cancelled) return;

		interactable = interact(node).draggable({
			enabled: !current.disabled,
			ignoreFrom: 'button,input,textarea,select,a,[data-no-drag]',
			listeners: {
				start(event) {
					if (current.disabled) return;
					current.onSelect(current.block.id);
					originLaneIds = laneIds();
					dragOrigins = draggableBlocks().map((block) => {
						const start = timeToMinutes(block.start);
						const end = actualEndMinutes(block);
						return {
							block,
							start,
							end,
							advertisedStart: timeToMinutes(block.advertisedStart),
							advertisedEnd: timeToMinutes(block.advertisedEnd),
							lane: block.lane,
							laneIndex: Math.max(0, originLaneIds.indexOf(block.lane)),
							duration: end - start
						};
					});
					primaryLaneIndex =
						dragOrigins.find((origin) => origin.block.id === current.block.id)?.laneIndex ?? -1;
					totalPixels = 0;
					const primaryOrigin =
						dragOrigins.find((origin) => origin.block.id === current.block.id) ?? dragOrigins[0];
					pointerMinuteOffset =
						current.pixelToMinute && event && primaryOrigin
							? pointerMinutes(event) - primaryOrigin.start
							: 0;
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
	let syncAdvertisedWithActual = false;

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
		if (current.pixelToMinute) return current.pixelToMinute(point.y - laneTop);
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

		if (syncAdvertisedWithActual) {
			current.block.advertisedStart = current.block.start;
			current.block.advertisedEnd = current.block.end;
		}
		current.onChange?.(current.block);
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
					syncAdvertisedWithActual =
						current.target !== 'advertised' &&
						current.block.advertisedStart === current.block.start &&
						current.block.advertisedEnd === current.block.end;
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
		if (current.pixelToMinute) return current.pixelToMinute(point.y - laneTop);
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
					originEnd = actualEndMinutes(current.block);
					originBuffer =
						current.edge === 'before' ? current.block.bufferBefore : current.block.bufferAfter;
					current.onSelect(current.block.id);
					current.onResizeStart?.(current.block, current.edge);
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
					current.onChange?.(current.block);
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

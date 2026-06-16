<script lang="ts">
	import { deserialize } from '$app/forms';
	import {
		Calendar,
		ClipboardPaste,
		ChevronDown,
		ChevronUp,
		Copy,
		FilePlus,
		HelpCircle,
		Plus,
		Scissors,
		Trash2,
		Undo2,
		X,
		ZoomIn,
		ZoomOut
	} from '@lucide/svelte';
	import {
		cloneBlocks,
		cloneLanes,
		durationLabel,
		minutesToTime,
		timeToMinutes,
		type TimelineBlock,
		type TimelineLane,
		type TimelineSnapshot,
		type TimelineBlockType
	} from '$lib/timeline';
	import { plannerShortcutForEvent, type PlannerShortcutIntent } from '$lib/planner-shortcuts';
	import BlockIconPicker from '$lib/components/block-icon-picker.svelte';
	import PlannerLegend from '$lib/components/planner-legend.svelte';
	import WorkspaceSidebar from '$lib/components/workspace-sidebar.svelte';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import {
		timelineActualResizeHandle,
		timelineBlockDrag,
		timelineBufferResizeHandle
	} from '$lib/timeline-interactions';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { ActionData, PageData } from './$types';

	type ViewMode = 'combined' | 'advertised' | 'actual';
	type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
	type SaveActionSuccess = { intent?: string; message?: string; timelineId?: string };
	type SaveActionFailure = { intent?: string; message?: string };
	type BufferEdge = 'before' | 'after';
	type BufferMerge = {
		id: string;
		lane: string;
		previous: TimelineBlock;
		next: TimelineBlock;
		start: number;
		end: number;
		split: number;
		previousAfterEnd: number;
		nextBeforeStart: number;
		totalDuration: number;
	};
	type BufferMergeCapacity = {
		previousAfter: number;
		nextBefore: number;
		total: number;
	};
	type DraftBlockCreate = {
		laneId: string;
		pointerId: number;
		startMinute: number;
		endMinute: number;
	};
	type MergedBufferTimeLabel = {
		id: string;
		time: string;
		style: string;
		align: 'above' | 'below' | 'center';
	};
	type TimeSegment = {
		id: string;
		start: number;
		end: number;
		top: number;
		height: number;
		collapsed: boolean;
	};
	type TimeBand = {
		id: string;
		start: number;
		end: number;
		top: number;
		height: number;
		shaded: boolean;
	};
	type TimeTick = {
		id: string;
		minute: number;
		label: string;
		top: number;
	};
	type DateBoundary = {
		id: string;
		minute: number;
		label: string;
		top: number;
	};
	type PlannerUndoEntry = {
		blocks: TimelineBlock[];
		selectedId: string;
		selectedIds: string[];
		separatedBufferMergeIds: string[];
		bufferMergeCapacities: Record<string, BufferMergeCapacity>;
	};
	type WorkspaceMember = PageData['workspaceMembers'][number];
	type OwnerOption = {
		value: string;
		label: string;
		subtitle: string;
		initials: string;
		avatarUrl: string | null;
	};

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const unassignedOwnerValue = '__unassigned__';
	const timelineDensitySteps = [1.25, 1.6, 2, 2.75, 3.5, 4.5];
	const defaultTimelineDensityIndex = 2;
	let timelineDensityIndex = $state(defaultTimelineDensityIndex);
	const minuteHeight = $derived(
		timelineDensitySteps[timelineDensityIndex] ?? timelineDensitySteps[defaultTimelineDensityIndex]
	);
	const laneWidth = 260;
	const resizeHandleHitPixels = 24;
	const milestoneVisualHeight = 44;
	const dayMinutes = 24 * 60;
	const overnightEndMinutes = 6 * 60;
	const overnightStartMinutes = 22 * 60;
	const collapsedOvernightHeight = 44;

	let lanes = $state<TimelineLane[]>(cloneLanes());
	let blocks = $state<TimelineBlock[]>(cloneBlocks());
	let selectedId = $state('');
	let selectedIds = $state<string[]>([]);
	let viewMode = $state<ViewMode>('combined');
	let timelineStartsAt = $state('');
	let timelineEndsAt = $state('');
	let padBefore = $state(30);
	let padAfter = $state(45);
	let timelineTimezone = $state('Europe/London');
	let pageTitle = $state('Event Timeline');
	let timelineTitle = $state('Launch Meetup Run of Show');
	let loadedTimelineKey = $state<string | null>(null);
	let autosavedTimelineId = $state<string | null>(null);
	let autosaveStatus = $state<AutosaveStatus>('idle');
	let autosaveMessage = $state('');
	let timelineScrollElement: HTMLDivElement | null = $state(null);
	const visibleDensityHours = $derived((600 / minuteHeight / 60).toFixed(1));
	let separatedBufferMergeIds = $state<string[]>([]);
	let bufferMergeCapacities = $state<Record<string, BufferMergeCapacity>>({});
	let draftBlockCreate = $state<DraftBlockCreate | null>(null);
	let showShortcutHelp = $state(false);
	let blockClipboard = $state<TimelineBlock[]>([]);
	let undoStack = $state<PlannerUndoEntry[]>([]);
	let pasteCount = 0;
	let suppressNextLaneClick = false;
	let lastAutosaveKey: string | null = null;
	let lastAutosaveSignature = '';
	let autosaveSequence = 0;
	let initialTimelineScrollKey = '';

	const selectedBlock = $derived(blocks.find((block) => block.id === selectedId));
	const activeWorkspace = $derived(
		data.workspaces.find((workspace) => workspace.id === data.activeWorkspaceId) ??
			data.workspaces[0]
	);
	const canEditActiveWorkspace = $derived(
		data.mode === 'local' ||
			data.activeWorkspaceRole === 'owner' ||
			data.activeWorkspaceRole === 'admin' ||
			data.activeWorkspaceRole === 'member'
	);
	const defaultOwnerLabel = $derived(data.userEmail?.trim() || 'Creator');
	const hasClipboardBlocks = $derived(blockClipboard.length > 0);
	const hasUndoEntry = $derived(undoStack.length > 0);
	const ownerOptions = $derived.by(() => {
		const options = data.workspaceMembers.map((member) => {
			const label = workspaceMemberLabel(member);
			return {
				value: member.id,
				label,
				subtitle: workspaceMemberSubtitle(member),
				initials: ownerInitials(label),
				avatarUrl: member.avatarUrl
			} satisfies OwnerOption;
		});
		const savedOwner = selectedBlock?.owner?.trim();
		if (savedOwner && !options.some((option) => option.label === savedOwner)) {
			options.unshift({
				value: savedOwner,
				label: savedOwner,
				subtitle: 'Saved owner',
				initials: ownerInitials(savedOwner),
				avatarUrl: null
			});
		}
		return options;
	});
	const selectedOwnerValue = $derived.by(() => {
		const owner = selectedBlock?.owner?.trim();
		if (!owner) return unassignedOwnerValue;
		return ownerOptions.find((option) => option.label === owner)?.value ?? owner;
	});
	const timelineDate = $derived(datePart(timelineStartsAt));
	const viewStart = $derived(timePart(timelineStartsAt));
	const viewEnd = $derived(timePart(timelineEndsAt));
	const timelineSnapshot = $derived({
		id: autosavedTimelineId ?? data.activeTimeline?.id ?? null,
		title: timelineTitle,
		date: timelineDate,
		timezone: timelineTimezone,
		startsAt: timelineStartsAt,
		endsAt: timelineEndsAt,
		viewStart,
		viewEnd,
		padBefore,
		padAfter,
		lanes,
		blocks
	} satisfies TimelineSnapshot);
	const viewStartMinutes = $derived(dateTimeToTimelineMinute(timelineStartsAt) - padBefore);
	const viewEndMinutes = $derived.by(() =>
		Math.max(viewStartMinutes + 60, dateTimeToTimelineMinute(timelineEndsAt) + padAfter)
	);
	const timelineSegments = $derived.by(() => buildTimelineSegments());
	const timelineHeight = $derived.by(() => {
		const lastSegment = timelineSegments.at(-1);
		return Math.max(720, lastSegment ? lastSegment.top + lastSegment.height : 0);
	});
	const timeBands = $derived.by(() => buildTimeBands());
	const timeTicks = $derived.by(() => buildTimeTicks());
	const collapsedTimeSegments = $derived(timelineSegments.filter((segment) => segment.collapsed));
	const dateBoundaries = $derived.by(() => buildDateBoundaries());
	const timelineWidth = $derived(76 + lanes.length * laneWidth);
	const timelineGridTemplate = $derived(
		`76px repeat(${lanes.length}, minmax(${laneWidth}px, 1fr))`
	);
	const now = new Date();
	const nowMinutes = $derived(dateToTimelineMinute(now));
	const displaySummary = $derived(
		`${dateTimeSummary(timelineStartsAt)}-${dateTimeSummary(timelineEndsAt)} · ${padBefore}m before / ${padAfter}m after`
	);
	const timelineStatusMessage = $derived.by(() => {
		if (autosaveStatus === 'error') return autosaveMessage || 'Autosave failed';
		return formMessage('timeline') || formMessage('save') || '';
	});
	const lumaEventById = $derived(new Map(data.lumaEvents.map((event) => [event.id, event])));
	const sidebarEvents = $derived.by(() => {
		const timelineEvents = data.timelines.map((timeline) => {
			const event = timeline.luma_event_id ? lumaEventById.get(timeline.luma_event_id) : null;
			return {
				id: timeline.id,
				title: event?.name ?? timeline.title,
				href: plannerHref({ timeline: timeline.id }),
				startsAt: event?.starts_at ?? null,
				isActive: timeline.id === data.activeTimeline?.id
			};
		});

		if (timelineEvents.length > 0) return timelineEvents;
		if (data.activeTimeline) {
			return [
				{
					id: data.activeTimeline.id ?? 'local-active-timeline',
					title: data.activeTimeline.title,
					href: plannerHref(),
					startsAt: null,
					isActive: true
				}
			];
		}
		if (data.mode === 'local') {
			return [
				{
					id: 'local-sample-timeline',
					title: timelineTitle,
					href: plannerHref(),
					startsAt: null,
					isActive: true
				}
			];
		}

		return [];
	});

	function plannerHref(params: Record<string, string | null | undefined> = {}) {
		const search = new SvelteURLSearchParams();
		if (activeWorkspace) search.set('workspace', activeWorkspace.id);
		for (const [key, value] of Object.entries(params)) {
			if (value) search.set(key, value);
		}
		const query = search.toString();
		return query ? `/planner?${query}` : '/planner';
	}

	function formMessage(intent: string) {
		return form?.intent === intent ? form.message : null;
	}

	function todayDateInput() {
		return new Date().toISOString().slice(0, 10);
	}

	function datePart(value: string | null | undefined) {
		const next = value?.slice(0, 10) ?? '';
		return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : todayDateInput();
	}

	function timePart(value: string | null | undefined) {
		const next = value?.slice(11, 16) || value?.slice(0, 5) || '';
		return /^([01]\d|2[0-3]):[0-5]\d$/.test(next) ? next : '09:00';
	}

	function localDateTimeInput(date: string | null | undefined, time: string | null | undefined) {
		return `${datePart(date)}T${timePart(time)}`;
	}

	function dateAtDayOffset(date: string, offsetDays: number) {
		const [year, month, day] = date.split('-').map(Number);
		const next = new Date(Date.UTC(year, month - 1, day + offsetDays, 12));
		return next.toISOString().slice(0, 10);
	}

	function baseTimelineDate() {
		return datePart(timelineStartsAt);
	}

	function dateTimeToTimelineMinute(value: string | null | undefined) {
		const base = baseTimelineDate();
		const date = datePart(value);
		const time = timePart(value);
		const [baseYear, baseMonth, baseDay] = base.split('-').map(Number);
		const [year, month, day] = date.split('-').map(Number);
		const dayDelta =
			(Date.UTC(year, month - 1, day, 12) - Date.UTC(baseYear, baseMonth - 1, baseDay, 12)) /
			86_400_000;
		return Math.round(dayDelta) * dayMinutes + timeToMinutes(time);
	}

	function dateToTimelineMinute(value: Date) {
		const date = `${value.getFullYear()}-${(value.getMonth() + 1).toString().padStart(2, '0')}-${value
			.getDate()
			.toString()
			.padStart(2, '0')}`;
		const time = `${value.getHours().toString().padStart(2, '0')}:${value
			.getMinutes()
			.toString()
			.padStart(2, '0')}`;
		return dateTimeToTimelineMinute(`${date}T${time}`);
	}

	function timelineMinuteToDateTime(minute: number) {
		return `${dateAtDayOffset(baseTimelineDate(), dayOffsetForMinute(minute))}T${timelineTimeLabel(minute)}`;
	}

	function blockMinute(value: string) {
		return value.includes('T') ? dateTimeToTimelineMinute(value) : timeToMinutes(value);
	}

	function blockTimeValue(minute: number) {
		return timelineTimeLabel(minute);
	}

	function timelineMinuteDisplay(minute: number) {
		const dateLabel =
			viewEndMinutes - viewStartMinutes > dayMinutes
				? `${timelineDateLabel(dayOffsetForMinute(minute), 'short')} `
				: '';
		return `${dateLabel}${timelineTimeLabel(minute)}`;
	}

	function durationMinutesLabel(start: number, end: number) {
		const total = Math.max(0, Math.round(end - start));
		const hours = Math.floor(total / 60);
		const minutes = total % 60;
		if (hours && minutes) return `${hours}h ${minutes}m`;
		if (hours) return `${hours}h`;
		return `${minutes}m`;
	}

	function dateTimeSummary(value: string) {
		return `${timelineDateLabel(dayOffsetForMinute(dateTimeToTimelineMinute(value)), 'short')} ${timePart(value)}`;
	}

	function timelineDateForOffset(offsetDays: number) {
		const [year, month, day] = baseTimelineDate().split('-').map(Number);
		const date = new Date(Date.UTC(year, month - 1, day + offsetDays, 12));
		return date;
	}

	function timelineDateLabel(offsetDays: number, format: 'short' | 'long' = 'long') {
		const date = timelineDateForOffset(offsetDays);
		return new Intl.DateTimeFormat([], {
			weekday: format === 'long' ? 'short' : undefined,
			month: 'short',
			day: 'numeric',
			timeZone: timelineTimezone
		}).format(date);
	}

	function timeOfDayMinutes(minute: number) {
		return ((Math.round(minute) % dayMinutes) + dayMinutes) % dayMinutes;
	}

	function timelineTimeLabel(minute: number) {
		const safe = timeOfDayMinutes(minute);
		const hours = Math.floor(safe / 60)
			.toString()
			.padStart(2, '0');
		const mins = (safe % 60).toString().padStart(2, '0');
		return `${hours}:${mins}`;
	}

	function dayOffsetForMinute(minute: number) {
		return Math.floor(minute / dayMinutes);
	}

	function buildTimelineSegments(): TimeSegment[] {
		const ranges: Array<{ id: string; start: number; end: number; collapsed: boolean }> = [];
		const firstDay = dayOffsetForMinute(viewStartMinutes);
		const lastDay = dayOffsetForMinute(viewEndMinutes);
		for (let day = firstDay; day <= lastDay; day += 1) {
			const dayStart = day * dayMinutes;
			ranges.push(
				{
					id: `${day}:overnight-start`,
					start: dayStart,
					end: dayStart + overnightEndMinutes,
					collapsed: true
				},
				{
					id: `${day}:daytime`,
					start: dayStart + overnightEndMinutes,
					end: dayStart + overnightStartMinutes,
					collapsed: false
				},
				{
					id: `${day}:overnight-end`,
					start: dayStart + overnightStartMinutes,
					end: dayStart + dayMinutes,
					collapsed: true
				}
			);
		}
		let top = 0;

		return ranges
			.map((range) => ({
				...range,
				start: Math.max(viewStartMinutes, range.start),
				end: Math.min(viewEndMinutes, range.end)
			}))
			.filter((range) => range.end > range.start)
			.map((range) => {
				const height = range.collapsed
					? collapsedOvernightHeight
					: (range.end - range.start) * minuteHeight;
				const segment = { ...range, top, height };
				top += height;
				return segment;
			});
	}

	function segmentForMinute(minute: number) {
		const safeMinute = Math.max(viewStartMinutes, Math.min(viewEndMinutes, minute));
		return (
			timelineSegments.find(
				(segment) => safeMinute >= segment.start && safeMinute <= segment.end
			) ?? timelineSegments.at(-1)
		);
	}

	function minuteToY(minute: number) {
		const safeMinute = Math.max(viewStartMinutes, Math.min(viewEndMinutes, minute));
		const segment = segmentForMinute(safeMinute);
		if (!segment) return 0;
		const progress = safeMinute - segment.start;
		if (segment.collapsed) {
			return segment.top + (progress / Math.max(1, segment.end - segment.start)) * segment.height;
		}
		return segment.top + progress * minuteHeight;
	}

	function yToMinute(y: number) {
		const safeY = Math.max(0, Math.min(timelineHeight, y));
		const segment =
			timelineSegments.find(
				(candidate) => safeY >= candidate.top && safeY <= candidate.top + candidate.height
			) ?? timelineSegments.at(-1);
		if (!segment) return viewStartMinutes;
		const progress = safeY - segment.top;
		if (segment.collapsed) {
			return (
				segment.start + (progress / Math.max(1, segment.height)) * (segment.end - segment.start)
			);
		}
		return segment.start + progress / minuteHeight;
	}

	function heightBetweenMinutes(start: number, end: number) {
		return Math.max(0, minuteToY(end) - minuteToY(start));
	}

	function buildTimeBands(): TimeBand[] {
		const bands: TimeBand[] = [];
		for (
			let minute = Math.ceil(viewStartMinutes / 30) * 30;
			minute < viewEndMinutes;
			minute += 30
		) {
			const dayMinute = timeOfDayMinutes(minute);
			if (dayMinute < overnightEndMinutes || dayMinute >= overnightStartMinutes) continue;
			const end = Math.min(minute + 30, viewEndMinutes);
			const start = Math.max(minute, viewStartMinutes);
			bands.push({
				id: `${start}-${end}`,
				start,
				end,
				top: minuteToY(start),
				height: heightBetweenMinutes(start, end),
				shaded: Math.floor(minute / 30) % 2 === 1
			});
		}
		return bands;
	}

	function buildTimeTicks(): TimeTick[] {
		const ticks: TimeTick[] = [];
		for (
			let minute = Math.ceil(viewStartMinutes / 30) * 30;
			minute <= viewEndMinutes;
			minute += 30
		) {
			const dayMinute = timeOfDayMinutes(minute);
			if (dayMinute < overnightEndMinutes || dayMinute > overnightStartMinutes) continue;
			ticks.push({
				id: String(minute),
				minute,
				label: timelineTimeLabel(minute),
				top: minuteToY(minute)
			});
		}
		return ticks;
	}

	function buildDateBoundaries(): DateBoundary[] {
		const boundaries: DateBoundary[] = [];
		for (
			let day = dayOffsetForMinute(viewStartMinutes);
			day <= dayOffsetForMinute(viewEndMinutes);
			day += 1
		) {
			const minute = day * dayMinutes;
			if (minute < viewStartMinutes || minute > viewEndMinutes) continue;
			boundaries.push({
				id: String(day),
				minute,
				label: timelineDateLabel(day),
				top: minuteToY(minute)
			});
		}
		return boundaries;
	}

	function collapsedSegmentLabel(segment: TimeSegment) {
		return `${timelineDateLabel(dayOffsetForMinute(segment.start), 'short')} overnight · ${timelineTimeLabel(segment.start)}-${timelineTimeLabel(segment.end)}`;
	}

	function isViewMode(value: string): value is ViewMode {
		return value === 'combined' || value === 'advertised' || value === 'actual';
	}

	function blockExists(id: string) {
		return blocks.some((block) => block.id === id);
	}

	function uniqueBlockIds(ids: string[]) {
		return Array.from(new Set(ids)).filter(blockExists);
	}

	function isBlockSelected(id: string) {
		return selectedIds.includes(id);
	}

	function hasBlockSelection() {
		return selectedIds.length > 0 || Boolean(selectedId);
	}

	function clearBlockSelection() {
		selectedId = '';
		selectedIds = [];
	}

	function selectSingleBlock(id: string) {
		if (!blockExists(id)) return;
		selectedId = id;
		selectedIds = [id];
	}

	function toggleBlockSelection(id: string) {
		if (!blockExists(id)) return;
		if (selectedIds.includes(id)) {
			const nextIds = selectedIds.filter((selected) => selected !== id);
			selectedIds = nextIds;
			selectedId = nextIds.at(-1) ?? '';
			return;
		}

		selectedIds = uniqueBlockIds([...selectedIds, id]);
		selectedId = id;
	}

	function shouldIgnoreBlockSelection(event: Event) {
		return (
			event.target instanceof Element &&
			Boolean(event.target.closest('button,input,textarea,select,a,[data-no-drag]'))
		);
	}

	function handleBlockPointerDown(event: PointerEvent, id: string) {
		if (shouldIgnoreBlockSelection(event)) return;
		if (event.shiftKey) {
			event.preventDefault();
			toggleBlockSelection(id);
			return;
		}

		if (selectedIds.includes(id)) {
			selectedId = id;
			return;
		}

		selectSingleBlock(id);
	}

	function handleBlockClick(event: MouseEvent, id: string) {
		if (shouldIgnoreBlockSelection(event)) return;
		if (event.shiftKey) {
			event.preventDefault();
			return;
		}

		if (selectedIds.includes(id)) {
			selectedId = id;
			return;
		}

		selectSingleBlock(id);
	}

	function handleBlockKeydown(event: KeyboardEvent, id: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		if (event.shiftKey) {
			toggleBlockSelection(id);
			return;
		}

		selectSingleBlock(id);
	}

	function prepareBlockDragSelection(id: string) {
		if (selectedIds.includes(id)) {
			selectedId = id;
			return;
		}

		selectSingleBlock(id);
	}

	function selectedDragBlocks(block: TimelineBlock) {
		const selectedBlocks = blocks.filter((candidate) => selectedIds.includes(candidate.id));
		return selectedBlocks.some((candidate) => candidate.id === block.id) ? selectedBlocks : [block];
	}

	function editableSelectedBlocks() {
		if (!canEditActiveWorkspace) return [];
		const selected = blocks.filter((candidate) => selectedIds.includes(candidate.id));
		if (selected.length > 0) return selected;
		return selectedBlock ? [selectedBlock] : [];
	}

	function selectedBlocksForClipboard() {
		const selected = blocks.filter((candidate) => selectedIds.includes(candidate.id));
		if (selected.length > 0) return selected;
		return selectedBlock ? [selectedBlock] : [];
	}

	function cloneTimelineBlocks(source: TimelineBlock[]) {
		return source.map((block) => ({ ...block }));
	}

	function cloneBufferMergeCapacities(source: Record<string, BufferMergeCapacity>) {
		return Object.fromEntries(
			Object.entries(source).map(([key, capacity]) => [key, { ...capacity }])
		);
	}

	function rememberUndo() {
		undoStack = [
			...undoStack.slice(-39),
			{
				blocks: cloneTimelineBlocks(blocks),
				selectedId,
				selectedIds: [...selectedIds],
				separatedBufferMergeIds: [...separatedBufferMergeIds],
				bufferMergeCapacities: cloneBufferMergeCapacities(bufferMergeCapacities)
			}
		];
	}

	function undoLastPlannerEdit() {
		const previous = undoStack.at(-1);
		if (!previous) return;

		blocks = cloneTimelineBlocks(previous.blocks);
		selectedId = previous.selectedId;
		selectedIds = [...previous.selectedIds];
		separatedBufferMergeIds = [...previous.separatedBufferMergeIds];
		bufferMergeCapacities = cloneBufferMergeCapacities(previous.bufferMergeCapacities);
		undoStack = undoStack.slice(0, -1);
	}

	function copySelectedBlocks() {
		const selected = selectedBlocksForClipboard();
		if (selected.length === 0) return;
		blockClipboard = cloneTimelineBlocks(selected);
		pasteCount = 0;
	}

	function shiftedBlock(block: TimelineBlock, minuteDelta: number, id = block.id) {
		return {
			...block,
			id,
			start: blockTimeValue(blockMinute(block.start) + minuteDelta),
			end: blockTimeValue(blockMinute(block.end) + minuteDelta),
			advertisedStart: blockTimeValue(blockMinute(block.advertisedStart) + minuteDelta),
			advertisedEnd: blockTimeValue(blockMinute(block.advertisedEnd) + minuteDelta)
		};
	}

	function clipboardPasteDelta() {
		const starts = blockClipboard.flatMap((block) => [
			blockMinute(block.start),
			blockMinute(block.advertisedStart)
		]);
		const ends = blockClipboard.flatMap((block) => [
			blockMinute(block.end),
			blockMinute(block.advertisedEnd)
		]);
		const minStart = Math.min(...starts);
		const maxEnd = Math.max(...ends);
		const wantedDelta = visibleCenterMinute() + pasteCount * 5 - minStart;
		return Math.max(viewStartMinutes - minStart, Math.min(viewEndMinutes - maxEnd, wantedDelta));
	}

	$effect(() => {
		const timeline = data.activeTimeline;
		const nextKey = timeline?.id ?? `${data.mode}:sample`;
		if (nextKey === loadedTimelineKey) return;

		const nextLanes = timeline ? timeline.lanes.map((lane) => ({ ...lane })) : cloneLanes();
		const nextBlocks = timeline ? timeline.blocks.map((block) => ({ ...block })) : cloneBlocks();

		lanes = nextLanes.length ? nextLanes : cloneLanes();
		blocks = nextBlocks;
		selectedId = nextBlocks[0]?.id ?? '';
		selectedIds = selectedId ? [selectedId] : [];
		timelineStartsAt = timeline?.startsAt ?? localDateTimeInput(timeline?.date, timeline?.viewStart ?? '08:00');
		timelineEndsAt = timeline?.endsAt ?? localDateTimeInput(timeline?.date, timeline?.viewEnd ?? '18:30');
		padBefore = timeline?.padBefore ?? 30;
		padAfter = timeline?.padAfter ?? 45;
		timelineTimezone = timeline?.timezone ?? 'Europe/London';
		timelineTitle = timeline?.title ?? 'Launch Meetup Run of Show';
		autosavedTimelineId = timeline?.id ?? null;
		loadedTimelineKey = nextKey;
		initialTimelineScrollKey = '';
		separatedBufferMergeIds = [];
		bufferMergeCapacities = {};
		undoStack = [];
		blockClipboard = [];
		pasteCount = 0;
	});

	$effect(() => {
		const key = `${loadedTimelineKey ?? 'loading'}:${timelineStartsAt}:${padBefore}`;
		if (!timelineScrollElement || !loadedTimelineKey || initialTimelineScrollKey === key) return;
		const nextScrollTop = Math.max(0, minuteToY(viewStartMinutes) - 24);
		if (timelineScrollElement.scrollHeight > timelineScrollElement.clientHeight) {
			timelineScrollElement.scrollTop = nextScrollTop;
		} else {
			window.scrollTo({ top: nextScrollTop, behavior: 'auto' });
		}
		initialTimelineScrollKey = key;
	});

	$effect(() => {
		const workspaceId = activeWorkspace?.id;
		const canAutosave = data.mode === 'supabase' && Boolean(workspaceId) && canEditActiveWorkspace;
		const key = `${data.mode}:${workspaceId ?? 'none'}:${timelineSnapshot.id ?? 'draft'}`;
		const signature = JSON.stringify(timelineSnapshot);

		if (!canAutosave || !workspaceId) {
			autosaveStatus = 'idle';
			autosaveMessage = '';
			return;
		}

		if (lastAutosaveKey !== key) {
			lastAutosaveKey = key;
			lastAutosaveSignature = signature;
			autosaveStatus = 'saved';
			autosaveMessage = '';
			return;
		}

		if (signature === lastAutosaveSignature) return;

		autosaveStatus = 'pending';
		autosaveMessage = '';
		const timeout = setTimeout(() => {
			void autosaveTimeline(workspaceId, signature);
		}, 900);

		return () => clearTimeout(timeout);
	});

	async function autosaveTimeline(workspaceId: string, snapshotJson: string) {
		const sequence = ++autosaveSequence;
		const formData = new FormData();
		formData.set('workspaceId', workspaceId);
		formData.set('snapshot', snapshotJson);
		formData.set('autosave', 'true');

		autosaveStatus = 'saving';

		try {
			const response = await fetch('?/saveTimeline', {
				method: 'POST',
				body: formData,
				headers: {
					'x-sveltekit-action': 'true'
				}
			});
			const result = deserialize<SaveActionSuccess, SaveActionFailure>(await response.text());
			if (sequence !== autosaveSequence) return;

			if (result.type === 'success') {
				const timelineId = result.data?.timelineId;
				if (timelineId) {
					autosavedTimelineId = timelineId;
					if (!data.activeTimeline?.id) {
						window.history.replaceState(
							window.history.state,
							'',
							plannerHref({ timeline: timelineId })
						);
					}
				}
				lastAutosaveSignature = snapshotJson;
				autosaveStatus = 'saved';
				autosaveMessage = '';
			} else if (result.type === 'failure') {
				autosaveStatus = 'error';
				autosaveMessage = result.data?.message ?? 'Autosave failed';
			} else {
				autosaveStatus = 'error';
				autosaveMessage = 'Autosave did not complete';
			}
		} catch (error) {
			if (sequence !== autosaveSequence) return;
			autosaveStatus = 'error';
			autosaveMessage = error instanceof Error ? error.message : 'Autosave failed';
		}
	}

	function typeLabel(type: TimelineBlockType) {
		if (type === 'scheduled') return 'Scheduled';
		if (type === 'milestone') return 'Milestone';
		if (type === 'active') return 'Scheduled';
		if (type === 'side') return 'Side';
		return 'Planning';
	}

	function laneLabel(laneId: string) {
		return lanes.find((lane) => lane.id === laneId)?.label ?? 'Lane';
	}

	function visibilityLabel(visibility: TimelineBlock['visibility']) {
		return visibility === 'internal' ? 'Internal' : 'External';
	}

	function roleLabel(role: WorkspaceMember['role']) {
		if (role === 'owner') return 'Owner';
		if (role === 'admin') return 'Admin';
		if (role === 'viewer') return 'Viewer';
		return 'Member';
	}

	function workspaceMemberLabel(member: WorkspaceMember) {
		return member.fullName?.trim() || member.email?.trim() || `Member ${member.id.slice(0, 8)}`;
	}

	function workspaceMemberSubtitle(member: WorkspaceMember) {
		const label = workspaceMemberLabel(member);
		const email = member.email?.trim();
		return email && email !== label ? email : roleLabel(member.role);
	}

	function ownerInitials(owner: string) {
		const words = owner.trim().split(/\s+/).filter(Boolean);
		if (words.length === 0) return '?';
		return words
			.slice(0, 2)
			.map((word) => word[0]?.toUpperCase() ?? '')
			.join('');
	}

	function blockColors(type: TimelineBlockType) {
		if (type === 'scheduled' || type === 'active')
			return 'border-neutral-300 bg-white text-neutral-950';
		if (type === 'side') return 'border-neutral-300 bg-white text-neutral-950';
		if (type === 'milestone')
			return 'border-amber-200 bg-white text-neutral-950 ring-1 ring-amber-100';
		return 'border-neutral-300 bg-white text-neutral-950';
	}

	function hasAdvertisedLayer(block: TimelineBlock) {
		return block.type === 'scheduled' || block.type === 'active' || block.type === 'side';
	}

	function isMilestone(block: TimelineBlock) {
		return block.type === 'milestone';
	}

	function visibleRange(block: TimelineBlock) {
		if (viewMode === 'advertised' && hasAdvertisedLayer(block)) {
			return {
				start: blockMinute(block.advertisedStart),
				end: blockMinute(block.advertisedEnd),
				before: 0,
				after: 0,
				advertisedOnly: true
			};
		}
		if (viewMode === 'actual') {
			const start = blockMinute(block.start);
			const end = isMilestone(block) ? start : blockMinute(block.end);
			return {
				start,
				end,
				before: 0,
				after: 0,
				advertisedOnly: false
			};
		}
		const actualStart = blockMinute(block.start);
		const actualEnd = isMilestone(block) ? actualStart : blockMinute(block.end);
		return {
			start: actualStart - block.bufferBefore,
			end: actualEnd + block.bufferAfter,
			before: block.bufferBefore,
			after: block.bufferAfter,
			advertisedOnly: false
		};
	}

	function laneBlocks(laneId: string) {
		return blocks.filter((block) => block.lane === laneId);
	}

	function actualStartMinutes(block: TimelineBlock) {
		return blockMinute(block.start);
	}

	function actualEndMinutes(block: TimelineBlock) {
		return isMilestone(block) ? actualStartMinutes(block) : blockMinute(block.end);
	}

	function bufferPairKey(laneId: string, previous: TimelineBlock, next: TimelineBlock) {
		return `${laneId}:${previous.id}:${next.id}`;
	}

	function positiveWholeMinutes(value: number) {
		return Math.max(0, Math.round(value));
	}

	function splitBufferCapacity(capacity: BufferMergeCapacity, available: number) {
		const safeAvailable = Math.min(capacity.total, positiveWholeMinutes(available));
		if (capacity.total <= 0 || safeAvailable <= 0) {
			return { previousAfter: 0, nextBefore: 0 };
		}

		let previousAfter = Math.min(
			capacity.previousAfter,
			Math.round((safeAvailable * capacity.previousAfter) / capacity.total)
		);
		let nextBefore = Math.min(capacity.nextBefore, safeAvailable - previousAfter);

		if (previousAfter + nextBefore < safeAvailable) {
			previousAfter = Math.min(capacity.previousAfter, safeAvailable - nextBefore);
		}
		if (previousAfter + nextBefore < safeAvailable) {
			nextBefore = Math.min(capacity.nextBefore, safeAvailable - previousAfter);
		}

		return { previousAfter, nextBefore };
	}

	function rememberBufferCapacity(key: string, previous: TimelineBlock, next: TimelineBlock) {
		const currentCapacity = {
			previousAfter: previous.bufferAfter,
			nextBefore: next.bufferBefore,
			total: previous.bufferAfter + next.bufferBefore
		};
		const existing = bufferMergeCapacities[key];
		if (!existing || currentCapacity.total > existing.total) {
			bufferMergeCapacities = { ...bufferMergeCapacities, [key]: currentCapacity };
			return currentCapacity;
		}

		return existing;
	}

	function forgetBufferCapacityForBlockEdge(block: TimelineBlock, edge: BufferEdge) {
		const sortedBlocks = laneBlocks(block.lane).sort(
			(a, b) => actualStartMinutes(a) - actualStartMinutes(b)
		);
		const index = sortedBlocks.findIndex((candidate) => candidate.id === block.id);
		const previous = edge === 'before' ? sortedBlocks[index - 1] : block;
		const next = edge === 'before' ? block : sortedBlocks[index + 1];
		if (!previous || !next) return;

		const key = bufferPairKey(block.lane, previous, next);
		if (!(key in bufferMergeCapacities)) return;

		const nextCapacities = { ...bufferMergeCapacities };
		delete nextCapacities[key];
		bufferMergeCapacities = nextCapacities;
		separatedBufferMergeIds = separatedBufferMergeIds.filter((id) => id !== key);
	}

	function syncBufferGooForLane(laneId: string) {
		const sortedBlocks = laneBlocks(laneId).sort(
			(a, b) => actualStartMinutes(a) - actualStartMinutes(b)
		);

		for (let index = 0; index < sortedBlocks.length - 1; index += 1) {
			const previous = sortedBlocks[index];
			const next = sortedBlocks[index + 1];
			const key = bufferPairKey(laneId, previous, next);
			const existing = bufferMergeCapacities[key];
			const currentTotal = previous.bufferAfter + next.bufferBefore;
			if (!existing && currentTotal <= 0) continue;

			const gap = actualStartMinutes(next) - actualEndMinutes(previous);
			if (!existing && gap > currentTotal) continue;

			const capacity = rememberBufferCapacity(key, previous, next);
			if (capacity.total <= 0) continue;

			if (gap >= capacity.total) {
				previous.bufferAfter = capacity.previousAfter;
				next.bufferBefore = capacity.nextBefore;
				continue;
			}

			const split = splitBufferCapacity(capacity, gap);
			previous.bufferAfter = split.previousAfter;
			next.bufferBefore = split.nextBefore;
		}
	}

	function syncBufferGoo() {
		for (const lane of lanes) {
			syncBufferGooForLane(lane.id);
		}
	}

	function syncBufferGooAfterMutation() {
		syncBufferGoo();
	}

	function laneBufferMerges(laneId: string) {
		if (viewMode !== 'combined') return [];

		const sortedBlocks = laneBlocks(laneId).sort(
			(a, b) => actualStartMinutes(a) - actualStartMinutes(b)
		);
		const merges: BufferMerge[] = [];

		for (let index = 0; index < sortedBlocks.length - 1; index += 1) {
			const previous = sortedBlocks[index];
			const next = sortedBlocks[index + 1];
			const id = bufferPairKey(laneId, previous, next);
			const hasCapacity = Boolean(bufferMergeCapacities[id]);
			if (!hasCapacity && (previous.bufferAfter <= 0 || next.bufferBefore <= 0)) continue;
			if (previous.bufferAfter <= 0 && next.bufferBefore <= 0) continue;

			const previousAfterStart = actualEndMinutes(previous);
			const previousAfterEnd = previousAfterStart + previous.bufferAfter;
			const nextBeforeStart = actualStartMinutes(next) - next.bufferBefore;
			const nextBeforeEnd = actualStartMinutes(next);
			if (previousAfterEnd < nextBeforeStart) continue;

			const start = Math.min(previousAfterStart, nextBeforeStart);
			const end = Math.max(previousAfterEnd, nextBeforeEnd);
			const split = Math.round((previousAfterEnd + nextBeforeStart) / 2);

			if (separatedBufferMergeIds.includes(id)) continue;

			merges.push({
				id,
				lane: laneId,
				previous,
				next,
				start,
				end,
				split,
				previousAfterEnd,
				nextBeforeStart,
				totalDuration: previous.bufferAfter + next.bufferBefore
			});
		}

		return merges;
	}

	function isBufferMerged(bufferMerges: BufferMerge[], block: TimelineBlock, edge: BufferEdge) {
		return bufferMerges.some((merge) =>
			edge === 'before' ? merge.next.id === block.id : merge.previous.id === block.id
		);
	}

	function mergedBufferStyle(merge: BufferMerge) {
		return `top:${minuteToY(merge.start)}px; height:${Math.max(12, heightBetweenMinutes(merge.start, merge.end))}px;`;
	}

	function mergedBufferHandleStyle(merge: BufferMerge) {
		return `top:${minuteToY(merge.split) - minuteToY(merge.start)}px;`;
	}

	function mergedBufferTimeLabels(merge: BufferMerge): MergedBufferTimeLabel[] {
		const sharedBoundary = merge.previousAfterEnd === merge.nextBeforeStart;
		if (sharedBoundary) {
			return [
				{
					id: 'shared',
					time: timelineMinuteDisplay(merge.previousAfterEnd),
					style: `top:${minuteToY(merge.previousAfterEnd) - minuteToY(merge.start)}px;`,
					align: 'center'
				}
			];
		}

		return [
			{
				id: 'previous-end',
				time: timelineMinuteDisplay(merge.previousAfterEnd),
				style: `top:${minuteToY(merge.previousAfterEnd) - minuteToY(merge.start)}px;`,
				align: 'above'
			},
			{
				id: 'next-start',
				time: timelineMinuteDisplay(merge.nextBeforeStart),
				style: `top:${minuteToY(merge.nextBeforeStart) - minuteToY(merge.start)}px;`,
				align: 'below'
			}
		];
	}

	function separateBufferMerge(merge: BufferMerge) {
		if (!separatedBufferMergeIds.includes(merge.id)) {
			separatedBufferMergeIds = [...separatedBufferMergeIds, merge.id];
		}
	}

	function blockTop(block: TimelineBlock) {
		return minuteToY(visibleRange(block).start);
	}

	function blockHeight(block: TimelineBlock) {
		const range = visibleRange(block);
		if (range.advertisedOnly) return Math.max(28, heightBetweenMinutes(range.start, range.end));
		if (isMilestone(block)) {
			return Math.max(
				milestoneVisualHeight,
				heightBetweenMinutes(range.start, range.end) + milestoneVisualHeight
			);
		}
		return heightBetweenMinutes(range.start, range.end);
	}

	function actualCardStyle(block: TimelineBlock) {
		const range = visibleRange(block);
		const actualStart =
			viewMode === 'advertised' && hasAdvertisedLayer(block)
				? blockMinute(block.advertisedStart)
				: actualStartMinutes(block);
		const top = range.advertisedOnly ? 0 : minuteToY(actualStart) - minuteToY(range.start);
		const height = isMilestone(block) ? milestoneVisualHeight : actualBlockHeight(block);
		return `top:${top}px; height:${height}px; min-height:${height}px;`;
	}

	function actualHandleStyle(block: TimelineBlock, edge: 'start' | 'end') {
		const range = visibleRange(block);
		const actualStart =
			viewMode === 'advertised' && hasAdvertisedLayer(block)
				? blockMinute(block.advertisedStart)
				: actualStartMinutes(block);
		const top = range.advertisedOnly ? 0 : minuteToY(actualStart) - minuteToY(range.start);
		const height = actualBlockHeight(block);
		const handleTop =
			edge === 'start' ? top - resizeHandleHitPixels / 2 : top + height - resizeHandleHitPixels / 2;
		return `top:${handleTop}px;`;
	}

	function addBufferButtonStyle(block: TimelineBlock, edge: 'before' | 'after') {
		const range = visibleRange(block);
		const top = range.advertisedOnly
			? 0
			: minuteToY(actualStartMinutes(block)) - minuteToY(range.start);
		const height = actualBlockHeight(block);
		const buttonTop = edge === 'before' ? top - 32 : top + height + 4;
		return `top:${buttonTop}px;`;
	}

	function bufferBeforeStyle(block: TimelineBlock) {
		const range = visibleRange(block);
		return `top:0px; height:${Math.max(12, heightBetweenMinutes(range.start, actualStartMinutes(block)))}px;`;
	}

	function bufferAfterStyle(block: TimelineBlock) {
		const range = visibleRange(block);
		const actualEnd = actualEndMinutes(block);
		const top = minuteToY(actualEnd) - minuteToY(range.start);
		return `top:${top}px; height:${Math.max(12, heightBetweenMinutes(actualEnd, range.end))}px;`;
	}

	function actualBlockHeight(block: TimelineBlock) {
		if (isMilestone(block)) return 0;
		const start =
			viewMode === 'advertised' && hasAdvertisedLayer(block) ? block.advertisedStart : block.start;
		const end =
			viewMode === 'advertised' && hasAdvertisedLayer(block) ? block.advertisedEnd : block.end;
		return Math.max(32, heightBetweenMinutes(blockMinute(start), blockMinute(end)));
	}

	function advertisedChanged(block: TimelineBlock) {
		if (!hasAdvertisedLayer(block)) return false;
		return block.advertisedStart !== block.start || block.advertisedEnd !== block.end;
	}

	function advertisedBoxStyle(block: TimelineBlock) {
		const { top, height } = advertisedMetrics(block);
		return `top:${top}px; height:${height}px;`;
	}

	function advertisedHandleStyle(block: TimelineBlock, edge: 'start' | 'end') {
		const { top, height } = advertisedMetrics(block);
		const handleTop =
			edge === 'start' ? top - resizeHandleHitPixels / 2 : top + height - resizeHandleHitPixels / 2;
		return `top:${handleTop}px;`;
	}

	function advertisedMetrics(block: TimelineBlock) {
		const cardHeight = actualBlockHeight(block);
		if (viewMode === 'advertised') {
			return {
				top: 0,
				height: Math.max(12, cardHeight)
			};
		}

		const range = visibleRange(block);
		const advertisedStart = blockMinute(block.advertisedStart);
		const advertisedEnd = blockMinute(block.advertisedEnd);
		const rawTop = minuteToY(advertisedStart) - minuteToY(range.start);
		const rawHeight = heightBetweenMinutes(advertisedStart, advertisedEnd);

		return { top: rawTop, height: Math.max(12, rawHeight) };
	}

	function displayedStart(block: TimelineBlock) {
		return viewMode === 'advertised' && hasAdvertisedLayer(block)
			? block.advertisedStart
			: block.start;
	}

	function displayedEnd(block: TimelineBlock) {
		if (isMilestone(block)) return block.start;
		return viewMode === 'advertised' && hasAdvertisedLayer(block) ? block.advertisedEnd : block.end;
	}

	function displayedStartLabel(block: TimelineBlock) {
		return timelineMinuteDisplay(blockMinute(displayedStart(block)));
	}

	function displayedEndLabel(block: TimelineBlock) {
		return timelineMinuteDisplay(blockMinute(displayedEnd(block)));
	}

	function displayedDurationLabel(block: TimelineBlock) {
		return durationMinutesLabel(blockMinute(displayedStart(block)), blockMinute(displayedEnd(block)));
	}

	function advertisedDurationLabel(block: TimelineBlock) {
		return durationMinutesLabel(blockMinute(block.advertisedStart), blockMinute(block.advertisedEnd));
	}

	function bufferStartLabel(block: TimelineBlock) {
		return timelineMinuteDisplay(blockMinute(block.start) - block.bufferBefore);
	}

	function bufferEndLabel(block: TimelineBlock) {
		const end = isMilestone(block) ? blockMinute(block.start) : blockMinute(block.end);
		return timelineMinuteDisplay(end + block.bufferAfter);
	}

	function snappedMinuteFromClientY(laneElement: HTMLElement, clientY: number) {
		const rect = laneElement.getBoundingClientRect();
		const rawMinute = yToMinute(clientY - rect.top);
		return Math.max(viewStartMinutes, Math.min(viewEndMinutes - 5, Math.round(rawMinute / 5) * 5));
	}

	function snappedMinuteFromY(y: number) {
		return Math.max(viewStartMinutes, Math.min(viewEndMinutes, Math.round(yToMinute(y) / 5) * 5));
	}

	function addBlockAt(laneId: string, startMinute: number, endMinute = startMinute + 30) {
		if (!canEditActiveWorkspace) return;
		rememberUndo();
		const safeStart = Math.max(viewStartMinutes, Math.min(viewEndMinutes - 5, Math.round(startMinute)));
		const safeEnd = Math.max(safeStart + 5, Math.min(viewEndMinutes, Math.round(endMinute)));
		const start = blockTimeValue(safeStart);
		const end = blockTimeValue(safeEnd);
		const block: TimelineBlock = {
			id: crypto.randomUUID(),
			title: 'New planning block',
			icon: 'list',
			lane: laneId,
			type: 'planning',
			visibility: 'internal',
			start,
			end,
			advertisedStart: start,
			advertisedEnd: end,
			bufferBefore: 0,
			bufferAfter: 0,
			owner: defaultOwnerLabel,
			notes: ''
		};
		blocks = [...blocks, block];
		selectedId = block.id;
		selectedIds = [block.id];
		syncBufferGoo();
	}

	function addBlock() {
		addBlockAt(selectedBlock?.lane ?? lanes[0]?.id ?? 'main', visibleCenterMinute());
	}

	function duplicateSelectedBlocks() {
		const selected = editableSelectedBlocks();
		if (selected.length === 0) return;
		rememberUndo();

		const duplicates = selected.map((block) => ({
			...block,
			id: crypto.randomUUID(),
			title: `${block.title} copy`,
			start: blockTimeValue(blockMinute(block.start) + 5),
			end: blockTimeValue(blockMinute(block.end) + 5),
			advertisedStart: blockTimeValue(blockMinute(block.advertisedStart) + 5),
			advertisedEnd: blockTimeValue(blockMinute(block.advertisedEnd) + 5)
		}));

		blocks = [...blocks, ...duplicates];
		selectedIds = duplicates.map((block) => block.id);
		selectedId = selectedIds.at(-1) ?? '';
		syncBufferGoo();
	}

	function deleteSelectedBlocks() {
		const selected = editableSelectedBlocks();
		if (selected.length === 0) return;
		rememberUndo();

		const ids = new Set(selected.map((block) => block.id));
		blocks = blocks.filter((block) => !ids.has(block.id));
		clearBlockSelection();
		syncBufferGoo();
	}

	function cutSelectedBlocks() {
		const selected = editableSelectedBlocks();
		if (selected.length === 0) return;
		copySelectedBlocks();
		deleteSelectedBlocks();
	}

	function pasteSelectedBlocks() {
		if (!canEditActiveWorkspace || blockClipboard.length === 0) return;
		rememberUndo();

		const minuteDelta = clipboardPasteDelta();
		const pasteLane =
			blockClipboard.length === 1 ? (selectedBlock?.lane ?? blockClipboard[0].lane) : null;
		const pasted = blockClipboard.map((block) => ({
			...shiftedBlock(block, minuteDelta, crypto.randomUUID()),
			lane: pasteLane ?? block.lane
		}));

		blocks = [...blocks, ...pasted];
		selectedIds = pasted.map((block) => block.id);
		selectedId = selectedIds.at(-1) ?? '';
		pasteCount += 1;
		syncBufferGoo();
	}

	function moveSelectedBlocks(minutes: number) {
		const selected = editableSelectedBlocks();
		if (selected.length === 0) return;
		rememberUndo();

		for (const block of selected) {
			block.start = blockTimeValue(blockMinute(block.start) + minutes);
			block.end = blockTimeValue(blockMinute(block.end) + minutes);
			block.advertisedStart = blockTimeValue(blockMinute(block.advertisedStart) + minutes);
			block.advertisedEnd = blockTimeValue(blockMinute(block.advertisedEnd) + minutes);
		}
		syncBufferGoo();
	}

	function moveSelectedBlocksLane(direction: number) {
		const selected = editableSelectedBlocks();
		if (selected.length === 0) return;
		rememberUndo();

		for (const block of selected) {
			const laneIndex = lanes.findIndex((lane) => lane.id === block.lane);
			const nextIndex = Math.max(0, Math.min(lanes.length - 1, laneIndex + direction));
			block.lane = lanes[nextIndex]?.id ?? block.lane;
		}
		syncBufferGoo();
	}

	function sortedBlocksForNavigation() {
		return [...blocks].sort((a, b) => {
			const laneDelta =
				lanes.findIndex((lane) => lane.id === a.lane) -
				lanes.findIndex((lane) => lane.id === b.lane);
			if (laneDelta !== 0) return laneDelta;
			return blockMinute(a.start) - blockMinute(b.start);
		});
	}

	function selectRelativeBlock(direction: 1 | -1) {
		const sorted = sortedBlocksForNavigation();
		if (sorted.length === 0) return;

		const currentIndex = Math.max(
			0,
			sorted.findIndex((block) => block.id === selectedId)
		);
		const nextIndex = Math.max(0, Math.min(sorted.length - 1, currentIndex + direction));
		selectSingleBlock(sorted[nextIndex].id);
	}

	function selectAdjacentLaneBlock(direction: 1 | -1) {
		if (!selectedBlock) {
			selectRelativeBlock(direction);
			return;
		}

		const laneIndex = lanes.findIndex((lane) => lane.id === selectedBlock.lane);
		const nextLane = lanes[Math.max(0, Math.min(lanes.length - 1, laneIndex + direction))];
		if (!nextLane) return;

		const selectedStart = blockMinute(selectedBlock.start);
		const candidate = blocks
			.filter((block) => block.lane === nextLane.id)
			.sort(
				(a, b) =>
					Math.abs(blockMinute(a.start) - selectedStart) -
					Math.abs(blockMinute(b.start) - selectedStart)
			)[0];
		if (candidate) selectSingleBlock(candidate.id);
	}

	function focusSelectedNotes() {
		if (!selectedBlock) return;
		const note = document.querySelector<HTMLTextAreaElement>(
			`textarea[data-block-notes="${selectedBlock.id}"]`
		);
		note?.focus();
	}

	async function saveTimelineNow() {
		const workspaceId = activeWorkspace?.id;
		if (data.mode !== 'supabase' || !workspaceId || !canEditActiveWorkspace) return;
		await autosaveTimeline(workspaceId, JSON.stringify(timelineSnapshot));
	}

	function runPlannerShortcut(intent: PlannerShortcutIntent) {
		if (intent.action === 'show-shortcuts') {
			showShortcutHelp = !showShortcutHelp;
			return true;
		}
		if (intent.action === 'clear-selection') {
			if (showShortcutHelp) {
				showShortcutHelp = false;
				return true;
			}
			clearBlockSelection();
			return true;
		}
		if (intent.action === 'undo') {
			undoLastPlannerEdit();
			return true;
		}
		if (intent.action === 'copy-selection') {
			copySelectedBlocks();
			return true;
		}
		if (intent.action === 'cut-selection') {
			cutSelectedBlocks();
			return true;
		}
		if (intent.action === 'paste-selection') {
			pasteSelectedBlocks();
			return true;
		}
		if (intent.action === 'new-block') {
			addBlock();
			return true;
		}
		if (intent.action === 'view-combined') {
			viewMode = 'combined';
			return true;
		}
		if (intent.action === 'view-advertised') {
			viewMode = 'advertised';
			return true;
		}
		if (intent.action === 'view-actual') {
			viewMode = 'actual';
			return true;
		}
		if (intent.action === 'zoom-in') {
			zoomTimelineDensity(1);
			return true;
		}
		if (intent.action === 'zoom-out') {
			zoomTimelineDensity(-1);
			return true;
		}
		if (intent.action === 'select-up') {
			selectRelativeBlock(-1);
			return true;
		}
		if (intent.action === 'select-down') {
			selectRelativeBlock(1);
			return true;
		}
		if (intent.action === 'select-left') {
			selectAdjacentLaneBlock(-1);
			return true;
		}
		if (intent.action === 'select-right') {
			selectAdjacentLaneBlock(1);
			return true;
		}
		if (intent.action === 'move-up') {
			moveSelectedBlocks(-(intent.step ?? 5));
			return true;
		}
		if (intent.action === 'move-down') {
			moveSelectedBlocks(intent.step ?? 5);
			return true;
		}
		if (intent.action === 'move-left') {
			moveSelectedBlocksLane(-1);
			return true;
		}
		if (intent.action === 'move-right') {
			moveSelectedBlocksLane(1);
			return true;
		}
		if (intent.action === 'duplicate-selection') {
			duplicateSelectedBlocks();
			return true;
		}
		if (intent.action === 'delete-selection') {
			deleteSelectedBlocks();
			return true;
		}
		if (intent.action === 'focus-notes') {
			focusSelectedNotes();
			return true;
		}
		if (intent.action === 'save-now') {
			void saveTimelineNow();
			return true;
		}

		return false;
	}

	function handlePlannerKeydown(event: KeyboardEvent) {
		const intent = plannerShortcutForEvent(event);
		if (!intent) return;
		if (!runPlannerShortcut(intent)) return;
		event.preventDefault();
		event.stopPropagation();
	}

	function updateViewMode(value: string) {
		if (isViewMode(value)) viewMode = value;
	}

	function updateSelectedLane(value: string) {
		if (!selectedBlock || !lanes.some((lane) => lane.id === value)) return;
		selectedBlock.lane = value;
		syncBufferGooAfterMutation();
	}

	function updateSelectedType(value: string) {
		if (!selectedBlock) return;
		if (value !== 'scheduled' && value !== 'planning' && value !== 'milestone') return;
		setBlockType(selectedBlock, value);
	}

	function updateSelectedOwner(value: string) {
		if (!selectedBlock) return;
		if (value === unassignedOwnerValue) {
			selectedBlock.owner = '';
			return;
		}
		selectedBlock.owner = ownerOptions.find((option) => option.value === value)?.label ?? value;
	}

	function updateSelectedVisibility(value: string) {
		if (!selectedBlock) return;
		if (value !== 'internal' && value !== 'external') return;
		selectedBlock.visibility = value;
	}

	function handleLaneClick(event: MouseEvent, laneId: string) {
		if (suppressNextLaneClick) {
			suppressNextLaneClick = false;
			return;
		}
		if (hasBlockSelection()) {
			clearBlockSelection();
			return;
		}
		if (!canEditActiveWorkspace) return;
		addBlockAt(laneId, visibleCenterMinute());
	}

	function handleLaneCreatePointerDown(event: PointerEvent, laneId: string) {
		if (event.button !== 0) return;
		if (hasBlockSelection()) {
			clearBlockSelection();
			suppressNextLaneClick = true;
			return;
		}
		if (!canEditActiveWorkspace) return;
		const laneElement = event.currentTarget;
		if (!(laneElement instanceof HTMLElement)) return;

		const startMinute = snappedMinuteFromClientY(laneElement, event.clientY);
		draftBlockCreate = {
			laneId,
			pointerId: event.pointerId,
			startMinute,
			endMinute: startMinute + 5
		};
		laneElement.setPointerCapture(event.pointerId);
	}

	function handleLaneCreatePointerMove(event: PointerEvent) {
		if (!draftBlockCreate || draftBlockCreate.pointerId !== event.pointerId) return;
		const laneElement = event.currentTarget;
		if (!(laneElement instanceof HTMLElement)) return;
		draftBlockCreate = {
			...draftBlockCreate,
			endMinute: snappedMinuteFromClientY(laneElement, event.clientY)
		};
	}

	function finishLaneCreateDrag(event: PointerEvent) {
		if (!draftBlockCreate || draftBlockCreate.pointerId !== event.pointerId) return;
		const laneElement = event.currentTarget;
		if (laneElement instanceof HTMLElement && laneElement.hasPointerCapture(event.pointerId)) {
			laneElement.releasePointerCapture(event.pointerId);
		}

		const startMinute = Math.min(draftBlockCreate.startMinute, draftBlockCreate.endMinute);
		const endMinute = Math.max(draftBlockCreate.startMinute, draftBlockCreate.endMinute);
		const isTap = endMinute - startMinute < 5;
		addBlockAt(draftBlockCreate.laneId, startMinute, isTap ? startMinute + 30 : endMinute);
		draftBlockCreate = null;
		suppressNextLaneClick = true;
	}

	function cancelLaneCreateDrag(event: PointerEvent) {
		if (!draftBlockCreate || draftBlockCreate.pointerId !== event.pointerId) return;
		draftBlockCreate = null;
	}

	function draftBlockStyle(draft: DraftBlockCreate) {
		const startMinute = Math.min(draft.startMinute, draft.endMinute);
		const endMinute = Math.max(draft.startMinute, draft.endMinute);
		const top = minuteToY(startMinute);
		const height = Math.max(20, heightBetweenMinutes(startMinute, endMinute));
		return `top:${top}px; height:${height}px;`;
	}

	function draftDurationLabel(draft: DraftBlockCreate) {
		const startMinute = Math.min(draft.startMinute, draft.endMinute);
		const endMinute = Math.max(draft.startMinute, draft.endMinute);
		return durationLabel(
			timelineTimeLabel(startMinute),
			timelineTimeLabel(Math.max(startMinute + 5, endMinute))
		);
	}

	function visibleCenterMinute() {
		const scrollTop = timelineScrollElement?.scrollTop ?? minuteToY(viewStartMinutes);
		const viewportHeight = timelineScrollElement?.clientHeight ?? 600;
		const headerHeight = 42;
		const minute = yToMinute(scrollTop + viewportHeight / 2 - headerHeight);
		return Math.max(viewStartMinutes, Math.min(viewEndMinutes - 5, Math.round(minute / 5) * 5));
	}

	function zoomTimelineDensity(direction: 1 | -1) {
		const scrollElement = timelineScrollElement;
		const centerMinute = visibleCenterMinute();
		const nextIndex = Math.max(
			0,
			Math.min(timelineDensitySteps.length - 1, timelineDensityIndex + direction)
		);
		if (nextIndex === timelineDensityIndex) return;

		timelineDensityIndex = nextIndex;
		queueMicrotask(() => {
			if (!scrollElement) return;
			const headerHeight = 42;
			scrollElement.scrollTop = Math.max(
				0,
				minuteToY(centerMinute) - scrollElement.clientHeight / 2 + headerHeight
			);
		});
	}

	function setBlockType(block: TimelineBlock, type: TimelineBlockType) {
		if (!canEditActiveWorkspace) return;
		block.type = type;
		if (type === 'milestone') {
			block.end = block.start;
			block.advertisedStart = block.start;
			block.advertisedEnd = block.start;
		}
		if (type === 'scheduled') {
			block.advertisedStart = block.start;
			block.advertisedEnd = block.end;
		}
		syncBufferGoo();
	}

	function syncMilestoneTime(block: TimelineBlock) {
		if (!isMilestone(block)) return;
		block.end = block.start;
		block.advertisedStart = block.start;
		block.advertisedEnd = block.start;
	}

	function setBlockIcon(block: TimelineBlock, icon: string) {
		if (!canEditActiveWorkspace) return;
		block.icon = icon;
	}
</script>

<svelte:window onkeydown={handlePlannerKeydown} />

<svelte:head>
	<title>Timeline Planner</title>
</svelte:head>

<main
	class="app-page [&_input]:w-full [&_input]:min-w-0 [&_select]:w-full [&_select]:min-w-0 [&_textarea]:w-full [&_textarea]:min-w-0"
>
	<div class="app-shell-grid">
		<WorkspaceSidebar
			active="planner"
			activeTimelineId={data.activeTimeline?.id}
			activeWorkspaceId={activeWorkspace?.id}
			events={sidebarEvents}
			mode={data.mode}
			plannerHref={plannerHref()}
			userEmail={data.userEmail}
			workspaces={data.workspaces}
			workspaceName={activeWorkspace?.name ?? pageTitle}
		/>

		<section
			class={[
				'planner-workspace relative grid h-svh min-h-0 min-w-0 overflow-hidden',
				selectedBlock ? 'has-details' : ''
			]}
		>
			<header class="app-topbar min-w-0">
				<div class="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
					<Calendar class="size-4" />
					<span class="max-w-[22rem] truncate text-[var(--app-text-muted)]">
						{activeWorkspace?.name ?? pageTitle}
					</span>
					<span class="text-[var(--app-text-subtle)]">/</span>
					<div class="min-w-[8rem] flex-[0_1_24rem]">
						<Input
							aria-label="Timeline title"
							class="h-8 border-0 bg-transparent px-1 py-0 text-sm leading-tight font-semibold tracking-normal text-[var(--app-text-secondary)] shadow-none hover:bg-[var(--app-soft-hover)] read-only:hover:bg-transparent focus:bg-[var(--app-soft-hover)] read-only:focus:bg-transparent focus-visible:ring-0"
							bind:value={timelineTitle}
							readonly={!canEditActiveWorkspace}
						/>
					</div>
					<Popover.Root>
						<Popover.Trigger
							type="button"
							disabled={!canEditActiveWorkspace}
							class="hidden max-w-[26rem] min-w-0 rounded-md px-2 py-1 text-left text-xs leading-tight font-medium text-[var(--app-text-muted)] transition hover:bg-[var(--app-soft-hover)] hover:text-[var(--app-text-secondary)] focus:bg-[var(--app-soft-hover)] focus:text-[var(--app-text-secondary)] focus:outline-none disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-[var(--app-text-muted)] lg:inline-flex"
							aria-label="Configure display view"
						>
							<span class="truncate">{displaySummary}</span>
						</Popover.Trigger>
						<Popover.Content side="bottom" align="start" sideOffset={8} class="w-[360px] p-4">
							<Popover.Title class="sr-only">Display view</Popover.Title>
							<div class="grid gap-4">
								<label class="app-label">
									Start
									<Input
										aria-label="Timeline date"
										class="h-10 px-3"
										type="datetime-local"
										bind:value={timelineStartsAt}
									/>
								</label>
								<label class="app-label">
									End
									<Input
										aria-label="Timeline end date and time"
										class="h-10 px-3"
										type="datetime-local"
										bind:value={timelineEndsAt}
									/>
								</label>
								<div class="grid grid-cols-2 gap-3">
									<label class="app-label">
										Before
										<Input
											aria-label="Display buffer before minutes"
											class="h-10 px-3"
											type="number"
											min="0"
											step="5"
											bind:value={padBefore}
										/>
									</label>
									<label class="app-label">
										After
										<Input
											aria-label="Display buffer after minutes"
											class="h-10 px-3"
											type="number"
											min="0"
											step="5"
											bind:value={padAfter}
										/>
									</label>
								</div>
							</div>
						</Popover.Content>
					</Popover.Root>
					{#if timelineStatusMessage}
						<span
							class="hidden max-w-[18rem] truncate rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 md:inline"
							title={timelineStatusMessage}
						>
							{timelineStatusMessage}
						</span>
					{/if}
				</div>
				<div class="flex shrink-0 items-center gap-2">
					{#if selectedIds.length > 1}
						<span
							class="rounded-md bg-[var(--app-soft)] px-2 py-1 text-xs font-medium text-[var(--app-text-muted)]"
						>
							{selectedIds.length} selected
						</span>
					{/if}
					{#if autosaveStatus === 'saving' || autosaveStatus === 'pending'}
						<span class="text-xs font-medium text-[var(--app-text-muted)]">Saving...</span>
					{:else if autosaveStatus === 'saved' && !timelineStatusMessage}
						<span class="text-xs font-medium text-[var(--app-accent)]">Saved</span>
					{/if}
					<div class="hidden items-center gap-1 md:flex" aria-label="Block edit actions">
						<button
							type="button"
							class="app-button grid size-8 place-items-center p-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)] disabled:cursor-default disabled:opacity-35 disabled:hover:text-[var(--app-text-muted)]"
							aria-label="Undo last planner edit"
							title="Undo"
							disabled={!hasUndoEntry}
							onclick={undoLastPlannerEdit}
						>
							<Undo2 class="size-4" />
						</button>
						<button
							type="button"
							class="app-button grid size-8 place-items-center p-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)] disabled:cursor-default disabled:opacity-35 disabled:hover:text-[var(--app-text-muted)]"
							aria-label="Copy selected block"
							title="Copy"
							disabled={!hasBlockSelection()}
							onclick={copySelectedBlocks}
						>
							<Copy class="size-4" />
						</button>
						<button
							type="button"
							class="app-button grid size-8 place-items-center p-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)] disabled:cursor-default disabled:opacity-35 disabled:hover:text-[var(--app-text-muted)]"
							aria-label="Cut selected block"
							title="Cut"
							disabled={!canEditActiveWorkspace || !hasBlockSelection()}
							onclick={cutSelectedBlocks}
						>
							<Scissors class="size-4" />
						</button>
						<button
							type="button"
							class="app-button grid size-8 place-items-center p-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)] disabled:cursor-default disabled:opacity-35 disabled:hover:text-[var(--app-text-muted)]"
							aria-label="Paste copied block"
							title="Paste"
							disabled={!canEditActiveWorkspace || !hasClipboardBlocks}
							onclick={pasteSelectedBlocks}
						>
							<ClipboardPaste class="size-4" />
						</button>
						<button
							type="button"
							class="app-button grid size-8 place-items-center p-0 text-[var(--app-text-muted)] hover:text-red-600 disabled:cursor-default disabled:opacity-35 disabled:hover:text-[var(--app-text-muted)]"
							aria-label="Delete selected block"
							title="Delete"
							disabled={!canEditActiveWorkspace || !hasBlockSelection()}
							onclick={deleteSelectedBlocks}
						>
							<Trash2 class="size-4" />
						</button>
					</div>
					<div class="hidden items-center gap-1 md:flex" aria-label="Timeline density">
						<button
							type="button"
							class="app-button grid size-8 place-items-center p-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)] disabled:cursor-default disabled:opacity-35 disabled:hover:text-[var(--app-text-muted)]"
							aria-label="Zoom timeline density out"
							title="Zoom out (-)"
							disabled={timelineDensityIndex === 0}
							onclick={() => zoomTimelineDensity(-1)}
						>
							<ZoomOut class="size-4" />
						</button>
						<span
							class="min-w-14 text-center text-xs font-black text-[var(--app-text-muted)] tabular-nums"
							title={`Approximately ${visibleDensityHours} hours visible`}
						>
							~{visibleDensityHours}h
						</span>
						<button
							type="button"
							class="app-button grid size-8 place-items-center p-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)] disabled:cursor-default disabled:opacity-35 disabled:hover:text-[var(--app-text-muted)]"
							aria-label="Zoom timeline density in"
							title="Zoom in (+)"
							disabled={timelineDensityIndex === timelineDensitySteps.length - 1}
							onclick={() => zoomTimelineDensity(1)}
						>
							<ZoomIn class="size-4" />
						</button>
					</div>
					<ToggleGroup.Root
						type="single"
						value={viewMode}
						onValueChange={updateViewMode}
						variant="outline"
						size="sm"
						class="hidden bg-muted/60 md:inline-flex"
					>
						{#each ['combined', 'advertised', 'actual'] as mode (mode)}
							<ToggleGroup.Item value={mode} class="capitalize">
								{mode}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<Popover.Root>
						<Popover.Trigger
							type="button"
							class="app-button grid size-8 place-items-center p-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
							aria-label="Show timeline key"
							title="Timeline key"
						>
							<HelpCircle class="size-4" />
						</Popover.Trigger>
						<Popover.Content side="bottom" align="end" sideOffset={8} class="w-[230px] p-3">
							<Popover.Title class="sr-only">Timeline key</Popover.Title>
							<PlannerLegend />
						</Popover.Content>
					</Popover.Root>
					<button
						type="button"
						class="app-button grid size-8 place-items-center p-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
						aria-label="Show keyboard shortcuts"
						title="Keyboard shortcuts"
						onclick={() => (showShortcutHelp = true)}
					>
						?
					</button>
					{#if activeWorkspace}
						<a class="app-button" href={`/timelines?workspace=${activeWorkspace.id}`}
							>All planners</a
						>
					{/if}
				</div>
			</header>

			<div class="min-h-0 min-w-0 overflow-hidden bg-[var(--app-panel)]">
				<section class="relative grid h-full min-h-0 min-w-0 grid-rows-[1fr] overflow-hidden">
					<div class="min-h-0 overflow-auto" data-timeline-scroll bind:this={timelineScrollElement}>
						<div
							class="relative grid"
							style={`width:max(100%, ${timelineWidth}px); min-height:${timelineHeight + 42}px; grid-template-columns:${timelineGridTemplate};`}
						>
							<div
								class="sticky top-0 z-20 grid h-[42px] content-center border-r border-b bg-white/95 px-3 text-xs font-black tracking-[0.08em] text-neutral-500 uppercase"
							>
								<span>Time</span>
								<span class="text-[10px] leading-none tracking-normal normal-case opacity-70">
									{timelineDateLabel(0, 'short')}
								</span>
							</div>
							{#each lanes as lane (lane.id)}
								<div
									class="sticky top-0 z-20 grid h-[42px] items-center border-r border-b bg-white/95 px-3 text-xs font-black tracking-[0.08em] text-neutral-500 uppercase"
								>
									{lane.label}
								</div>
							{/each}

							<div class="relative border-r bg-white" style={`height:${timelineHeight}px;`}>
								{#each timeBands as band (band.id)}
									<div
										class={[
											'pointer-events-none absolute inset-x-0',
											band.shaded ? 'bg-neutral-50/70' : 'bg-white'
										]}
										style={`top:${band.top}px; height:${band.height}px;`}
									></div>
								{/each}
								{#each collapsedTimeSegments as segment (segment.id)}
									<div
										class="pointer-events-none absolute inset-x-0 overflow-hidden bg-[repeating-linear-gradient(135deg,rgba(92,101,110,.11)_0_5px,rgba(92,101,110,.025)_5px_10px)]"
										style={`top:${segment.top}px; height:${segment.height}px;`}
									>
										<span
											class="absolute top-1/2 right-2 left-2 -translate-y-1/2 rounded bg-white/80 px-1.5 py-0.5 text-[9px] leading-none font-black tracking-[0.06em] text-neutral-500 uppercase"
										>
											{collapsedSegmentLabel(segment)}
										</span>
									</div>
								{/each}
								{#each timeTicks as tick (tick.id)}
									<div
										class="pointer-events-none absolute inset-x-0 border-t border-neutral-200/70"
										style={`top:${tick.top}px;`}
									></div>
									<div
										class="absolute right-3 -translate-y-1/2 text-xs font-bold text-neutral-500 tabular-nums"
										style={`top:${tick.top}px;`}
									>
										{tick.label}
									</div>
								{/each}
								{#each dateBoundaries as boundary (boundary.id)}
									<div
										class="pointer-events-none absolute inset-x-0 z-[1] border-t border-neutral-400/50"
										style={`top:${boundary.top}px;`}
									>
										<span
											class="absolute right-2 -translate-y-1/2 rounded bg-white px-1.5 py-0.5 text-[9px] leading-none font-black text-neutral-500 shadow-sm shadow-neutral-950/5"
										>
											{boundary.label}
										</span>
									</div>
								{/each}
							</div>

							{#each lanes as lane (lane.id)}
								{@const bufferMerges = laneBufferMerges(lane.id)}
								<div
									role="region"
									aria-label={`${lane.label} timeline lane`}
									data-timeline-lane={lane.id}
									class="relative border-r bg-white"
									style={`height:${timelineHeight}px;`}
								>
									{#each timeBands as band (band.id)}
										<div
											class={[
												'pointer-events-none absolute inset-x-0 z-0',
												band.shaded ? 'bg-neutral-50/70' : 'bg-white'
											]}
											style={`top:${band.top}px; height:${band.height}px;`}
										></div>
									{/each}
									{#each collapsedTimeSegments as segment (segment.id)}
										<div
											class="pointer-events-none absolute inset-x-0 z-0 overflow-hidden bg-[repeating-linear-gradient(135deg,rgba(92,101,110,.12)_0_5px,rgba(92,101,110,.03)_5px_10px)]"
											style={`top:${segment.top}px; height:${segment.height}px;`}
										>
											<span
												class="absolute top-1/2 left-3 -translate-y-1/2 rounded bg-white/80 px-1.5 py-0.5 text-[9px] leading-none font-black tracking-[0.08em] text-neutral-400 uppercase"
											>
												{collapsedSegmentLabel(segment)}
											</span>
										</div>
									{/each}
									{#each timeTicks as tick (tick.id)}
										<div
											class="pointer-events-none absolute inset-x-0 z-0 border-t border-neutral-200/70"
											style={`top:${tick.top}px;`}
										></div>
									{/each}
									{#each dateBoundaries as boundary (boundary.id)}
										<div
											class="pointer-events-none absolute inset-x-0 z-[1] border-t border-neutral-400/50"
											style={`top:${boundary.top}px;`}
										>
											<span
												class="absolute left-3 -translate-y-1/2 rounded bg-white px-1.5 py-0.5 text-[9px] leading-none font-black tracking-[0.06em] text-neutral-500 uppercase shadow-sm shadow-neutral-950/5"
											>
												{boundary.label}
											</span>
										</div>
									{/each}
									<button
										type="button"
										aria-label={`Drag to add block to ${lane.label}`}
										class="group/lane-add absolute inset-0 z-0 h-full w-full cursor-crosshair bg-transparent p-0 text-left focus-visible:ring-2 focus-visible:ring-neutral-950/15 focus-visible:outline-none disabled:cursor-default"
										disabled={!canEditActiveWorkspace}
										onpointerdown={(event) => handleLaneCreatePointerDown(event, lane.id)}
										onpointermove={handleLaneCreatePointerMove}
										onpointerup={finishLaneCreateDrag}
										onpointercancel={cancelLaneCreateDrag}
										onclick={(event) => handleLaneClick(event, lane.id)}
									></button>
									{#if draftBlockCreate?.laneId === lane.id}
										<div
											class="pointer-events-none absolute right-2 left-2 z-[15] rounded-md border border-neutral-700 bg-white/80 p-2 pr-14 text-xs font-black text-neutral-950 shadow-md shadow-neutral-950/10 transition-[top,height,box-shadow] duration-150 ease-out"
											style={draftBlockStyle(draftBlockCreate)}
										>
											New planning block
											<span
												class="absolute top-1/2 right-2 -translate-y-1/2 rounded-md border border-neutral-300 bg-white/95 px-1.5 py-0.5 text-[10px] leading-none font-black whitespace-nowrap text-neutral-600 shadow-sm shadow-neutral-950/10"
											>
												{draftDurationLabel(draftBlockCreate)}
											</span>
										</div>
									{/if}
									{#each bufferMerges as merge (merge.id)}
										<div
											class="pointer-events-none absolute right-2 left-2 z-[35] rounded-md bg-[repeating-linear-gradient(135deg,rgba(92,101,110,.13)_0_5px,rgba(92,101,110,.04)_5px_10px)] text-[10px] font-black tracking-[0.08em] text-neutral-500 uppercase opacity-80 ring-1 ring-neutral-300/30"
											style={mergedBufferStyle(merge)}
										>
											<span
												class="absolute top-1/2 left-2 -translate-y-1/2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] leading-none font-black text-neutral-600 shadow-sm shadow-neutral-950/10"
											>
												Buffer {merge.totalDuration}m
											</span>
											{#each mergedBufferTimeLabels(merge) as timeLabel (timeLabel.id)}
												<span
													class={[
														'absolute right-2 rounded bg-white/85 px-1.5 py-0.5 text-[10px] leading-none font-black tracking-normal text-neutral-600 tabular-nums shadow-sm shadow-neutral-950/10',
														timeLabel.align === 'above' ? '-translate-y-full' : '',
														timeLabel.align === 'center' ? '-translate-y-1/2' : '',
														timeLabel.align === 'below' ? 'translate-y-0' : ''
													]}
													style={timeLabel.style}
												>
													{timeLabel.time}
												</span>
											{/each}
											<button
												type="button"
												aria-label={`Separate buffers between ${merge.previous.title} and ${merge.next.title}`}
												title="Double-click to separate buffers"
												data-no-drag
												class="group/merged-buffer pointer-events-auto absolute right-10 left-10 z-10 flex h-8 -translate-y-1/2 touch-none items-center justify-center rounded-full focus-visible:outline-none enabled:cursor-ns-resize"
												style={mergedBufferHandleStyle(merge)}
												ondblclick={(event) => {
													event.stopPropagation();
													separateBufferMerge(merge);
												}}
												onclick={(event) => event.stopPropagation()}
											>
												<ChevronUp
													class="absolute -top-0.5 size-3 stroke-[3] text-neutral-500 opacity-0 transition-all duration-150 group-hover/merged-buffer:-top-2 group-hover/merged-buffer:text-neutral-800 group-hover/merged-buffer:opacity-70 group-focus-visible/merged-buffer:-top-2 group-focus-visible/merged-buffer:text-neutral-800 group-focus-visible/merged-buffer:opacity-70"
												/>
												<span
													class="h-1 w-16 rounded-full bg-neutral-500/35 shadow-[0_0_0_1px_rgba(255,255,255,0.65)] transition-all duration-150 ease-out group-hover/merged-buffer:h-2 group-hover/merged-buffer:w-full group-hover/merged-buffer:bg-neutral-900 group-hover/merged-buffer:shadow-[0_0_0_2px_rgba(255,255,255,0.9)] group-focus-visible/merged-buffer:h-2 group-focus-visible/merged-buffer:w-full group-focus-visible/merged-buffer:bg-neutral-900 group-focus-visible/merged-buffer:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
												></span>
												<ChevronDown
													class="absolute -bottom-0.5 size-3 stroke-[3] text-neutral-500 opacity-0 transition-all duration-150 group-hover/merged-buffer:-bottom-2 group-hover/merged-buffer:text-neutral-800 group-hover/merged-buffer:opacity-70 group-focus-visible/merged-buffer:-bottom-2 group-focus-visible/merged-buffer:text-neutral-800 group-focus-visible/merged-buffer:opacity-70"
												/>
											</button>
										</div>
									{/each}
									{#each laneBlocks(lane.id) as block (block.id)}
										{@const range = visibleRange(block)}
										<div
											role="button"
											tabindex="0"
											aria-pressed={isBlockSelected(block.id)}
											data-timeline-block={block.id}
											class={[
												'group absolute right-2 left-2 z-10 rounded-lg select-none',
												canEditActiveWorkspace ? 'touch-none' : ''
											]}
											class:z-20={isBlockSelected(block.id)}
											class:z-30={selectedId === block.id}
											style={`top:${blockTop(block)}px; height:${blockHeight(block)}px;`}
											use:timelineBlockDrag={{
												block,
												laneSelector: '[data-timeline-lane]',
												minuteHeight,
												pixelToMinute: snappedMinuteFromY,
												onSelect: prepareBlockDragSelection,
												getDragBlocks: selectedDragBlocks,
												onChange: syncBufferGooAfterMutation,
												disabled: !canEditActiveWorkspace
											}}
											onpointerdown={(event) => handleBlockPointerDown(event, block.id)}
											onclick={(event) => handleBlockClick(event, block.id)}
											onkeydown={(event) => handleBlockKeydown(event, block.id)}
										>
											{#if hasAdvertisedLayer(block)}
												<div
													class={[
														'pointer-events-none absolute inset-x-0 z-10 rounded-md border-2 border-dashed border-violet-600 bg-transparent transition-opacity',
														advertisedChanged(block)
															? 'opacity-100'
															: 'opacity-0 group-focus-within:opacity-40 group-hover:opacity-40'
													]}
													style={advertisedBoxStyle(block)}
												></div>
												{#if advertisedChanged(block)}
													<div
														class="pointer-events-none absolute right-10 z-20 grid w-12 grid-rows-[auto_1fr_auto] place-items-center text-[10px] font-black text-violet-700 tabular-nums"
														style={advertisedBoxStyle(block)}
													>
														<span
															class="rounded-full bg-white/90 px-1 shadow-[0_0_0_1px_rgba(124,58,237,0.25)]"
															>{timelineMinuteDisplay(blockMinute(block.advertisedStart))}</span
														>
														<span class="relative h-full w-px bg-violet-600/45">
															<span
																class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-violet-300 bg-white/95 px-1.5 py-0.5 text-[10px] leading-none font-black whitespace-nowrap text-violet-700 shadow-sm shadow-violet-950/10"
															>
																{advertisedDurationLabel(block)}
															</span>
														</span>
														<span
															class="rounded-full bg-white/90 px-1 shadow-[0_0_0_1px_rgba(124,58,237,0.25)]"
															>{timelineMinuteDisplay(blockMinute(block.advertisedEnd))}</span
														>
													</div>
												{/if}
												{#if canEditActiveWorkspace && selectedId === block.id}
													<button
														type="button"
														aria-label="Resize advertised start"
														data-no-drag
														class="group/advertised-resize absolute inset-x-0 z-40 flex h-6 touch-none items-center justify-end rounded-md px-3 focus-visible:outline-none enabled:cursor-ns-resize disabled:cursor-default"
														style={advertisedHandleStyle(block, 'start')}
														disabled={!canEditActiveWorkspace}
														use:timelineActualResizeHandle={{
															block,
															edge: 'start',
															target: 'advertised',
															laneSelector: '[data-timeline-lane]',
															minuteHeight,
															pixelToMinute: snappedMinuteFromY,
															onSelect: prepareBlockDragSelection,
															viewStartMinutes,
															onChange: syncBufferGooAfterMutation,
															disabled: !canEditActiveWorkspace
														}}
													>
														<ChevronUp
															class="absolute -top-0.5 right-12 size-3 stroke-[3] text-violet-500 opacity-0 transition-all duration-150 group-hover/advertised-resize:-top-2 group-hover/advertised-resize:text-violet-700 group-hover/advertised-resize:opacity-75 group-focus-visible/advertised-resize:-top-2 group-focus-visible/advertised-resize:text-violet-700 group-focus-visible/advertised-resize:opacity-75"
														/>
														<span
															class="h-1 w-12 rounded-full bg-violet-500/35 shadow-[0_0_0_1px_rgba(255,255,255,0.65)] transition-all duration-150 ease-out group-hover/advertised-resize:h-2 group-hover/advertised-resize:w-24 group-hover/advertised-resize:bg-violet-700 group-hover/advertised-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)] group-focus-visible/advertised-resize:h-2 group-focus-visible/advertised-resize:w-24 group-focus-visible/advertised-resize:bg-violet-700 group-focus-visible/advertised-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
														></span>
													</button>
													<button
														type="button"
														aria-label="Resize advertised end"
														data-no-drag
														class="group/advertised-resize absolute inset-x-0 z-40 flex h-6 touch-none items-center justify-end rounded-md px-3 focus-visible:outline-none enabled:cursor-ns-resize disabled:cursor-default"
														style={advertisedHandleStyle(block, 'end')}
														disabled={!canEditActiveWorkspace}
														use:timelineActualResizeHandle={{
															block,
															edge: 'end',
															target: 'advertised',
															laneSelector: '[data-timeline-lane]',
															minuteHeight,
															pixelToMinute: snappedMinuteFromY,
															onSelect: prepareBlockDragSelection,
															viewStartMinutes,
															onChange: syncBufferGooAfterMutation,
															disabled: !canEditActiveWorkspace
														}}
													>
														<ChevronDown
															class="absolute right-12 -bottom-0.5 size-3 stroke-[3] text-violet-500 opacity-0 transition-all duration-150 group-hover/advertised-resize:-bottom-2 group-hover/advertised-resize:text-violet-700 group-hover/advertised-resize:opacity-75 group-focus-visible/advertised-resize:-bottom-2 group-focus-visible/advertised-resize:text-violet-700 group-focus-visible/advertised-resize:opacity-75"
														/>
														<span
															class="h-1 w-12 rounded-full bg-violet-500/35 shadow-[0_0_0_1px_rgba(255,255,255,0.65)] transition-all duration-150 ease-out group-hover/advertised-resize:h-2 group-hover/advertised-resize:w-24 group-hover/advertised-resize:bg-violet-700 group-hover/advertised-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)] group-focus-visible/advertised-resize:h-2 group-focus-visible/advertised-resize:w-24 group-focus-visible/advertised-resize:bg-violet-700 group-focus-visible/advertised-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
														></span>
													</button>
												{/if}
											{/if}

											{#if canEditActiveWorkspace && selectedId === block.id && !range.advertisedOnly && range.before === 0 && viewMode !== 'advertised'}
												<button
													type="button"
													aria-label="Add buffer time before"
													title="Add buffer time"
													data-no-drag
													class="absolute left-1/2 z-[60] grid size-7 -translate-x-1/2 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-800 opacity-0 shadow-md shadow-neutral-950/15 transition-all duration-150 ease-out hover:scale-110 hover:border-neutral-900 hover:bg-neutral-950 hover:text-white hover:opacity-100 focus-visible:scale-110 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-neutral-950/20 focus-visible:outline-none active:scale-95"
													style={addBufferButtonStyle(block, 'before')}
													onclick={(event) => {
														event.stopPropagation();
														block.bufferBefore = 10;
														syncBufferGoo();
													}}
												>
													<Plus class="size-4" />
												</button>
											{/if}

											{#if !range.advertisedOnly && range.before > 0 && !isBufferMerged(bufferMerges, block, 'before')}
												<div
													class="absolute inset-x-0 flex items-center bg-[repeating-linear-gradient(135deg,rgba(92,101,110,.12)_0_5px,rgba(92,101,110,.035)_5px_10px)] px-2 pr-14 text-[10px] font-black tracking-[0.08em] text-neutral-500 uppercase opacity-70"
													style={bufferBeforeStyle(block)}
												>
													Buffer {range.before}m
													<span
														class="absolute top-1 right-2 rounded bg-white/75 px-1.5 py-0.5 text-[10px] leading-none font-black tracking-normal text-neutral-600 tabular-nums"
													>
														{bufferStartLabel(block)}
													</span>
													<button
														type="button"
														aria-label="Resize buffer before"
														data-no-drag
														class="group/buffer-resize absolute inset-x-12 -top-3 z-10 flex h-6 touch-none items-center justify-center rounded-full opacity-0 transition-opacity duration-150 focus-visible:opacity-100 focus-visible:outline-none enabled:cursor-ns-resize group-hover:enabled:opacity-100 disabled:cursor-default"
														disabled={!canEditActiveWorkspace}
														use:timelineBufferResizeHandle={{
															block,
															edge: 'before',
															laneSelector: '[data-timeline-lane]',
															minuteHeight,
															pixelToMinute: snappedMinuteFromY,
															onSelect: prepareBlockDragSelection,
															viewStartMinutes,
															onResizeStart: forgetBufferCapacityForBlockEdge,
															onChange: syncBufferGooAfterMutation,
															disabled: !canEditActiveWorkspace
														}}
													>
														<span
															class="h-1 w-12 rounded-full bg-neutral-500/35 shadow-[0_0_0_1px_rgba(255,255,255,0.65)] transition-all duration-150 ease-out group-hover/buffer-resize:h-2 group-hover/buffer-resize:w-full group-hover/buffer-resize:bg-neutral-900 group-hover/buffer-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)] group-focus-visible/buffer-resize:h-2 group-focus-visible/buffer-resize:w-full group-focus-visible/buffer-resize:bg-neutral-900 group-focus-visible/buffer-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
														></span>
													</button>
												</div>
											{/if}

											{#if canEditActiveWorkspace && selectedId === block.id && viewMode !== 'advertised' && !isMilestone(block)}
												<button
													type="button"
													aria-label="Resize actual start"
													data-no-drag
													class="group/actual-resize absolute right-24 left-3 z-50 flex h-6 touch-none items-center justify-center rounded-full focus-visible:outline-none enabled:cursor-ns-resize disabled:cursor-default"
													style={actualHandleStyle(block, 'start')}
													disabled={!canEditActiveWorkspace}
													use:timelineActualResizeHandle={{
														block,
														edge: 'start',
														laneSelector: '[data-timeline-lane]',
														minuteHeight,
														pixelToMinute: snappedMinuteFromY,
														onSelect: prepareBlockDragSelection,
														viewStartMinutes,
														onChange: syncBufferGooAfterMutation,
														disabled: !canEditActiveWorkspace
													}}
												>
													<ChevronUp
														class="absolute -top-0.5 size-3 stroke-[3] text-neutral-500 opacity-0 transition-all duration-150 group-hover/actual-resize:-top-2 group-hover/actual-resize:text-neutral-800 group-hover/actual-resize:opacity-70 group-focus-visible/actual-resize:-top-2 group-focus-visible/actual-resize:text-neutral-800 group-focus-visible/actual-resize:opacity-70"
													/>
													<span
														class={[
															'h-1 w-16 rounded-full bg-neutral-500/35 shadow-[0_0_0_1px_rgba(255,255,255,0.65)] transition-all duration-150 ease-out',
															canEditActiveWorkspace
																? 'group-hover/actual-resize:h-2 group-hover/actual-resize:w-full group-hover/actual-resize:bg-neutral-900 group-hover/actual-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)] group-focus-visible/actual-resize:h-2 group-focus-visible/actual-resize:w-full group-focus-visible/actual-resize:bg-neutral-900 group-focus-visible/actual-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]'
																: ''
														]}
													></span>
												</button>
												<button
													type="button"
													aria-label="Resize actual end"
													data-no-drag
													class="group/actual-resize absolute right-24 left-3 z-50 flex h-6 touch-none items-center justify-center rounded-full focus-visible:outline-none enabled:cursor-ns-resize disabled:cursor-default"
													style={actualHandleStyle(block, 'end')}
													disabled={!canEditActiveWorkspace}
													use:timelineActualResizeHandle={{
														block,
														edge: 'end',
														laneSelector: '[data-timeline-lane]',
														minuteHeight,
														pixelToMinute: snappedMinuteFromY,
														onSelect: prepareBlockDragSelection,
														viewStartMinutes,
														onChange: syncBufferGooAfterMutation,
														disabled: !canEditActiveWorkspace
													}}
												>
													<ChevronDown
														class="absolute -bottom-0.5 size-3 stroke-[3] text-neutral-500 opacity-0 transition-all duration-150 group-hover/actual-resize:-bottom-2 group-hover/actual-resize:text-neutral-800 group-hover/actual-resize:opacity-70 group-focus-visible/actual-resize:-bottom-2 group-focus-visible/actual-resize:text-neutral-800 group-focus-visible/actual-resize:opacity-70"
													/>
													<span
														class={[
															'h-1 w-16 rounded-full bg-neutral-500/35 shadow-[0_0_0_1px_rgba(255,255,255,0.65)] transition-all duration-150 ease-out',
															canEditActiveWorkspace
																? 'group-hover/actual-resize:h-2 group-hover/actual-resize:w-full group-hover/actual-resize:bg-neutral-900 group-hover/actual-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)] group-focus-visible/actual-resize:h-2 group-focus-visible/actual-resize:w-full group-focus-visible/actual-resize:bg-neutral-900 group-focus-visible/actual-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]'
																: ''
														]}
													></span>
												</button>
											{/if}

											<div
												class={[
													'absolute inset-x-0 transition-[border-color,box-shadow,filter]',
													isMilestone(block)
														? 'z-30 overflow-visible rounded-none border-0 bg-transparent p-0 pr-0 text-amber-950 shadow-none'
														: [
																'overflow-hidden rounded-md border p-2 pr-14 pb-8 shadow-sm shadow-neutral-950/10 transition-shadow group-hover:shadow-md group-hover:shadow-neutral-950/10',
																blockColors(block.type),
																isBlockSelected(block.id)
																	? 'border-neutral-700 shadow-md shadow-neutral-950/15'
																	: ''
															]
												]}
												style={actualCardStyle(block)}
											>
												{#if isMilestone(block)}
													<div
														class="pointer-events-none absolute inset-x-0 top-0 border-t-2 border-amber-700/80 shadow-[0_1px_0_rgba(255,255,255,0.9)]"
													>
														<span
															class="absolute top-0 right-0 -translate-y-1/2 rounded-full border border-amber-200 bg-white px-1.5 py-0.5 text-[10px] leading-none font-black text-amber-800 tabular-nums shadow-sm"
														>
															{timelineMinuteDisplay(blockMinute(block.start))}
														</span>
													</div>
												{/if}
												<div
													class={[
														'grid text-left text-[13px] leading-5 font-black',
														isMilestone(block)
															? 'relative z-10 mt-3 grid-cols-[22px_minmax(0,1fr)] items-center gap-1 rounded-md bg-white/80 px-1 py-0.5 shadow-sm shadow-amber-950/10'
															: 'grid-cols-[20px_minmax(0,1fr)] items-center gap-1'
													]}
												>
													<div class="relative -ml-0.5">
														<BlockIconPicker
															ariaLabel={`Change icon for ${block.title}`}
															disabled={!canEditActiveWorkspace}
															icon={block.icon}
															onSelect={(icon) => setBlockIcon(block, icon)}
															title={block.title}
															type={block.type}
														/>
													</div>
													<input
														aria-label={`Title for ${block.title}`}
														class="min-w-0 rounded bg-transparent px-0 py-0 font-black hover:bg-white/50 read-only:hover:bg-transparent focus:bg-white/90 focus:ring-2 focus:ring-blue-600/20 focus:outline-none read-only:focus:bg-transparent read-only:focus:ring-0"
														bind:value={block.title}
														readonly={!canEditActiveWorkspace}
														onclick={(event) => event.stopPropagation()}
													/>
												</div>

												{#if !isMilestone(block)}
													<textarea
														aria-label={`Notes for ${block.title}`}
														data-block-notes={block.id}
														data-no-drag
														class="mt-1 block w-full resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 pr-1 text-xs leading-4 font-medium text-neutral-700 outline-none placeholder:text-neutral-400 read-only:cursor-default focus:text-neutral-950 focus:ring-0"
														rows="3"
														placeholder="Add notes, responsibilities, links, or callouts here."
														bind:value={block.notes}
														readonly={!canEditActiveWorkspace}
														onfocus={() => selectSingleBlock(block.id)}
														onpointerdown={(event) => event.stopPropagation()}
														onclick={(event) => event.stopPropagation()}
														onkeydown={(event) => event.stopPropagation()}
													></textarea>

													<div
														class="pointer-events-none absolute top-3 right-2 bottom-3 grid w-12 grid-rows-[auto_1fr_auto] place-items-center text-[10px] font-black text-neutral-700 tabular-nums"
													>
														<span>{displayedStartLabel(block)}</span>
														<span class="relative h-full w-px bg-neutral-950/25">
															<span
																class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-neutral-300 bg-white/95 px-1.5 py-0.5 text-[10px] leading-none font-black whitespace-nowrap text-neutral-600 shadow-sm shadow-neutral-950/10"
															>
																{displayedDurationLabel(block)}
															</span>
														</span>
														<span>{displayedEndLabel(block)}</span>
													</div>
													{#if block.owner}
														<div
															class="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-full border border-neutral-200 bg-white/95 py-0.5 pr-2 pl-0.5 text-[10px] leading-none font-semibold text-neutral-600 shadow-sm shadow-neutral-950/10"
														>
															<span
																class="grid size-4 shrink-0 place-items-center rounded-full bg-neutral-950 text-[8px] font-black text-white"
															>
																{ownerInitials(block.owner)}
															</span>
															<span class="truncate">{block.owner}</span>
														</div>
													{/if}
												{/if}
											</div>

											{#if !range.advertisedOnly && range.after > 0 && !isBufferMerged(bufferMerges, block, 'after')}
												<div
													class="absolute inset-x-0 flex items-center bg-[repeating-linear-gradient(135deg,rgba(92,101,110,.12)_0_5px,rgba(92,101,110,.035)_5px_10px)] px-2 pr-14 text-[10px] font-black tracking-[0.08em] text-neutral-500 uppercase opacity-70"
													style={bufferAfterStyle(block)}
												>
													{range.after}m Buffer
													<span
														class="absolute right-2 bottom-1 rounded bg-white/75 px-1.5 py-0.5 text-[10px] leading-none font-black tracking-normal text-neutral-600 tabular-nums"
													>
														{bufferEndLabel(block)}
													</span>
													<button
														type="button"
														aria-label="Resize buffer after"
														data-no-drag
														class="group/buffer-resize absolute inset-x-12 -bottom-3 z-10 flex h-6 touch-none items-center justify-center rounded-full opacity-0 transition-opacity duration-150 focus-visible:opacity-100 focus-visible:outline-none enabled:cursor-ns-resize group-hover:enabled:opacity-100 disabled:cursor-default"
														disabled={!canEditActiveWorkspace}
														use:timelineBufferResizeHandle={{
															block,
															edge: 'after',
															laneSelector: '[data-timeline-lane]',
															minuteHeight,
															pixelToMinute: snappedMinuteFromY,
															onSelect: prepareBlockDragSelection,
															viewStartMinutes,
															onResizeStart: forgetBufferCapacityForBlockEdge,
															onChange: syncBufferGooAfterMutation,
															disabled: !canEditActiveWorkspace
														}}
													>
														<span
															class="h-1 w-12 rounded-full bg-neutral-500/35 shadow-[0_0_0_1px_rgba(255,255,255,0.65)] transition-all duration-150 ease-out group-hover/buffer-resize:h-2 group-hover/buffer-resize:w-full group-hover/buffer-resize:bg-neutral-900 group-hover/buffer-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)] group-focus-visible/buffer-resize:h-2 group-focus-visible/buffer-resize:w-full group-focus-visible/buffer-resize:bg-neutral-900 group-focus-visible/buffer-resize:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
														></span>
													</button>
												</div>
											{/if}
											{#if canEditActiveWorkspace && selectedId === block.id && !range.advertisedOnly && range.after === 0 && viewMode !== 'advertised'}
												<button
													type="button"
													aria-label="Add buffer time after"
													title="Add buffer time"
													data-no-drag
													class="absolute left-1/2 z-[60] grid size-7 -translate-x-1/2 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-800 opacity-0 shadow-md shadow-neutral-950/15 transition-all duration-150 ease-out hover:scale-110 hover:border-neutral-900 hover:bg-neutral-950 hover:text-white hover:opacity-100 focus-visible:scale-110 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-neutral-950/20 focus-visible:outline-none active:scale-95"
													style={addBufferButtonStyle(block, 'after')}
													onclick={(event) => {
														event.stopPropagation();
														block.bufferAfter = 10;
														syncBufferGoo();
													}}
												>
													<Plus class="size-4" />
												</button>
											{/if}
										</div>
									{/each}
								</div>
							{/each}

							{#if nowMinutes >= viewStartMinutes && nowMinutes <= viewEndMinutes}
								<div
									class="pointer-events-none absolute right-0 left-0 z-30 h-0.5 bg-red-600"
									style={`top:${42 + minuteToY(nowMinutes)}px;`}
								>
									<span
										class="absolute -top-3 left-3 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white"
										>Now</span
									>
								</div>
							{/if}
						</div>
					</div>
					{#if canEditActiveWorkspace}
						<div
							class="pointer-events-none absolute bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2"
							aria-label="Timeline actions"
						>
							<button
								type="button"
								class="pointer-events-auto grid size-11 place-items-center rounded-full bg-[var(--app-accent)] text-[var(--app-accent-foreground)] shadow-[var(--app-shadow-popover)] transition hover:-translate-y-0.5 hover:bg-[var(--app-accent-active)] focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] focus-visible:outline-none"
								title="Add block"
								aria-label="Add block"
								onclick={addBlock}
							>
								<Plus class="size-5" />
							</button>
							{#if data.mode === 'supabase' && activeWorkspace}
								<form class="pointer-events-auto" method="POST" action="?/createBlankTimeline">
									<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
									<input type="hidden" name="title" value="New run of show" />
									<button
										type="submit"
										class="grid size-10 place-items-center rounded-full border border-[var(--app-line)] bg-[var(--app-panel)] text-[var(--app-text-muted)] shadow-[var(--app-shadow)] transition hover:-translate-y-0.5 hover:text-[var(--app-text)] focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] focus-visible:outline-none"
										title="New planner"
										aria-label="New planner"
									>
										<FilePlus class="size-4" />
									</button>
								</form>
								{#if data.activeTimeline?.id}
									<form class="pointer-events-auto" method="POST" action="?/duplicateTimeline">
										<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
										<input type="hidden" name="timelineId" value={data.activeTimeline.id} />
										<button
											type="submit"
											class="grid size-10 place-items-center rounded-full border border-[var(--app-line)] bg-[var(--app-panel)] text-[var(--app-text-muted)] shadow-[var(--app-shadow)] transition hover:-translate-y-0.5 hover:text-[var(--app-text)] focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] focus-visible:outline-none"
											title="Duplicate planner"
											aria-label="Duplicate planner"
										>
											<Copy class="size-4" />
										</button>
									</form>
								{/if}
							{/if}
						</div>
					{/if}
				</section>
			</div>
			{#if selectedBlock}
				<aside
					class="planner-details-sheet fixed inset-0 z-[90] overflow-y-auto border-l border-[var(--app-line)] bg-[var(--app-panel)] text-[var(--app-text)] shadow-[var(--app-shadow-popover)]"
					aria-label="Selected block details"
					data-selected-block-details
				>
					<div
						class="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-[var(--app-line)] bg-[var(--app-panel)] px-3"
					>
						<p class="truncate text-xs font-semibold text-[var(--app-text-muted)]">Block details</p>
						<button
							type="button"
							class="grid size-7 place-items-center rounded-md text-[var(--app-text-muted)] transition hover:bg-[var(--app-soft-hover)] hover:text-[var(--app-text)] focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] focus-visible:outline-none"
							aria-label="Close selected block details"
							onclick={() => {
								selectedId = '';
								selectedIds = [];
							}}
						>
							<X class="size-4" />
						</button>
					</div>

					<div class="mx-auto grid max-w-[520px] gap-6 px-8 pt-12 pb-10">
						<div class="grid gap-3">
							<div class="flex items-center">
								<BlockIconPicker
									ariaLabel="Change block icon"
									disabled={!canEditActiveWorkspace}
									icon={selectedBlock.icon}
									onSelect={(icon) => setBlockIcon(selectedBlock, icon)}
									title={selectedBlock.title}
									type={selectedBlock.type}
								/>
							</div>
							<Input
								aria-label="Selected block title"
								class="h-auto min-w-0 border-0 bg-transparent px-0 py-1 text-[34px] leading-tight font-bold tracking-normal text-[var(--app-text)] shadow-none hover:bg-[var(--app-soft-hover)] focus:bg-[var(--app-soft-hover)] focus-visible:ring-0"
								bind:value={selectedBlock.title}
								readonly={!canEditActiveWorkspace}
							/>
						</div>

						<div class="grid gap-1">
							<div class="notion-property-row">
								<span>Lane</span>
								<Select.Root
									type="single"
									value={selectedBlock.lane}
									onValueChange={updateSelectedLane}
									disabled={!canEditActiveWorkspace}
									items={lanes.map((lane) => ({ value: lane.id, label: lane.label }))}
								>
									<Select.Trigger
										aria-label="Selected block lane"
										class="notion-property-field h-8 w-full justify-between"
									>
										<span class="truncate">{laneLabel(selectedBlock.lane)}</span>
									</Select.Trigger>
									<Select.Content align="end">
										<Select.Group>
											{#each lanes as lane (lane.id)}
												<Select.Item value={lane.id} label={lane.label} />
											{/each}
										</Select.Group>
									</Select.Content>
								</Select.Root>
							</div>
							<div class="notion-property-row">
								<span>Type</span>
								<Select.Root
									type="single"
									value={selectedBlock.type}
									disabled={!canEditActiveWorkspace}
									onValueChange={updateSelectedType}
									items={[
										{ value: 'scheduled', label: 'Scheduled' },
										{ value: 'planning', label: 'Planning' },
										{ value: 'milestone', label: 'Milestone' }
									]}
								>
									<Select.Trigger
										aria-label="Selected block type"
										class="notion-property-field h-8 w-full justify-between"
									>
										<span class="truncate">{typeLabel(selectedBlock.type)}</span>
									</Select.Trigger>
									<Select.Content align="end">
										<Select.Group>
											<Select.Item value="scheduled" label="Scheduled" />
											<Select.Item value="planning" label="Planning" />
											<Select.Item value="milestone" label="Milestone" />
										</Select.Group>
									</Select.Content>
								</Select.Root>
							</div>
							<div class="notion-property-row">
								<span>Owner</span>
								<Select.Root
									type="single"
									value={selectedOwnerValue}
									disabled={!canEditActiveWorkspace}
									onValueChange={updateSelectedOwner}
									items={[
										{ value: unassignedOwnerValue, label: 'Unassigned' },
										...ownerOptions.map((owner) => ({ value: owner.value, label: owner.label }))
									]}
								>
									<Select.Trigger
										aria-label="Selected block owner"
										class="notion-property-field h-8 w-full justify-between"
									>
										<span class="flex min-w-0 items-center gap-2">
											<span
												class="grid size-5 shrink-0 place-items-center rounded-full bg-neutral-950 text-[9px] font-black text-white"
											>
												{ownerInitials(selectedBlock.owner || 'Unassigned')}
											</span>
											<span class="truncate">{selectedBlock.owner || 'Unassigned'}</span>
										</span>
									</Select.Trigger>
									<Select.Content align="end" class="z-[130]">
										<Select.Group>
											<Select.Item value={unassignedOwnerValue} label="Unassigned">
												<span
													class="grid size-5 shrink-0 place-items-center rounded-full bg-neutral-200 text-[9px] font-black text-neutral-600"
												>
													U
												</span>
												<span class="truncate">Unassigned</span>
											</Select.Item>
											{#each ownerOptions as owner (owner.value)}
												<Select.Item value={owner.value} label={owner.label}>
													{#if owner.avatarUrl}
														<img
															src={owner.avatarUrl}
															alt=""
															class="size-5 shrink-0 rounded-full object-cover"
														/>
													{:else}
														<span
															class="grid size-5 shrink-0 place-items-center rounded-full bg-neutral-950 text-[9px] font-black text-white"
														>
															{owner.initials}
														</span>
													{/if}
													<span class="grid min-w-0">
														<span class="truncate">{owner.label}</span>
														<span class="truncate text-[11px] font-medium text-neutral-500">
															{owner.subtitle}
														</span>
													</span>
												</Select.Item>
											{/each}
										</Select.Group>
									</Select.Content>
								</Select.Root>
							</div>
							<div class="notion-property-row">
								<span>Visibility</span>
								<Select.Root
									type="single"
									value={selectedBlock.visibility}
									disabled={!canEditActiveWorkspace}
									onValueChange={updateSelectedVisibility}
									items={[
										{ value: 'internal', label: 'Internal' },
										{ value: 'external', label: 'External' }
									]}
								>
									<Select.Trigger
										aria-label="Selected block visibility"
										class="notion-property-field h-8 w-full justify-between"
									>
										<span class="truncate">{visibilityLabel(selectedBlock.visibility)}</span>
									</Select.Trigger>
									<Select.Content align="end" class="z-[130]">
										<Select.Group>
											<Select.Item value="internal" label="Internal" />
											<Select.Item value="external" label="External" />
										</Select.Group>
									</Select.Content>
								</Select.Root>
							</div>
							<label class="notion-property-row">
								<span>{isMilestone(selectedBlock) ? 'Time' : 'Actual start'}</span>
								<Input
									aria-label="Selected block actual start"
									class="notion-property-field"
									type="time"
									bind:value={selectedBlock.start}
									readonly={!canEditActiveWorkspace}
									onchange={() => {
										syncMilestoneTime(selectedBlock);
										syncBufferGoo();
									}}
								/>
							</label>
							{#if !isMilestone(selectedBlock)}
								<label class="notion-property-row">
									<span>Actual end</span>
									<Input
										aria-label="Selected block actual end"
										class="notion-property-field"
										type="time"
										bind:value={selectedBlock.end}
										readonly={!canEditActiveWorkspace}
										onchange={syncBufferGooAfterMutation}
									/>
								</label>
							{/if}
							{#if hasAdvertisedLayer(selectedBlock)}
								<label class="notion-property-row">
									<span>Advertised start</span>
									<Input
										aria-label="Selected block advertised start"
										class="notion-property-field"
										type="time"
										bind:value={selectedBlock.advertisedStart}
										readonly={!canEditActiveWorkspace}
									/>
								</label>
								<label class="notion-property-row">
									<span>Advertised end</span>
									<Input
										aria-label="Selected block advertised end"
										class="notion-property-field"
										type="time"
										bind:value={selectedBlock.advertisedEnd}
										readonly={!canEditActiveWorkspace}
									/>
								</label>
							{/if}
							<label class="notion-property-row">
								<span>Buffer before</span>
								<Input
									aria-label="Selected block buffer before minutes"
									class="notion-property-field"
									type="number"
									min="0"
									step="5"
									bind:value={selectedBlock.bufferBefore}
									readonly={!canEditActiveWorkspace}
									onfocus={() => forgetBufferCapacityForBlockEdge(selectedBlock, 'before')}
									onchange={syncBufferGooAfterMutation}
								/>
							</label>
							<label class="notion-property-row">
								<span>Buffer after</span>
								<Input
									aria-label="Selected block buffer after minutes"
									class="notion-property-field"
									type="number"
									min="0"
									step="5"
									bind:value={selectedBlock.bufferAfter}
									readonly={!canEditActiveWorkspace}
									onfocus={() => forgetBufferCapacityForBlockEdge(selectedBlock, 'after')}
									onchange={syncBufferGooAfterMutation}
								/>
							</label>
						</div>

						<div class="border-t border-[var(--app-line)] pt-5">
							<Textarea
								aria-label="Selected block notes"
								class="min-h-72 w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-7 font-medium text-[var(--app-text)] shadow-none outline-none placeholder:text-[var(--app-text-subtle)] focus-visible:ring-0"
								placeholder="Add notes, responsibilities, links, or callouts here."
								bind:value={selectedBlock.notes}
								readonly={!canEditActiveWorkspace}
							/>
						</div>
					</div>
				</aside>
			{/if}
		</section>
	</div>
	{#if showShortcutHelp}
		<div
			class="fixed inset-0 z-[120] grid place-items-center px-4"
			role="dialog"
			aria-modal="true"
			aria-label="Keyboard shortcuts"
		>
			<button
				type="button"
				class="absolute inset-0 bg-neutral-950/15 backdrop-blur-[1px]"
				aria-label="Close keyboard shortcuts"
				onclick={() => (showShortcutHelp = false)}
			></button>
			<section
				class="relative w-full max-w-xl rounded-md border border-[var(--app-line)] bg-white p-4 shadow-2xl shadow-neutral-950/20"
				aria-label="Keyboard shortcuts"
			>
				<div class="mb-4 flex items-center justify-between gap-3">
					<h2 class="text-sm font-black text-[var(--app-text)]">Keyboard Shortcuts</h2>
					<button
						type="button"
						class="grid size-8 place-items-center rounded-md text-[var(--app-text-muted)] transition hover:bg-[var(--app-soft-hover)] hover:text-[var(--app-text)] focus-visible:ring-2 focus-visible:ring-neutral-950/20 focus-visible:outline-none"
						aria-label="Close keyboard shortcuts"
						onclick={() => (showShortcutHelp = false)}
					>
						<X class="size-4" />
					</button>
				</div>
				<div class="grid gap-4 text-sm sm:grid-cols-2">
					<div class="grid gap-2">
						<h3
							class="text-[11px] font-black tracking-[0.12em] text-[var(--app-text-muted)] uppercase"
						>
							Create and View
						</h3>
						<p><span><kbd>N</kbd> / <kbd>B</kbd></span><span>New block at visible center</span></p>
						<p><span><kbd>1</kbd></span><span>Combined view</span></p>
						<p><span><kbd>2</kbd></span><span>Advertised view</span></p>
						<p><span><kbd>3</kbd></span><span>Actual view</span></p>
						<p><span><kbd>+</kbd> / <kbd>-</kbd></span><span>Zoom timeline density</span></p>
						<p><span><kbd>?</kbd></span><span>Show shortcuts</span></p>
					</div>
					<div class="grid gap-2">
						<h3
							class="text-[11px] font-black tracking-[0.12em] text-[var(--app-text-muted)] uppercase"
						>
							Select
						</h3>
						<p><span><kbd>↑</kbd> / <kbd>↓</kbd></span><span>Previous / next block</span></p>
						<p>
							<span><kbd>←</kbd> / <kbd>→</kbd></span><span>Nearest block in adjacent lane</span>
						</p>
						<p><span><kbd>Esc</kbd></span><span>Clear selection or close this sheet</span></p>
						<p><span><kbd>Enter</kbd></span><span>Focus selected note</span></p>
					</div>
					<div class="grid gap-2">
						<h3
							class="text-[11px] font-black tracking-[0.12em] text-[var(--app-text-muted)] uppercase"
						>
							Move
						</h3>
						<p><span><kbd>J</kbd> / <kbd>K</kbd></span><span>Move down / up 5 min</span></p>
						<p>
							<span><kbd>Shift</kbd> + <kbd>J</kbd> / <kbd>K</kbd></span><span>Move 15 min</span>
						</p>
						<p>
							<span><kbd>Cmd</kbd> + <kbd>J</kbd> / <kbd>K</kbd></span><span>Move 30 min</span>
						</p>
						<p><span><kbd>H</kbd> / <kbd>L</kbd></span><span>Move lane left / right</span></p>
					</div>
					<div class="grid gap-2">
						<h3
							class="text-[11px] font-black tracking-[0.12em] text-[var(--app-text-muted)] uppercase"
						>
							Edit
						</h3>
						<p><span><kbd>Cmd</kbd> + <kbd>C</kbd></span><span>Copy selection</span></p>
						<p><span><kbd>Cmd</kbd> + <kbd>X</kbd></span><span>Cut selection</span></p>
						<p><span><kbd>Cmd</kbd> + <kbd>V</kbd></span><span>Paste at visible center</span></p>
						<p><span><kbd>Cmd</kbd> + <kbd>D</kbd></span><span>Duplicate selection</span></p>
						<p><span><kbd>Delete</kbd></span><span>Delete selection</span></p>
						<p><span><kbd>Cmd</kbd> + <kbd>Z</kbd></span><span>Undo last edit</span></p>
						<p><span><kbd>Cmd</kbd> + <kbd>S</kbd></span><span>Save now</span></p>
					</div>
				</div>
			</section>
		</div>
	{/if}
</main>

<style>
	kbd {
		display: inline-grid;
		min-width: 1.55rem;
		height: 1.45rem;
		place-items: center;
		border: 1px solid var(--app-line);
		border-radius: 4px;
		background: var(--app-soft);
		padding: 0 0.35rem;
		color: var(--app-text);
		font-size: 0.72rem;
		font-weight: 800;
		line-height: 1;
	}

	section[aria-label='Keyboard shortcuts'] p {
		display: grid;
		grid-template-columns: minmax(5.5rem, max-content) 1fr;
		align-items: center;
		gap: 0.5rem;
		color: var(--app-text-muted);
		font-weight: 600;
	}

	.planner-workspace {
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
	}

	.planner-details-sheet {
		animation: planner-details-slide 180ms ease-out;
	}

	.notion-property-row {
		display: grid;
		grid-template-columns: minmax(112px, 0.42fr) minmax(0, 1fr);
		align-items: center;
		min-height: 34px;
		gap: 12px;
		border-radius: 4px;
		color: var(--app-text-subtle);
		font-size: 13px;
		font-weight: 600;
	}

	.notion-property-row:hover {
		background: var(--app-soft-hover);
	}

	.notion-property-row > span {
		min-width: 0;
		overflow: hidden;
		padding-left: 6px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.notion-property-field {
		min-width: 0;
		width: 100%;
		border: 0;
		border-radius: 4px;
		background: transparent;
		padding: 6px 8px;
		color: var(--app-text);
		font-size: 13px;
		font-weight: 600;
		outline: none;
	}

	.notion-property-field:hover,
	.notion-property-field:focus {
		background: var(--app-soft-hover);
	}

	@media (prefers-reduced-motion: reduce) {
		.planner-details-sheet {
			animation: none;
		}
	}

	@media (min-width: 1024px) {
		.planner-workspace.has-details {
			grid-template-columns: minmax(0, 1fr) clamp(20rem, 25vw, 22.5rem);
		}

		.planner-workspace.has-details > header,
		.planner-workspace.has-details > div {
			grid-column: 1;
		}

		.planner-details-sheet {
			position: relative;
			inset: auto;
			z-index: 30;
			grid-row: 1 / span 2;
			grid-column: 2;
			height: 100svh;
			min-width: 0;
			width: auto;
			box-shadow: none;
		}

		.planner-details-sheet > div:last-child {
			max-width: none;
			gap: 1.25rem;
			padding: 1.5rem 1.25rem 1.75rem;
		}
	}

	@keyframes planner-details-slide {
		from {
			opacity: 0;
			transform: translateX(24px);
		}

		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
</style>

<script lang="ts">
	import { deserialize } from '$app/forms';
	import { Check, Clock, LayoutGrid, List, Mic, Play, Plus, Sparkles, Users } from '@lucide/svelte';
	import { Popover } from 'bits-ui';
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
	import EmojiPicker from '$lib/components/emoji-picker.svelte';
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

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const minuteHeight = 2;
	const laneWidth = 260;
	const resizeHandleHitPixels = 24;
	const iconOptions = [
		{ id: 'play', label: 'Play' },
		{ id: 'list', label: 'List' },
		{ id: 'clock', label: 'Clock' },
		{ id: 'users', label: 'Crew' },
		{ id: 'mic', label: 'Mic' },
		{ id: 'spark', label: 'Moment' },
		{ id: 'layout', label: 'Prep' },
		{ id: 'check', label: 'Check' }
	];
	const lucideIconIds = new Set(iconOptions.map((option) => option.id));

	let lanes = $state<TimelineLane[]>(cloneLanes());
	let blocks = $state<TimelineBlock[]>(cloneBlocks());
	let selectedId = $state('');
	let viewMode = $state<ViewMode>('combined');
	let viewStart = $state('08:00');
	let viewEnd = $state('18:30');
	let padBefore = $state(30);
	let padAfter = $state(45);
	let openIconPicker = $state<string | null>(null);
	let pageTitle = $state('Event Timeline');
	let timelineTitle = $state('Launch Meetup Run of Show');
	let loadedTimelineKey = $state<string | null>(null);
	let autosavedTimelineId = $state<string | null>(null);
	let autosaveStatus = $state<AutosaveStatus>('idle');
	let autosaveMessage = $state('');
	let timelineScrollElement: HTMLDivElement | null = $state(null);
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
	const timelineSnapshot = $derived({
		id: autosavedTimelineId ?? data.activeTimeline?.id ?? null,
		title: timelineTitle,
		viewStart,
		viewEnd,
		padBefore,
		padAfter,
		lanes,
		blocks
	} satisfies TimelineSnapshot);
	const timelineByEventId = $derived(
		new Map(
			data.timelines
				.filter((timeline) => timeline.luma_event_id)
				.map((timeline) => [timeline.luma_event_id, timeline])
		)
	);
	const displayStartMinutes = $derived(timeToMinutes(viewStart) - padBefore);
	const viewStartMinutes = 0;
	const viewEndMinutes = 23 * 60 + 59;
	const viewDuration = $derived(Math.max(60, viewEndMinutes - viewStartMinutes));
	const timelineHeight = $derived(Math.max(720, viewDuration * minuteHeight));
	const timelineWidth = $derived(76 + lanes.length * laneWidth);
	const now = new Date();
	const nowMinutes = now.getHours() * 60 + now.getMinutes();
	const displaySummary = $derived(
		`${viewStart}-${viewEnd} with ${padBefore}m before / ${padAfter}m after`
	);
	const autosaveLabel = $derived.by(() => {
		if (autosaveStatus === 'pending') return 'Autosave pending';
		if (autosaveStatus === 'saving') return 'Autosaving...';
		if (autosaveStatus === 'saved') return 'Autosaved';
		if (autosaveStatus === 'error') return autosaveMessage || 'Autosave failed';
		return 'Autosave ready';
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

	$effect(() => {
		const timeline = data.activeTimeline;
		const nextKey = timeline?.id ?? `${data.mode}:sample`;
		if (nextKey === loadedTimelineKey) return;

		const nextLanes = timeline ? timeline.lanes.map((lane) => ({ ...lane })) : cloneLanes();
		const nextBlocks = timeline ? timeline.blocks.map((block) => ({ ...block })) : cloneBlocks();

		lanes = nextLanes.length ? nextLanes : cloneLanes();
		blocks = nextBlocks;
		selectedId = nextBlocks[0]?.id ?? '';
		viewStart = timeline?.viewStart ?? '08:00';
		viewEnd = timeline?.viewEnd ?? '18:30';
		padBefore = timeline?.padBefore ?? 30;
		padAfter = timeline?.padAfter ?? 45;
		timelineTitle = timeline?.title ?? 'Launch Meetup Run of Show';
		autosavedTimelineId = timeline?.id ?? null;
		loadedTimelineKey = nextKey;
		initialTimelineScrollKey = '';
	});

	$effect(() => {
		const key = `${loadedTimelineKey ?? 'loading'}:${viewStart}:${padBefore}`;
		if (!timelineScrollElement || !loadedTimelineKey || initialTimelineScrollKey === key) return;
		const nextScrollTop = Math.max(0, displayStartMinutes * minuteHeight - 24);
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

	function blockColors(type: TimelineBlockType) {
		if (type === 'scheduled' || type === 'active')
			return 'border-emerald-900/20 bg-emerald-50 text-emerald-950';
		if (type === 'side') return 'border-violet-900/20 bg-violet-50 text-violet-950';
		if (type === 'milestone') return 'border-amber-900/20 bg-amber-50 text-amber-950';
		return 'border-blue-900/20 bg-blue-50 text-blue-950';
	}

	function iconColor(type: TimelineBlockType) {
		if (type === 'scheduled' || type === 'active') return 'bg-emerald-700 text-white';
		if (type === 'side') return 'bg-violet-600 text-white';
		if (type === 'milestone') return 'bg-amber-600 text-white';
		return 'bg-blue-600 text-white';
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
				start: timeToMinutes(block.advertisedStart),
				end: timeToMinutes(block.advertisedEnd),
				before: 0,
				after: 0,
				advertisedOnly: true
			};
		}
		if (viewMode === 'actual') {
			const start = timeToMinutes(block.start);
			const end = isMilestone(block) ? start : timeToMinutes(block.end);
			return {
				start,
				end,
				before: 0,
				after: 0,
				advertisedOnly: false
			};
		}
		const actualStart = timeToMinutes(block.start);
		const actualEnd = isMilestone(block) ? actualStart : timeToMinutes(block.end);
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

	function blockTop(block: TimelineBlock) {
		return (visibleRange(block).start - viewStartMinutes) * minuteHeight;
	}

	function blockHeight(block: TimelineBlock) {
		const range = visibleRange(block);
		if (range.advertisedOnly) return Math.max(28, (range.end - range.start) * minuteHeight);
		return range.before * minuteHeight + actualBlockHeight(block) + range.after * minuteHeight;
	}

	function actualCardStyle(block: TimelineBlock) {
		const range = visibleRange(block);
		const top = range.advertisedOnly ? 0 : range.before * minuteHeight;
		const height = actualBlockHeight(block);
		return `top:${top}px; height:${height}px; min-height:${height}px;`;
	}

	function actualHandleStyle(block: TimelineBlock, edge: 'start' | 'end') {
		const range = visibleRange(block);
		const top = range.advertisedOnly ? 0 : range.before * minuteHeight;
		const height = actualBlockHeight(block);
		const handleTop =
			edge === 'start' ? top - resizeHandleHitPixels / 2 : top + height - resizeHandleHitPixels / 2;
		return `top:${handleTop}px;`;
	}

	function addBufferButtonStyle(block: TimelineBlock, edge: 'before' | 'after') {
		const range = visibleRange(block);
		const top = range.advertisedOnly ? 0 : range.before * minuteHeight;
		const height = actualBlockHeight(block);
		const buttonTop = edge === 'before' ? top - 32 : top + height + 4;
		return `top:${buttonTop}px;`;
	}

	function bufferBeforeStyle(block: TimelineBlock) {
		const range = visibleRange(block);
		return `top:0px; height:${Math.max(12, range.before * minuteHeight)}px;`;
	}

	function bufferAfterStyle(block: TimelineBlock) {
		const range = visibleRange(block);
		const top = range.before * minuteHeight + actualBlockHeight(block);
		return `top:${top}px; height:${Math.max(12, range.after * minuteHeight)}px;`;
	}

	function actualBlockHeight(block: TimelineBlock) {
		if (isMilestone(block)) return 28;
		const start =
			viewMode === 'advertised' && hasAdvertisedLayer(block) ? block.advertisedStart : block.start;
		const end =
			viewMode === 'advertised' && hasAdvertisedLayer(block) ? block.advertisedEnd : block.end;
		return Math.max(32, (timeToMinutes(end) - timeToMinutes(start)) * minuteHeight);
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
		const advertisedStart = timeToMinutes(block.advertisedStart);
		const advertisedEnd = timeToMinutes(block.advertisedEnd);
		const rawTop = (advertisedStart - range.start) * minuteHeight;
		const rawHeight = (advertisedEnd - advertisedStart) * minuteHeight;

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

	function displayedTimeLabel(block: TimelineBlock) {
		if (isMilestone(block)) return displayedStart(block);
		return `${displayedStart(block)}-${displayedEnd(block)}`;
	}

	function advertisedDurationLabel(block: TimelineBlock) {
		return durationLabel(block.advertisedStart, block.advertisedEnd);
	}

	function bufferStartLabel(block: TimelineBlock) {
		return minutesToTime(timeToMinutes(block.start) - block.bufferBefore);
	}

	function bufferEndLabel(block: TimelineBlock) {
		const end = isMilestone(block) ? timeToMinutes(block.start) : timeToMinutes(block.end);
		return minutesToTime(end + block.bufferAfter);
	}

	function nudgeSelected(minutes: number) {
		if (!canEditActiveWorkspace || !selectedBlock) return;
		selectedBlock.start = minutesToTime(timeToMinutes(selectedBlock.start) + minutes);
		selectedBlock.end = minutesToTime(timeToMinutes(selectedBlock.end) + minutes);
		selectedBlock.advertisedStart = minutesToTime(
			timeToMinutes(selectedBlock.advertisedStart) + minutes
		);
		selectedBlock.advertisedEnd = minutesToTime(
			timeToMinutes(selectedBlock.advertisedEnd) + minutes
		);
	}

	function moveSelectedLane(direction: number) {
		if (!canEditActiveWorkspace || !selectedBlock) return;
		const index = lanes.findIndex((lane) => lane.id === selectedBlock.lane);
		const next = Math.max(0, Math.min(lanes.length - 1, index + direction));
		selectedBlock.lane = lanes[next].id;
	}

	function addBlock() {
		if (!canEditActiveWorkspace) return;
		const block: TimelineBlock = {
			id: crypto.randomUUID(),
			title: 'New planning block',
			icon: 'list',
			lane: lanes[0]?.id ?? 'main',
			type: 'planning',
			visibility: 'internal',
			start: '14:30',
			end: '15:00',
			advertisedStart: '14:30',
			advertisedEnd: '15:00',
			bufferBefore: 10,
			bufferAfter: 10,
			owner: 'Unassigned',
			notes: 'Add notes, responsibilities, links, or callouts here.'
		};
		blocks = [...blocks, block];
		selectedId = block.id;
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
			block.advertisedStart = block.advertisedStart || block.start;
			block.advertisedEnd = block.advertisedEnd || block.end;
		}
	}

	function syncMilestoneTime(block: TimelineBlock) {
		if (!isMilestone(block)) return;
		block.end = block.start;
		block.advertisedStart = block.start;
		block.advertisedEnd = block.start;
	}

	function cycleType(block: TimelineBlock) {
		if (!canEditActiveWorkspace) return;
		const order: TimelineBlockType[] = ['scheduled', 'planning', 'milestone'];
		const current = order.includes(block.type) ? block.type : 'scheduled';
		setBlockType(block, order[(order.indexOf(current) + 1) % order.length]);
	}

	function isEmojiIcon(icon: string) {
		return !lucideIconIds.has(icon);
	}

	function setBlockIcon(block: TimelineBlock, icon: string) {
		if (!canEditActiveWorkspace) return;
		block.icon = icon;
		openIconPicker = null;
	}

	function pickerKey(surface: 'card' | 'panel', blockId: string) {
		return `${surface}:${blockId}`;
	}

	function iconComponent(icon: string) {
		if (icon === 'clock') return Clock;
		if (icon === 'users') return Users;
		if (icon === 'mic') return Mic;
		if (icon === 'spark') return Sparkles;
		if (icon === 'layout') return LayoutGrid;
		if (icon === 'check') return Check;
		if (icon === 'play') return Play;
		return List;
	}
</script>

<svelte:head>
	<title>Timeline Planner</title>
</svelte:head>

<main
	class="min-h-svh bg-[#f6f7f4] p-3 text-neutral-950 [&_input]:w-full [&_input]:min-w-0 [&_select]:w-full [&_select]:min-w-0 [&_textarea]:w-full [&_textarea]:min-w-0"
>
	<div class="grid min-h-[calc(100svh-1.5rem)] grid-cols-[260px_minmax(620px,1fr)_340px] gap-3">
		<aside class="rounded-lg border bg-white/95 p-4 shadow-xl shadow-neutral-950/10">
			<div class="mb-5 flex items-center justify-between gap-3">
				<input
					aria-label="Page title"
					class="min-w-0 rounded-md bg-transparent px-1 py-0 text-[22px] leading-none font-bold tracking-normal hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
					bind:value={pageTitle}
				/>
				<span class="size-3.5 rounded-full bg-red-600 shadow-[0_0_0_5px_rgba(220,38,38,0.13)]"
				></span>
			</div>

			<button
				type="button"
				class="mb-5 flex h-9 w-full items-center justify-center rounded-md bg-neutral-950 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
				disabled={!canEditActiveWorkspace}
				onclick={addBlock}
			>
				+ Add block
			</button>

			{#if data.mode !== 'local' && activeWorkspace}
				{#if data.workspaces.length > 1}
					<div class="mb-5 grid gap-2">
						<p class="text-[11px] font-black tracking-[0.12em] text-neutral-500 uppercase">
							Workspace
						</p>
						<div class="grid gap-1">
							{#each data.workspaces as workspace (workspace.id)}
								<a
									class={[
										'truncate rounded-md border px-3 py-2 text-sm font-black',
										workspace.id === activeWorkspace.id
											? 'border-neutral-950 bg-neutral-950 text-white'
											: 'bg-neutral-50 text-neutral-700 hover:bg-white'
									]}
									href={`/planner?workspace=${workspace.id}`}
								>
									{workspace.name}
								</a>
							{/each}
						</div>
					</div>
				{/if}

				{#if canEditActiveWorkspace}
					<div class="mb-5 grid gap-2">
						<form method="POST" action="?/saveTimeline">
							<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
							<input type="hidden" name="snapshot" value={JSON.stringify(timelineSnapshot)} />
							<button
								type="submit"
								class="flex h-9 w-full items-center justify-center rounded-md border bg-white text-sm font-bold text-neutral-950"
							>
								Save timeline
							</button>
						</form>
						<p
							class={[
								'rounded-md border px-2 py-1 text-[11px] font-bold',
								autosaveStatus === 'error'
									? 'border-red-200 bg-red-50 text-red-700'
									: 'border-neutral-200 bg-neutral-50 text-neutral-500'
							]}
						>
							{autosaveLabel}
						</p>
						{#if formMessage('save')}
							<p
								class="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700"
							>
								{formMessage('save')}
							</p>
						{/if}
						{#if data.mode === 'supabase'}
							<div class="grid grid-cols-2 gap-2">
								<form method="POST" action="?/createBlankTimeline">
									<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
									<input type="hidden" name="title" value="New run of show" />
									<button
										type="submit"
										class="h-8 w-full rounded-md border bg-neutral-100 text-xs font-black text-neutral-700"
									>
										New
									</button>
								</form>
								{#if data.activeTimeline?.id}
									<form method="POST" action="?/duplicateTimeline">
										<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
										<input type="hidden" name="timelineId" value={data.activeTimeline.id} />
										<button
											type="submit"
											class="h-8 w-full rounded-md border bg-neutral-100 text-xs font-black text-neutral-700"
										>
											Duplicate
										</button>
									</form>
								{/if}
							</div>
						{/if}
						{#if formMessage('timeline')}
							<p
								class="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700"
							>
								{formMessage('timeline')}
							</p>
						{/if}
					</div>
				{/if}
			{/if}

			<p class="mt-5 mb-2 text-[11px] font-black tracking-[0.12em] text-neutral-500 uppercase">
				Quick Reorganise
			</p>
			<div class="grid grid-cols-2 gap-2">
				<button
					type="button"
					class="h-9 rounded-md border bg-neutral-100 text-sm font-bold disabled:cursor-not-allowed disabled:text-neutral-400"
					disabled={!canEditActiveWorkspace}
					onclick={() => nudgeSelected(-15)}>-15 min</button
				>
				<button
					type="button"
					class="h-9 rounded-md border bg-neutral-100 text-sm font-bold disabled:cursor-not-allowed disabled:text-neutral-400"
					disabled={!canEditActiveWorkspace}
					onclick={() => nudgeSelected(15)}>+15 min</button
				>
				<button
					type="button"
					class="h-9 rounded-md border bg-neutral-100 text-sm font-bold disabled:cursor-not-allowed disabled:text-neutral-400"
					disabled={!canEditActiveWorkspace}
					onclick={() => moveSelectedLane(-1)}>← Lane</button
				>
				<button
					type="button"
					class="h-9 rounded-md border bg-neutral-100 text-sm font-bold disabled:cursor-not-allowed disabled:text-neutral-400"
					disabled={!canEditActiveWorkspace}
					onclick={() => moveSelectedLane(1)}>Lane →</button
				>
			</div>

			<p class="mt-5 mb-2 text-[11px] font-black tracking-[0.12em] text-neutral-500 uppercase">
				Layers
			</p>
			<div class="grid gap-2 text-sm text-neutral-600">
				<p class="flex items-center gap-2">
					<span class="size-3.5 rounded bg-blue-600"></span>Planning / advertised
				</p>
				<p class="flex items-center gap-2">
					<span class="size-3.5 rounded bg-emerald-700"></span>Active / actual
				</p>
				<p class="flex items-center gap-2">
					<span class="size-3.5 rounded bg-neutral-400"></span>Buffer outside block
				</p>
				<p class="flex items-center gap-2">
					<span class="size-3.5 rounded border-2 border-dashed border-violet-600"></span>Advertised
					outline
				</p>
			</div>

			<div class="mt-5 rounded-lg border bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">
				{#if data.mode === 'local'}
					<div class="mb-2 font-black text-neutral-950">Local sample mode</div>
					<p>Supabase is not configured, so edits stay in the browser prototype state.</p>
				{:else if activeWorkspace}
					<div class="mb-2 font-black text-neutral-950">{activeWorkspace.name}</div>
					<p>{data.lumaEvents.length} Luma events / {data.timelines.length} timelines</p>
					<a
						class="mt-3 inline-flex h-8 w-full items-center justify-center rounded-md border bg-white px-2 font-black text-neutral-700"
						href={`/timelines?workspace=${activeWorkspace.id}`}
					>
						All planners
					</a>
					<a
						class="mt-2 inline-flex h-8 w-full items-center justify-center rounded-md border bg-white px-2 font-black text-neutral-700"
						href={`/settings?workspace=${activeWorkspace.id}`}
					>
						Workspace settings
					</a>
				{:else}
					<div class="mb-2 font-black text-neutral-950">Workspace setup</div>
					<a
						class="inline-flex h-8 w-full items-center justify-center rounded-md border bg-white px-2 font-black text-neutral-700"
						href="/settings"
					>
						Create or accept workspace
					</a>
				{/if}
			</div>

			{#if data.mode !== 'local' && activeWorkspace && data.lumaEvents.length > 0}
				<p class="mt-5 mb-2 text-[11px] font-black tracking-[0.12em] text-neutral-500 uppercase">
					Luma Events
				</p>
				<div class="grid max-h-56 gap-2 overflow-auto pr-1">
					{#each data.lumaEvents as event (event.id)}
						{@const linkedTimeline = timelineByEventId.get(event.id)}
						<div class="rounded-md border bg-neutral-50 p-2">
							<div class="text-xs leading-4 font-black text-neutral-950">{event.name}</div>
							<div class="mt-1 text-[11px] leading-4 text-neutral-500">
								{event.starts_at
									? new Date(event.starts_at).toLocaleString([], {
											dateStyle: 'medium',
											timeStyle: 'short'
										})
									: 'Date TBA'}
							</div>
							{#if event.location}
								<div class="truncate text-[11px] leading-4 text-neutral-500">{event.location}</div>
							{/if}
							{#if linkedTimeline}
								<a
									class="mt-2 inline-flex h-7 items-center rounded-md border bg-white px-2 text-[11px] font-black text-neutral-700"
									href={plannerHref({ timeline: linkedTimeline.id })}
								>
									Open timeline
								</a>
							{:else if canEditActiveWorkspace}
								<form class="mt-2" method="POST" action="?/createTimelineFromEvent">
									<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
									<input type="hidden" name="eventId" value={event.id} />
									<button
										class="inline-flex h-7 items-center rounded-md bg-neutral-950 px-2 text-[11px] font-black text-white"
										type="submit"
									>
										Create timeline
									</button>
								</form>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</aside>

		<section
			class="grid min-w-0 grid-rows-[auto_1fr] overflow-hidden rounded-lg border bg-white/95 shadow-xl shadow-neutral-950/10"
		>
			<header class="flex items-start justify-between gap-4 border-b px-8 py-4">
				<div class="min-w-0 flex-1">
					<input
						aria-label="Timeline title"
						class="w-full rounded-md bg-transparent px-1 py-0 text-base leading-tight font-black tracking-normal hover:bg-neutral-100 read-only:hover:bg-transparent focus:bg-neutral-100 focus:outline-none read-only:focus:bg-transparent"
						bind:value={timelineTitle}
						readonly={!canEditActiveWorkspace}
					/>
					<Popover.Root>
						<Popover.Trigger
							type="button"
							disabled={!canEditActiveWorkspace}
							class="mt-1 inline-flex max-w-full rounded-md px-1 py-0.5 text-left text-sm leading-tight font-bold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 focus:bg-neutral-100 focus:text-neutral-700 focus:outline-none disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-neutral-500"
							aria-label="Configure display view"
						>
							<span class="truncate">{displaySummary}</span>
						</Popover.Trigger>
						<Popover.Portal>
							<Popover.Content
								side="bottom"
								align="start"
								sideOffset={8}
								class="z-50 w-[360px] rounded-md border bg-white p-4 shadow-xl shadow-neutral-950/15"
							>
								<div class="grid gap-4">
									<div class="grid grid-cols-2 gap-3">
										<label class="grid gap-1 text-xs font-bold text-neutral-500">
											Start
											<input
												aria-label="Display start time"
												class="h-10 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
												type="time"
												bind:value={viewStart}
											/>
										</label>
										<label class="grid gap-1 text-xs font-bold text-neutral-500">
											End
											<input
												aria-label="Display end time"
												class="h-10 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
												type="time"
												bind:value={viewEnd}
											/>
										</label>
									</div>
									<div class="grid grid-cols-2 gap-3">
										<label class="grid gap-1 text-xs font-bold text-neutral-500">
											Before
											<input
												aria-label="Display buffer before minutes"
												class="h-10 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
												type="number"
												min="0"
												step="5"
												bind:value={padBefore}
											/>
										</label>
										<label class="grid gap-1 text-xs font-bold text-neutral-500">
											After
											<input
												aria-label="Display buffer after minutes"
												class="h-10 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
												type="number"
												min="0"
												step="5"
												bind:value={padAfter}
											/>
										</label>
									</div>
								</div>
							</Popover.Content>
						</Popover.Portal>
					</Popover.Root>
				</div>
				<div class="inline-flex overflow-hidden rounded-md border bg-neutral-100">
					{#each ['combined', 'advertised', 'actual'] as mode (mode)}
						<button
							type="button"
							class={[
								'h-9 px-4 text-sm font-bold capitalize',
								viewMode === mode ? 'bg-neutral-950 text-white' : 'text-neutral-500'
							]}
							aria-pressed={viewMode === mode}
							onclick={() => (viewMode = mode as ViewMode)}
						>
							{mode}
						</button>
					{/each}
				</div>
			</header>

			<div class="overflow-auto" data-timeline-scroll bind:this={timelineScrollElement}>
				<div
					class="relative grid"
					style={`width:${timelineWidth}px; min-height:${timelineHeight + 42}px; grid-template-columns:76px repeat(${lanes.length}, ${laneWidth}px);`}
				>
					<div
						class="sticky top-0 z-20 grid h-[42px] items-center border-r border-b bg-white/95 px-3 text-xs font-black tracking-[0.08em] text-neutral-500 uppercase"
					>
						Time
					</div>
					{#each lanes as lane (lane.id)}
						<div
							class="sticky top-0 z-20 grid h-[42px] items-center border-r border-b bg-white/95 px-3 text-xs font-black tracking-[0.08em] text-neutral-500 uppercase"
						>
							{lane.label}
						</div>
					{/each}

					<div class="relative border-r bg-neutral-50/70" style={`height:${timelineHeight}px;`}>
						{#each Array.from({ length: Math.floor(viewDuration / 30) + 2 }, (_, i) => Math.ceil(viewStartMinutes / 30) * 30 + i * 30) as minute (minute)}
							{#if minute <= viewEndMinutes}
								<div
									class="absolute right-3 -translate-y-2 text-xs font-bold text-neutral-500 tabular-nums"
									style={`top:${(minute - viewStartMinutes) * minuteHeight}px;`}
								>
									{minutesToTime(minute)}
								</div>
							{/if}
						{/each}
					</div>

					{#each lanes as lane (lane.id)}
						<div
							role="region"
							aria-label={`${lane.label} timeline lane`}
							data-timeline-lane={lane.id}
							class="relative border-r bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,.45)_0,rgba(255,255,255,.45)_29px,rgba(246,247,244,.7)_30px,rgba(246,247,244,.7)_59px)]"
							style={`height:${timelineHeight}px;`}
						>
							{#each laneBlocks(lane.id) as block (block.id)}
								{@const range = visibleRange(block)}
								<div
									role="button"
									tabindex="0"
									class={[
										'group absolute right-2 left-2 rounded-lg select-none',
										canEditActiveWorkspace ? 'touch-none' : ''
									]}
									class:z-20={selectedId === block.id}
									style={`top:${blockTop(block)}px; height:${blockHeight(block)}px;`}
									use:timelineBlockDrag={{
										block,
										laneSelector: '[data-timeline-lane]',
										minuteHeight,
										onSelect: (id) => (selectedId = id),
										disabled: !canEditActiveWorkspace
									}}
									onclick={() => (selectedId = block.id)}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') selectedId = block.id;
									}}
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
													>{block.advertisedStart}</span
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
													>{block.advertisedEnd}</span
												>
											</div>
										{/if}
										{#if canEditActiveWorkspace && selectedId === block.id}
											<button
												type="button"
												aria-label="Resize advertised start"
												data-no-drag
												class="group/resize absolute inset-x-0 z-40 flex h-6 touch-none items-center justify-end rounded-md px-3 focus-visible:outline-none enabled:cursor-ns-resize disabled:cursor-default"
												style={advertisedHandleStyle(block, 'start')}
												disabled={!canEditActiveWorkspace}
												use:timelineActualResizeHandle={{
													block,
													edge: 'start',
													target: 'advertised',
													laneSelector: '[data-timeline-lane]',
													minuteHeight,
													onSelect: (id) => (selectedId = id),
													viewStartMinutes,
													disabled: !canEditActiveWorkspace
												}}
											>
												<span
													class={[
														'h-1.5 w-20 rounded-full bg-violet-600 opacity-0 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-opacity',
														'group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100'
													]}
												></span>
											</button>
											<button
												type="button"
												aria-label="Resize advertised end"
												data-no-drag
												class="group/resize absolute inset-x-0 z-40 flex h-6 touch-none items-center justify-end rounded-md px-3 focus-visible:outline-none enabled:cursor-ns-resize disabled:cursor-default"
												style={advertisedHandleStyle(block, 'end')}
												disabled={!canEditActiveWorkspace}
												use:timelineActualResizeHandle={{
													block,
													edge: 'end',
													target: 'advertised',
													laneSelector: '[data-timeline-lane]',
													minuteHeight,
													onSelect: (id) => (selectedId = id),
													viewStartMinutes,
													disabled: !canEditActiveWorkspace
												}}
											>
												<span
													class={[
														'h-1.5 w-20 rounded-full bg-violet-600 opacity-0 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-opacity',
														'group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100'
													]}
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
											class="absolute left-1/2 z-[60] grid size-7 -translate-x-1/2 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-800 opacity-0 shadow-md shadow-neutral-950/15 transition hover:border-neutral-900 hover:bg-neutral-950 hover:text-white hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-neutral-950/20 focus-visible:outline-none"
											style={addBufferButtonStyle(block, 'before')}
											onclick={(event) => {
												event.stopPropagation();
												block.bufferBefore = 10;
											}}
										>
											<Plus class="size-4" />
										</button>
									{/if}

									{#if !range.advertisedOnly && range.before > 0}
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
												class="absolute inset-x-12 -top-1 h-2 touch-none rounded-full opacity-0 hover:bg-neutral-500/30 enabled:cursor-ns-resize group-hover:enabled:opacity-100 disabled:cursor-default"
												disabled={!canEditActiveWorkspace}
												use:timelineBufferResizeHandle={{
													block,
													edge: 'before',
													laneSelector: '[data-timeline-lane]',
													minuteHeight,
													onSelect: (id) => (selectedId = id),
													viewStartMinutes,
													disabled: !canEditActiveWorkspace
												}}
											></button>
										</div>
									{/if}

									{#if canEditActiveWorkspace && selectedId === block.id && viewMode !== 'advertised' && !isMilestone(block)}
										<button
											type="button"
											aria-label="Resize actual start"
											data-no-drag
											class="group/resize absolute inset-x-3 z-50 flex h-6 touch-none items-center justify-center rounded-full focus-visible:outline-none enabled:cursor-ns-resize disabled:cursor-default"
											style={actualHandleStyle(block, 'start')}
											disabled={!canEditActiveWorkspace}
											use:timelineActualResizeHandle={{
												block,
												edge: 'start',
												laneSelector: '[data-timeline-lane]',
												minuteHeight,
												onSelect: (id) => (selectedId = id),
												viewStartMinutes,
												disabled: !canEditActiveWorkspace
											}}
										>
											<span
												class={[
													'h-1.5 w-full rounded-full bg-neutral-950/85 opacity-0 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-opacity',
													canEditActiveWorkspace
														? 'group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100'
														: ''
												]}
											></span>
										</button>
										<button
											type="button"
											aria-label="Resize actual end"
											data-no-drag
											class="group/resize absolute inset-x-3 z-50 flex h-6 touch-none items-center justify-center rounded-full focus-visible:outline-none enabled:cursor-ns-resize disabled:cursor-default"
											style={actualHandleStyle(block, 'end')}
											disabled={!canEditActiveWorkspace}
											use:timelineActualResizeHandle={{
												block,
												edge: 'end',
												laneSelector: '[data-timeline-lane]',
												minuteHeight,
												onSelect: (id) => (selectedId = id),
												viewStartMinutes,
												disabled: !canEditActiveWorkspace
											}}
										>
											<span
												class={[
													'h-1.5 w-full rounded-full bg-neutral-950/85 opacity-0 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-opacity',
													canEditActiveWorkspace
														? 'group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100'
														: ''
												]}
											></span>
										</button>
									{/if}

									<div
										class={[
											'absolute inset-x-0 overflow-hidden rounded-md border p-2 pr-12 shadow-lg shadow-neutral-950/10 transition-[border-color,box-shadow,filter]',
											blockColors(block.type),
											selectedId === block.id
												? 'border-neutral-700 shadow-neutral-950/20 brightness-95'
												: ''
										]}
										style={actualCardStyle(block)}
									>
										<div
											class="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-2 text-left text-sm leading-tight font-black"
										>
											<div class="relative">
												<button
													type="button"
													aria-label={`Change icon for ${block.title}`}
													class={[
														'grid size-5 place-items-center rounded-md',
														iconColor(block.type)
													]}
													disabled={!canEditActiveWorkspace}
													onclick={(event) => {
														event.stopPropagation();
														if (!canEditActiveWorkspace) return;
														const key = pickerKey('card', block.id);
														openIconPicker = openIconPicker === key ? null : key;
													}}
												>
													{#if isEmojiIcon(block.icon)}
														<span class="text-[13px] leading-none">{block.icon}</span>
													{:else}
														{@const Icon = iconComponent(block.icon)}
														<Icon class="size-3" />
													{/if}
												</button>
												{#if canEditActiveWorkspace && openIconPicker === pickerKey('card', block.id)}
													<div
														class="absolute top-7 left-0 z-40 grid gap-2 rounded-md border bg-white p-2 shadow-2xl"
													>
														<div class="grid grid-cols-8 gap-1">
															{#each iconOptions as option (option.id)}
																{@const Choice = iconComponent(option.id)}
																<button
																	type="button"
																	class={[
																		'grid size-7 place-items-center rounded-md border text-white',
																		iconColor(block.type),
																		block.icon === option.id
																			? 'border-neutral-950'
																			: 'border-transparent'
																	]}
																	title={option.label}
																	aria-label={`Use ${option.label} icon`}
																	onclick={() => setBlockIcon(block, option.id)}
																>
																	<Choice class="size-4" />
																</button>
															{/each}
														</div>
														<EmojiPicker onSelect={(emoji) => setBlockIcon(block, emoji)} />
													</div>
												{/if}
											</div>
											<input
												aria-label={`Title for ${block.title}`}
												class="min-w-0 rounded bg-transparent px-1 py-0 font-black hover:bg-white/50 read-only:hover:bg-transparent focus:bg-white/90 focus:ring-2 focus:ring-blue-600/20 focus:outline-none read-only:focus:bg-transparent read-only:focus:ring-0"
												bind:value={block.title}
												readonly={!canEditActiveWorkspace}
												onclick={(event) => event.stopPropagation()}
											/>
										</div>

										<div
											class={[
												'mt-2 flex flex-wrap gap-1 text-[10px] font-black tracking-[0.05em] text-neutral-500 uppercase'
											]}
										>
											{#if canEditActiveWorkspace && selectedId === block.id}
												<button
													type="button"
													data-no-drag
													class="rounded-full border bg-white/90 px-2 py-0.5 text-[10px] font-black tracking-[0.05em] text-neutral-700 uppercase hover:border-neutral-900 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-950/20 focus-visible:outline-none"
													onclick={(event) => {
														event.stopPropagation();
														cycleType(block);
													}}
												>
													{typeLabel(block.type)}
												</button>
											{:else}
												<span class="rounded-full border bg-white/70 px-2 py-0.5"
													>{typeLabel(block.type)}</span
												>
											{/if}
											<span class="rounded-full border bg-white/70 px-2 py-0.5"
												>{block.visibility}</span
											>
											<span class="rounded-full border bg-white/70 px-2 py-0.5"
												>{displayedTimeLabel(block)}</span
											>
										</div>
										<p class={['mt-2 line-clamp-2 text-xs leading-5 text-neutral-700']}>
											{block.notes}
										</p>

										<div
											class="pointer-events-none absolute top-2 right-2 bottom-2 grid w-12 grid-rows-[auto_1fr_auto] place-items-center text-[10px] font-black text-neutral-700 tabular-nums"
										>
											<span>{displayedStart(block)}</span>
											<span class="relative h-full w-px bg-neutral-950/25">
												{#if !isMilestone(block)}
													<span
														class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-neutral-300 bg-white/95 px-1.5 py-0.5 text-[10px] leading-none font-black whitespace-nowrap text-neutral-600 shadow-sm shadow-neutral-950/10"
													>
														{durationLabel(displayedStart(block), displayedEnd(block))}
													</span>
												{/if}
											</span>
											<span>{isMilestone(block) ? '' : displayedEnd(block)}</span>
										</div>
									</div>

									{#if !range.advertisedOnly && range.after > 0}
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
												class="absolute inset-x-12 -bottom-1 h-2 touch-none rounded-full opacity-0 hover:bg-neutral-500/30 enabled:cursor-ns-resize group-hover:enabled:opacity-100 disabled:cursor-default"
												disabled={!canEditActiveWorkspace}
												use:timelineBufferResizeHandle={{
													block,
													edge: 'after',
													laneSelector: '[data-timeline-lane]',
													minuteHeight,
													onSelect: (id) => (selectedId = id),
													viewStartMinutes,
													disabled: !canEditActiveWorkspace
												}}
											></button>
										</div>
									{/if}
									{#if canEditActiveWorkspace && selectedId === block.id && !range.advertisedOnly && range.after === 0 && viewMode !== 'advertised'}
										<button
											type="button"
											aria-label="Add buffer time after"
											title="Add buffer time"
											data-no-drag
											class="absolute left-1/2 z-[60] grid size-7 -translate-x-1/2 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-800 opacity-0 shadow-md shadow-neutral-950/15 transition hover:border-neutral-900 hover:bg-neutral-950 hover:text-white hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-neutral-950/20 focus-visible:outline-none"
											style={addBufferButtonStyle(block, 'after')}
											onclick={(event) => {
												event.stopPropagation();
												block.bufferAfter = 10;
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
							style={`top:${42 + (nowMinutes - viewStartMinutes) * minuteHeight}px;`}
						>
							<span
								class="absolute -top-3 left-3 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white"
								>Now</span
							>
						</div>
					{/if}
				</div>
			</div>
		</section>

		<aside class="rounded-lg border bg-white/95 p-4 shadow-xl shadow-neutral-950/10">
			<h2 class="text-xl font-bold tracking-normal">Notes</h2>
			<p class="mt-2 mb-4 text-sm leading-5 text-neutral-500">
				Click a block to edit timing, lane, buffer, visibility, and event notes.
			</p>

			{#if selectedBlock}
				<div class="grid gap-3">
					<label class="grid gap-1 text-xs font-bold text-neutral-500">
						Block title
						<input
							aria-label="Selected block title"
							class="h-9 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
							bind:value={selectedBlock.title}
							readonly={!canEditActiveWorkspace}
						/>
					</label>
					<div class="grid gap-1 text-xs font-bold text-neutral-500">
						Icon
						<div class="relative grid gap-2">
							<div class="grid grid-cols-[36px_1fr] gap-2">
								<button
									type="button"
									class={[
										'grid size-9 place-items-center rounded-md border',
										isEmojiIcon(selectedBlock.icon)
											? 'border-neutral-950 bg-white text-lg'
											: 'border-neutral-200 bg-neutral-50 text-neutral-600'
									]}
									aria-label="Change block icon"
									disabled={!canEditActiveWorkspace}
									onclick={() => {
										if (!canEditActiveWorkspace) return;
										const key = pickerKey('panel', selectedBlock.id);
										openIconPicker = openIconPicker === key ? null : key;
									}}
								>
									{#if isEmojiIcon(selectedBlock.icon)}
										<span class="leading-none">{selectedBlock.icon}</span>
									{:else}
										{@const CurrentIcon = iconComponent(selectedBlock.icon)}
										<CurrentIcon class="size-4" />
									{/if}
								</button>
								<div class="grid grid-cols-8 gap-1">
									{#each iconOptions as option (option.id)}
										{@const Choice = iconComponent(option.id)}
										<button
											type="button"
											class={[
												'grid size-8 place-items-center rounded-md border',
												selectedBlock.icon === option.id
													? 'border-neutral-950 bg-neutral-950 text-white'
													: 'bg-neutral-50 text-neutral-600'
											]}
											title={option.label}
											aria-label={`Use ${option.label} icon`}
											disabled={!canEditActiveWorkspace}
											onclick={() => setBlockIcon(selectedBlock, option.id)}
										>
											<Choice class="size-4" />
										</button>
									{/each}
								</div>
							</div>
							<button
								type="button"
								class="h-8 rounded-md border bg-neutral-50 text-xs font-black text-neutral-700"
								disabled={!canEditActiveWorkspace}
								onclick={() => {
									if (!canEditActiveWorkspace) return;
									const key = pickerKey('panel', selectedBlock.id);
									openIconPicker = openIconPicker === key ? null : key;
								}}
							>
								Choose emoji
							</button>
							{#if canEditActiveWorkspace && openIconPicker === pickerKey('panel', selectedBlock.id)}
								<div
									class="absolute top-full left-0 z-40 mt-2 rounded-md border bg-white p-2 shadow-2xl"
								>
									<EmojiPicker onSelect={(emoji) => setBlockIcon(selectedBlock, emoji)} />
								</div>
							{/if}
						</div>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<label class="grid gap-1 text-xs font-bold text-neutral-500">
							Lane
							<select
								aria-label="Selected block lane"
								class="h-9 rounded-md border bg-neutral-50 px-2 font-semibold text-neutral-950"
								bind:value={selectedBlock.lane}
								disabled={!canEditActiveWorkspace}
							>
								{#each lanes as lane (lane.id)}
									<option value={lane.id}>{lane.label}</option>
								{/each}
							</select>
						</label>
						<label class="grid gap-1 text-xs font-bold text-neutral-500">
							Type
							<select
								aria-label="Selected block type"
								class="h-9 rounded-md border bg-neutral-50 px-2 font-semibold text-neutral-950"
								value={selectedBlock.type}
								disabled={!canEditActiveWorkspace}
								onchange={(event) =>
									setBlockType(
										selectedBlock,
										(event.currentTarget as HTMLSelectElement).value as TimelineBlockType
									)}
							>
								<option value="scheduled">Scheduled</option>
								<option value="planning">Planning</option>
								<option value="milestone">Milestone</option>
							</select>
						</label>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<label class="grid gap-1 text-xs font-bold text-neutral-500"
							>{isMilestone(selectedBlock) ? 'Time' : 'Actual start'}<input
								aria-label="Selected block actual start"
								class="h-9 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
								type="time"
								bind:value={selectedBlock.start}
								readonly={!canEditActiveWorkspace}
								onchange={() => syncMilestoneTime(selectedBlock)}
							/></label
						>
						{#if !isMilestone(selectedBlock)}
							<label class="grid gap-1 text-xs font-bold text-neutral-500"
								>Actual end<input
									aria-label="Selected block actual end"
									class="h-9 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
									type="time"
									bind:value={selectedBlock.end}
									readonly={!canEditActiveWorkspace}
								/></label
							>
						{/if}
						{#if hasAdvertisedLayer(selectedBlock)}
							<label class="grid gap-1 text-xs font-bold text-neutral-500"
								>Advertised start<input
									aria-label="Selected block advertised start"
									class="h-9 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
									type="time"
									bind:value={selectedBlock.advertisedStart}
									readonly={!canEditActiveWorkspace}
								/></label
							>
							<label class="grid gap-1 text-xs font-bold text-neutral-500"
								>Advertised end<input
									aria-label="Selected block advertised end"
									class="h-9 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
									type="time"
									bind:value={selectedBlock.advertisedEnd}
									readonly={!canEditActiveWorkspace}
								/></label
							>
						{/if}
						<label class="grid gap-1 text-xs font-bold text-neutral-500"
							>Buffer before<input
								aria-label="Selected block buffer before minutes"
								class="h-9 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
								type="number"
								min="0"
								step="5"
								bind:value={selectedBlock.bufferBefore}
								readonly={!canEditActiveWorkspace}
							/></label
						>
						<label class="grid gap-1 text-xs font-bold text-neutral-500"
							>Buffer after<input
								aria-label="Selected block buffer after minutes"
								class="h-9 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
								type="number"
								min="0"
								step="5"
								bind:value={selectedBlock.bufferAfter}
								readonly={!canEditActiveWorkspace}
							/></label
						>
					</div>
					<label class="grid gap-1 text-xs font-bold text-neutral-500">
						Notes
						<textarea
							aria-label="Selected block notes"
							class="min-h-44 rounded-md border bg-neutral-50 p-3 text-sm leading-5 font-semibold text-neutral-950"
							bind:value={selectedBlock.notes}
							readonly={!canEditActiveWorkspace}
						></textarea>
					</label>
				</div>
			{:else}
				<div class="rounded-lg border border-dashed bg-neutral-50 p-4 text-sm text-neutral-500">
					No block selected.
				</div>
			{/if}
		</aside>
	</div>
</main>

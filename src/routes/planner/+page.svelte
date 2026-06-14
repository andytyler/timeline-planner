<script lang="ts">
	import { Check, Clock, LayoutGrid, List, Mic, Play, Sparkles, Users } from '@lucide/svelte';
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

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const minuteHeight = 2;
	const laneWidth = 260;
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
		id: data.activeTimeline?.id ?? null,
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
	const viewStartMinutes = $derived(timeToMinutes(viewStart) - padBefore);
	const viewEndMinutes = $derived(timeToMinutes(viewEnd) + padAfter);
	const viewDuration = $derived(Math.max(60, viewEndMinutes - viewStartMinutes));
	const timelineHeight = $derived(Math.max(720, viewDuration * minuteHeight));
	const timelineWidth = $derived(76 + lanes.length * laneWidth);
	const now = new Date();
	const nowMinutes = now.getHours() * 60 + now.getMinutes();

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
		loadedTimelineKey = nextKey;
	});

	function typeLabel(type: TimelineBlockType) {
		if (type === 'active') return 'Active';
		if (type === 'side') return 'Side';
		return 'Planning';
	}

	function blockColors(type: TimelineBlockType) {
		if (type === 'active') return 'border-emerald-900/20 bg-emerald-50 text-emerald-950';
		if (type === 'side') return 'border-violet-900/20 bg-violet-50 text-violet-950';
		return 'border-blue-900/20 bg-blue-50 text-blue-950';
	}

	function iconColor(type: TimelineBlockType) {
		if (type === 'active') return 'bg-emerald-700 text-white';
		if (type === 'side') return 'bg-violet-600 text-white';
		return 'bg-blue-600 text-white';
	}

	function visibleRange(block: TimelineBlock) {
		if (viewMode === 'advertised') {
			return {
				start: timeToMinutes(block.advertisedStart),
				end: timeToMinutes(block.advertisedEnd),
				before: 0,
				after: 0,
				advertisedOnly: true
			};
		}
		if (viewMode === 'actual') {
			return {
				start: timeToMinutes(block.start),
				end: timeToMinutes(block.end),
				before: 0,
				after: 0,
				advertisedOnly: false
			};
		}
		return {
			start: timeToMinutes(block.start) - block.bufferBefore,
			end: timeToMinutes(block.end) + block.bufferAfter,
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
		return Math.max(28, (range.end - range.start) * minuteHeight);
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

	function cycleType(block: TimelineBlock) {
		if (!canEditActiveWorkspace) return;
		const order: TimelineBlockType[] = ['planning', 'active', 'side'];
		block.type = order[(order.indexOf(block.type) + 1) % order.length];
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

			<p class="mb-2 text-[11px] font-black tracking-[0.12em] text-neutral-500 uppercase">
				Display View
			</p>
			<div class="grid grid-cols-2 gap-2">
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
			<header class="flex items-center justify-between gap-4 border-b px-4 py-3">
				<div class="min-w-0">
					<input
						aria-label="Timeline title"
						class="w-full rounded-md bg-transparent px-1 py-0 text-sm font-bold hover:bg-neutral-100 read-only:hover:bg-transparent focus:bg-neutral-100 focus:outline-none read-only:focus:bg-transparent"
						bind:value={timelineTitle}
						readonly={!canEditActiveWorkspace}
					/>
					<p class="text-xs text-neutral-500">
						{viewStart}-{viewEnd} with {padBefore}m before / {padAfter}m after
					</p>
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

			<div class="overflow-auto">
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
										canEditActiveWorkspace
											? 'cursor-grab touch-none active:cursor-grabbing'
											: 'cursor-default'
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
									{#if canEditActiveWorkspace && selectedId === block.id}
										<div class="absolute -top-9 left-2 z-30 flex h-7 items-center gap-1">
											<button
												type="button"
												class="h-7 rounded-md border bg-white px-2 text-[10px] font-black shadow"
												onclick={() => (block.bufferBefore = Math.max(0, block.bufferBefore - 5))}
												>Pre -</button
											>
											<button
												type="button"
												class="h-7 rounded-md border bg-white px-2 text-[10px] font-black shadow"
												onclick={() => (block.bufferBefore += 5)}>Pre +</button
											>
											<button
												type="button"
												class="h-7 rounded-md border bg-white px-2 text-[10px] font-black shadow"
												onclick={() => (block.bufferAfter = Math.max(0, block.bufferAfter - 5))}
												>Post -</button
											>
											<button
												type="button"
												class="h-7 rounded-md border bg-white px-2 text-[10px] font-black shadow"
												onclick={() => (block.bufferAfter += 5)}>Post +</button
											>
											<button
												type="button"
												class="h-7 rounded-md border bg-white px-2 text-[10px] font-black shadow"
												onclick={() => cycleType(block)}>{typeLabel(block.type)}</button
											>
										</div>
									{/if}

									{#if !range.advertisedOnly && range.before > 0}
										<div
											class="relative flex items-center bg-[repeating-linear-gradient(135deg,rgba(92,101,110,.12)_0_5px,rgba(92,101,110,.035)_5px_10px)] px-2 pr-12 text-[10px] font-black tracking-[0.08em] text-neutral-500 uppercase opacity-70"
											style={`height:${Math.max(12, range.before * minuteHeight)}px;`}
										>
											Buffer {range.before}m
											<button
												type="button"
												aria-label="Resize buffer before"
												data-no-drag
												class="absolute inset-x-12 -top-1 h-2 touch-none rounded-full opacity-0 hover:bg-neutral-500/30 enabled:cursor-ns-resize group-hover:enabled:opacity-100 disabled:cursor-default"
												disabled={!canEditActiveWorkspace}
												use:timelineBufferResizeHandle={{
													block,
													edge: 'before',
													minuteHeight,
													onSelect: (id) => (selectedId = id),
													disabled: !canEditActiveWorkspace
												}}
											></button>
										</div>
									{/if}

									<div
										class={[
											'relative overflow-hidden rounded-md border p-2 pr-12 shadow-lg shadow-neutral-950/10',
											blockColors(block.type),
											selectedId === block.id ? 'border-neutral-950 ring-4 ring-neutral-950/10' : ''
										]}
									>
										<button
											type="button"
											aria-label="Resize actual start"
											data-no-drag
											class="absolute inset-x-8 top-0 z-10 h-3 touch-none rounded-full opacity-0 hover:bg-neutral-800/25 enabled:cursor-ns-resize group-hover:enabled:opacity-100 disabled:cursor-default"
											disabled={!canEditActiveWorkspace}
											use:timelineActualResizeHandle={{
												block,
												edge: 'start',
												minuteHeight,
												onSelect: (id) => (selectedId = id),
												disabled: !canEditActiveWorkspace
											}}
										></button>

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
											data-block-drag-surface
											class="mt-2 flex flex-wrap gap-1 text-[10px] font-black tracking-[0.05em] text-neutral-500 uppercase"
										>
											<span class="rounded-full border bg-white/70 px-2 py-0.5"
												>{typeLabel(block.type)}</span
											>
											<span class="rounded-full border bg-white/70 px-2 py-0.5"
												>{block.visibility}</span
											>
											<span class="rounded-full border bg-white/70 px-2 py-0.5"
												>{viewMode === 'advertised'
													? `${block.advertisedStart}-${block.advertisedEnd}`
													: `${block.start}-${block.end}`}</span
											>
										</div>
										<p
											data-block-drag-surface
											class="mt-2 line-clamp-2 text-xs leading-5 text-neutral-700"
										>
											{block.notes}
										</p>

										<div
											data-block-drag-surface
											class="pointer-events-none absolute top-2 right-2 bottom-2 grid w-9 grid-rows-[auto_1fr_auto] place-items-center text-[10px] font-black text-neutral-700 tabular-nums"
										>
											<span>{viewMode === 'advertised' ? block.advertisedStart : block.start}</span>
											<span class="relative h-full w-px bg-neutral-950/25">
												<span
													class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-white/90 px-1 text-neutral-500"
												>
													{durationLabel(
														viewMode === 'advertised' ? block.advertisedStart : block.start,
														viewMode === 'advertised' ? block.advertisedEnd : block.end
													)}
												</span>
											</span>
											<span>{viewMode === 'advertised' ? block.advertisedEnd : block.end}</span>
										</div>

										<button
											type="button"
											aria-label="Resize actual end"
											data-no-drag
											class="absolute inset-x-8 bottom-0 z-10 h-3 touch-none rounded-full opacity-0 hover:bg-neutral-800/25 enabled:cursor-ns-resize group-hover:enabled:opacity-100 disabled:cursor-default"
											disabled={!canEditActiveWorkspace}
											use:timelineActualResizeHandle={{
												block,
												edge: 'end',
												minuteHeight,
												onSelect: (id) => (selectedId = id),
												disabled: !canEditActiveWorkspace
											}}
										></button>
									</div>

									{#if !range.advertisedOnly && range.after > 0}
										<div
											class="relative flex items-center bg-[repeating-linear-gradient(135deg,rgba(92,101,110,.12)_0_5px,rgba(92,101,110,.035)_5px_10px)] px-2 pr-12 text-[10px] font-black tracking-[0.08em] text-neutral-500 uppercase opacity-70"
											style={`height:${Math.max(12, range.after * minuteHeight)}px;`}
										>
											{range.after}m Buffer
											<button
												type="button"
												aria-label="Resize buffer after"
												data-no-drag
												class="absolute inset-x-12 -bottom-1 h-2 touch-none rounded-full opacity-0 hover:bg-neutral-500/30 enabled:cursor-ns-resize group-hover:enabled:opacity-100 disabled:cursor-default"
												disabled={!canEditActiveWorkspace}
												use:timelineBufferResizeHandle={{
													block,
													edge: 'after',
													minuteHeight,
													onSelect: (id) => (selectedId = id),
													disabled: !canEditActiveWorkspace
												}}
											></button>
										</div>
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
								bind:value={selectedBlock.type}
								disabled={!canEditActiveWorkspace}
							>
								<option value="planning">Planning</option>
								<option value="active">Active</option>
								<option value="side">Side task</option>
							</select>
						</label>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<label class="grid gap-1 text-xs font-bold text-neutral-500"
							>Actual start<input
								aria-label="Selected block actual start"
								class="h-9 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
								type="time"
								bind:value={selectedBlock.start}
								readonly={!canEditActiveWorkspace}
							/></label
						>
						<label class="grid gap-1 text-xs font-bold text-neutral-500"
							>Actual end<input
								aria-label="Selected block actual end"
								class="h-9 rounded-md border bg-neutral-50 px-3 font-semibold text-neutral-950"
								type="time"
								bind:value={selectedBlock.end}
								readonly={!canEditActiveWorkspace}
							/></label
						>
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

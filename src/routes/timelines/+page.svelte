<script lang="ts">
	import { ArrowRight, CalendarDays, Copy, Plus, Settings, Workflow } from '@lucide/svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const activeWorkspace = $derived(
		data.workspaces.find((workspace) => workspace.id === data.activeWorkspaceId) ??
			data.workspaces[0] ??
			null
	);
	const roleByWorkspace = $derived(
		new Map(data.workspaceRoles.map((membership) => [membership.workspace_id, membership.role]))
	);
	const eventByWorkspaceAndId = $derived(
		new Map(data.lumaEvents.map((event) => [`${event.workspace_id}:${event.id}`, event]))
	);
	const activeWorkspaceRole = $derived(
		activeWorkspace ? (roleByWorkspace.get(activeWorkspace.id) ?? null) : null
	);
	const canEditActiveWorkspace = $derived(
		activeWorkspaceRole === 'owner' ||
			activeWorkspaceRole === 'admin' ||
			activeWorkspaceRole === 'member'
	);
	const visibleTimelines = $derived(
		activeWorkspace
			? data.timelines.filter((timeline) => timeline.workspace_id === activeWorkspace.id)
			: data.timelines
	);
	const totalTimelineCount = $derived(data.timelines.length);

	function formMessage(intent: string) {
		return form?.intent === intent ? form.message : null;
	}

	function workspaceTimelineCount(workspaceId: string) {
		return data.timelines.filter((timeline) => timeline.workspace_id === workspaceId).length;
	}

	function timelineEvent(timeline: PageData['timelines'][number]) {
		if (!timeline.luma_event_id) return null;
		return eventByWorkspaceAndId.get(`${timeline.workspace_id}:${timeline.luma_event_id}`) ?? null;
	}

	function timelineDate(timeline: PageData['timelines'][number]) {
		const event = timelineEvent(timeline);
		const value = event?.starts_at ?? timeline.date;
		if (!value) return 'No date set';
		return new Date(value).toLocaleDateString([], {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function updatedLabel(value: string) {
		return new Date(value).toLocaleDateString([], {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function roleLabel(role: string | null) {
		return role ?? 'member';
	}
</script>

<svelte:head>
	<title>Planners / Timeline Planner</title>
</svelte:head>

<main class="min-h-svh bg-[#f6f7f4] px-4 py-5 text-neutral-950">
	<div class="mx-auto grid w-full max-w-7xl gap-5">
		<header class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<div class="mb-3 flex items-center gap-3">
					<div class="grid size-10 place-items-center rounded-lg bg-neutral-950 text-white">
						<Workflow class="size-5" />
					</div>
					<div>
						<p class="text-xs font-black tracking-[0.12em] text-neutral-500 uppercase">Planners</p>
						<p class="text-sm font-bold text-neutral-500">{data.userEmail}</p>
					</div>
				</div>
				<h1 class="text-3xl font-black tracking-normal">All timelines</h1>
				<p class="mt-2 text-sm font-bold text-neutral-500">
					{totalTimelineCount} planners across {data.workspaces.length} workspaces
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				{#if activeWorkspace}
					<a
						class="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-black shadow-sm"
						href={`/settings?workspace=${activeWorkspace.id}`}
					>
						<Settings class="size-4" />
						Settings
					</a>
					<a
						class="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-black text-white shadow-sm"
						href={`/planner?workspace=${activeWorkspace.id}`}
					>
						Open planner
						<ArrowRight class="size-4" />
					</a>
				{/if}
			</div>
		</header>

		{#if data.mode === 'local'}
			<section class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
				<h2 class="text-lg font-black">Local sample mode</h2>
				<p class="mt-2 max-w-xl text-sm leading-6 font-bold text-neutral-500">
					Connect Supabase and sign in to browse saved planners. The local sample planner is still
					available.
				</p>
				<a
					class="mt-4 inline-flex h-10 items-center rounded-lg bg-neutral-950 px-4 text-sm font-black text-white"
					href="/planner"
				>
					Open sample planner
				</a>
			</section>
		{:else if activeWorkspace}
			<section class="flex flex-wrap gap-2">
				{#each data.workspaces as workspace (workspace.id)}
					<a
						class={[
							'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-black shadow-sm',
							workspace.id === activeWorkspace.id
								? 'border-neutral-950 bg-neutral-950 text-white'
								: 'bg-white text-neutral-600 hover:text-neutral-950'
						]}
						href={`/timelines?workspace=${workspace.id}`}
					>
						<span>{workspace.name}</span>
						<span
							class={[
								'rounded-full px-2 py-0.5 text-[11px]',
								workspace.id === activeWorkspace.id ? 'bg-white/15' : 'bg-neutral-100'
							]}
						>
							{workspaceTimelineCount(workspace.id)}
						</span>
					</a>
				{/each}
			</section>

			<section class="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
				<aside class="grid content-start gap-4">
					<div class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
						<p class="text-xs font-black tracking-[0.12em] text-neutral-500 uppercase">Workspace</p>
						<h2 class="mt-2 text-xl font-black">{activeWorkspace.name}</h2>
						<p class="mt-1 text-sm font-bold text-neutral-500">
							{visibleTimelines.length} planners / {roleLabel(activeWorkspaceRole)}
						</p>
					</div>

					{#if canEditActiveWorkspace}
						<div class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
							<div class="mb-4 flex items-center gap-2">
								<Plus class="size-5 text-neutral-500" />
								<h2 class="text-lg font-black">New planner</h2>
							</div>
							<form class="grid gap-3" method="POST" action="?/createBlankTimeline">
								<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
								<label class="grid gap-2 text-sm font-black text-neutral-500">
									Title
									<input
										class="h-11 rounded-lg border bg-white px-3 text-sm font-bold text-neutral-950 outline-none focus:border-neutral-950"
										name="title"
										placeholder="Run of show"
									/>
								</label>
								<button
									class="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-black text-white"
									type="submit"
								>
									Create planner
									<ArrowRight class="size-4" />
								</button>
							</form>
							{#if formMessage('timeline')}
								<p
									class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
								>
									{formMessage('timeline')}
								</p>
							{/if}
						</div>
					{/if}
				</aside>

				<section class="rounded-xl border bg-white shadow-xl shadow-neutral-950/5">
					<div class="flex flex-wrap items-center justify-between gap-3 border-b p-5">
						<div>
							<h2 class="text-lg font-black">{activeWorkspace.name} planners</h2>
							<p class="mt-1 text-sm font-bold text-neutral-500">
								Open a saved timeline or duplicate one as a starting point.
							</p>
						</div>
					</div>

					<div class="divide-y">
						{#each visibleTimelines as timeline (timeline.id)}
							{@const event = timelineEvent(timeline)}
							<article class="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<h3 class="truncate text-lg font-black">{timeline.title}</h3>
										{#if event}
											<span
												class="rounded-full border bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700 uppercase"
											>
												Luma
											</span>
										{/if}
									</div>
									<div
										class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-neutral-500"
									>
										<span class="inline-flex items-center gap-1.5">
											<CalendarDays class="size-4" />
											{timelineDate(timeline)}
										</span>
										<span>{timeline.view_start.slice(0, 5)}-{timeline.view_end.slice(0, 5)}</span>
										<span
											>{timeline.pad_before_minutes}m before / {timeline.pad_after_minutes}m after</span
										>
										<span>Updated {updatedLabel(timeline.updated_at)}</span>
									</div>
									{#if event}
										<p class="mt-2 truncate text-sm font-bold text-neutral-500">
											{event.name}{event.location ? ` / ${event.location}` : ''}
										</p>
									{/if}
								</div>
								<div class="flex flex-wrap gap-2">
									<a
										class="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-black text-white"
										href={`/planner?workspace=${timeline.workspace_id}&timeline=${timeline.id}`}
									>
										Open
										<ArrowRight class="size-4" />
									</a>
									{#if canEditActiveWorkspace}
										<form method="POST" action="?/duplicateTimeline">
											<input type="hidden" name="workspaceId" value={timeline.workspace_id} />
											<input type="hidden" name="timelineId" value={timeline.id} />
											<button
												class="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-black"
												type="submit"
											>
												<Copy class="size-4" />
												Duplicate
											</button>
										</form>
									{/if}
								</div>
							</article>
						{:else}
							<div class="p-5">
								<h3 class="font-black">No planners yet</h3>
								<p class="mt-1 text-sm font-bold text-neutral-500">
									Create a planner for this workspace to start building a run of show.
								</p>
							</div>
						{/each}
					</div>
				</section>
			</section>
		{/if}
	</div>
</main>

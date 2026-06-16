<script lang="ts">
	import { ArrowRight, Copy, Database, FilePlus, Settings, Workflow } from '@lucide/svelte';
	import WorkspaceSidebar from '$lib/components/workspace-sidebar.svelte';
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
		if (!value) return 'No date';
		return new Date(value).toLocaleDateString([], {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const sidebarEvents = $derived(
		visibleTimelines.map((timeline) => {
			const event = timelineEvent(timeline);
			return {
				id: timeline.id,
				title: event?.name ?? timeline.title,
				href: `/planner?workspace=${timeline.workspace_id}&timeline=${timeline.id}`,
				startsAt: event?.starts_at ?? timeline.date ?? null,
				isActive: false
			};
		})
	);

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

<main class="app-page">
	<div class="app-shell-grid">
		<WorkspaceSidebar
			active="timelines"
			activeWorkspaceId={data.activeWorkspaceId}
			events={sidebarEvents}
			mode={data.mode}
			userEmail={data.userEmail}
			workspaces={data.workspaces}
			workspaceName={activeWorkspace?.name ?? 'Timeline Planner'}
		/>

		<section class="min-w-0">
			<header class="app-topbar">
				<div
					class="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--app-text-muted)]"
				>
					<Database class="size-4" />
					<span>Planners</span>
					{#if activeWorkspace}
						<span class="text-[var(--app-text-subtle)]">/</span>
						<span class="truncate text-[var(--app-text-secondary)]">{activeWorkspace.name}</span>
					{/if}
				</div>
				{#if activeWorkspace}
					<div class="flex items-center gap-2">
						<a class="app-button" href={`/settings?workspace=${activeWorkspace.id}`}>
							<Settings class="size-4" />
							Settings
						</a>
						<a
							class="app-button app-button-primary"
							href={`/planner?workspace=${activeWorkspace.id}`}
						>
							Open planner
							<ArrowRight class="size-4" />
						</a>
					</div>
				{/if}
			</header>

			<div class="mx-auto grid w-full max-w-6xl gap-6 px-6 py-6">
				<header class="flex flex-wrap items-end justify-between gap-4">
					<div class="min-w-0">
						<div
							class="mb-4 grid size-12 place-items-center rounded-lg border border-[var(--app-line)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]"
						>
							<Workflow class="size-6 text-[var(--app-accent)]" />
						</div>
						<p class="app-section-title">Runboards database</p>
						<h1 class="mt-2 text-4xl font-semibold tracking-[-0.025em] text-[var(--app-text)]">
							All planners
						</h1>
						<p class="mt-2 text-sm text-[var(--app-text-muted)]">
							{totalTimelineCount} planners across {data.workspaces.length} workspaces
						</p>
					</div>

					{#if activeWorkspace && canEditActiveWorkspace}
						<form
							class="flex flex-wrap items-end gap-2"
							method="POST"
							action="?/createBlankTimeline"
						>
							<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
							<label class="app-label min-w-[220px]">
								New planner
								<input class="app-input" name="title" placeholder="Run of show" />
							</label>
							<button class="app-button app-button-primary h-8" type="submit">
								<FilePlus class="size-4" />
								New
							</button>
						</form>
					{/if}
				</header>

				{#if formMessage('timeline')}
					<p
						class="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
					>
						{formMessage('timeline')}
					</p>
				{/if}

				{#if data.mode === 'local'}
					<section class="app-panel p-4">
						<h2 class="text-sm font-semibold">Local sample mode</h2>
						<p class="mt-1 max-w-xl text-sm leading-6 text-[var(--app-text-muted)]">
							Connect Supabase and sign in to browse saved planners. The local sample planner is
							still available.
						</p>
						<a class="app-button app-button-primary mt-4" href="/planner">Open sample planner</a>
					</section>
				{:else if activeWorkspace}
					<div class="flex flex-wrap gap-2">
						{#each data.workspaces as workspace (workspace.id)}
							<a
								class={[
									'app-button',
									workspace.id === activeWorkspace.id ? 'app-button-primary' : ''
								]}
								href={`/timelines?workspace=${workspace.id}`}
							>
								<span>{workspace.name}</span>
								<span class="rounded bg-white/20 px-1.5 text-xs">
									{workspaceTimelineCount(workspace.id)}
								</span>
							</a>
						{/each}
					</div>

					<section class="app-panel overflow-hidden">
						<div
							class="grid min-h-10 grid-cols-[minmax(220px,1fr)_120px_120px_150px_120px] items-center gap-3 border-b border-[var(--app-line)] bg-[var(--app-soft)] px-3 text-xs font-semibold text-[var(--app-text-muted)]"
						>
							<span>Name</span>
							<span>Date</span>
							<span>Window</span>
							<span>Updated</span>
							<span class="text-right">Actions</span>
						</div>

						{#each visibleTimelines as timeline (timeline.id)}
							{@const event = timelineEvent(timeline)}
							<article
								class="app-database-row grid-cols-[minmax(220px,1fr)_120px_120px_150px_120px] gap-3"
							>
								<a
									class="min-w-0"
									href={`/planner?workspace=${timeline.workspace_id}&timeline=${timeline.id}`}
								>
									<div class="flex min-w-0 items-center gap-2">
										<p class="truncate text-sm font-semibold text-[var(--app-text)]">
											{timeline.title}
										</p>
										{#if event}
											<span class="app-pill border-violet-200 bg-violet-50 text-violet-700"
												>Luma</span
											>
										{/if}
									</div>
									{#if event}
										<p class="mt-1 truncate text-xs text-[var(--app-text-muted)]">
											{event.name}{event.location ? ` / ${event.location}` : ''}
										</p>
									{/if}
								</a>
								<span class="text-sm text-[var(--app-text-muted)]">{timelineDate(timeline)}</span>
								<span class="text-sm text-[var(--app-text-muted)]">
									{timeline.view_start.slice(0, 5)}-{timeline.view_end.slice(0, 5)}
								</span>
								<span class="text-sm text-[var(--app-text-muted)]"
									>{updatedLabel(timeline.updated_at)}</span
								>
								<div class="flex justify-end gap-1">
									<a
										class="app-button"
										href={`/planner?workspace=${timeline.workspace_id}&timeline=${timeline.id}`}
									>
										Open
									</a>
									{#if canEditActiveWorkspace}
										<form method="POST" action="?/duplicateTimeline">
											<input type="hidden" name="workspaceId" value={timeline.workspace_id} />
											<input type="hidden" name="timelineId" value={timeline.id} />
											<button class="app-button" type="submit" title="Duplicate planner">
												<Copy class="size-4" />
											</button>
										</form>
									{/if}
								</div>
							</article>
						{:else}
							<div class="px-4 py-12">
								<h3 class="text-sm font-semibold">No planners yet</h3>
								<p class="mt-1 text-sm text-[var(--app-text-muted)]">
									Create a planner for this workspace to start building a run of show.
								</p>
							</div>
						{/each}
					</section>

					<div class="grid gap-3 text-sm text-[var(--app-text-muted)] md:grid-cols-3">
						<div class="app-panel p-3">
							<p class="font-semibold text-[var(--app-text)]">{activeWorkspace.name}</p>
							<p class="mt-1">{visibleTimelines.length} planners in this workspace</p>
						</div>
						<div class="app-panel p-3">
							<p class="font-semibold text-[var(--app-text)]">Role</p>
							<p class="mt-1 capitalize">{roleLabel(activeWorkspaceRole)}</p>
						</div>
						<div class="app-panel p-3">
							<p class="font-semibold text-[var(--app-text)]">Buffers</p>
							<p class="mt-1">Planner windows preserve before and after padding.</p>
						</div>
					</div>
				{/if}
			</div>
		</section>
	</div>
</main>

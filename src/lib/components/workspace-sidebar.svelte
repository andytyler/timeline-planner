<script lang="ts">
	import {
		CalendarDays,
		ChevronsUpDown,
		Home,
		ListTodo,
		LogOut,
		Search,
		Settings,
		Sparkles
	} from '@lucide/svelte';

	type Workspace = {
		id: string;
		name: string;
	};

	type SidebarEvent = {
		id: string;
		title: string;
		href: string;
		startsAt?: string | null;
		isActive?: boolean;
	};

	type ActiveItem = 'setup' | 'planner' | 'timelines' | 'settings';

	type Props = {
		active?: ActiveItem;
		activeTimelineId?: string | null;
		activeWorkspaceId?: string | null;
		events?: SidebarEvent[];
		mode?: string;
		plannerHref?: string;
		userEmail?: string | null;
		workspaces?: Workspace[];
		workspaceName?: string | null;
	};

	let {
		active = 'planner',
		activeTimelineId = null,
		activeWorkspaceId = null,
		events = [],
		mode = 'supabase',
		plannerHref = undefined,
		userEmail = '',
		workspaces = [],
		workspaceName = null
	}: Props = $props();

	const activeWorkspace = $derived(
		workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? null
	);
	const workspaceLabel = $derived(workspaceName ?? activeWorkspace?.name ?? 'Timeline Planner');
	const workspaceInitial = $derived(workspaceLabel.slice(0, 1).toUpperCase());
	const plannerLink = $derived(
		plannerHref ?? (activeWorkspaceId ? `/planner?workspace=${activeWorkspaceId}` : '/planner')
	);
	const timelinesLink = $derived(
		activeWorkspaceId ? `/timelines?workspace=${activeWorkspaceId}` : '/timelines'
	);
	const settingsLink = $derived(
		activeWorkspaceId ? `/settings?workspace=${activeWorkspaceId}` : '/settings'
	);
	const visibleEvents = $derived(events.slice(0, 24));

	function eventTime(value: string | null | undefined) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
	}
</script>

<aside class="app-sidebar group/sidebar" aria-label="Workspace navigation">
	<button
		type="button"
		class="mb-1 flex min-h-8 items-center rounded-md text-left transition hover:bg-[var(--app-soft-hover)] focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] focus-visible:outline-none"
		aria-label="Expand workspace navigation"
		onpointerdown={(event) => event.preventDefault()}
	>
		<div
			class="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--app-panel)] text-xs font-semibold text-[var(--app-text-secondary)] shadow-[var(--app-shadow)]"
		>
			{workspaceInitial}
		</div>
		<div class="app-sidebar-expandable min-w-0 flex-1">
			<p class="truncate text-sm font-semibold text-[var(--app-text)]">{workspaceLabel}</p>
			<p class="truncate text-[11px] font-medium text-[var(--app-text-muted)]">
				{mode === 'local' ? 'Local sample' : userEmail}
			</p>
		</div>
		<ChevronsUpDown class="app-sidebar-expandable size-3.5 text-[var(--app-text-subtle)]" />
	</button>

	<nav class="grid gap-0.5" aria-label="Primary">
		<a class={['app-sidebar-row', active === 'setup' ? 'is-active' : '']} href="/">
			<Home class="size-4" />
			<span class="app-sidebar-expandable">Home</span>
		</a>
		<a class={['app-sidebar-row', active === 'planner' ? 'is-active' : '']} href={plannerLink}>
			<CalendarDays class="size-4" />
			<span class="app-sidebar-expandable">Planner</span>
		</a>
		<a class={['app-sidebar-row', active === 'timelines' ? 'is-active' : '']} href={timelinesLink}>
			<ListTodo class="size-4" />
			<span class="app-sidebar-expandable">All planners</span>
		</a>
		<a class={['app-sidebar-row', active === 'settings' ? 'is-active' : '']} href={settingsLink}>
			<Settings class="size-4" />
			<span class="app-sidebar-expandable">Settings</span>
		</a>
	</nav>

	<div
		class="app-sidebar-panel mt-2 rounded-md border border-[var(--app-line)] bg-[var(--app-panel)]/70 p-0.5"
	>
		<div class="app-sidebar-row min-h-7 text-[var(--app-text-muted)]">
			<Search class="size-4" />
			<span>Search workspace</span>
			<span class="ml-auto text-[10px] font-semibold text-[var(--app-text-subtle)]">Cmd K</span>
		</div>
	</div>

	{#if visibleEvents.length > 0}
		<div class="app-sidebar-panel mt-3 min-h-0">
			<p class="px-2 text-[11px] font-semibold tracking-[0.01em] text-[var(--app-text-subtle)]">
				Events
			</p>
			<div class="mt-1 grid max-h-[34svh] gap-0.5 overflow-y-auto pr-1">
				{#each visibleEvents as event (event.id)}
					<a
						class={[
							'app-sidebar-row min-h-7',
							event.isActive || event.id === activeTimelineId ? 'is-active' : ''
						]}
						href={event.href}
					>
						<CalendarDays class="size-4 shrink-0" />
						<span class="min-w-0 flex-1 truncate">{event.title}</span>
						{#if event.startsAt}
							<span class="text-[10px] font-semibold whitespace-nowrap text-[var(--app-text-subtle)]">
								{eventTime(event.startsAt)}
							</span>
						{/if}
					</a>
				{/each}
			</div>
		</div>
	{/if}

	{#if mode !== 'local' && workspaces.length > 0}
		<div class="app-sidebar-panel mt-3">
			<p class="px-2 text-[11px] font-semibold tracking-[0.01em] text-[var(--app-text-subtle)]">
				Workspaces
			</p>
			<div class="mt-1 grid gap-0.5">
				{#each workspaces as workspace (workspace.id)}
					<a
						class={['app-sidebar-row', workspace.id === activeWorkspaceId ? 'is-active' : '']}
						href={`/planner?workspace=${workspace.id}`}
					>
						<span
							class="grid size-5 place-items-center rounded bg-[var(--app-soft)] text-[10px] font-semibold text-[var(--app-text-muted)]"
						>
							{workspace.name.slice(0, 1).toUpperCase()}
						</span>
						<span class="truncate">{workspace.name}</span>
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<div class="mt-auto grid gap-0.5 border-t border-[var(--app-line)] pt-2">
		<div class="app-sidebar-row text-[var(--app-text-muted)]">
			<Sparkles class="size-4" />
			<span class="app-sidebar-expandable">Runboard</span>
		</div>
		{#if mode !== 'local'}
			<a class="app-sidebar-row" href="/logout">
				<LogOut class="size-4" />
				<span class="app-sidebar-expandable">Sign out</span>
			</a>
		{/if}
	</div>
</aside>

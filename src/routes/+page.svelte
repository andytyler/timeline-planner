<script lang="ts">
	import { ArrowRight, Building2, Inbox, Plus, UserPlus } from '@lucide/svelte';
	import WorkspaceSidebar from '$lib/components/workspace-sidebar.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const formMessage = (intent: string) => (form?.intent === intent ? form.message : null);
	const firstWorkspaceId = $derived(data.workspaces[0]?.id ?? null);
</script>

<svelte:head>
	<title>Workspace setup / Timeline Planner</title>
</svelte:head>

<main class="app-page">
	<div class="app-shell-grid">
		<WorkspaceSidebar
			active="setup"
			activeWorkspaceId={firstWorkspaceId}
			userEmail={data.userEmail}
			workspaces={data.workspaces}
			workspaceName={data.workspaces[0]?.name ?? 'Timeline Planner'}
		/>

		<section class="min-w-0">
			<header class="app-topbar">
				<div
					class="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--app-text-muted)]"
				>
					<Building2 class="size-4" />
					<span>Workspace setup</span>
				</div>
				<a class="app-button" href="/planner">
					Open sample
					<ArrowRight class="size-4" />
				</a>
			</header>

			<div class="mx-auto grid w-full max-w-5xl gap-8 px-6 py-8">
				<header class="max-w-3xl">
					<div
						class="mb-4 grid size-12 place-items-center rounded-lg border border-[var(--app-line)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]"
					>
						<Building2 class="size-6 text-[var(--app-accent)]" />
					</div>
					<p class="app-section-title">Signed in as {data.userEmail}</p>
					<h1 class="mt-2 text-4xl font-semibold tracking-[-0.025em] text-[var(--app-text)]">
						Set up your planning workspace
					</h1>
					<p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--app-text-muted)]">
						Workspaces hold timelines, Luma credentials, saved planners, and team access. Create one
						or accept an invitation to get started.
					</p>
				</header>

				<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
					<section class="app-panel overflow-hidden">
						<div
							class="flex items-center justify-between border-b border-[var(--app-line)] px-4 py-3"
						>
							<div class="flex items-center gap-2">
								<Inbox class="size-4 text-[var(--app-text-muted)]" />
								<h2 class="text-sm font-semibold">Invitations</h2>
							</div>
							<span class="app-pill">{data.myInvitations.length} pending</span>
						</div>

						{#if data.myInvitations.length > 0}
							<div class="divide-y divide-zinc-100">
								{#each data.myInvitations as invite (invite.id)}
									<form
										method="POST"
										action="?/acceptInvitation"
										class="app-database-row grid-cols-[minmax(0,1fr)_110px_auto] gap-3"
									>
										<input type="hidden" name="invitationId" value={invite.id} />
										<div class="min-w-0">
											<p class="truncate text-sm font-semibold">Workspace invitation</p>
											<p class="truncate text-xs text-[var(--app-text-muted)]">
												Invited as {invite.role}
											</p>
										</div>
										<span class="app-pill justify-self-start">{invite.role}</span>
										<button type="submit" class="app-button app-button-primary"> Accept </button>
									</form>
								{/each}
							</div>
						{:else}
							<div class="px-4 py-10 text-sm text-[var(--app-text-muted)]">
								No pending invitations for this email.
							</div>
						{/if}

						{#if formMessage('invitation')}
							<p
								class="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
							>
								{formMessage('invitation')}
							</p>
						{/if}
					</section>

					<section class="app-panel p-4">
						<div class="mb-4 flex items-center gap-2">
							<div
								class="grid size-8 place-items-center rounded-lg bg-[var(--app-soft)] text-[var(--app-accent)]"
							>
								<UserPlus class="size-4" />
							</div>
							<div>
								<h2 class="text-sm font-semibold">New workspace</h2>
								<p class="text-xs text-[var(--app-text-muted)]">
									Create the first planning database.
								</p>
							</div>
						</div>

						<form method="POST" action="?/createWorkspace" class="grid gap-3">
							<label class="app-label">
								Workspace name
								<input name="name" placeholder="Spring / Summer 26" class="app-input" />
							</label>
							<button type="submit" class="app-button app-button-primary h-9">
								<Plus class="size-4" />
								Create workspace
							</button>
						</form>

						{#if formMessage('workspace')}
							<p
								class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
							>
								{formMessage('workspace')}
							</p>
						{/if}
					</section>
				</div>
			</div>
		</section>
	</div>
</main>

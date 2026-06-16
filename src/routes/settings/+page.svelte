<script lang="ts">
	import {
		ArrowRight,
		Building2,
		CalendarDays,
		KeyRound,
		Plus,
		UserRound,
		Users
	} from '@lucide/svelte';
	import WorkspaceSidebar from '$lib/components/workspace-sidebar.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const activeWorkspace = $derived(
		data.workspaces.find((workspace) => workspace.id === data.activeWorkspaceId) ??
			data.workspaces[0] ??
			null
	);
	const canManageActiveWorkspace = $derived(
		data.activeWorkspaceRole === 'owner' || data.activeWorkspaceRole === 'admin'
	);
	const canUseWorkspaceLuma = $derived(Boolean(activeWorkspace));
	const initials = $derived(
		(data.currentProfile?.full_name || data.userEmail || '?').slice(0, 1).toUpperCase()
	);

	function formMessage(intent: string) {
		return form?.intent === intent ? form.message : null;
	}

	function memberLabel(member: PageData['members'][number]) {
		return member.profile?.full_name || member.profile?.email || member.user_id.slice(0, 8);
	}

	function memberSecondary(member: PageData['members'][number]) {
		if (member.profile?.full_name && member.profile.email) return member.profile.email;
		return member.user_id.slice(0, 8);
	}

	function canManageMember(member: PageData['members'][number]) {
		if (!canManageActiveWorkspace) return false;
		if (member.role === 'owner') return false;
		if (member.user_id === data.currentUserId) return false;
		if (data.activeWorkspaceRole === 'admin' && member.role === 'admin') return false;
		return true;
	}

	function memberRoleChoices() {
		return data.activeWorkspaceRole === 'owner'
			? ['admin', 'member', 'viewer']
			: ['member', 'viewer'];
	}
</script>

<svelte:head>
	<title>Settings / Timeline Planner</title>
</svelte:head>

<main class="app-page [&_input]:w-full [&_select]:w-full [&_textarea]:w-full">
	<div class="app-shell-grid">
		<WorkspaceSidebar
			active="settings"
			activeWorkspaceId={data.activeWorkspaceId}
			userEmail={data.userEmail}
			workspaces={data.workspaces}
			workspaceName={data.activeWorkspaceName ?? 'Timeline Planner'}
		/>

		<section class="min-w-0">
			<header class="app-topbar">
				<div
					class="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--app-text-muted)]"
				>
					<Building2 class="size-4" />
					<span>Settings</span>
					{#if activeWorkspace}
						<span class="text-[var(--app-text-subtle)]">/</span>
						<span class="truncate text-[var(--app-text-secondary)]">{activeWorkspace.name}</span>
					{/if}
				</div>
				{#if activeWorkspace}
					<a
						class="app-button app-button-primary"
						href={`/planner?workspace=${activeWorkspace.id}`}
					>
						Open planner
						<ArrowRight class="size-4" />
					</a>
				{/if}
			</header>

			<div
				class="mx-auto grid w-full max-w-6xl gap-8 px-6 py-6 lg:grid-cols-[180px_minmax(0,760px)]"
			>
				<nav class="hidden lg:block" aria-label="Settings sections">
					<div class="sticky top-16 grid gap-1 text-sm">
						<a class="app-sidebar-row is-active" href="#profile">Profile</a>
						<a class="app-sidebar-row" href="#workspace">Workspace</a>
						<a class="app-sidebar-row" href="#luma">Luma</a>
						<a class="app-sidebar-row" href="#people">People</a>
						<a class="app-sidebar-row" href="#timelines">Timelines</a>
					</div>
				</nav>

				<div class="min-w-0">
					<header class="mb-6">
						<p class="app-section-title">Workspace settings</p>
						<h1 class="mt-2 text-4xl font-semibold tracking-[-0.025em] text-[var(--app-text)]">
							Settings
						</h1>
						<p class="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-text-muted)]">
							Manage your profile, workspace credentials, members, invitations, and saved planners
							from one place.
						</p>
					</header>

					<div class="app-panel px-5">
						<section id="profile" class="app-section scroll-mt-20">
							<div class="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
								<div>
									<h2 class="text-sm font-semibold text-[var(--app-text)]">Profile</h2>
									<p class="mt-1 text-sm leading-5 text-[var(--app-text-muted)]">
										This is shown to other workspace members.
									</p>
								</div>

								<div class="grid gap-4">
									<div class="flex items-center gap-3">
										{#if data.currentProfile?.avatar_url}
											<img
												class="size-12 rounded-md border object-cover"
												src={data.currentProfile.avatar_url}
												alt=""
											/>
										{:else}
											<div
												class="grid size-12 place-items-center rounded-lg border border-[var(--app-line)] bg-[var(--app-soft)] text-lg font-semibold text-[var(--app-text-muted)]"
											>
												{initials}
											</div>
										{/if}
										<div class="min-w-0">
											<p class="truncate text-sm font-semibold text-[var(--app-text)]">
												{data.currentProfile?.full_name || data.userEmail}
											</p>
											<p class="truncate text-sm text-[var(--app-text-muted)]">
												{data.currentProfile?.email || data.userEmail}
											</p>
										</div>
									</div>

									<form class="grid gap-3" method="POST" action="?/updateProfile">
										<input
											type="hidden"
											name="returnTo"
											value={activeWorkspace
												? `/settings?workspace=${activeWorkspace.id}`
												: '/settings'}
										/>
										<label class="app-label">
											Display name
											<input
												class="app-input"
												name="fullName"
												value={data.currentProfile?.full_name ?? ''}
												maxlength="120"
												placeholder="Your name"
											/>
										</label>
										<label class="app-label">
											Avatar URL
											<input
												class="app-input"
												name="avatarUrl"
												value={data.currentProfile?.avatar_url ?? ''}
												maxlength="500"
												placeholder="https://..."
											/>
										</label>
										<button class="app-button w-fit" type="submit">Save profile</button>
										{#if formMessage('profile')}
											<p
												class="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
											>
												{formMessage('profile')}
											</p>
										{/if}
									</form>
								</div>
							</div>
						</section>

						<section id="workspace" class="app-section scroll-mt-20">
							<div class="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
								<div>
									<h2 class="text-sm font-semibold text-[var(--app-text)]">Workspace</h2>
									<p class="mt-1 text-sm leading-5 text-[var(--app-text-muted)]">
										Create and switch between planning workspaces.
									</p>
								</div>

								<div class="grid gap-4">
									{#if activeWorkspace}
										<div
											class="grid gap-2 rounded-lg border border-[var(--app-line)] bg-[var(--app-soft)] p-3"
										>
											<p class="text-sm font-semibold text-[var(--app-text)]">
												{data.activeWorkspaceName}
											</p>
											<p class="text-sm text-[var(--app-text-muted)]">
												{data.members.length} members / {data.invitations.length} invites
											</p>
											<p class="text-sm text-[var(--app-text-muted)]">
												{data.lumaEventCount} Luma events / {data.timelines.length} timelines
											</p>
										</div>
									{/if}

									<div class="flex flex-wrap gap-2">
										{#each data.workspaces as workspace (workspace.id)}
											<a
												class={[
													'app-button',
													workspace.id === activeWorkspace?.id ? 'app-button-primary' : ''
												]}
												href={`/settings?workspace=${workspace.id}`}
											>
												{workspace.name}
											</a>
										{/each}
									</div>

									<form class="grid gap-3" method="POST" action="?/createWorkspace">
										<label class="app-label">
											New workspace
											<input class="app-input" name="name" placeholder="Event Operations" />
										</label>
										<button class="app-button app-button-primary w-fit" type="submit">
											<Plus class="size-4" />
											Create workspace
										</button>
										{#if formMessage('workspace')}
											<p
												class="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
											>
												{formMessage('workspace')}
											</p>
										{/if}
									</form>
								</div>
							</div>
						</section>

						<section id="luma" class="app-section scroll-mt-20">
							<div class="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
								<div>
									<h2 class="text-sm font-semibold text-[var(--app-text)]">Luma</h2>
									<p class="mt-1 text-sm leading-5 text-[var(--app-text-muted)]">
										Workspace-level credentials are available only to this workspace.
									</p>
								</div>

								<div class="grid gap-3">
									{#if activeWorkspace && canUseWorkspaceLuma}
										<form class="grid gap-3" method="POST" action="?/updateLumaSource">
											<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
											<label class="app-label">
												Luma calendar API ID
												<input
													class="app-input"
													name="calendarApiId"
													value={data.activeWorkspaceLumaCalendarApiId ?? ''}
													maxlength="120"
													placeholder="cal-..."
												/>
											</label>
											<label class="app-label">
												Luma API key
												<input
													class="app-input"
													name="lumaApiKey"
													type="password"
													autocomplete="off"
													maxlength="500"
													placeholder={data.activeWorkspaceLumaApiKeyConfigured
														? 'Saved - enter a new key to replace'
														: 'Paste workspace Luma API key'}
												/>
											</label>
											<p class="text-sm leading-5 text-[var(--app-text-muted)]">
												{data.activeWorkspaceLumaApiKeyConfigured
													? 'A Luma API key is saved for this workspace.'
													: 'No Luma API key is saved for this workspace yet.'}
											</p>
											<div class="flex flex-wrap gap-2">
												<button class="app-button" type="submit">Save Luma settings</button>
											</div>
										</form>
										<form method="POST" action="?/syncLumaEvents">
											<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
											<button class="app-button" type="submit">
												<KeyRound class="size-4" />
												Sync Luma
											</button>
										</form>
									{:else}
										<p class="text-sm text-[var(--app-text-muted)]">
											Create a workspace before connecting Luma.
										</p>
									{/if}
									{#if formMessage('luma')}
										<p
											class="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
										>
											{formMessage('luma')}
										</p>
									{/if}
								</div>
							</div>
						</section>

						<section id="people" class="app-section scroll-mt-20">
							<div class="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
								<div>
									<h2 class="text-sm font-semibold text-[var(--app-text)]">People</h2>
									<p class="mt-1 text-sm leading-5 text-[var(--app-text-muted)]">
										Invite members and manage workspace roles.
									</p>
								</div>

								<div class="grid gap-4">
									{#if activeWorkspace && canManageActiveWorkspace}
										<form class="grid gap-3" method="POST" action="?/inviteMember">
											<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
											<label class="app-label">
												Invite email
												<input
													class="app-input"
													name="email"
													type="email"
													placeholder="person@example.com"
												/>
											</label>
											<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
												<select class="app-input" name="role">
													<option value="member">Member</option>
													<option value="viewer">Viewer</option>
													<option value="admin">Admin</option>
												</select>
												<button class="app-button app-button-primary" type="submit">
													Invite
												</button>
											</div>
											{#if formMessage('invite')}
												<p
													class="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
												>
													{formMessage('invite')}
												</p>
											{/if}
										</form>
									{/if}

									{#if formMessage('member')}
										<p
											class="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
										>
											{formMessage('member')}
										</p>
									{/if}

									<div class="overflow-hidden rounded-lg border border-[var(--app-line)]">
										<div
											class="grid min-h-9 grid-cols-[minmax(0,1fr)_90px_auto] items-center gap-3 bg-[var(--app-soft)] px-3 text-xs font-semibold text-[var(--app-text-muted)]"
										>
											<span>Member</span>
											<span>Role</span>
											<span></span>
										</div>
										{#each data.members as member (member.user_id)}
											<div
												class="grid grid-cols-[minmax(0,1fr)_90px_auto] items-center gap-3 border-t border-[var(--app-line)] px-3 py-2"
											>
												<div class="min-w-0">
													<p class="truncate text-sm font-semibold text-[var(--app-text)]">
														{memberLabel(member)}
													</p>
													<p class="truncate text-xs text-[var(--app-text-muted)]">
														{memberSecondary(member)}
													</p>
												</div>
												<span class="app-pill justify-self-start">{member.role}</span>
												{#if activeWorkspace && canManageMember(member)}
													<div class="flex flex-wrap justify-end gap-1">
														<form class="flex gap-1" method="POST" action="?/updateMemberRole">
															<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
															<input type="hidden" name="userId" value={member.user_id} />
															<select class="app-input h-8 w-[110px]" name="role">
																{#each memberRoleChoices() as role (role)}
																	<option value={role} selected={member.role === role}>
																		{role}
																	</option>
																{/each}
															</select>
															<button class="app-button" type="submit">Update</button>
														</form>
														<form method="POST" action="?/removeMember">
															<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
															<input type="hidden" name="userId" value={member.user_id} />
															<button
																class="app-button border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
																type="submit"
															>
																Remove
															</button>
														</form>
													</div>
												{/if}
											</div>
										{:else}
											<p
												class="border-t border-[var(--app-line)] px-3 py-8 text-sm text-[var(--app-text-muted)]"
											>
												No members yet.
											</p>
										{/each}
									</div>

									{#if data.myInvitations.length > 0}
										<div class="grid gap-2">
											<p class="text-sm font-semibold text-[var(--app-text)]">
												Invitations for you
											</p>
											{#each data.myInvitations as invite (invite.id)}
												<form
													class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--app-line)] bg-[var(--app-soft)] p-3"
													method="POST"
													action="?/acceptInvitation"
												>
													<input type="hidden" name="invitationId" value={invite.id} />
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold">Workspace invite</p>
														<p class="text-xs text-[var(--app-text-muted)]">{invite.role}</p>
													</div>
													<button class="app-button app-button-primary" type="submit">
														Accept
													</button>
												</form>
											{/each}
										</div>
									{/if}

									{#if canManageActiveWorkspace && data.invitations.length > 0}
										<div class="grid gap-2">
											<p class="text-sm font-semibold text-[var(--app-text)]">
												Pending invitations
											</p>
											{#each data.invitations as invite (invite.id)}
												<div
													class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--app-line)] p-3"
												>
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold">{invite.email}</p>
														<p class="text-xs text-[var(--app-text-muted)]">
															{invite.role} pending
														</p>
													</div>
													<form method="POST" action="?/revokeInvitation">
														<input type="hidden" name="invitationId" value={invite.id} />
														<button class="app-button" type="submit">Revoke</button>
													</form>
												</div>
											{/each}
										</div>
									{/if}

									{#if formMessage('invitation')}
										<p
											class="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
										>
											{formMessage('invitation')}
										</p>
									{/if}
								</div>
							</div>
						</section>

						<section id="timelines" class="app-section scroll-mt-20">
							<div class="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
								<div>
									<h2 class="text-sm font-semibold text-[var(--app-text)]">Timelines</h2>
									<p class="mt-1 text-sm leading-5 text-[var(--app-text-muted)]">
										Saved planners in the active workspace.
									</p>
								</div>

								<div class="grid gap-2">
									{#if activeWorkspace && data.timelines.length > 0}
										{#each data.timelines as timeline (timeline.id)}
											<a
												class="app-database-row grid-cols-[1fr_auto] gap-3 rounded-lg border border-[var(--app-line)]"
												href={`/planner?workspace=${activeWorkspace.id}&timeline=${timeline.id}`}
											>
												<span class="truncate text-sm font-semibold text-[var(--app-text)]">
													{timeline.title}
												</span>
												<CalendarDays class="size-4 text-[var(--app-text-subtle)]" />
											</a>
										{/each}
									{:else}
										<p class="text-sm text-[var(--app-text-muted)]">
											No timelines are saved in this workspace yet.
										</p>
									{/if}
								</div>
							</div>
						</section>
					</div>

					<div class="mt-5 flex justify-between">
						<a class="app-button" href="/logout">
							<UserRound class="size-4" />
							Sign out
						</a>
						{#if activeWorkspace}
							<a class="app-button" href={`/timelines?workspace=${activeWorkspace.id}`}>
								<Users class="size-4" />
								All planners
							</a>
						{/if}
					</div>
				</div>
			</div>
		</section>
	</div>
</main>

<script lang="ts">
	import { ArrowLeft, CalendarDays, KeyRound, Plus, UserRound, Users } from '@lucide/svelte';
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

<main class="min-h-svh bg-[#f6f7f4] px-4 py-5 text-neutral-950 [&_input]:w-full [&_select]:w-full">
	<div class="mx-auto grid w-full max-w-6xl gap-5">
		<header class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<a
					class="mb-3 inline-flex h-9 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold text-neutral-700 shadow-sm hover:text-neutral-950"
					href={activeWorkspace ? `/planner?workspace=${activeWorkspace.id}` : '/planner'}
				>
					<ArrowLeft class="size-4" />
					Back to planner
				</a>
				<h1 class="text-3xl font-black tracking-normal">Settings</h1>
			</div>
			{#if activeWorkspace}
				<div class="flex flex-wrap gap-2">
					{#each data.workspaces as workspace (workspace.id)}
						<a
							class={[
								'rounded-lg border px-3 py-2 text-sm font-black shadow-sm',
								workspace.id === activeWorkspace.id
									? 'border-neutral-950 bg-neutral-950 text-white'
									: 'bg-white text-neutral-600 hover:text-neutral-950'
							]}
							href={`/settings?workspace=${workspace.id}`}
						>
							{workspace.name}
						</a>
					{/each}
				</div>
			{/if}
		</header>

		<div class="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
			<section class="grid gap-5">
				<div class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
					<div class="mb-5 flex items-center gap-4">
						{#if data.currentProfile?.avatar_url}
							<img
								class="size-14 rounded-xl border object-cover"
								src={data.currentProfile.avatar_url}
								alt=""
							/>
						{:else}
							<div
								class="grid size-14 place-items-center rounded-xl border bg-neutral-50 text-lg font-black text-neutral-500"
							>
								{initials}
							</div>
						{/if}
						<div class="min-w-0">
							<p class="truncate text-lg font-black">
								{data.currentProfile?.full_name || data.userEmail}
							</p>
							<p class="truncate text-sm font-bold text-neutral-500">
								{data.currentProfile?.email || data.userEmail}
							</p>
						</div>
					</div>

					<form class="grid gap-3" method="POST" action="?/updateProfile">
						<input
							type="hidden"
							name="returnTo"
							value={activeWorkspace ? `/settings?workspace=${activeWorkspace.id}` : '/settings'}
						/>
						<label class="grid gap-2 text-sm font-black text-neutral-500">
							Display name
							<input
								class="h-11 rounded-lg border bg-white px-3 text-sm font-bold text-neutral-950 outline-none focus:border-neutral-950"
								name="fullName"
								value={data.currentProfile?.full_name ?? ''}
								maxlength="120"
								placeholder="Your name"
							/>
						</label>
						<label class="grid gap-2 text-sm font-black text-neutral-500">
							Avatar URL
							<input
								class="h-11 rounded-lg border bg-white px-3 text-sm font-bold text-neutral-950 outline-none focus:border-neutral-950"
								name="avatarUrl"
								value={data.currentProfile?.avatar_url ?? ''}
								maxlength="500"
								placeholder="https://..."
							/>
						</label>
						<button class="h-11 rounded-lg border bg-white text-sm font-black" type="submit">
							Save profile
						</button>
						{#if formMessage('profile')}
							<p
								class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
							>
								{formMessage('profile')}
							</p>
						{/if}
					</form>
				</div>

				<div class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
					<div class="mb-4 flex items-center gap-2">
						<Plus class="size-5 text-neutral-500" />
						<h2 class="text-lg font-black">Workspace</h2>
					</div>
					<form class="grid gap-3" method="POST" action="?/createWorkspace">
						<label class="grid gap-2 text-sm font-black text-neutral-500">
							New workspace
							<input
								class="h-11 rounded-lg border bg-white px-3 text-sm font-bold text-neutral-950 outline-none focus:border-neutral-950"
								name="name"
								placeholder="Event Operations"
							/>
						</label>
						<button
							class="h-11 rounded-lg bg-neutral-950 text-sm font-black text-white"
							type="submit"
						>
							Create workspace
						</button>
						{#if formMessage('workspace')}
							<p
								class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
							>
								{formMessage('workspace')}
							</p>
						{/if}
					</form>
				</div>

				{#if data.myInvitations.length > 0}
					<div class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
						<h2 class="mb-3 text-lg font-black">Pending invitations</h2>
						<div class="grid gap-2">
							{#each data.myInvitations as invite (invite.id)}
								<form
									class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-neutral-50 p-3"
									method="POST"
									action="?/acceptInvitation"
								>
									<input type="hidden" name="invitationId" value={invite.id} />
									<div class="min-w-0">
										<p class="truncate font-black">Workspace invite</p>
										<p class="text-xs font-black text-neutral-500 uppercase">{invite.role}</p>
									</div>
									<button class="h-9 rounded-lg bg-neutral-950 px-3 text-sm font-black text-white">
										Accept
									</button>
								</form>
							{/each}
						</div>
						{#if formMessage('invitation')}
							<p
								class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
							>
								{formMessage('invitation')}
							</p>
						{/if}
					</div>
				{/if}
			</section>

			<section class="grid gap-5">
				{#if activeWorkspace}
					<div class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
						<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 class="text-xl font-black">{data.activeWorkspaceName}</h2>
								<p class="mt-1 text-sm font-bold text-neutral-500">
									{data.members.length} members / {data.invitations.length} invites
								</p>
								<p class="text-sm font-bold text-neutral-500">
									{data.lumaEventCount} Luma events / {data.timelines.length} timelines
								</p>
							</div>
							<a
								class="inline-flex h-9 items-center rounded-lg border bg-white px-3 text-sm font-black"
								href={`/planner?workspace=${activeWorkspace.id}`}
							>
								Open planner
							</a>
						</div>

						{#if canUseWorkspaceLuma}
							<form class="grid gap-3 border-t pt-4" method="POST" action="?/updateLumaSource">
								<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
								<label class="grid gap-2 text-sm font-black text-neutral-500">
									Luma calendar API ID
									<input
										class="h-11 rounded-lg border bg-white px-3 text-sm font-bold text-neutral-950 outline-none focus:border-neutral-950"
										name="calendarApiId"
										value={data.activeWorkspaceLumaCalendarApiId ?? ''}
										maxlength="120"
										placeholder="cal-..."
									/>
								</label>
								<label class="grid gap-2 text-sm font-black text-neutral-500">
									Luma API key
									<input
										class="h-11 rounded-lg border bg-white px-3 text-sm font-bold text-neutral-950 outline-none focus:border-neutral-950"
										name="lumaApiKey"
										type="password"
										autocomplete="off"
										maxlength="500"
										placeholder={data.activeWorkspaceLumaApiKeyConfigured
											? 'Saved - enter a new key to replace'
											: 'Paste workspace Luma API key'}
									/>
								</label>
								<p class="text-sm leading-5 font-bold text-neutral-500">
									{data.activeWorkspaceLumaApiKeyConfigured
										? 'A Luma API key is saved for this workspace.'
										: 'No Luma API key is saved for this workspace yet.'}
								</p>
								<button class="h-11 rounded-lg border bg-white text-sm font-black" type="submit">
									Save Luma settings
								</button>
							</form>
							<form class="mt-3" method="POST" action="?/syncLumaEvents">
								<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
								<button
									class="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-black"
									type="submit"
								>
									<KeyRound class="size-4" />
									Sync Luma
								</button>
							</form>
						{/if}
						{#if formMessage('luma')}
							<p
								class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
							>
								{formMessage('luma')}
							</p>
						{/if}
					</div>

					<div class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
						<div class="mb-4 flex items-center gap-2">
							<Users class="size-5 text-neutral-500" />
							<h2 class="text-lg font-black">People</h2>
						</div>

						{#if canManageActiveWorkspace}
							<form class="grid gap-3" method="POST" action="?/inviteMember">
								<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
								<label class="grid gap-2 text-sm font-black text-neutral-500">
									Invite email
									<input
										class="h-11 rounded-lg border bg-white px-3 text-sm font-bold text-neutral-950 outline-none focus:border-neutral-950"
										name="email"
										type="email"
										placeholder="person@example.com"
									/>
								</label>
								<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
									<select
										class="h-11 rounded-lg border bg-white px-3 text-sm font-black text-neutral-950"
										name="role"
									>
										<option value="member">Member</option>
										<option value="viewer">Viewer</option>
										<option value="admin">Admin</option>
									</select>
									<button class="h-11 rounded-lg bg-neutral-950 px-5 text-sm font-black text-white">
										Invite
									</button>
								</div>
								{#if formMessage('invite')}
									<p
										class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
									>
										{formMessage('invite')}
									</p>
								{/if}
							</form>
						{/if}

						<div class="mt-5 grid gap-3 border-t pt-4">
							{#if formMessage('member')}
								<p
									class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
								>
									{formMessage('member')}
								</p>
							{/if}
							{#each data.members as member (member.user_id)}
								<div class="grid gap-3 rounded-xl border bg-neutral-50 p-4">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="truncate font-black">{memberLabel(member)}</p>
											<p class="truncate text-sm font-bold text-neutral-500">
												{memberSecondary(member)}
											</p>
										</div>
										<span
											class="rounded-full border bg-white px-3 py-1 text-xs font-black text-neutral-500 uppercase"
										>
											{member.role}
										</span>
									</div>

									{#if canManageMember(member)}
										<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
											<form
												class="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
												method="POST"
												action="?/updateMemberRole"
											>
												<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
												<input type="hidden" name="userId" value={member.user_id} />
												<select class="h-10 rounded-lg border bg-white px-3 font-bold" name="role">
													{#each memberRoleChoices() as role (role)}
														<option value={role} selected={member.role === role}>{role}</option>
													{/each}
												</select>
												<button class="h-10 rounded-lg border bg-white px-3 font-black">
													Update
												</button>
											</form>
											<form method="POST" action="?/removeMember">
												<input type="hidden" name="workspaceId" value={activeWorkspace.id} />
												<input type="hidden" name="userId" value={member.user_id} />
												<button
													class="h-10 rounded-lg border border-red-200 bg-red-50 px-3 font-black text-red-700"
												>
													Remove
												</button>
											</form>
										</div>
									{/if}
								</div>
							{/each}
						</div>

						{#if canManageActiveWorkspace && data.invitations.length > 0}
							<div class="mt-5 grid gap-3 border-t pt-4">
								{#each data.invitations as invite (invite.id)}
									<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
										<div class="min-w-0">
											<p class="truncate font-black">{invite.email}</p>
											<p class="text-xs font-black text-neutral-500 uppercase">
												{invite.role} pending
											</p>
										</div>
										<form method="POST" action="?/revokeInvitation">
											<input type="hidden" name="invitationId" value={invite.id} />
											<button class="h-9 rounded-lg border bg-white px-3 text-sm font-black">
												Revoke
											</button>
										</form>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					{#if data.timelines.length > 0}
						<div class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
							<div class="mb-3 flex items-center gap-2">
								<CalendarDays class="size-5 text-neutral-500" />
								<h2 class="text-lg font-black">Timelines</h2>
							</div>
							<div class="grid gap-2">
								{#each data.timelines as timeline (timeline.id)}
									<a
										class="rounded-lg border bg-neutral-50 px-3 py-2 font-black hover:bg-white"
										href={`/planner?workspace=${activeWorkspace.id}&timeline=${timeline.id}`}
									>
										{timeline.title}
									</a>
								{/each}
							</div>
						</div>
					{/if}
				{:else}
					<div class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
						<div class="mb-4 flex items-center gap-2">
							<UserRound class="size-5 text-neutral-500" />
							<h2 class="text-lg font-black">No workspace yet</h2>
						</div>
						<p class="text-sm font-bold text-neutral-500">
							Create a workspace or accept an invitation to manage Luma keys, timelines, and people.
						</p>
					</div>
				{/if}

				<a
					class="inline-flex h-11 w-fit items-center rounded-lg border bg-white px-4 text-sm font-black shadow-sm"
					href="/logout"
				>
					Sign out
				</a>
			</section>
		</div>
	</div>
</main>

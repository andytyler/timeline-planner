<script lang="ts">
	import { ArrowRight, Building2, MailPlus, Plus } from '@lucide/svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const formMessage = (intent: string) => (form?.intent === intent ? form.message : null);
</script>

<svelte:head>
	<title>Workspace setup / Timeline Planner</title>
</svelte:head>

<main class="min-h-svh bg-[#f6f7f4] text-neutral-950">
	<section class="mx-auto grid min-h-svh w-full max-w-5xl content-center gap-8 px-6 py-10">
		<header class="max-w-2xl">
			<div class="mb-4 flex items-center gap-3">
				<div class="grid size-10 place-items-center rounded-lg bg-neutral-950 text-white">
					<Building2 class="size-5" />
				</div>
				<p class="text-sm font-bold text-neutral-500">{data.userEmail}</p>
			</div>
			<h1 class="text-4xl font-bold tracking-normal md:text-5xl">Set up your workspace</h1>
			<p class="mt-3 max-w-xl text-base leading-7 text-neutral-600">
				Accept an invitation or create the workspace where your timelines, Luma source, and team
				access will live.
			</p>
		</header>

		<div class="grid gap-4 md:grid-cols-[1fr_0.9fr]">
			{#if data.myInvitations.length > 0}
				<section class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
					<div class="mb-4 flex items-center gap-2">
						<MailPlus class="size-5 text-neutral-500" />
						<h2 class="text-lg font-bold">Pending invitations</h2>
					</div>
					<div class="grid gap-3">
						{#each data.myInvitations as invite (invite.id)}
							<form
								method="POST"
								action="?/acceptInvitation"
								class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-neutral-50 p-3"
							>
								<input type="hidden" name="invitationId" value={invite.id} />
								<div>
									<p class="text-sm font-bold">Workspace invitation</p>
									<p class="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
										{invite.role}
									</p>
								</div>
								<button
									type="submit"
									class="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white"
								>
									Accept
									<ArrowRight class="size-4" />
								</button>
							</form>
						{/each}
					</div>
					{#if formMessage('invitation')}
						<p
							class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"
						>
							{formMessage('invitation')}
						</p>
					{/if}
				</section>
			{/if}

			<section class="rounded-xl border bg-white p-5 shadow-xl shadow-neutral-950/5">
				<div class="mb-4 flex items-center gap-2">
					<Plus class="size-5 text-neutral-500" />
					<h2 class="text-lg font-bold">Create workspace</h2>
				</div>
				<form method="POST" action="?/createWorkspace" class="grid gap-3">
					<label class="grid gap-2 text-sm font-bold">
						Workspace name
						<input
							name="name"
							placeholder="Spring / Summer 26"
							class="h-11 rounded-lg border bg-white px-3 text-sm font-semibold outline-none focus:border-neutral-950"
						/>
					</label>
					<button
						type="submit"
						class="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white"
					>
						Create workspace
						<ArrowRight class="size-4" />
					</button>
				</form>
				{#if formMessage('workspace')}
					<p
						class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"
					>
						{formMessage('workspace')}
					</p>
				{/if}
			</section>
		</div>

		{#if data.workspaces.length > 0}
			<a href="/planner" class="text-sm font-bold text-neutral-500 hover:text-neutral-950">
				Open existing workspace
			</a>
		{/if}
	</section>
</main>

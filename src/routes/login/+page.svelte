<script lang="ts">
	import { ArrowRight, CalendarDays, Lock, Mail } from '@lucide/svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let authMode = $state<'signin' | 'signup'>('signin');
</script>

<svelte:head>
	<title>Sign in / Timeline Planner</title>
</svelte:head>

<main class="grid min-h-svh place-items-center bg-[#f6f7f4] p-6 text-neutral-950">
	<section class="w-full max-w-md rounded-xl border bg-white p-6 shadow-2xl shadow-neutral-950/10">
		<div class="mb-6 flex items-center gap-3">
			<div class="grid size-10 place-items-center rounded-lg bg-neutral-950 text-white">
				<CalendarDays class="size-5" />
			</div>
			<div>
				<h1 class="text-2xl font-bold tracking-normal">Timeline Planner</h1>
				<p class="text-sm text-neutral-500">Sign into your workspace.</p>
			</div>
		</div>

		{#if form?.message}
			<p
				class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
			>
				{form.message}
			</p>
		{/if}

		{#if !data.supabaseConfigured}
			<div class="mb-4 rounded-lg border bg-neutral-50 p-3 text-sm leading-5 text-neutral-600">
				Supabase is not configured locally yet. Add `PUBLIC_SUPABASE_URL` and
				`PUBLIC_SUPABASE_PUBLISHABLE_KEY` to enable login.
			</div>
		{/if}

		<form method="POST" action="?/email" class="grid gap-3">
			<input type="hidden" name="next" value={data.next} />
			<input type="hidden" name="mode" value={authMode} />
			<label class="grid gap-2 text-sm font-bold">
				Email
				<div class="flex h-11 items-center gap-2 rounded-lg border bg-white px-3">
					<Mail class="size-4 text-neutral-400" />
					<input
						name="email"
						type="email"
						autocomplete="email"
						placeholder="you@example.com"
						class="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
						required
					/>
				</div>
			</label>
			<label class="grid gap-2 text-sm font-bold">
				Password
				<div class="flex h-11 items-center gap-2 rounded-lg border bg-white px-3">
					<Lock class="size-4 text-neutral-400" />
					<input
						name="password"
						type="password"
						autocomplete={authMode === 'signup' ? 'new-password' : 'current-password'}
						placeholder="At least 6 characters"
						class="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
						required
					/>
				</div>
			</label>
			<button
				type="submit"
				class="flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
				disabled={!data.supabaseConfigured}
			>
				{authMode === 'signup' ? 'Create account' : 'Sign in with email'}
				<ArrowRight class="size-4" />
			</button>
			<button
				type="button"
				class="h-10 rounded-lg border px-4 text-sm font-bold text-neutral-700 hover:border-neutral-950 hover:text-neutral-950"
				onclick={() => (authMode = authMode === 'signup' ? 'signin' : 'signup')}
			>
				{authMode === 'signup' ? 'I already have an account' : 'Create an account'}
			</button>
		</form>

		<div
			class="my-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-bold tracking-wide text-neutral-400 uppercase"
		>
			<span class="h-px bg-neutral-200"></span>
			<span>or</span>
			<span class="h-px bg-neutral-200"></span>
		</div>

		<form method="POST" action="?/google" class="grid gap-3">
			<input type="hidden" name="next" value={data.next} />
			<button
				type="submit"
				class="flex h-11 items-center justify-center gap-2 rounded-lg border bg-white px-4 text-sm font-bold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
				disabled={!data.supabaseConfigured}
			>
				Continue with Google
				<ArrowRight class="size-4" />
			</button>
			<a
				href="/planner"
				class="text-center text-sm font-semibold text-neutral-500 hover:text-neutral-950"
			>
				Continue with local sample data
			</a>
		</form>
	</section>
</main>

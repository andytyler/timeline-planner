<script lang="ts">
	import { ArrowRight, CalendarDays, Lock, Mail } from '@lucide/svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let authMode = $state<'signin' | 'signup'>('signin');
</script>

<svelte:head>
	<title>Sign in / Timeline Planner</title>
</svelte:head>

<main class="app-page grid place-items-center px-4 py-8">
	<section class="w-full max-w-[380px]">
		<header class="mb-5">
			<div
				class="mb-4 grid size-11 place-items-center rounded-lg border border-[var(--app-line)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]"
			>
				<CalendarDays class="size-5 text-[var(--app-accent)]" />
			</div>
			<h1 class="text-2xl font-semibold tracking-normal text-[var(--app-text)]">
				Timeline Planner
			</h1>
			<p class="mt-1 text-sm text-[var(--app-text-muted)]">
				Sign in to open your workspace runboards.
			</p>
		</header>

		<div class="app-panel p-4">
			<div class="mb-4 inline-flex rounded-lg bg-[var(--app-soft)] p-0.5">
				<button
					type="button"
					class={[
						'h-8 rounded-md px-3 text-sm font-medium transition',
						authMode === 'signin'
							? 'bg-[var(--app-panel)] text-[var(--app-text)] shadow-[var(--app-shadow)]'
							: 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
					]}
					onclick={() => (authMode = 'signin')}
				>
					Sign in
				</button>
				<button
					type="button"
					class={[
						'h-8 rounded-md px-3 text-sm font-medium transition',
						authMode === 'signup'
							? 'bg-[var(--app-panel)] text-[var(--app-text)] shadow-[var(--app-shadow)]'
							: 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
					]}
					onclick={() => (authMode = 'signup')}
				>
					Create account
				</button>
			</div>

			{#if form?.message}
				<p
					class="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
				>
					{form.message}
				</p>
			{/if}

			{#if !data.supabaseConfigured}
				<div
					class="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-800"
				>
					Supabase is not configured locally yet. Add `PUBLIC_SUPABASE_URL` and
					`PUBLIC_SUPABASE_PUBLISHABLE_KEY` to enable login.
				</div>
			{/if}

			<form method="POST" action="?/email" class="grid gap-3">
				<input type="hidden" name="next" value={data.next} />
				<input type="hidden" name="mode" value={authMode} />
				<label class="app-label">
					Email
					<div class="app-input flex items-center gap-2">
						<Mail class="size-4 text-[var(--app-text-subtle)]" />
						<input
							name="email"
							type="email"
							autocomplete="email"
							placeholder="you@example.com"
							class="min-w-0 flex-1 bg-transparent outline-none"
							required
						/>
					</div>
				</label>
				<label class="app-label">
					Password
					<div class="app-input flex items-center gap-2">
						<Lock class="size-4 text-[var(--app-text-subtle)]" />
						<input
							name="password"
							type="password"
							autocomplete={authMode === 'signup' ? 'new-password' : 'current-password'}
							placeholder="At least 6 characters"
							class="min-w-0 flex-1 bg-transparent outline-none"
							required
						/>
					</div>
				</label>
				<button
					type="submit"
					class="app-button app-button-primary h-9"
					disabled={!data.supabaseConfigured}
				>
					{authMode === 'signup' ? 'Create account' : 'Sign in'}
					<ArrowRight class="size-4" />
				</button>
			</form>

			<div class="my-4 flex items-center gap-3 text-xs font-medium text-[var(--app-text-subtle)]">
				<span class="h-px flex-1 bg-[var(--app-line)]"></span>
				<span>or</span>
				<span class="h-px flex-1 bg-[var(--app-line)]"></span>
			</div>

			<form method="POST" action="?/google" class="grid gap-2">
				<input type="hidden" name="next" value={data.next} />
				<button type="submit" class="app-button h-9" disabled={!data.supabaseConfigured}>
					Continue with Google
					<ArrowRight class="size-4" />
				</button>
				<a class="app-button h-9" href="/planner">Continue with local sample data</a>
			</form>
		</div>
	</section>
</main>

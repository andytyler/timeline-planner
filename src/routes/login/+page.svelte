<script lang="ts">
	import { ArrowRight, CalendarDays } from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form?: { message?: string } } = $props();
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
				`PUBLIC_SUPABASE_PUBLISHABLE_KEY` to enable Google login.
			</div>
		{/if}

		<form method="POST" action="?/google" class="grid gap-3">
			<input type="hidden" name="next" value={data.next} />
			<button
				type="submit"
				class="flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
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

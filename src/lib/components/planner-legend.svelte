<script lang="ts">
	type LegendItem = {
		id: string;
		label: string;
		variant:
			| 'planning-fill'
			| 'actual-fill'
			| 'buffer-band'
			| 'advertised-outline'
			| 'merged-buffer'
			| 'scheduled-type'
			| 'planning-type'
			| 'milestone-type';
	};

	const layers: LegendItem[] = [
		{ id: 'planning-advertised', label: 'Planning / advertised', variant: 'planning-fill' },
		{ id: 'active-actual', label: 'Active / actual', variant: 'actual-fill' },
		{ id: 'buffer-band', label: 'Buffer', variant: 'buffer-band' },
		{ id: 'advertised-outline', label: 'Advertised outline', variant: 'advertised-outline' },
		{ id: 'merged-buffer', label: 'Merged buffer', variant: 'merged-buffer' }
	];

	const types: LegendItem[] = [
		{ id: 'scheduled', label: 'Scheduled', variant: 'scheduled-type' },
		{ id: 'planning', label: 'Planning', variant: 'planning-type' },
		{ id: 'milestone', label: 'Milestone', variant: 'milestone-type' }
	];
</script>

<div class="grid gap-3 text-[11px] leading-4 text-[var(--app-text-secondary)]">
	<section class="grid gap-1" aria-label="Timeline layers">
		<h3 class="px-1 text-[11px] font-semibold tracking-[0.01em] text-[var(--app-text-subtle)]">
			Layers
		</h3>
		<div class="grid gap-0.5">
			{#each layers as item (item.id)}
				<div
					class="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-[var(--app-soft-hover)]"
				>
					<span class="grid size-5 place-items-center rounded bg-[var(--app-panel)]">
						{#if item.variant === 'planning-fill'}
							<span class="h-3.5 w-4 rounded-sm border border-blue-900/20 bg-blue-600/85"></span>
						{:else if item.variant === 'actual-fill'}
							<span class="h-3.5 w-4 rounded-sm border border-emerald-900/20 bg-emerald-700/85"
							></span>
						{:else if item.variant === 'buffer-band'}
							<span
								class="h-3.5 w-4 rounded-sm border border-neutral-300 bg-[repeating-linear-gradient(135deg,rgba(92,101,110,.18)_0_4px,rgba(92,101,110,.04)_4px_8px)]"
							></span>
						{:else if item.variant === 'advertised-outline'}
							<span class="h-3.5 w-4 rounded-sm border-2 border-dashed border-violet-600 bg-white"
							></span>
						{:else}
							<span class="relative flex h-4 w-5 items-center justify-center">
								<span
									class="absolute top-0 size-1.5 rotate-45 rounded-[1px] border border-neutral-400 bg-white"
								></span>
								<span
									class="h-1.5 w-5 rounded-full bg-neutral-700/80 shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
								></span>
								<span
									class="absolute bottom-0 size-1.5 rotate-45 rounded-[1px] border border-neutral-400 bg-white"
								></span>
							</span>
						{/if}
					</span>
					<span class="min-w-0 truncate font-medium text-[var(--app-text-secondary)]"
						>{item.label}</span
					>
				</div>
			{/each}
		</div>
	</section>

	<section class="grid gap-1" aria-label="Timeline block types">
		<h3 class="px-1 text-[11px] font-semibold tracking-[0.01em] text-[var(--app-text-subtle)]">
			Types
		</h3>
		<div class="grid gap-0.5">
			{#each types as item (item.id)}
				<div
					class="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-[var(--app-soft-hover)]"
				>
					<span class="grid size-5 place-items-center rounded bg-[var(--app-panel)]">
						{#if item.variant === 'scheduled-type'}
							<span
								class="h-3.5 w-4 rounded-sm border border-emerald-900/20 bg-emerald-50 shadow-[inset_3px_0_0_rgba(4,120,87,0.85)]"
							></span>
						{:else if item.variant === 'planning-type'}
							<span
								class="h-3.5 w-4 rounded-sm border border-blue-900/20 bg-blue-50 shadow-[inset_3px_0_0_rgba(37,99,235,0.85)]"
							></span>
						{:else}
							<span class="relative h-4 w-5">
								<span class="absolute top-1/2 right-0 left-0 border-t-2 border-amber-700/75"></span>
								<span
									class="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-amber-700/40 bg-amber-100"
								></span>
							</span>
						{/if}
					</span>
					<span class="min-w-0 truncate font-medium text-[var(--app-text-secondary)]"
						>{item.label}</span
					>
				</div>
			{/each}
		</div>
	</section>
</div>

<script lang="ts">
	import { Check, Clock, LayoutGrid, List, Mic, Play, Sparkles, Users } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import type { TimelineBlockType } from '$lib/timeline';
	import * as Popover from '$lib/components/ui/popover';
	import EmojiPicker from './emoji-picker.svelte';

	type IconOption = {
		id: string;
		label: string;
		component: Component<{ class?: string }>;
	};

	type Props = {
		ariaLabel: string;
		disabled?: boolean;
		icon: string;
		onSelect: (icon: string) => void;
		title: string;
		type: TimelineBlockType;
	};

	let { ariaLabel, disabled = false, icon, onSelect, title, type }: Props = $props();
	let open = $state(false);

	const iconOptions: IconOption[] = [
		{ id: 'play', label: 'Play', component: Play },
		{ id: 'list', label: 'List', component: List },
		{ id: 'clock', label: 'Clock', component: Clock },
		{ id: 'users', label: 'Crew', component: Users },
		{ id: 'mic', label: 'Mic', component: Mic },
		{ id: 'spark', label: 'Moment', component: Sparkles },
		{ id: 'layout', label: 'Prep', component: LayoutGrid },
		{ id: 'check', label: 'Check', component: Check }
	];
	const lucideIconIds = new Set(iconOptions.map((option) => option.id));

	function isEmojiIcon(value: string) {
		return !lucideIconIds.has(value);
	}

	function iconColor(value: TimelineBlockType) {
		if (value === 'scheduled' || value === 'active') return 'bg-emerald-700 text-white';
		if (value === 'side') return 'bg-violet-600 text-white';
		if (value === 'milestone') return 'bg-amber-600 text-white';
		return 'bg-blue-600 text-white';
	}

	function iconTextColor(value: TimelineBlockType) {
		if (value === 'scheduled' || value === 'active') return 'text-emerald-800';
		if (value === 'side') return 'text-violet-700';
		if (value === 'milestone') return 'text-amber-700';
		return 'text-blue-700';
	}

	function iconComponent(value: string) {
		return iconOptions.find((option) => option.id === value)?.component ?? List;
	}

	function selectIcon(value: string) {
		if (disabled) return;
		onSelect(value);
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		type="button"
		aria-label={ariaLabel || `Change icon for ${title}`}
		data-no-drag
		class={[
			'grid size-5 place-items-center rounded-md bg-transparent text-[17px] leading-none drop-shadow-[0_2px_2px_rgba(15,23,42,0.25)] transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-neutral-950/20 focus-visible:outline-none disabled:cursor-default disabled:opacity-70',
			isEmojiIcon(icon) ? 'text-neutral-950' : iconTextColor(type)
		]}
		{disabled}
		onclick={(event) => event.stopPropagation()}
	>
		{#if isEmojiIcon(icon)}
			<span class="leading-none">{icon}</span>
		{:else}
			{@const Icon = iconComponent(icon)}
			<Icon class="size-4 stroke-[2.6]" />
		{/if}
	</Popover.Trigger>
	<Popover.Content
		side="bottom"
		align="start"
		sideOffset={8}
		collisionPadding={12}
		strategy="fixed"
		data-no-drag
		class="z-[220] grid w-auto gap-2 rounded-md border bg-white p-2 shadow-2xl shadow-neutral-950/20"
	>
		<Popover.Title class="sr-only">Icon picker</Popover.Title>
		<div class="grid grid-cols-8 gap-1">
			{#each iconOptions as option (option.id)}
				{@const Choice = option.component}
				<button
					type="button"
					class={[
						'grid size-8 place-items-center rounded-md border text-white transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-neutral-950/20 focus-visible:outline-none',
						iconColor(type),
						icon === option.id ? 'border-neutral-950' : 'border-transparent'
					]}
					title={option.label}
					aria-label={`Use ${option.label} icon`}
					onclick={() => selectIcon(option.id)}
				>
					<Choice class="size-4" />
				</button>
			{/each}
		</div>
		<EmojiPicker onSelect={selectIcon} />
	</Popover.Content>
</Popover.Root>

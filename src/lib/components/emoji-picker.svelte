<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	type EmojiSelection = {
		native?: string;
		shortcodes?: string;
		id?: string;
		name?: string;
	};

	type Props = {
		onSelect: (emoji: string) => void;
	};

	let { onSelect }: Props = $props();

	const quickIcons = [
		'⭐',
		'✅',
		'🔥',
		'🎤',
		'👥',
		'🕒',
		'📋',
		'🚚',
		'🍽️',
		'🎟️',
		'🚪',
		'💡',
		'📦',
		'🧰',
		'🎬',
		'📍',
		'🚨',
		'🔒',
		'⚡',
		'🎧',
		'🛠️',
		'🧾',
		'🪪',
		'🏁'
	];

	const mountEmojiPicker: Attachment<HTMLDivElement> = (container) => {
		let picker: HTMLElement | null = null;
		let mounted = true;

		void (async () => {
			const [{ default: data }, { Picker }] = await Promise.all([
				import('@emoji-mart/data'),
				import('emoji-mart')
			]);

			if (!mounted) return;

			picker = new Picker({
				data,
				emojiButtonRadius: '6px',
				emojiButtonSize: 32,
				emojiSize: 20,
				maxFrequentRows: 2,
				navPosition: 'bottom',
				perLine: 8,
				previewPosition: 'none',
				searchPosition: 'sticky',
				set: 'native',
				theme: 'light',
				onEmojiSelect: (emoji: EmojiSelection) => {
					if (emoji.native) onSelect(emoji.native);
				}
			}) as unknown as HTMLElement;

			container.replaceChildren(picker);
		})();

		return () => {
			mounted = false;
			picker?.remove();
			picker = null;
		};
	};
</script>

<div class="w-[320px] overflow-hidden rounded-md bg-white text-neutral-950">
	<div class="grid grid-cols-8 gap-1 border-b border-neutral-100 p-1.5">
		{#each quickIcons as icon (icon)}
			<button
				type="button"
				class="grid size-8 place-items-center rounded-md text-[20px] leading-none transition hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-950/15 focus-visible:outline-none"
				aria-label={`Use ${icon} icon`}
				onclick={() => onSelect(icon)}
			>
				<span class="drop-shadow-sm">{icon}</span>
			</button>
		{/each}
	</div>
	<div
		{@attach mountEmojiPicker}
		class="h-[330px] overflow-hidden [&_em-emoji-picker]:h-[330px] [&_em-emoji-picker]:w-full"
	></div>
</div>

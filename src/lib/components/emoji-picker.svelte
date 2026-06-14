<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

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

	let container: HTMLDivElement | undefined;
	let picker: HTMLElement | null = null;
	let destroyed = false;

	onMount(async () => {
		const [{ default: data }, { Picker }] = await Promise.all([
			import('@emoji-mart/data'),
			import('emoji-mart')
		]);

		if (destroyed || !container) return;

		picker = new Picker({
			data,
			emojiButtonRadius: '6px',
			emojiButtonSize: 34,
			emojiSize: 21,
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
	});

	onDestroy(() => {
		destroyed = true;
		picker?.remove();
		picker = null;
	});
</script>

<div
	bind:this={container}
	class="max-h-[360px] w-[310px] overflow-hidden rounded-md bg-white text-neutral-950 [&_em-emoji-picker]:h-[360px] [&_em-emoji-picker]:w-full"
></div>

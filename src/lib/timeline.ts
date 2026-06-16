export type TimelineBlockType = 'scheduled' | 'planning' | 'milestone' | 'active' | 'side';
export type TimelineVisibility = 'internal' | 'external';

export type TimelineLane = {
	id: string;
	label: string;
};

export type TimelineBlock = {
	id: string;
	title: string;
	icon: string;
	lane: string;
	type: TimelineBlockType;
	visibility: TimelineVisibility;
	start: string;
	end: string;
	advertisedStart: string;
	advertisedEnd: string;
	bufferBefore: number;
	bufferAfter: number;
	owner: string;
	notes: string;
};

export type TimelineSnapshot = {
	id: string | null;
	title: string;
	date: string | null;
	timezone: string;
	startsAt: string | null;
	endsAt: string | null;
	viewStart: string;
	viewEnd: string;
	padBefore: number;
	padAfter: number;
	lanes: TimelineLane[];
	blocks: TimelineBlock[];
};

export const timelineLanes: TimelineLane[] = [
	{ id: 'main', label: 'Main Run' },
	{ id: 'prep', label: 'Prep' },
	{ id: 'crew', label: 'Crew' },
	{ id: 'external', label: 'External' }
];

export const timelineBlocks: TimelineBlock[] = [
	{
		id: 'doors',
		title: 'Doors open and badge scan',
		icon: 'play',
		lane: 'main',
		type: 'scheduled',
		visibility: 'external',
		start: '09:30',
		end: '10:15',
		advertisedStart: '09:45',
		advertisedEnd: '10:15',
		bufferBefore: 15,
		bufferAfter: 10,
		owner: 'Front desk',
		notes: 'Keep one person floating for QR issues. External schedule says doors at 09:45.'
	},
	{
		id: 'opening',
		title: 'Opening remarks',
		icon: 'list',
		lane: 'main',
		type: 'planning',
		visibility: 'external',
		start: '10:20',
		end: '10:35',
		advertisedStart: '10:30',
		advertisedEnd: '10:40',
		bufferBefore: 10,
		bufferAfter: 5,
		owner: 'Host',
		notes: 'Have house lights down by the end of intro music. Keep remarks tight.'
	},
	{
		id: 'demo-a',
		title: 'Demo block A',
		icon: 'play',
		lane: 'main',
		type: 'scheduled',
		visibility: 'internal',
		start: '10:45',
		end: '11:35',
		advertisedStart: '10:45',
		advertisedEnd: '11:30',
		bufferBefore: 5,
		bufferAfter: 15,
		owner: 'Demo team',
		notes: 'Actual tends to run five minutes over. Buffer protects coffee reset.'
	},
	{
		id: 'green-room',
		title: 'Speaker green room',
		icon: 'layout',
		lane: 'prep',
		type: 'side',
		visibility: 'internal',
		start: '09:50',
		end: '10:25',
		advertisedStart: '09:50',
		advertisedEnd: '10:20',
		bufferBefore: 10,
		bufferAfter: 10,
		owner: 'Producer',
		notes: 'Mic check, slides loaded, water on podium.'
	},
	{
		id: 'catering',
		title: 'Catering setup',
		icon: 'users',
		lane: 'crew',
		type: 'side',
		visibility: 'internal',
		start: '11:05',
		end: '12:15',
		advertisedStart: '11:15',
		advertisedEnd: '12:00',
		bufferBefore: 15,
		bufferAfter: 20,
		owner: 'Venue',
		notes: 'Use side entrance. Do not cross the main audience route.'
	},
	{
		id: 'public-break',
		title: 'Public break',
		icon: 'clock',
		lane: 'external',
		type: 'scheduled',
		visibility: 'external',
		start: '11:45',
		end: '12:20',
		advertisedStart: '12:00',
		advertisedEnd: '12:20',
		bufferBefore: 15,
		bufferAfter: 5,
		owner: 'All',
		notes: 'Advertised break begins at noon, but internal reset starts earlier.'
	},
	{
		id: 'panel',
		title: 'Panel and Q&A',
		icon: 'mic',
		lane: 'main',
		type: 'scheduled',
		visibility: 'external',
		start: '13:10',
		end: '14:15',
		advertisedStart: '13:15',
		advertisedEnd: '14:00',
		bufferBefore: 10,
		bufferAfter: 20,
		owner: 'Moderator',
		notes:
			'Keep external visible span to advertised time. Internal actual has flex for audience questions.'
	}
];

export function timeToMinutes(time: string) {
	const [hours, minutes] = time.split(':').map(Number);
	return hours * 60 + minutes;
}

export function minutesToTime(minutes: number) {
	const safe = Math.max(0, Math.min(23 * 60 + 59, minutes));
	const hours = Math.floor(safe / 60)
		.toString()
		.padStart(2, '0');
	const mins = (safe % 60).toString().padStart(2, '0');
	return `${hours}:${mins}`;
}

export function durationLabel(start: string, end: string) {
	const total = Math.max(0, timeToMinutes(end) - timeToMinutes(start));
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	if (hours && minutes) return `${hours}h ${minutes}m`;
	if (hours) return `${hours}h`;
	return `${minutes}m`;
}

export function cloneBlocks() {
	return timelineBlocks.map((block) => ({ ...block }));
}

export function cloneLanes() {
	return timelineLanes.map((lane) => ({ ...lane }));
}

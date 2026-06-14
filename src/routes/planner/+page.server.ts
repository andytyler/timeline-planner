import {
	type TimelineBlock,
	type TimelineBlockType,
	type TimelineSnapshot,
	type TimelineVisibility
} from '$lib/timeline';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type WorkspaceRecord = {
	id: string;
	name: string;
	slug: string;
};

type WorkspaceRow = WorkspaceRecord & {
	luma_calendar_api_id: string | null;
};

type LumaEventRecord = {
	id: string;
	name: string;
	starts_at: string | null;
	ends_at: string | null;
	url: string | null;
	location: string | null;
};

type TimelineRecord = {
	id: string;
	title: string;
	luma_event_id: string | null;
	view_start: string;
	view_end: string;
	pad_before_minutes: number;
	pad_after_minutes: number;
};

type LaneRow = {
	id: string;
	name: string;
	sort_order: number;
};

type BlockRow = {
	id: string;
	lane_id: string;
	title: string;
	icon: string;
	block_type: TimelineBlockType;
	visibility: TimelineVisibility;
	actual_start: string;
	actual_end: string;
	advertised_start: string | null;
	advertised_end: string | null;
	buffer_before_minutes: number;
	buffer_after_minutes: number;
	owner_label: string | null;
	notes: string;
	sort_order: number;
};

type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
type ActionIntent = 'timeline' | 'save' | 'luma';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function actionFail(status: number, intent: ActionIntent, message: string) {
	return fail(status, { intent, message });
}

function timeInput(value: string | null | undefined, fallback = '09:00') {
	const next = value?.slice(0, 5) ?? fallback;
	return timePattern.test(next) ? next : fallback;
}

function nonNegativeNumber(value: unknown, fallback = 0) {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.max(0, Math.round(number));
}

function normalizeSnapshot(raw: unknown): TimelineSnapshot | null {
	if (!raw || typeof raw !== 'object') return null;
	const snapshot = raw as Partial<TimelineSnapshot>;
	if (!Array.isArray(snapshot.lanes) || !Array.isArray(snapshot.blocks)) return null;

	const lanes = snapshot.lanes
		.map((lane) => ({
			id: String(lane?.id ?? '').trim() || crypto.randomUUID(),
			label: String(lane?.label ?? '').trim() || 'Lane'
		}))
		.slice(0, 12);

	const laneIds = new Set(lanes.map((lane) => lane.id));

	const blocks = snapshot.blocks
		.map((block) => {
			const type = ['planning', 'active', 'side'].includes(String(block?.type))
				? (block?.type as TimelineBlockType)
				: 'planning';
			const visibility = ['internal', 'external'].includes(String(block?.visibility))
				? (block?.visibility as TimelineVisibility)
				: 'internal';
			const lane = laneIds.has(String(block?.lane)) ? String(block?.lane) : lanes[0]?.id;
			const start = timeInput(block?.start, '09:00');
			const end = timeInput(block?.end, '09:30');

			return {
				id: String(block?.id ?? '').trim() || crypto.randomUUID(),
				title: String(block?.title ?? '').trim() || 'Untitled block',
				icon: String(block?.icon ?? 'list').trim() || 'list',
				lane,
				type,
				visibility,
				start,
				end,
				advertisedStart: timeInput(block?.advertisedStart, start),
				advertisedEnd: timeInput(block?.advertisedEnd, end),
				bufferBefore: nonNegativeNumber(block?.bufferBefore, 0),
				bufferAfter: nonNegativeNumber(block?.bufferAfter, 0),
				owner: String(block?.owner ?? '').trim(),
				notes: String(block?.notes ?? '')
			} satisfies TimelineBlock;
		})
		.filter((block) => block.lane)
		.slice(0, 200);

	return {
		id: typeof snapshot.id === 'string' && idPattern.test(snapshot.id) ? snapshot.id : null,
		title: String(snapshot.title ?? '').trim() || 'Run of Show',
		viewStart: timeInput(snapshot.viewStart, '08:00'),
		viewEnd: timeInput(snapshot.viewEnd, '18:30'),
		padBefore: nonNegativeNumber(snapshot.padBefore, 30),
		padAfter: nonNegativeNumber(snapshot.padAfter, 45),
		lanes,
		blocks
	};
}

async function workspaceRole(
	supabase: NonNullable<App.Locals['supabase']>,
	workspaceId: string,
	userId: string
) {
	const { data, error } = await supabase
		.from('workspace_members')
		.select('role')
		.eq('workspace_id', workspaceId)
		.eq('user_id', userId)
		.single();

	if (error || !data) return null;
	return data.role as WorkspaceRole;
}

function canEditWorkspace(role: WorkspaceRole | null) {
	return role === 'owner' || role === 'admin' || role === 'member';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();

	if (locals.supabase && !user) {
		redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	}

	if (!locals.supabase || !user) {
		return {
			mode: 'local' as const,
			userEmail: null as string | null,
			workspaces: [] as WorkspaceRecord[],
			lumaEvents: [] as LumaEventRecord[],
			timelines: [] as TimelineRecord[],
			activeWorkspaceRole: null as WorkspaceRole | null,
			activeWorkspaceId: null as string | null,
			activeTimeline: null as TimelineSnapshot | null
		};
	}

	const { data: workspaces } = await locals.supabase
		.from('workspaces')
		.select('id,name,slug,luma_calendar_api_id')
		.order('created_at', { ascending: true });

	const workspaceRows = (workspaces ?? []) as WorkspaceRow[];
	const workspaceRecords = workspaceRows.map(({ id, name, slug }) => ({
		id,
		name,
		slug
	})) satisfies WorkspaceRecord[];
	const requestedWorkspace = url.searchParams.get('workspace');
	const workspace =
		workspaceRows.find((record) => record.id === requestedWorkspace) ?? workspaceRows[0];
	const activeWorkspaceRole = workspace
		? await workspaceRole(locals.supabase, workspace.id, user.id)
		: null;

	const [{ data: lumaEvents }, { data: timelines }] = workspace
		? await Promise.all([
				workspace.luma_calendar_api_id
					? locals.supabase
							.from('luma_events')
							.select('id,name,starts_at,ends_at,url,location')
							.eq('workspace_id', workspace.id)
							.eq('luma_calendar_api_id', workspace.luma_calendar_api_id)
							.order('starts_at', { ascending: true, nullsFirst: false })
					: Promise.resolve({ data: [] }),
				locals.supabase
					.from('timelines')
					.select('id,title,luma_event_id,view_start,view_end,pad_before_minutes,pad_after_minutes')
					.eq('workspace_id', workspace.id)
					.order('created_at', { ascending: false })
			])
		: [{ data: [] }, { data: [] }];

	const timelineRecords = (timelines ?? []) as TimelineRecord[];
	const requestedTimeline = url.searchParams.get('timeline');
	const activeTimelineRecord =
		timelineRecords.find((timeline) => timeline.id === requestedTimeline) ?? timelineRecords[0];

	let activeTimeline: TimelineSnapshot | null = null;
	if (activeTimelineRecord) {
		const [{ data: lanes }, { data: blocks }] = await Promise.all([
			locals.supabase
				.from('timeline_lanes')
				.select('id,name,sort_order')
				.eq('timeline_id', activeTimelineRecord.id)
				.order('sort_order', { ascending: true }),
			locals.supabase
				.from('timeline_blocks')
				.select(
					'id,lane_id,title,icon,block_type,visibility,actual_start,actual_end,advertised_start,advertised_end,buffer_before_minutes,buffer_after_minutes,owner_label,notes,sort_order'
				)
				.eq('timeline_id', activeTimelineRecord.id)
				.order('sort_order', { ascending: true })
		]);

		activeTimeline = {
			id: activeTimelineRecord.id,
			title: activeTimelineRecord.title,
			viewStart: timeInput(activeTimelineRecord.view_start, '08:00'),
			viewEnd: timeInput(activeTimelineRecord.view_end, '18:30'),
			padBefore: activeTimelineRecord.pad_before_minutes,
			padAfter: activeTimelineRecord.pad_after_minutes,
			lanes: ((lanes ?? []) as LaneRow[]).map((lane) => ({ id: lane.id, label: lane.name })),
			blocks: ((blocks ?? []) as BlockRow[]).map((block) => ({
				id: block.id,
				title: block.title,
				icon: block.icon,
				lane: block.lane_id,
				type: block.block_type,
				visibility: block.visibility,
				start: timeInput(block.actual_start),
				end: timeInput(block.actual_end, '09:30'),
				advertisedStart: timeInput(block.advertised_start, timeInput(block.actual_start)),
				advertisedEnd: timeInput(block.advertised_end, timeInput(block.actual_end, '09:30')),
				bufferBefore: block.buffer_before_minutes,
				bufferAfter: block.buffer_after_minutes,
				owner: block.owner_label ?? '',
				notes: block.notes
			}))
		};
	}

	return {
		mode: 'supabase' as const,
		userEmail: user.email ?? null,
		workspaces: workspaceRecords,
		lumaEvents: (lumaEvents ?? []) as LumaEventRecord[],
		timelines: timelineRecords,
		activeWorkspaceRole,
		activeWorkspaceId: workspace?.id ?? null,
		activeTimeline
	};
};

export const actions: Actions = {
	createBlankTimeline: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'timeline', 'Sign in before creating a timeline.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const title = String(form.get('title') ?? '').trim() || 'Untitled run of show';
		if (!idPattern.test(workspaceId))
			return actionFail(400, 'timeline', 'Choose a valid workspace.');

		const role = await workspaceRole(locals.supabase, workspaceId, user.id);
		if (!canEditWorkspace(role)) {
			return actionFail(403, 'timeline', 'You need edit access to create a timeline.');
		}

		const { data: timelineId, error: timelineError } = await locals.supabase.rpc(
			'create_timeline_with_default_lanes',
			{
				target_workspace_id: workspaceId,
				timeline_title: title,
				source_luma_event_id: null
			}
		);

		if (timelineError || !timelineId) {
			return actionFail(400, 'timeline', timelineError?.message ?? 'Could not create timeline.');
		}

		redirect(303, `/planner?workspace=${workspaceId}&timeline=${timelineId}`);
	},

	duplicateTimeline: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'timeline', 'Sign in before duplicating a timeline.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const timelineId = String(form.get('timelineId') ?? '');
		if (!idPattern.test(workspaceId) || !idPattern.test(timelineId)) {
			return actionFail(400, 'timeline', 'Choose a valid timeline.');
		}

		const role = await workspaceRole(locals.supabase, workspaceId, user.id);
		if (!canEditWorkspace(role)) {
			return actionFail(403, 'timeline', 'You need edit access to duplicate a timeline.');
		}

		const { data: duplicatedTimelineId, error: duplicateError } = await locals.supabase.rpc(
			'duplicate_timeline',
			{
				source_timeline_id: timelineId,
				target_workspace_id: workspaceId
			}
		);

		if (duplicateError || !duplicatedTimelineId) {
			return actionFail(
				400,
				'timeline',
				duplicateError?.message ?? 'Could not duplicate timeline.'
			);
		}

		redirect(303, `/planner?workspace=${workspaceId}&timeline=${duplicatedTimelineId}`);
	},

	createTimelineFromEvent: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'luma', 'Sign in before creating a timeline.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const eventId = String(form.get('eventId') ?? '');
		if (!idPattern.test(workspaceId) || !idPattern.test(eventId)) {
			return actionFail(400, 'luma', 'Choose a valid Luma event.');
		}

		const { data: existingTimeline } = await locals.supabase
			.from('timelines')
			.select('id')
			.eq('workspace_id', workspaceId)
			.eq('luma_event_id', eventId)
			.maybeSingle();
		if (existingTimeline?.id) {
			redirect(303, `/planner?workspace=${workspaceId}&timeline=${existingTimeline.id}`);
		}

		const role = await workspaceRole(locals.supabase, workspaceId, user.id);
		if (!canEditWorkspace(role)) {
			return actionFail(403, 'luma', 'You need edit access to create a timeline.');
		}

		const { data: event, error: eventError } = await locals.supabase
			.from('luma_events')
			.select('id,name,starts_at,ends_at')
			.eq('id', eventId)
			.eq('workspace_id', workspaceId)
			.single();
		if (eventError || !event) {
			return actionFail(404, 'luma', 'That Luma event is not available in this workspace.');
		}

		const { data: timelineId, error: timelineError } = await locals.supabase.rpc(
			'create_timeline_with_default_lanes',
			{
				target_workspace_id: workspaceId,
				timeline_title: event.name,
				source_luma_event_id: event.id
			}
		);

		if (timelineError || !timelineId) {
			return actionFail(400, 'luma', timelineError?.message ?? 'Could not create timeline.');
		}

		redirect(303, `/planner?workspace=${workspaceId}&timeline=${timelineId}`);
	},

	saveTimeline: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'save', 'Sign in before saving a timeline.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		if (!idPattern.test(workspaceId)) return actionFail(400, 'save', 'Choose a valid workspace.');

		const snapshotText = String(form.get('snapshot') ?? '');
		let parsed: unknown;
		try {
			parsed = JSON.parse(snapshotText);
		} catch {
			return actionFail(400, 'save', 'Timeline data was not valid JSON.');
		}

		const snapshot = normalizeSnapshot(parsed);
		if (!snapshot) return actionFail(400, 'save', 'Timeline data was incomplete.');
		if (snapshot.lanes.length === 0)
			return actionFail(400, 'save', 'A timeline needs at least one lane.');

		const { data: workspace, error: workspaceError } = await locals.supabase
			.from('workspaces')
			.select('id')
			.eq('id', workspaceId)
			.single();
		if (workspaceError || !workspace) {
			return actionFail(403, 'save', 'You do not have access to this workspace.');
		}

		const role = await workspaceRole(locals.supabase, workspaceId, user.id);
		if (!canEditWorkspace(role)) {
			return actionFail(403, 'save', 'You need edit access to save this timeline.');
		}

		const { data: timelineId, error: saveError } = await locals.supabase.rpc(
			'save_timeline_snapshot',
			{
				target_workspace_id: workspaceId,
				timeline_snapshot: snapshot
			}
		);

		if (saveError || !timelineId) {
			return actionFail(400, 'save', saveError?.message ?? 'Could not save the timeline.');
		}

		redirect(303, `/planner?workspace=${workspaceId}&timeline=${timelineId}`);
	}
};

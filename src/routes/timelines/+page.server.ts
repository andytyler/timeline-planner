import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
type ActionIntent = 'timeline';

type WorkspaceRecord = {
	id: string;
	name: string;
	slug: string;
};

type WorkspaceMemberRow = {
	workspace_id: string;
	role: WorkspaceRole;
};

type TimelineRow = {
	id: string;
	workspace_id: string;
	luma_event_id: string | null;
	title: string;
	date: string | null;
	view_start: string;
	view_end: string;
	pad_before_minutes: number;
	pad_after_minutes: number;
	created_at: string;
	updated_at: string;
};

type LumaEventRow = {
	id: string;
	workspace_id: string;
	name: string;
	starts_at: string | null;
	location: string | null;
};

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function actionFail(status: number, intent: ActionIntent, message: string) {
	return fail(status, { intent, message });
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

	if (!locals.supabase) {
		return {
			mode: 'local' as const,
			userEmail: null as string | null,
			workspaces: [] as WorkspaceRecord[],
			workspaceRoles: [] as WorkspaceMemberRow[],
			activeWorkspaceId: null as string | null,
			timelines: [] as TimelineRow[],
			lumaEvents: [] as LumaEventRow[]
		};
	}

	if (!user) {
		const next = `${url.pathname}${url.search}`;
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	const { data: workspaces } = await locals.supabase
		.from('workspaces')
		.select('id,name,slug')
		.order('created_at', { ascending: true });

	const workspaceRecords = (workspaces ?? []) as WorkspaceRecord[];
	if (workspaceRecords.length === 0) {
		redirect(303, '/');
	}

	const workspaceIds = workspaceRecords.map((workspace) => workspace.id);
	const requestedWorkspace = url.searchParams.get('workspace');
	const activeWorkspace =
		workspaceRecords.find((workspace) => workspace.id === requestedWorkspace) ??
		workspaceRecords[0];

	const [{ data: memberships }, { data: timelines }] = await Promise.all([
		locals.supabase
			.from('workspace_members')
			.select('workspace_id,role')
			.eq('user_id', user.id)
			.in('workspace_id', workspaceIds),
		locals.supabase
			.from('timelines')
			.select(
				'id,workspace_id,luma_event_id,title,date,view_start,view_end,pad_before_minutes,pad_after_minutes,created_at,updated_at'
			)
			.in('workspace_id', workspaceIds)
			.order('updated_at', { ascending: false })
	]);

	const timelineRows = (timelines ?? []) as TimelineRow[];
	const eventIds = Array.from(
		new Set(timelineRows.map((timeline) => timeline.luma_event_id).filter(Boolean))
	) as string[];
	const { data: lumaEvents } =
		eventIds.length > 0
			? await locals.supabase
					.from('luma_events')
					.select('id,workspace_id,name,starts_at,location')
					.in('workspace_id', workspaceIds)
					.in('id', eventIds)
			: { data: [] };

	return {
		mode: 'supabase' as const,
		userEmail: user.email ?? null,
		workspaces: workspaceRecords,
		workspaceRoles: (memberships ?? []) as WorkspaceMemberRow[],
		activeWorkspaceId: activeWorkspace.id,
		timelines: timelineRows,
		lumaEvents: (lumaEvents ?? []) as LumaEventRow[]
	};
};

export const actions: Actions = {
	createBlankTimeline: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'timeline', 'Sign in before creating a planner.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const title = String(form.get('title') ?? '').trim() || 'Untitled run of show';
		if (!idPattern.test(workspaceId)) {
			return actionFail(400, 'timeline', 'Choose a valid workspace.');
		}

		const role = await workspaceRole(locals.supabase, workspaceId, user.id);
		if (!canEditWorkspace(role)) {
			return actionFail(403, 'timeline', 'You need edit access to create a planner.');
		}

		const { data: timelineId, error } = await locals.supabase.rpc(
			'create_timeline_with_default_lanes',
			{
				target_workspace_id: workspaceId,
				timeline_title: title,
				source_luma_event_id: null
			}
		);

		if (error || !timelineId) {
			return actionFail(400, 'timeline', error?.message ?? 'Could not create planner.');
		}

		redirect(303, `/planner?workspace=${workspaceId}&timeline=${timelineId}`);
	},

	duplicateTimeline: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'timeline', 'Sign in before duplicating a planner.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const timelineId = String(form.get('timelineId') ?? '');
		if (!idPattern.test(workspaceId) || !idPattern.test(timelineId)) {
			return actionFail(400, 'timeline', 'Choose a valid planner.');
		}

		const role = await workspaceRole(locals.supabase, workspaceId, user.id);
		if (!canEditWorkspace(role)) {
			return actionFail(403, 'timeline', 'You need edit access to duplicate a planner.');
		}

		const { data: duplicatedTimelineId, error } = await locals.supabase.rpc('duplicate_timeline', {
			source_timeline_id: timelineId,
			target_workspace_id: workspaceId
		});

		if (error || !duplicatedTimelineId) {
			return actionFail(400, 'timeline', error?.message ?? 'Could not duplicate planner.');
		}

		redirect(303, `/planner?workspace=${workspaceId}&timeline=${duplicatedTimelineId}`);
	}
};

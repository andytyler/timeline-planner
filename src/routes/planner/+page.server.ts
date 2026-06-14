import { safeRedirectPath } from '$lib/server/redirect';
import { sharedWorkspaceConfigError } from '$lib/server/runtime-config';
import { fetchUpcomingLumaEvents } from '$lib/server/luma';
import {
	createLumaConsoleTimelineFromEvent,
	saveLumaConsoleTimelineSnapshot,
	lumaConsoleDatabaseConfigured,
	lumaConsoleEventsForWorkspace,
	lumaConsoleTimelineBlocks,
	lumaConsoleTimelineLanes,
	lumaConsoleTimelinesForWorkspace,
	lumaConsoleUserForSupabaseUser,
	lumaConsoleWorkspacesForSupabaseUser,
	type LumaConsoleTimeline,
	type LumaConsoleWorkspaceRole
} from '$lib/server/luma-console-db';
import {
	type TimelineBlock,
	type TimelineBlockType,
	type TimelineSnapshot,
	type TimelineVisibility
} from '$lib/timeline';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type WorkspaceRecord = {
	id: string;
	name: string;
	slug: string;
};

type WorkspaceRow = WorkspaceRecord & {
	luma_calendar_api_id: string | null;
};

type ProfileRecord = {
	email: string;
	full_name: string | null;
	avatar_url: string | null;
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

type WorkspaceMemberRecord = {
	user_id: string;
	role: WorkspaceRole;
	created_at: string;
	profile: {
		email: string;
		full_name: string | null;
		avatar_url: string | null;
	} | null;
};

type WorkspaceMemberRow = Omit<WorkspaceMemberRecord, 'profile'> & {
	profile: WorkspaceMemberRecord['profile'] | WorkspaceMemberRecord['profile'][] | null;
};

type WorkspaceInvitationRecord = {
	id: string;
	workspace_id: string;
	email: string;
	role: WorkspaceRole;
	expires_at: string;
	created_at: string;
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
type ActionIntent =
	| 'profile'
	| 'workspace'
	| 'invite'
	| 'member'
	| 'invitation'
	| 'timeline'
	| 'save'
	| 'luma';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function optionalText(value: FormDataEntryValue | null, maxLength: number) {
	const text = String(value ?? '').trim();
	if (!text) return null;
	return text.slice(0, maxLength);
}

function optionalUrl(value: FormDataEntryValue | null) {
	const text = optionalText(value, 500);
	if (!text) return null;
	try {
		const url = new URL(text);
		if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
	} catch {
		return null;
	}
	return null;
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

function canManageWorkspace(role: WorkspaceRole | null) {
	return role === 'owner' || role === 'admin';
}

function canEditWorkspace(role: WorkspaceRole | null) {
	return role === 'owner' || role === 'admin' || role === 'member';
}

function plannerRoleFromLumaConsole(role: LumaConsoleWorkspaceRole): WorkspaceRole {
	if (role === 'reviewer') return 'viewer';
	return role;
}

function timelineRecordFromLumaConsole(timeline: LumaConsoleTimeline): TimelineRecord {
	return {
		id: timeline.id,
		title: timeline.title,
		luma_event_id: timeline.event_id,
		view_start: timeline.view_start,
		view_end: timeline.view_end,
		pad_before_minutes: timeline.pad_before_minutes,
		pad_after_minutes: timeline.pad_after_minutes
	};
}

function inviteRole(value: FormDataEntryValue | null): Exclude<WorkspaceRole, 'owner'> {
	if (value === 'admin' || value === 'viewer') return value;
	return 'member';
}

function managedMemberRole(
	value: FormDataEntryValue | null
): Exclude<WorkspaceRole, 'owner'> | null {
	if (value === 'admin' || value === 'member' || value === 'viewer') return value;
	return null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const configError = sharedWorkspaceConfigError();
	if (configError) {
		error(503, configError);
	}

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
			members: [] as WorkspaceMemberRecord[],
			invitations: [] as WorkspaceInvitationRecord[],
			myInvitations: [] as WorkspaceInvitationRecord[],
			currentProfile: null as ProfileRecord | null,
			currentUserId: null as string | null,
			activeWorkspaceRole: null as WorkspaceRole | null,
			activeWorkspaceLumaCalendarApiId: null as string | null,
			activeWorkspaceId: null as string | null,
			activeTimeline: null as TimelineSnapshot | null
		};
	}

	if (lumaConsoleDatabaseConfigured()) {
		try {
			const [lumaConsoleUser, lumaConsoleWorkspaces] = await Promise.all([
				lumaConsoleUserForSupabaseUser(user.id),
				lumaConsoleWorkspacesForSupabaseUser(user.id)
			]);

			if (lumaConsoleUser || lumaConsoleWorkspaces.length > 0) {
				const workspaceRecords = lumaConsoleWorkspaces.map(({ id, name }) => ({
					id,
					name,
					slug: id
				})) satisfies WorkspaceRecord[];
				const requestedWorkspace = url.searchParams.get('workspace');
				const workspace =
					lumaConsoleWorkspaces.find((record) => record.id === requestedWorkspace) ??
					lumaConsoleWorkspaces[0] ??
					null;
				const activeWorkspaceRole = workspace ? plannerRoleFromLumaConsole(workspace.role) : null;
				const [events, timelines] = workspace
					? await Promise.all([
							lumaConsoleEventsForWorkspace(workspace.id),
							lumaConsoleTimelinesForWorkspace(workspace.id)
						])
					: [[], []];
				const timelineRecords = timelines.map(timelineRecordFromLumaConsole);
				const requestedTimeline = url.searchParams.get('timeline');
				const activeTimelineRecord =
					timelineRecords.find((timeline) => timeline.id === requestedTimeline) ??
					timelineRecords[0];

				let activeTimeline: TimelineSnapshot | null = null;
				if (activeTimelineRecord) {
					const [
						{ title, view_start, view_end, pad_before_minutes, pad_after_minutes },
						lanes,
						blocks
					] = await Promise.all([
						Promise.resolve(activeTimelineRecord),
						lumaConsoleTimelineLanes(activeTimelineRecord.id),
						lumaConsoleTimelineBlocks(activeTimelineRecord.id)
					]);

					activeTimeline = {
						id: activeTimelineRecord.id,
						title,
						viewStart: timeInput(view_start, '08:00'),
						viewEnd: timeInput(view_end, '18:30'),
						padBefore: pad_before_minutes,
						padAfter: pad_after_minutes,
						lanes: lanes.map((lane) => ({ id: lane.id, label: lane.name })),
						blocks: blocks.map((block) => ({
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
					mode: 'luma-console' as const,
					userEmail: user.email ?? null,
					workspaces: workspaceRecords,
					lumaEvents: events.map((event) => ({
						id: event.id,
						name: event.name,
						starts_at: event.start_at,
						ends_at: event.end_at,
						url: event.url,
						location: event.calendar_name
					})) satisfies LumaEventRecord[],
					timelines: timelineRecords,
					members: [] as WorkspaceMemberRecord[],
					invitations: [] as WorkspaceInvitationRecord[],
					myInvitations: [] as WorkspaceInvitationRecord[],
					currentProfile: lumaConsoleUser
						? ({
								email: lumaConsoleUser.email,
								full_name: lumaConsoleUser.name,
								avatar_url: lumaConsoleUser.avatar_url
							} satisfies ProfileRecord)
						: null,
					currentUserId: lumaConsoleUser?.id ?? user.id,
					activeWorkspaceRole,
					activeWorkspaceLumaCalendarApiId: null as string | null,
					activeWorkspaceId: workspace?.id ?? null,
					activeTimeline
				};
			}
		} catch (error) {
			console.error('Could not load Luma console workspace data.', error);
		}
	}

	const { data: currentProfile } = await locals.supabase
		.from('profiles')
		.select('email,full_name,avatar_url')
		.eq('id', user.id)
		.maybeSingle();

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

	const { data: myInvitations } = await locals.supabase
		.from('workspace_invitations')
		.select('id,workspace_id,email,role,expires_at,created_at')
		.eq('email', user.email?.toLowerCase() ?? '')
		.is('accepted_at', null)
		.is('revoked_at', null)
		.order('created_at', { ascending: false });

	const [{ data: members }, { data: invitations }] = workspace
		? await Promise.all([
				locals.supabase
					.from('workspace_members')
					.select(
						'user_id,role,created_at,profile:profiles!workspace_members_user_profile_fk(email,full_name,avatar_url)'
					)
					.eq('workspace_id', workspace.id)
					.order('created_at', { ascending: true }),
				locals.supabase
					.from('workspace_invitations')
					.select('id,workspace_id,email,role,expires_at,created_at')
					.eq('workspace_id', workspace.id)
					.is('accepted_at', null)
					.is('revoked_at', null)
					.order('created_at', { ascending: false })
			])
		: [{ data: [] }, { data: [] }];

	const memberRecords = ((members ?? []) as WorkspaceMemberRow[]).map((member) => ({
		user_id: member.user_id,
		role: member.role,
		created_at: member.created_at,
		profile: Array.isArray(member.profile) ? (member.profile[0] ?? null) : member.profile
	})) satisfies WorkspaceMemberRecord[];

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
		members: memberRecords,
		invitations: (invitations ?? []) as WorkspaceInvitationRecord[],
		myInvitations: (myInvitations ?? []) as WorkspaceInvitationRecord[],
		currentProfile: (currentProfile ?? null) as ProfileRecord | null,
		currentUserId: user.id,
		activeWorkspaceRole,
		activeWorkspaceLumaCalendarApiId: canManageWorkspace(activeWorkspaceRole)
			? (workspace?.luma_calendar_api_id ?? null)
			: null,
		activeWorkspaceId: workspace?.id ?? null,
		activeTimeline
	};
};

export const actions: Actions = {
	updateProfile: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'profile', 'Sign in before updating your profile.');
		}

		const form = await request.formData();
		const fullName = optionalText(form.get('fullName'), 120);
		const avatarUrlText = optionalText(form.get('avatarUrl'), 500);
		const avatarUrl = optionalUrl(form.get('avatarUrl'));
		const returnTo = safeRedirectPath(String(form.get('returnTo') ?? '/planner'));
		if (avatarUrlText && !avatarUrl) {
			return actionFail(400, 'profile', 'Avatar URL must start with http:// or https://.');
		}

		const { data, error } = await locals.supabase
			.from('profiles')
			.update({
				full_name: fullName,
				avatar_url: avatarUrl
			})
			.eq('id', user.id)
			.select('id')
			.maybeSingle();

		if (error) return actionFail(400, 'profile', error.message);
		if (!data) return actionFail(404, 'profile', 'Profile record was not found.');
		redirect(303, returnTo);
	},

	createWorkspace: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'workspace', 'Sign in before creating a workspace.');
		}

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim() || 'Event Operations';

		const { data: workspaceId, error } = await locals.supabase.rpc('create_workspace', {
			workspace_name: name
		});

		if (error || !workspaceId) {
			return actionFail(400, 'workspace', error?.message ?? 'Could not create workspace.');
		}

		redirect(303, safeRedirectPath(`/planner?workspace=${workspaceId}`));
	},

	inviteMember: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'invite', 'Sign in before inviting people.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const role = inviteRole(form.get('role'));

		if (!idPattern.test(workspaceId)) return actionFail(400, 'invite', 'Choose a valid workspace.');
		if (!emailPattern.test(email)) return actionFail(400, 'invite', 'Enter a valid email address.');

		const { error } = await locals.supabase.rpc('invite_workspace_member', {
			target_workspace_id: workspaceId,
			invite_email: email,
			invite_role: role
		});

		if (error) return actionFail(400, 'invite', error.message);
		redirect(303, `/planner?workspace=${workspaceId}`);
	},

	updateMemberRole: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'member', 'Sign in before managing members.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const userId = String(form.get('userId') ?? '');
		const role = managedMemberRole(form.get('role'));

		if (!idPattern.test(workspaceId)) return actionFail(400, 'member', 'Choose a valid workspace.');
		if (!idPattern.test(userId)) return actionFail(400, 'member', 'Choose a valid member.');
		if (!role) return actionFail(400, 'member', 'Choose a valid member role.');

		const { data: updatedWorkspaceId, error } = await locals.supabase.rpc(
			'update_workspace_member_role',
			{
				target_workspace_id: workspaceId,
				target_user_id: userId,
				next_role: role
			}
		);

		if (error || !updatedWorkspaceId) {
			return actionFail(400, 'member', error?.message ?? 'Could not update member role.');
		}

		redirect(303, `/planner?workspace=${updatedWorkspaceId}`);
	},

	removeMember: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'member', 'Sign in before managing members.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const userId = String(form.get('userId') ?? '');

		if (!idPattern.test(workspaceId)) return actionFail(400, 'member', 'Choose a valid workspace.');
		if (!idPattern.test(userId)) return actionFail(400, 'member', 'Choose a valid member.');

		const { data: updatedWorkspaceId, error } = await locals.supabase.rpc(
			'remove_workspace_member',
			{
				target_workspace_id: workspaceId,
				target_user_id: userId
			}
		);

		if (error || !updatedWorkspaceId) {
			return actionFail(400, 'member', error?.message ?? 'Could not remove member.');
		}

		redirect(303, `/planner?workspace=${updatedWorkspaceId}`);
	},

	updateLumaSource: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'luma', 'Sign in before updating Luma settings.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const calendarApiId = optionalText(form.get('calendarApiId'), 120);
		if (!idPattern.test(workspaceId)) return actionFail(400, 'luma', 'Choose a valid workspace.');

		const { error } = await locals.supabase.rpc('update_workspace_luma_source', {
			target_workspace_id: workspaceId,
			calendar_api_id: calendarApiId
		});

		if (error) return actionFail(400, 'luma', error.message);
		redirect(303, `/planner?workspace=${workspaceId}`);
	},

	revokeInvitation: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'invite', 'Sign in before revoking invitations.');
		}

		const form = await request.formData();
		const invitationId = String(form.get('invitationId') ?? '');
		if (!idPattern.test(invitationId))
			return actionFail(400, 'invite', 'Choose a valid invitation.');

		const { data: workspaceId, error } = await locals.supabase.rpc('revoke_workspace_invitation', {
			target_invitation_id: invitationId
		});

		if (error || !workspaceId) {
			return actionFail(400, 'invite', error?.message ?? 'Could not revoke invitation.');
		}

		redirect(303, `/planner?workspace=${workspaceId}`);
	},

	acceptInvitation: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user?.email) {
			return actionFail(401, 'invitation', 'Sign in before accepting an invitation.');
		}

		const form = await request.formData();
		const invitationId = String(form.get('invitationId') ?? '');
		if (!idPattern.test(invitationId))
			return actionFail(400, 'invitation', 'Choose a valid invitation.');

		const { data: workspaceId, error } = await locals.supabase.rpc('accept_workspace_invitation', {
			target_invitation_id: invitationId
		});

		if (error || !workspaceId) {
			return actionFail(400, 'invitation', error?.message ?? 'Could not accept invitation.');
		}

		redirect(303, `/planner?workspace=${workspaceId}`);
	},

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

	syncLumaEvents: async ({ locals, request, fetch }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'luma', 'Sign in before syncing Luma events.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		if (!idPattern.test(workspaceId)) return actionFail(400, 'luma', 'Choose a valid workspace.');

		const { data: workspace, error: workspaceError } = await locals.supabase
			.from('workspaces')
			.select('id,luma_calendar_api_id')
			.eq('id', workspaceId)
			.single();
		if (workspaceError || !workspace) {
			return actionFail(403, 'luma', 'You do not have access to this workspace.');
		}

		const role = await workspaceRole(locals.supabase, workspaceId, user.id);
		if (!canManageWorkspace(role)) {
			return actionFail(403, 'luma', 'Only workspace owners and admins can sync Luma events.');
		}
		if (!workspace.luma_calendar_api_id) {
			return actionFail(400, 'luma', "Set this workspace's Luma calendar API ID before syncing.");
		}

		const { events, error } = await fetchUpcomingLumaEvents(
			fetch,
			50,
			workspace.luma_calendar_api_id
		);
		if (error) return actionFail(503, 'luma', error);
		if (events.length === 0) return actionFail(404, 'luma', 'No upcoming Luma events were found.');

		const { data: syncedCount, error: syncError } = await locals.supabase.rpc(
			'sync_workspace_luma_events',
			{
				target_workspace_id: workspaceId,
				source_calendar_api_id: workspace.luma_calendar_api_id,
				event_rows: events
			}
		);

		if (syncError) return actionFail(400, 'luma', syncError.message);
		if (!syncedCount) return actionFail(404, 'luma', 'No valid Luma events were synced.');

		redirect(303, `/planner?workspace=${workspaceId}`);
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

		if (lumaConsoleDatabaseConfigured()) {
			let timelineId: string;
			try {
				timelineId = await createLumaConsoleTimelineFromEvent(user.id, workspaceId, eventId);
			} catch (error) {
				return actionFail(
					400,
					'luma',
					error instanceof Error ? error.message : 'Could not create timeline.'
				);
			}
			redirect(303, `/planner?workspace=${workspaceId}&timeline=${timelineId}`);
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

		if (lumaConsoleDatabaseConfigured()) {
			let timelineId: string;
			try {
				timelineId = await saveLumaConsoleTimelineSnapshot(user.id, workspaceId, snapshot);
			} catch (error) {
				return actionFail(
					400,
					'save',
					error instanceof Error ? error.message : 'Could not save the timeline.'
				);
			}
			redirect(303, `/planner?workspace=${workspaceId}&timeline=${timelineId}`);
		}

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

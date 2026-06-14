import { fetchUpcomingLumaEvents } from '$lib/server/luma';
import { safeRedirectPath } from '$lib/server/redirect';
import { createSupabaseAdminClient } from '$lib/server/supabase-admin';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

type WorkspaceRow = {
	id: string;
	name: string;
	slug: string;
	luma_calendar_api_id: string | null;
};

type WorkspaceMemberRow = {
	user_id: string;
	role: WorkspaceRole;
	created_at: string;
	profile:
		| {
				email: string;
				full_name: string | null;
				avatar_url: string | null;
		  }
		| {
				email: string;
				full_name: string | null;
				avatar_url: string | null;
		  }[]
		| null;
};

type WorkspaceInvitationRow = {
	id: string;
	workspace_id: string;
	email: string;
	role: WorkspaceRole;
	expires_at: string;
	created_at: string;
};

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ActionIntent = 'profile' | 'workspace' | 'invite' | 'member' | 'invitation' | 'luma';

function actionFail(status: number, intent: ActionIntent, message: string) {
	return fail(status, { intent, message });
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

function settingsPath(workspaceId: string) {
	return `/settings?workspace=${workspaceId}`;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();

	if (!locals.supabase) {
		redirect(303, '/planner');
	}

	if (!user) {
		redirect(303, `/login?next=${encodeURIComponent('/settings')}`);
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
	const requestedWorkspace = url.searchParams.get('workspace');
	const activeWorkspace =
		workspaceRows.find((workspace) => workspace.id === requestedWorkspace) ??
		workspaceRows[0] ??
		null;

	const activeWorkspaceRole = activeWorkspace
		? await workspaceRole(locals.supabase, activeWorkspace.id, user.id)
		: null;
	const { data: activeWorkspaceLumaApiKeyConfigured } = activeWorkspace
		? await locals.supabase.rpc('workspace_luma_api_key_configured', {
				target_workspace_id: activeWorkspace.id
			})
		: { data: false };

	const { data: myInvitations } = await locals.supabase
		.from('workspace_invitations')
		.select('id,workspace_id,email,role,expires_at,created_at')
		.eq('email', user.email?.toLowerCase() ?? '')
		.is('accepted_at', null)
		.is('revoked_at', null)
		.order('created_at', { ascending: false });

	const [{ data: members }, { data: invitations }, { data: lumaEvents }, { data: timelines }] =
		activeWorkspace
			? await Promise.all([
					locals.supabase
						.from('workspace_members')
						.select(
							'user_id,role,created_at,profile:profiles!workspace_members_user_profile_fk(email,full_name,avatar_url)'
						)
						.eq('workspace_id', activeWorkspace.id)
						.order('created_at', { ascending: true }),
					locals.supabase
						.from('workspace_invitations')
						.select('id,workspace_id,email,role,expires_at,created_at')
						.eq('workspace_id', activeWorkspace.id)
						.is('accepted_at', null)
						.is('revoked_at', null)
						.order('created_at', { ascending: false }),
					locals.supabase
						.from('luma_events')
						.select('id,name')
						.eq('workspace_id', activeWorkspace.id),
					locals.supabase
						.from('timelines')
						.select('id,title,luma_event_id')
						.eq('workspace_id', activeWorkspace.id)
						.order('created_at', { ascending: false })
				])
			: [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

	return {
		userEmail: user.email ?? null,
		currentUserId: user.id,
		currentProfile: currentProfile ?? null,
		workspaces: workspaceRows.map(({ id, name, slug }) => ({ id, name, slug })),
		activeWorkspaceId: activeWorkspace?.id ?? null,
		activeWorkspaceName: activeWorkspace?.name ?? null,
		activeWorkspaceRole,
		activeWorkspaceLumaCalendarApiId: activeWorkspace?.luma_calendar_api_id ?? null,
		activeWorkspaceLumaApiKeyConfigured: Boolean(activeWorkspaceLumaApiKeyConfigured),
		myInvitations: (myInvitations ?? []) as WorkspaceInvitationRow[],
		members: ((members ?? []) as WorkspaceMemberRow[]).map((member) => ({
			user_id: member.user_id,
			role: member.role,
			created_at: member.created_at,
			profile: Array.isArray(member.profile) ? (member.profile[0] ?? null) : member.profile
		})),
		invitations: (invitations ?? []) as WorkspaceInvitationRow[],
		lumaEventCount: lumaEvents?.length ?? 0,
		timelines: (timelines ?? []) as { id: string; title: string; luma_event_id: string | null }[]
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
		const returnTo = safeRedirectPath(String(form.get('returnTo') ?? '/settings'));
		if (avatarUrlText && !avatarUrl) {
			return actionFail(400, 'profile', 'Avatar URL must start with http:// or https://.');
		}

		const { data, error } = await locals.supabase
			.from('profiles')
			.update({ full_name: fullName, avatar_url: avatarUrl })
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

		redirect(303, settingsPath(workspaceId));
	},

	acceptInvitation: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user?.email) {
			return actionFail(401, 'invitation', 'Sign in before accepting an invitation.');
		}

		const form = await request.formData();
		const invitationId = String(form.get('invitationId') ?? '');
		if (!idPattern.test(invitationId)) {
			return actionFail(400, 'invitation', 'Choose a valid invitation.');
		}

		const { data: workspaceId, error } = await locals.supabase.rpc('accept_workspace_invitation', {
			target_invitation_id: invitationId
		});

		if (error || !workspaceId) {
			return actionFail(400, 'invitation', error?.message ?? 'Could not accept invitation.');
		}

		redirect(303, settingsPath(workspaceId));
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
		redirect(303, settingsPath(workspaceId));
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

		redirect(303, settingsPath(updatedWorkspaceId));
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

		redirect(303, settingsPath(updatedWorkspaceId));
	},

	revokeInvitation: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'invite', 'Sign in before revoking invitations.');
		}

		const form = await request.formData();
		const invitationId = String(form.get('invitationId') ?? '');
		if (!idPattern.test(invitationId)) {
			return actionFail(400, 'invite', 'Choose a valid invitation.');
		}

		const { data: workspaceId, error } = await locals.supabase.rpc('revoke_workspace_invitation', {
			target_invitation_id: invitationId
		});

		if (error || !workspaceId) {
			return actionFail(400, 'invite', error?.message ?? 'Could not revoke invitation.');
		}

		redirect(303, settingsPath(workspaceId));
	},

	updateLumaSource: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return actionFail(401, 'luma', 'Sign in before updating Luma settings.');
		}

		const form = await request.formData();
		const workspaceId = String(form.get('workspaceId') ?? '');
		const calendarApiId = optionalText(form.get('calendarApiId'), 120);
		const lumaApiKey = optionalText(form.get('lumaApiKey'), 500);
		if (!idPattern.test(workspaceId)) return actionFail(400, 'luma', 'Choose a valid workspace.');

		const { error } = await locals.supabase.rpc('update_workspace_luma_source', {
			target_workspace_id: workspaceId,
			calendar_api_id: calendarApiId,
			luma_api_key: lumaApiKey
		});

		if (error) return actionFail(400, 'luma', error.message);
		redirect(303, settingsPath(workspaceId));
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
		if (!(await workspaceRole(locals.supabase, workspaceId, user.id))) {
			return actionFail(403, 'luma', 'You do not have access to this workspace.');
		}
		if (!workspace.luma_calendar_api_id) {
			return actionFail(400, 'luma', "Set this workspace's Luma calendar API ID before syncing.");
		}

		const admin = createSupabaseAdminClient();
		if (!admin) {
			return actionFail(
				503,
				'luma',
				'SUPABASE_SERVICE_ROLE_KEY is not configured, so workspace Luma keys cannot be read.'
			);
		}

		const { data: lumaApiKey, error: credentialError } = await admin.rpc(
			'workspace_luma_api_key_for_server',
			{ target_workspace_id: workspaceId }
		);

		if (credentialError) return actionFail(503, 'luma', credentialError.message);
		if (!lumaApiKey) {
			return actionFail(400, 'luma', "Set this workspace's Luma API key before syncing.");
		}

		const { events, error } = await fetchUpcomingLumaEvents(
			fetch,
			lumaApiKey,
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

		redirect(303, settingsPath(workspaceId));
	}
};

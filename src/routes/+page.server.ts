import { safeRedirectPath } from '$lib/server/redirect';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type WorkspaceRecord = {
	id: string;
	name: string;
	slug: string;
};

type WorkspaceInvitationRecord = {
	id: string;
	workspace_id: string;
	email: string;
	role: 'admin' | 'member' | 'viewer';
	expires_at: string;
	created_at: string;
};

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();

	if (!locals.supabase) {
		redirect(303, '/planner');
	}

	if (!user) {
		redirect(303, '/login?next=/');
	}

	const [{ data: workspaces }, { data: myInvitations }] = await Promise.all([
		locals.supabase
			.from('workspaces')
			.select('id,name,slug')
			.order('created_at', { ascending: true }),
		locals.supabase
			.from('workspace_invitations')
			.select('id,workspace_id,email,role,expires_at,created_at')
			.eq('email', user.email?.toLowerCase() ?? '')
			.is('accepted_at', null)
			.is('revoked_at', null)
			.order('created_at', { ascending: false })
	]);

	const workspaceRecords = (workspaces ?? []) as WorkspaceRecord[];
	const invitationRecords = (myInvitations ?? []) as WorkspaceInvitationRecord[];

	if (workspaceRecords.length > 0 && invitationRecords.length === 0) {
		redirect(303, `/planner?workspace=${workspaceRecords[0].id}`);
	}

	return {
		userEmail: user.email ?? null,
		workspaces: workspaceRecords,
		myInvitations: invitationRecords
	};
};

export const actions: Actions = {
	createWorkspace: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return fail(401, { intent: 'workspace', message: 'Sign in before creating a workspace.' });
		}

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim() || 'Event Operations';

		const { data: workspaceId, error } = await locals.supabase.rpc('create_workspace', {
			workspace_name: name
		});

		if (error || !workspaceId) {
			return fail(400, {
				intent: 'workspace',
				message: error?.message ?? 'Could not create workspace.'
			});
		}

		redirect(303, safeRedirectPath(`/planner?workspace=${workspaceId}`));
	},

	acceptInvitation: async ({ locals, request }) => {
		const { user } = await locals.safeGetSession();
		if (!locals.supabase || !user) {
			return fail(401, { intent: 'invitation', message: 'Sign in before accepting invitations.' });
		}

		const form = await request.formData();
		const invitationId = String(form.get('invitationId') ?? '');

		const { data: workspaceId, error } = await locals.supabase.rpc('accept_workspace_invitation', {
			target_invitation_id: invitationId
		});

		if (error || !workspaceId) {
			return fail(400, {
				intent: 'invitation',
				message: error?.message ?? 'Could not accept invitation.'
			});
		}

		redirect(303, safeRedirectPath(`/planner?workspace=${workspaceId}`));
	}
};

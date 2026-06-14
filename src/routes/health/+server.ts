import { json } from '@sveltejs/kit';
import { runtimeMode, supabaseAuthConfigured } from '$lib/server/runtime-config';
import { supabaseServiceRoleConfigured } from '$lib/server/supabase-admin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const deep = url.searchParams.get('deep') === '1';
	const supabaseConfigured = supabaseAuthConfigured();

	return json({
		ok: true,
		service: 'event-timeline-planner',
		mode: runtimeMode(),
		readiness: {
			supabaseAuthConfigured: supabaseConfigured,
			supabaseWorkspaceConfigured: supabaseConfigured,
			supabaseServiceRoleConfigured: supabaseServiceRoleConfigured(),
			configError: supabaseConfigured
				? null
				: 'Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY to enable login and workspaces.',
			...(deep
				? {
						database: supabaseConfigured
							? 'Supabase credentials are configured; apply supabase/migrations/0001_timeline_workspace_schema.sql to create the workspace schema.'
							: 'Supabase credentials are not configured.'
					}
				: {})
		},
		deep
	});
};

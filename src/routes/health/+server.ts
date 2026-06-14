import { json } from '@sveltejs/kit';
import { hasLumaApiKey } from '$lib/server/luma';
import {
	lumaConsoleDatabaseConfigured,
	lumaConsoleSchemaStatus
} from '$lib/server/luma-console-db';
import {
	requireSharedWorkspaceMode,
	runtimeMode,
	sharedWorkspaceConfigError,
	sharedWorkspaceReady,
	supabaseAuthConfigured
} from '$lib/server/runtime-config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const sharedLumaConsoleConfigured = lumaConsoleDatabaseConfigured();
	const deep = url.searchParams.get('deep') === '1';
	const configError = sharedWorkspaceConfigError();

	return json({
		ok: true,
		service: 'event-timeline-planner',
		mode: runtimeMode(),
		readiness: {
			supabaseAuthConfigured: supabaseAuthConfigured(),
			sharedLumaConsoleConfigured,
			lumaApiConfigured: hasLumaApiKey(),
			requireSharedWorkspace: requireSharedWorkspaceMode(),
			sharedWorkspaceReady: sharedWorkspaceReady(),
			configError,
			...(deep ? { lumaConsoleSchema: await lumaConsoleSchemaStatus() } : {})
		},
		deep
	});
};

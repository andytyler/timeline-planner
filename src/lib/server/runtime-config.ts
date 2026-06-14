import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { lumaConsoleDatabaseConfigured } from '$lib/server/luma-console-db';

function truthyEnv(value: string | undefined) {
	return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
}

export function requireSharedWorkspaceMode() {
	return truthyEnv(privateEnv.PLANNER_REQUIRE_SHARED_WORKSPACE);
}

export function supabaseAuthConfigured() {
	return Boolean(publicEnv.PUBLIC_SUPABASE_URL && publicEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function sharedWorkspaceReady() {
	return supabaseAuthConfigured() && lumaConsoleDatabaseConfigured();
}

export function runtimeMode() {
	if (lumaConsoleDatabaseConfigured()) return 'luma-console';
	if (supabaseAuthConfigured()) return 'supabase-fallback';
	return 'local';
}

export function sharedWorkspaceConfigError() {
	if (!requireSharedWorkspaceMode() || sharedWorkspaceReady()) return null;

	const missing = [];
	if (!supabaseAuthConfigured())
		missing.push('PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_PUBLISHABLE_KEY');
	if (!lumaConsoleDatabaseConfigured()) missing.push('LUMA_CONSOLE_DATABASE_URL');

	return `Shared workspace mode is required but missing: ${missing.join(', ')}.`;
}

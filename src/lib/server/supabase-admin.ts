import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';

export function supabaseServiceRoleConfigured() {
	return Boolean(publicEnv.PUBLIC_SUPABASE_URL && privateEnv.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseAdminClient() {
	if (!publicEnv.PUBLIC_SUPABASE_URL || !privateEnv.SUPABASE_SERVICE_ROLE_KEY) return null;

	return createClient(publicEnv.PUBLIC_SUPABASE_URL, privateEnv.SUPABASE_SERVICE_ROLE_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}

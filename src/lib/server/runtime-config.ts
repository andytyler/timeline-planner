import { env as publicEnv } from '$env/dynamic/public';

export function supabaseAuthConfigured() {
	return Boolean(publicEnv.PUBLIC_SUPABASE_URL && publicEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function runtimeMode() {
	if (supabaseAuthConfigured()) return 'supabase';
	return 'local';
}

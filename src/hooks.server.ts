import { env } from '$env/dynamic/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	if (!env.PUBLIC_SUPABASE_URL || !env.PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
		event.locals.supabase = null;
		event.locals.safeGetSession = async () => ({ session: null, user: null });
		return resolve(event);
	}

	event.locals.supabase = createServerClient(
		env.PUBLIC_SUPABASE_URL,
		env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					for (const { name, value, options } of cookiesToSet) {
						event.cookies.set(name, value, { ...options, path: '/' });
					}
				}
			}
		}
	);

	event.locals.safeGetSession = async () => {
		const { data: sessionData } = await event.locals.supabase!.auth.getSession();
		if (!sessionData.session) return { session: null, user: null };

		const { data: userData, error } = await event.locals.supabase!.auth.getUser();
		if (error) return { session: null, user: null };

		return {
			session: sessionData.session,
			user: userData.user
		};
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

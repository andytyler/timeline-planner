import { safeRedirectPath } from '$lib/server/redirect';
import { redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals, url }) => {
	const code = url.searchParams.get('code');
	const next = safeRedirectPath(url.searchParams.get('next'));

	if (!locals.supabase || !code) {
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
	if (error) {
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	redirect(303, next);
};

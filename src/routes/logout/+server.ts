import { redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.supabase) {
		await locals.supabase.auth.signOut();
	}

	redirect(303, '/login');
};

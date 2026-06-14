import { safeRedirectPath } from '$lib/server/redirect';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	const next = safeRedirectPath(url.searchParams.get('next'));
	if (user) redirect(303, next);

	return {
		next,
		supabaseConfigured: Boolean(locals.supabase)
	};
};

export const actions: Actions = {
	email: async ({ locals, request, url }) => {
		if (!locals.supabase) {
			return fail(503, {
				message: 'Supabase is not configured yet.'
			});
		}

		const form = await request.formData();
		const next = safeRedirectPath(form.get('next'));
		const mode = String(form.get('mode') ?? 'signin');
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, {
				message: 'Enter your email and password.'
			});
		}

		if (password.length < 6) {
			return fail(400, {
				message: 'Password must be at least 6 characters.'
			});
		}

		if (mode === 'signup') {
			const redirectTo = new URL('/auth/callback', url.origin);
			redirectTo.searchParams.set('next', next);

			const { data, error } = await locals.supabase.auth.signUp({
				email,
				password,
				options: {
					emailRedirectTo: redirectTo.toString()
				}
			});

			if (error) {
				return fail(400, {
					message: error.message
				});
			}

			if (!data.session) {
				return {
					message: 'Check your email to confirm your account, then sign in.'
				};
			}

			redirect(303, next);
		}

		const { error } = await locals.supabase.auth.signInWithPassword({
			email,
			password
		});

		if (error) {
			return fail(400, {
				message: error.message
			});
		}

		redirect(303, next);
	},

	google: async ({ locals, request, url }) => {
		if (!locals.supabase) {
			return fail(503, {
				message: 'Supabase is not configured yet.'
			});
		}

		const form = await request.formData();
		const next = safeRedirectPath(form.get('next'));
		const redirectTo = new URL('/auth/callback', url.origin);
		redirectTo.searchParams.set('next', next);

		const { data, error } = await locals.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: redirectTo.toString()
			}
		});

		if (error || !data.url) {
			return fail(400, {
				message: error?.message ?? 'Could not start Google sign in.'
			});
		}

		redirect(303, data.url);
	}
};

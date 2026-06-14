import { env } from '$env/dynamic/private';

export function appOrigin(fallbackOrigin: string) {
	return (env.APP_ORIGIN || fallbackOrigin).replace(/\/$/, '');
}

export function authCallbackUrl(fallbackOrigin: string, next: string) {
	const redirectTo = new URL('/auth/callback', appOrigin(fallbackOrigin));
	redirectTo.searchParams.set('next', next);
	return redirectTo.toString();
}

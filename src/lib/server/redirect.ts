export function safeRedirectPath(
	value: FormDataEntryValue | string | null | undefined,
	fallback = '/planner'
) {
	if (typeof value !== 'string') return fallback;
	if (!value.startsWith('/') || value.startsWith('//')) return fallback;
	if (value.includes('\\')) return fallback;
	return value;
}

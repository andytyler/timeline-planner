import { env } from '$env/dynamic/private';

type LumaRecord = Record<string, unknown>;

const LUMA_EVENTS_ENDPOINT = 'https://public-api.luma.com/v1/calendar/list-events';

export type SyncedLumaEvent = {
	luma_event_id: string;
	name: string;
	url: string | null;
	starts_at: string | null;
	ends_at: string | null;
	location: string | null;
	raw: LumaRecord;
};

function asRecord(value: unknown): LumaRecord | undefined {
	return value && typeof value === 'object' ? (value as LumaRecord) : undefined;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function nestedString(record: LumaRecord | undefined, ...keys: string[]): string | undefined {
	let value: unknown = record;
	for (const key of keys) {
		value = asRecord(value)?.[key];
	}
	return asString(value);
}

function eventLocation(event: LumaRecord): string | null {
	return (
		nestedString(event, 'geo_address_json', 'city') ??
		nestedString(event, 'geo_address_json', 'address') ??
		nestedString(event, 'geo_address_info', 'city') ??
		nestedString(event, 'geo_address_info', 'full_address') ??
		nestedString(event, 'location_info', 'name') ??
		nestedString(event, 'venue', 'name') ??
		null
	);
}

function eventUrl(event: LumaRecord, wrapper: LumaRecord): string | null {
	const direct =
		asString(event.url) ??
		asString(event.event_url) ??
		asString(wrapper.url) ??
		asString(wrapper.event_url);
	if (direct) return direct;

	const slug = asString(event.slug) ?? asString(event.url_slug) ?? asString(wrapper.slug);
	return slug ? `https://luma.com/${slug}` : null;
}

function mapLumaEvent(value: unknown): SyncedLumaEvent | null {
	const wrapper = asRecord(value);
	if (!wrapper) return null;

	const event = asRecord(wrapper.event) ?? wrapper;
	const lumaEventId =
		asString(event.api_id) ??
		asString(event.event_api_id) ??
		asString(event.id) ??
		asString(wrapper.api_id) ??
		asString(wrapper.event_api_id) ??
		asString(wrapper.id);
	const name = asString(event.name) ?? asString(event.title);

	if (!lumaEventId || !name) return null;

	return {
		luma_event_id: lumaEventId,
		name,
		url: eventUrl(event, wrapper),
		starts_at: asString(event.start_at) ?? asString(wrapper.start_at) ?? null,
		ends_at: asString(event.end_at) ?? asString(wrapper.end_at) ?? null,
		location: eventLocation(event),
		raw: wrapper
	};
}

export function hasLumaApiKey() {
	return Boolean(env.LUMA_API_KEY);
}

export async function fetchUpcomingLumaEvents(
	fetch: typeof globalThis.fetch,
	limit = 50,
	calendarApiId?: string | null
) {
	if (!env.LUMA_API_KEY) {
		return { events: [] as SyncedLumaEvent[], error: 'LUMA_API_KEY is not configured.' };
	}

	const url = new URL(LUMA_EVENTS_ENDPOINT);
	url.searchParams.set('after', new Date().toISOString());
	url.searchParams.set('pagination_limit', String(limit));
	url.searchParams.set('sort_column', 'start_at');
	url.searchParams.set('sort_direction', 'asc');
	url.searchParams.append('platforms', 'luma');
	url.searchParams.append('platforms', 'external');
	if (calendarApiId) url.searchParams.set('calendar_api_id', calendarApiId);

	const response = await fetch(url, {
		headers: {
			'x-luma-api-key': env.LUMA_API_KEY
		}
	});

	if (!response.ok) {
		return { events: [] as SyncedLumaEvent[], error: `Luma returned ${response.status}.` };
	}

	const payload = asRecord(await response.json());
	const rawEvents = Array.isArray(payload?.entries)
		? payload.entries
		: Array.isArray(payload?.events)
			? payload.events
			: [];

	const events = rawEvents
		.map(mapLumaEvent)
		.filter((event): event is SyncedLumaEvent => Boolean(event));

	return { events, error: null };
}

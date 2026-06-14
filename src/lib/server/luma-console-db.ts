import { env } from '$env/dynamic/private';
import postgres from 'postgres';
import type { TimelineSnapshot } from '$lib/timeline';

export type LumaConsoleWorkspaceRole = 'owner' | 'admin' | 'reviewer';

export type LumaConsoleUser = {
	id: string;
	email: string;
	name: string | null;
	avatar_url: string | null;
	role: 'admin' | 'reviewer';
};

export type LumaConsoleWorkspace = {
	id: string;
	name: string;
	role: LumaConsoleWorkspaceRole;
	created_at: string;
};

export type LumaConsoleEvent = {
	id: string;
	workspace_id: string;
	calendar_id: string;
	calendar_name: string;
	name: string;
	url: string | null;
	start_at: string | null;
	end_at: string | null;
	timezone: string | null;
	status: string | null;
};

export type LumaConsoleTimeline = {
	id: string;
	workspace_id: string;
	event_id: string;
	event_name: string;
	title: string;
	status: 'draft' | 'active' | 'archived';
	timezone: string | null;
	view_start: string;
	view_end: string;
	pad_before_minutes: number;
	pad_after_minutes: number;
	updated_at: string;
};

export type LumaConsoleTimelineLane = {
	id: string;
	name: string;
	sort_order: number;
};

export type LumaConsoleTimelineBlock = {
	id: string;
	lane_id: string;
	title: string;
	icon: string;
	block_type: 'planning' | 'active' | 'side';
	visibility: 'internal' | 'external';
	actual_start: string;
	actual_end: string;
	advertised_start: string | null;
	advertised_end: string | null;
	buffer_before_minutes: number;
	buffer_after_minutes: number;
	owner_label: string | null;
	notes: string;
	sort_order: number;
};

type LumaConsoleMembership = {
	user_id: string;
	role: LumaConsoleWorkspaceRole;
};

export type LumaConsoleSchemaStatus = {
	configured: boolean;
	reachable: boolean;
	ready: boolean;
	tables: {
		event_timelines: boolean;
		event_timeline_lanes: boolean;
		event_timeline_blocks: boolean;
	};
	functions: {
		create_event_timeline_with_default_lanes: boolean;
	};
	error: string | null;
};

declare global {
	// eslint-disable-next-line no-var
	var __timelinePlannerLumaConsoleSql: postgres.Sql | undefined;
}

function databaseUrl() {
	return env.LUMA_CONSOLE_DATABASE_URL || env.DATABASE_URL || null;
}

export function lumaConsoleDatabaseConfigured() {
	return Boolean(databaseUrl());
}

function emptySchemaStatus(error: string | null = null): LumaConsoleSchemaStatus {
	return {
		configured: lumaConsoleDatabaseConfigured(),
		reachable: false,
		ready: false,
		tables: {
			event_timelines: false,
			event_timeline_lanes: false,
			event_timeline_blocks: false
		},
		functions: {
			create_event_timeline_with_default_lanes: false
		},
		error
	};
}

function sqlClient() {
	if (!databaseUrl()) {
		throw new Error(
			'LUMA_CONSOLE_DATABASE_URL or DATABASE_URL must be set for shared Luma console data.'
		);
	}

	if (globalThis.__timelinePlannerLumaConsoleSql) return globalThis.__timelinePlannerLumaConsoleSql;

	globalThis.__timelinePlannerLumaConsoleSql = postgres(databaseUrl()!, {
		max: 5,
		idle_timeout: 20,
		connect_timeout: 20,
		prepare: false,
		transform: {
			undefined: null
		}
	});

	return globalThis.__timelinePlannerLumaConsoleSql;
}

export function canManageLumaConsoleWorkspace(role: LumaConsoleWorkspaceRole | null | undefined) {
	return role === 'owner' || role === 'admin';
}

export function canEditLumaConsoleWorkspace(role: LumaConsoleWorkspaceRole | null | undefined) {
	return role === 'owner' || role === 'admin';
}

function isUuid(value: string | null | undefined): value is string {
	return Boolean(
		value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
	);
}

type LumaConsoleSqlExecutor = postgres.Sql | postgres.TransactionSql;

async function lumaConsoleMembershipForSupabaseUser(
	supabaseUserId: string,
	workspaceId: string,
	sql: LumaConsoleSqlExecutor = sqlClient()
) {
	const [membership] = await sql<LumaConsoleMembership[]>`
		select users.id::text as user_id, workspace_memberships.role
		from users
		join workspace_memberships on workspace_memberships.user_id = users.id
		where users.supabase_user_id = ${supabaseUserId}
			and workspace_memberships.workspace_id = ${workspaceId}
		limit 1
	`;

	return membership ?? null;
}

export async function lumaConsoleUserForSupabaseUser(supabaseUserId: string) {
	const [user] = await sqlClient()<LumaConsoleUser[]>`
		select id::text, email, name, avatar_url, role
		from users
		where supabase_user_id = ${supabaseUserId}
		limit 1
	`;

	return user ?? null;
}

export async function lumaConsoleWorkspacesForSupabaseUser(supabaseUserId: string) {
	return await sqlClient()<LumaConsoleWorkspace[]>`
		select
			workspaces.id::text,
			workspaces.name,
			workspace_memberships.role,
			workspaces.created_at::text
		from users
		join workspace_memberships on workspace_memberships.user_id = users.id
		join workspaces on workspaces.id = workspace_memberships.workspace_id
		where users.supabase_user_id = ${supabaseUserId}
		order by workspaces.created_at asc
	`;
}

export async function lumaConsoleEventsForWorkspace(workspaceId: string) {
	return await sqlClient()<LumaConsoleEvent[]>`
		select
			events.id::text,
			luma_calendars.workspace_id::text,
			luma_calendars.id::text as calendar_id,
			luma_calendars.name as calendar_name,
			events.name,
			events.url,
			events.start_at::text,
			events.end_at::text,
			events.timezone,
			events.status
		from events
		join luma_calendars on luma_calendars.id = events.calendar_id
		where luma_calendars.workspace_id = ${workspaceId}
		order by events.start_at asc nulls last, events.created_at desc
	`;
}

export async function lumaConsoleTimelinesForWorkspace(workspaceId: string) {
	return await sqlClient()<LumaConsoleTimeline[]>`
		select
			event_timelines.id::text,
			event_timelines.workspace_id::text,
			event_timelines.event_id::text,
			events.name as event_name,
			event_timelines.title,
			event_timelines.status,
			event_timelines.timezone,
			event_timelines.view_start::text,
			event_timelines.view_end::text,
			event_timelines.pad_before_minutes,
			event_timelines.pad_after_minutes,
			event_timelines.updated_at::text
		from event_timelines
		join events on events.id = event_timelines.event_id
		where event_timelines.workspace_id = ${workspaceId}
		order by event_timelines.updated_at desc
	`;
}

export async function lumaConsoleTimelineLanes(timelineId: string) {
	return await sqlClient()<LumaConsoleTimelineLane[]>`
		select id::text, name, sort_order
		from event_timeline_lanes
		where timeline_id = ${timelineId}
		order by sort_order asc
	`;
}

export async function lumaConsoleTimelineBlocks(timelineId: string) {
	return await sqlClient()<LumaConsoleTimelineBlock[]>`
		select
			id::text,
			lane_id::text,
			title,
			icon,
			block_type,
			visibility,
			actual_start::text,
			actual_end::text,
			advertised_start::text,
			advertised_end::text,
			buffer_before_minutes,
			buffer_after_minutes,
			owner_label,
			notes,
			sort_order
		from event_timeline_blocks
		where timeline_id = ${timelineId}
		order by sort_order asc
	`;
}

export async function lumaConsoleSchemaStatus(): Promise<LumaConsoleSchemaStatus> {
	if (!lumaConsoleDatabaseConfigured()) {
		return emptySchemaStatus('LUMA_CONSOLE_DATABASE_URL or DATABASE_URL is not configured.');
	}

	try {
		const [status] = await sqlClient()<
			Array<{
				event_timelines: boolean;
				event_timeline_lanes: boolean;
				event_timeline_blocks: boolean;
				create_event_timeline_with_default_lanes: boolean;
			}>
		>`
			select
				to_regclass('public.event_timelines') is not null as event_timelines,
				to_regclass('public.event_timeline_lanes') is not null as event_timeline_lanes,
				to_regclass('public.event_timeline_blocks') is not null as event_timeline_blocks,
				exists (
					select 1
					from pg_proc
					join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
					where pg_namespace.nspname = 'public'
						and pg_proc.proname = 'create_event_timeline_with_default_lanes'
				) as create_event_timeline_with_default_lanes
		`;

		const tables = {
			event_timelines: Boolean(status?.event_timelines),
			event_timeline_lanes: Boolean(status?.event_timeline_lanes),
			event_timeline_blocks: Boolean(status?.event_timeline_blocks)
		};
		const functions = {
			create_event_timeline_with_default_lanes: Boolean(
				status?.create_event_timeline_with_default_lanes
			)
		};
		const ready =
			tables.event_timelines &&
			tables.event_timeline_lanes &&
			tables.event_timeline_blocks &&
			functions.create_event_timeline_with_default_lanes;

		return {
			configured: true,
			reachable: true,
			ready,
			tables,
			functions,
			error: null
		};
	} catch (error) {
		return emptySchemaStatus(error instanceof Error ? error.message : 'Could not inspect schema.');
	}
}

export async function createLumaConsoleTimelineFromEvent(
	supabaseUserId: string,
	workspaceId: string,
	eventId: string
) {
	const sql = sqlClient();
	const membership = await lumaConsoleMembershipForSupabaseUser(supabaseUserId, workspaceId, sql);
	if (!canEditLumaConsoleWorkspace(membership?.role)) {
		throw new Error('You need owner or admin access to create a timeline.');
	}

	const [event] = await sql<{ id: string; name: string }[]>`
		select events.id::text, events.name
		from events
		join luma_calendars on luma_calendars.id = events.calendar_id
		where events.id = ${eventId}
			and luma_calendars.workspace_id = ${workspaceId}
		limit 1
	`;

	if (!event) throw new Error('That Luma event is not available in this workspace.');

	const [timelineId] = await sql<{ id: string }[]>`
		select create_event_timeline_with_default_lanes(
			${workspaceId}::uuid,
			${event.id}::uuid,
			${event.name},
			${membership!.user_id}::uuid
		)::text as id
	`;

	if (!timelineId?.id) throw new Error('Could not create timeline.');
	return timelineId.id;
}

export async function saveLumaConsoleTimelineSnapshot(
	supabaseUserId: string,
	workspaceId: string,
	snapshot: TimelineSnapshot
) {
	const timelineId = snapshot.id;
	if (!isUuid(timelineId)) {
		throw new Error('Choose an existing Luma event timeline before saving.');
	}

	const invalidLane = snapshot.lanes.find((lane) => !isUuid(lane.id));
	if (invalidLane) {
		throw new Error(
			'This timeline has a local-only lane. Reopen the shared timeline before saving.'
		);
	}

	const invalidBlock = snapshot.blocks.find((block) => !isUuid(block.id) || !isUuid(block.lane));
	if (invalidBlock) {
		throw new Error(
			'This timeline has a local-only block. Reopen the shared timeline before saving.'
		);
	}

	const sql = sqlClient();
	return await sql.begin(async (transaction) => {
		const membership = await lumaConsoleMembershipForSupabaseUser(
			supabaseUserId,
			workspaceId,
			transaction
		);
		if (!canEditLumaConsoleWorkspace(membership?.role)) {
			throw new Error('You need owner or admin access to save this timeline.');
		}

		const [timeline] = await transaction<{ id: string }[]>`
			select event_timelines.id::text
			from event_timelines
			where event_timelines.id = ${timelineId}
				and event_timelines.workspace_id = ${workspaceId}
			limit 1
		`;

		if (!timeline) throw new Error('That timeline is not available in this workspace.');

		await transaction`
			update event_timelines
			set
				title = ${snapshot.title},
				view_start = ${snapshot.viewStart}::time,
				view_end = ${snapshot.viewEnd}::time,
				pad_before_minutes = ${snapshot.padBefore},
				pad_after_minutes = ${snapshot.padAfter},
				updated_by = ${membership!.user_id}::uuid
			where id = ${snapshot.id}
				and workspace_id = ${workspaceId}
		`;

		await transaction`delete from event_timeline_blocks where timeline_id = ${timelineId}`;
		await transaction`delete from event_timeline_lanes where timeline_id = ${timelineId}`;

		for (const [index, lane] of snapshot.lanes.entries()) {
			await transaction`
				insert into event_timeline_lanes (id, timeline_id, name, sort_order)
				values (${lane.id}::uuid, ${timelineId}::uuid, ${lane.label}, ${index})
			`;
		}

		for (const [index, block] of snapshot.blocks.entries()) {
			await transaction`
				insert into event_timeline_blocks (
					id,
					timeline_id,
					lane_id,
					title,
					icon,
					block_type,
					visibility,
					actual_start,
					actual_end,
					advertised_start,
					advertised_end,
					buffer_before_minutes,
					buffer_after_minutes,
					owner_label,
					notes,
					sort_order
				)
				values (
					${block.id}::uuid,
					${timelineId}::uuid,
					${block.lane}::uuid,
					${block.title},
					${block.icon},
					${block.type},
					${block.visibility},
					${block.start}::time,
					${block.end}::time,
					${block.advertisedStart || null}::time,
					${block.advertisedEnd || null}::time,
					${block.bufferBefore},
					${block.bufferAfter},
					${block.owner || null},
					${block.notes},
					${index}
				)
			`;
		}

		return timelineId;
	});
}

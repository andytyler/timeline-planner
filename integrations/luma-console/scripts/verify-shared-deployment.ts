import postgres from 'postgres';

type Check = {
	name: string;
	ok: boolean;
	detail?: string;
};

const databaseUrl = process.env.LUMA_CONSOLE_DATABASE_URL || process.env.DATABASE_URL;
const checks: Check[] = [];
const jsonOutput = process.argv.includes('--json');

function addCheck(name: string, ok: boolean, detail?: string) {
	checks.push({ name, ok, detail });
}

function hasValue(value: string | undefined) {
	return Boolean(value?.trim());
}

addCheck('PUBLIC_SUPABASE_URL', hasValue(process.env.PUBLIC_SUPABASE_URL));
addCheck('PUBLIC_SUPABASE_PUBLISHABLE_KEY', hasValue(process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY));
addCheck(
	'LUMA_CONSOLE_DATABASE_URL',
	hasValue(databaseUrl),
	'Can also be supplied as DATABASE_URL for local verification.'
);
addCheck(
	'PLANNER_REQUIRE_SHARED_WORKSPACE',
	process.env.PLANNER_REQUIRE_SHARED_WORKSPACE === 'true' ||
		process.env.PLANNER_REQUIRE_SHARED_WORKSPACE === '1',
	'Expected true/1 for the production shared-workspace Railway service.'
);

if (databaseUrl) {
	const sql = postgres(databaseUrl, {
		max: 1,
		idle_timeout: 5,
		connect_timeout: 20,
		prepare: false
	});

	try {
		const [status] = await sql<Array<Record<string, boolean>>>`
			select
				to_regclass('public.users') is not null as users,
				to_regclass('public.workspaces') is not null as workspaces,
				to_regclass('public.workspace_memberships') is not null as workspace_memberships,
				to_regclass('public.luma_calendars') is not null as luma_calendars,
				to_regclass('public.events') is not null as events,
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

		for (const key of [
			'users',
			'workspaces',
			'workspace_memberships',
			'luma_calendars',
			'events',
			'event_timelines',
			'event_timeline_lanes',
			'event_timeline_blocks',
			'create_event_timeline_with_default_lanes'
		]) {
			addCheck(`db:${key}`, Boolean(status?.[key]));
		}
	} catch (error) {
		addCheck(
			'db:connect',
			false,
			error instanceof Error ? error.message : 'Could not inspect database.'
		);
	} finally {
		await sql.end();
	}
}

const ok = checks.every((check) => check.ok);

if (jsonOutput) {
	console.info(JSON.stringify({ ok, checks }, null, 2));
} else {
	for (const check of checks) {
		const marker = check.ok ? 'ok' : 'fail';
		const detail = check.detail ? ` - ${check.detail}` : '';
		console.info(`[${marker}] ${check.name}${detail}`);
	}
}

if (!ok) process.exit(1);

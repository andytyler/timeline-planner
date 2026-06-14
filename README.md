# Event Timeline Planner

A standalone SvelteKit app for planning event run-of-show timelines with Supabase workspaces, Luma event sync, and Railway deployment.

## Stack

- Bun package manager
- SvelteKit with Svelte 5 and TypeScript
- Tailwind CSS v4 through `@tailwindcss/vite`
- shadcn-svelte Nova preset with Geist and Lucide icons
- Supabase SSR auth/data for `/planner`
- Railway adapter-node deployment
- ESLint, Prettier, and `svelte-check`

## Project Shape

- Reusable UI comes from shadcn-svelte source components in `src/lib/components/ui`
- The app root redirects to `/planner`
- The planner app lives at `/planner`
- Planner persistence uses `supabase/migrations/0001_timeline_workspace_schema.sql`
- Railway config-as-code lives in `railway.toml`
- Runtime healthcheck endpoint: `/health`
- Luma console integration notes live in `docs/shared-luma-console-integration.md`
- Legacy landing-page files still exist in this directory but are no longer the deployed surface for this service; they should move to a separate static site/repo/service.

## Environment

```sh
LUMA_API_KEY=
LUMA_CONSOLE_DATABASE_URL=
PLANNER_REQUIRE_SHARED_WORKSPACE=
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Keep real keys in `.env.local` or the Railway service environment, not in committed files.

- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` enable Supabase Auth and planner persistence.
- For one shared login with Luma console, set these Supabase public env vars to the same values as the Luma console service.
- Workspace creation and invitation acceptance run through signed-in Supabase RPCs, so the normal web service does not need a service-role key.
- `LUMA_API_KEY` powers `/planner` Luma sync.
- `LUMA_CONSOLE_DATABASE_URL` points at the Luma console Postgres database for the shared workspace/event integration path.
- `PLANNER_REQUIRE_SHARED_WORKSPACE=true` makes `/planner` refuse to run unless shared Supabase Auth and `LUMA_CONSOLE_DATABASE_URL` are configured. Use this in Railway production once the shared workspace path is the intended authority.
- Supabase Google OAuth must allow the production callback URL: `https://<railway-domain>/auth/callback`.
- `/health` returns non-secret readiness flags for `supabaseAuthConfigured`, `sharedLumaConsoleConfigured`, and `lumaApiConfigured`, plus the active runtime mode: `local`, `supabase-fallback`, or `luma-console`.
- `/health?deep=1` also checks whether the shared Luma console database is reachable and has the timeline tables/function installed. Keep Railway's normal liveness check on `/health` so routine health checks do not open database connections.

## Commands

```sh
bun install
bun run dev
bun run check
bun run lint
bun run build
bun run start
LUMA_CONSOLE_DATABASE_URL="postgres://..." bun run luma-console:schema
PUBLIC_SUPABASE_URL="https://..." PUBLIC_SUPABASE_PUBLISHABLE_KEY="..." LUMA_CONSOLE_DATABASE_URL="postgres://..." PLANNER_REQUIRE_SHARED_WORKSPACE=true bun run luma-console:verify
```

`luma-console:schema` applies `integrations/luma-console/timeline-schema.sql` to the Luma console Postgres database. Use it only when deploying the shared-workspace architecture.

`luma-console:verify` checks the shared deployment contract before/after Railway configuration: shared Supabase Auth env vars, `LUMA_CONSOLE_DATABASE_URL`, `PLANNER_REQUIRE_SHARED_WORKSPACE`, Luma console base tables, planner timeline tables, and `create_event_timeline_with_default_lanes`.

## Railway

Create a Railway service rooted at this `spring-summer-26` directory. The checked-in `railway.toml` sets:

- build: `bun install --frozen-lockfile && bun run build`
- start: `bun run start`
- healthcheck: `/health`

Set the environment variables above in the same Railway project/environment as the Luma console service.

For the production shared-workspace deployment, set `PLANNER_REQUIRE_SHARED_WORKSPACE=true`. With that flag enabled, `/planner` returns a 503 instead of falling back to local sample mode or the standalone fallback schema when the shared login/database env vars are missing. `/health` remains a 200 liveness endpoint, but reports `readiness.sharedWorkspaceReady: false` and a `readiness.configError` string until configuration is complete.

For full workspace reuse, do not assume the planner fallback schema is the production authority. The local Luma console repo uses `users`, `workspaces`, `workspace_memberships`, `luma_calendars`, and `events` in its `DATABASE_URL` database. See `docs/shared-luma-console-integration.md` before deploying this against shared production workspaces.

After deploy, open `/health` on the Railway domain. The production shared-workspace target should report:

```json
{
	"mode": "luma-console",
	"readiness": {
		"supabaseAuthConfigured": true,
		"sharedLumaConsoleConfigured": true
	}
}
```

After applying the shared timeline schema, open `/health?deep=1`. The production shared-workspace target should additionally report `readiness.lumaConsoleSchema.ready: true`.

Before calling the Railway service ready, run `bun run luma-console:verify` with the same env vars configured on Railway. A passing verifier plus `/health?deep=1` returning `ready: true` are the deployment evidence for the shared workspace/database path.

## Notes

The project was created with the current `sv` and `shadcn-svelte@latest` CLI flow, then componentized as source files under `src/lib/components/ui`.

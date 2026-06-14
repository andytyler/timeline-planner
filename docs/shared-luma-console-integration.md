# Shared Luma Console Integration

## Current Evidence

The local Luma console repo is `/Users/ajt/Repos/projects/luma-console`.

It is also a SvelteKit/Bun app and uses:

- Supabase Auth for Google OAuth via `@supabase/ssr`.
- A separate app database through `DATABASE_URL` and the `postgres` package.
- App-local users in `users`, bridged to Supabase Auth through `users.supabase_user_id`.
- Workspace membership in `workspace_memberships`, with roles `owner`, `admin`, and `reviewer`.
- Luma calendars and imported Luma events in `luma_calendars` and `events`.

This planner currently uses:

- Supabase Auth directly through `auth.users`.
- Supabase RLS tables `profiles`, `workspace_members`, `workspace_invitations`, and `luma_events`.
- Roles `owner`, `admin`, `member`, and `viewer`.

## Decision

Use the same Supabase Auth project as Luma console for one login.

Do not treat planner `workspace_members` as equivalent to Luma console `workspace_memberships`. They are not the same authority, and the role names differ.

## Best Production Shape

The preferred production integration is:

1. Set this planner service to the same `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` as Luma console.
2. Add the planner production callback URL to the same Supabase/Google OAuth allowlists.
3. Add planner timeline tables to the Luma console database, keyed to:
   - `workspaces.id`
   - `workspace_memberships.user_id`
   - `luma_calendars.id`
   - `events.id`
4. Use `src/lib/server/luma-console-db.ts` as the server data layer for Luma console `LUMA_CONSOLE_DATABASE_URL`, matching the console's `postgres` client pattern.
5. Map Luma console roles deliberately:
   - `owner`: manage workspace, Luma source, members, and timelines.
   - `admin`: manage Luma source and timelines; member management depends on product policy.
   - `reviewer`: view by default, or edit timelines only if event operations wants reviewers to plan.
6. Set `PLANNER_REQUIRE_SHARED_WORKSPACE=true` on the Railway service once shared workspace mode is the intended production path. This prevents `/planner` from silently running as local sample mode or the standalone fallback schema when shared Auth or `LUMA_CONSOLE_DATABASE_URL` are missing.

After Railway deployment, inspect this planner service's `/health` endpoint. The shared production path should report `mode: "luma-console"` with `readiness.supabaseAuthConfigured` and `readiness.sharedLumaConsoleConfigured` both `true`. The plain endpoint only reports configuration presence and does not expose secret values or open database connections.

If `PLANNER_REQUIRE_SHARED_WORKSPACE=true`, `/health` should also report `readiness.sharedWorkspaceReady: true` and `readiness.configError: null`. `/planner` intentionally returns 503 until those are true.

After applying `integrations/luma-console/timeline-schema.sql`, inspect `/health?deep=1`. The shared production path should report `readiness.lumaConsoleSchema.ready: true`, which proves the app can reach the Luma console database and can see `event_timelines`, `event_timeline_lanes`, `event_timeline_blocks`, and `create_event_timeline_with_default_lanes`.

The first-pass database artifact for this path is:

```text
integrations/luma-console/timeline-schema.sql
```

It adds `event_timelines`, `event_timeline_lanes`, and `event_timeline_blocks` to the Luma console database. `event_timelines.workspace_id` references Luma console `workspaces.id`; `event_timelines.event_id` is required, unique, and references Luma console `events.id`; a trigger verifies that the event belongs to a calendar in the same workspace through `events.calendar_id -> luma_calendars.workspace_id`. The timeline root includes `status` and `timezone`, while lanes/blocks preserve the visual planner's parallel-track model.

Apply this SQL only after deciding that the timeline planner should share Luma console's `DATABASE_URL` database. It is designed to be idempotent and should be folded into the Luma console migration flow before production use.

To apply it manually from this repo:

```sh
LUMA_CONSOLE_DATABASE_URL="postgres://..." bun run luma-console:schema
```

The apply script also accepts `DATABASE_URL` for convenience, but `LUMA_CONSOLE_DATABASE_URL` is the preferred Railway variable in this planner service so it is clear that the connection belongs to the Luma console database.

To verify the shared deployment contract from this repo:

```sh
PUBLIC_SUPABASE_URL="https://..." \
PUBLIC_SUPABASE_PUBLISHABLE_KEY="..." \
LUMA_CONSOLE_DATABASE_URL="postgres://..." \
PLANNER_REQUIRE_SHARED_WORKSPACE=true \
bun run luma-console:verify
```

The verifier checks shared Supabase Auth env vars, the Luma console DB URL, the production guard flag, Luma console base tables, timeline tables, and `create_event_timeline_with_default_lanes`.

The SQL intentionally does not implement row-level security. Luma console uses server-side direct Postgres access, so app authorization should happen in the server data layer by checking `workspace_memberships` before reading or mutating timeline rows.

The initial adapter exports typed server helpers for:

- looking up a Luma console user by Supabase Auth user id;
- listing Luma console workspaces for a Supabase Auth user;
- listing Luma console events for a workspace;
- listing shared timeline rows for a workspace;
- creating an event-backed timeline through `create_event_timeline_with_default_lanes`;
- saving timeline lanes and blocks to `event_timeline_lanes` and `event_timeline_blocks` after checking `workspace_memberships`.

## Fallback Shape

If timeline data must stay in a separate Supabase project:

1. Keep this app's current Supabase schema.
2. Use the same Supabase Auth project only if cross-project JWT verification and cookie behavior are proven in staging.
3. Mirror Luma console `users`, `workspaces`, `workspace_memberships`, `luma_calendars`, and `events` into planner tables through a backend sync job.
4. Treat mirrored membership as derived data. Luma console remains the authority.

## Library Choices

Current library choices are still valid:

- `interactjs` for precise timeline drag/resize interactions.
- `svelte-dnd-action` for future list-style ordering surfaces, not the time-grid interaction layer.
- `emoji-mart` and `@emoji-mart/data` for the Notion-like block icon/emoji picker.
- shadcn-svelte/Tailwind for app UI surfaces.

## References Checked

- Supabase SSR for SvelteKit: https://supabase.com/docs/guides/auth/server-side/sveltekit
- Supabase Google OAuth: https://supabase.com/docs/guides/auth/social-login/auth-google
- Railway deployments: https://docs.railway.com/deployments
- shadcn-svelte docs: https://www.shadcn-svelte.com/docs
- interact.js docs: https://interactjs.io/docs/
- svelte-dnd-action: https://github.com/isaacHagoel/svelte-dnd-action
- emoji-mart: https://github.com/missive/emoji-mart

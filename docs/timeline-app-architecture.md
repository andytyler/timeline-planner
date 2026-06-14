# Timeline Planner App Architecture

## Target Shape

The timeline planner should become a standalone SvelteKit app deployed as its own Railway service in the same Railway project/workspace as the existing Luma console. It should use the same Supabase Auth project as Luma console for one Google login, then either read the Luma console workspace schema directly or run a deliberate migration/bridge so workspace membership is not duplicated.

## Current Repo State

- Existing app: `spring-summer-26`, SvelteKit 2, Svelte 5, Tailwind CSS v4, shadcn-svelte source components, Bun.
- Existing timeline prototype: `event-timeline-planner/index.html`, static HTML/CSS/JS.
- Root route: `/` redirects to `/planner` for this service. The Codex Community London landing page should move to a separate static service/domain.
- Planner route: `/planner`, with local sample mode when Supabase env vars are absent and Supabase-backed workspace/timeline mode when they are present.
- Workspace navigation: `/planner?workspace=<workspace-id>` selects the active shared workspace, and `/planner?workspace=<workspace-id>&timeline=<timeline-id>` opens a specific run-of-show inside that workspace.
- Persistence: `src/routes/planner/+page.server.ts` loads workspaces, Luma events, timelines, lanes, and blocks through RLS; `createBlankTimeline` and `createTimelineFromEvent` call `public.create_timeline_with_default_lanes`, `saveTimeline` calls `public.save_timeline_snapshot`, and `duplicateTimeline` calls `public.duplicate_timeline`, keeping multi-row timeline writes transaction-safe.
- Workspace bootstrap: `createWorkspace` calls the signed-in Supabase RPC `public.create_workspace`, which creates the workspace, ensures the profile row, and inserts the owner membership in one transaction. This keeps workspace creation in the shared database layer instead of relying on a service-role app action.
- Invitation creation: `inviteMember` calls `public.invite_workspace_member`, which creates or refreshes a pending invite, enforces owner/admin invite permissions, and keeps owner-only admin invites in the database layer.
- Invitation acceptance: `acceptInvitation` calls the signed-in Supabase RPC `public.accept_workspace_invitation`, which validates the invite against the signed-in user's Auth email, ensures the profile row, upserts workspace membership, and marks the invite accepted in one locked transaction.
- Invitation revocation: pending invites can be revoked by owners/admins through `public.revoke_workspace_invitation`; browser clients have read-only grants on `workspace_members`, so membership creation and role/removal changes are constrained to the workspace RPCs.
- Member management: `updateMemberRole` and `removeMember` call `public.update_workspace_member_role` and `public.remove_workspace_member`. Owners can manage admins/members/viewers, admins can manage only members/viewers, and self-demotion/self-removal is blocked so leave-workspace behavior can be designed separately.
- Member identity: `public.profiles` mirrors Auth users through a trigger and lets workspace member lists show names/emails instead of raw UUID fragments while keeping profile reads limited to the signed-in user and shared workspace members. Users can edit their own display name and avatar URL from the planner; Auth remains the source of truth for email.
- Luma sync: each workspace stores `luma_calendar_api_id`; `syncLumaEvents` refuses to import until that workspace source is set, then fetches upcoming Luma events through `src/lib/server/luma.ts` with server-only `LUMA_API_KEY` and calls `public.sync_workspace_luma_events`. Browser clients have read-only grants on `luma_events`; writes are constrained to the sync RPC, which checks owner/admin membership and the workspace's configured Luma source before upserting rows. The event list only shows rows for the workspace's current Luma source, so switching sources does not mix old-source events into the active source list. Event timeline creation returns an existing linked timeline when one already exists or creates one atomically with the default lanes.
- Luma console code exists locally at `/Users/ajt/Repos/projects/luma-console` and `/Users/ajt/Repos/personal-brand/luma-console`. The project copy shows Supabase Auth for Google sign-in plus a separate app database accessed through `DATABASE_URL` and the `postgres` client.
- Luma console's canonical app user/workspace tables are `users`, `workspaces`, `workspace_memberships`, `workspace_invites`, `luma_calendars`, and `events` in `/Users/ajt/Repos/projects/luma-console/src/lib/server/schema.sql`. Planner tables currently use Supabase RLS names such as `profiles`, `workspace_members`, `workspace_invitations`, and `luma_events`, so workspace reuse requires an adapter/migration rather than a same-name drop-in.

## Verified External Constraints

- Supabase changelog, fetched 2026-06-14: new public tables may not be exposed to the Data API automatically on newer projects. Migrations should bundle explicit `GRANT`s with RLS.
- Supabase API security docs: grants control whether a role can reach a table/function, RLS controls which rows are visible or mutable.
- Supabase security guidance: avoid `security definer` functions in exposed schemas. Workspace helper functions belong in a private schema.
- Supabase SSR docs: `@supabase/ssr` is the supported JavaScript helper for cookie-backed server-side auth, matching both apps' current approach.
- Supabase Google OAuth docs: Google sign-in should be configured once in the shared Supabase Auth project, with every deployed app callback URL allowlisted.
- Railway deployment docs: this should remain a separate service in the same Railway project/environment, with config-as-code and environment variables scoped to the service.
- shadcn-svelte docs: shadcn-svelte is source-owned component code built on Bits UI and Tailwind CSS, which matches the request to keep the UI in shadcn/Tailwind patterns.
- interact.js docs: interact.js is appropriate for pointer-driven dragging/resizing with snapping/restriction; it does not move elements automatically, which matches the current state-driven Svelte implementation.
- svelte-dnd-action README: use it for accessible Svelte list reordering surfaces, not the precise vertical time-grid resize math.
- emoji-mart README/package: keep it as the current emoji picker source for Notion-like block icons unless a stronger Svelte-native icon picker is introduced.

## Recommended Stack

- App: SvelteKit 2 / Svelte 5.
- UI: Tailwind v4 and shadcn-svelte components only for product UI surfaces.
- Icons: `@lucide/svelte` for deterministic UI icons, plus emoji/icon picker for block icons.
- Drag/drop and resizing: `interactjs` is now the input layer for moving timeline blocks between lanes/times and resizing actual/buffer handles, kept behind `src/lib/timeline-interactions.ts` so Tailwind/shadcn remain the visual system. `svelte-dnd-action` should be reserved for list-like ordering surfaces, not precise time-grid resizing.
- Calendar engine fallback: prototype FullCalendar TimeGrid only if the custom visual planner becomes too costly to maintain. It is mature and has drag/resize support, but its opinionated CSS makes it a worse fit for the current custom Notion-like UI. Avoid adopting Schedule-X premium-only features or TOAST UI Calendar unless we intentionally accept their visual/theming constraints.
- Icon/emoji picker: keep `emoji-mart`/`@emoji-mart/data` behind `src/lib/components/emoji-picker.svelte` for Notion-like block icons. Wrap it in local shadcn/Tailwind surfaces rather than styling third-party UI globally.
- Rich notes/editor: use Tiptap directly for Svelte 5 if block notes need a Notion-like editor. Avoid React-first packages such as BlockNote or Novel unless the editor becomes central enough to justify a React island.
- Auth/data: `@supabase/ssr` and `@supabase/supabase-js`.
- Database: new Supabase project unless the Luma console already has a Supabase project whose Auth can be safely reused.
- Deployment: Railway service with Bun build/start commands; same Railway project as Luma console but separate service/container.

## Auth And Workspace Strategy

Preferred shared-login path:

1. Point this planner service at the same `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` as Luma console.
2. Add this planner's Railway callback URL to the same Supabase/Google OAuth allowlists.
3. Reuse Luma console's `users.supabase_user_id` mapping after Supabase Auth callback instead of maintaining a separate planner-only profile identity where possible.
4. Prefer adding planner timeline tables to the Luma console Postgres database, keyed to `workspaces.id`, `workspace_memberships.user_id`, `luma_calendars.id`, and `events.id`. The first-pass SQL artifact is `integrations/luma-console/timeline-schema.sql`.
5. If the planner remains on a separate Supabase Postgres project, build a one-way workspace/event sync job from Luma console's `DATABASE_URL`; do not pretend `workspace_members` and `workspace_memberships` are automatically the same authority.

Fallback:

1. Create a new Supabase project for timeline planner.
2. Enable Google OAuth in Supabase Auth after GCP OAuth credentials exist.
3. Use `workspaces` and `workspace_members` from `supabase/migrations/0001_timeline_workspace_schema.sql`.
4. Later sync/import Luma console workspace membership via service-role backend jobs.

Avoid:

- Using `raw_user_meta_data` or user-editable JWT claims for authorization.
- Exposing `service_role` to the browser.
- Granting public anon access to workspace/timeline tables.

## Data Model

Core tables in the first migration:

- `workspaces`: shared planning workspace.
- `profiles`: Auth-backed member identity for workspace rosters.
- `workspace_members`: user membership and role.
- `workspace_invitations`: pending email invites for admin/member/viewer roles.
- `luma_events`: synced Luma events available to attach timelines to.
- `timelines`: one run-of-show per event/date.
- `timeline_lanes`: main, prep, crew, external, or custom tracks.
- `timeline_blocks`: actual/advertised timing, buffers, icon, type, visibility, notes.

Later tables:

- `timeline_block_comments` for collaborative comments.
- `timeline_block_assignments` if owners become real members rather than labels.
- `timeline_activity_log` for audit/history.
- `timeline_public_views` for external read-only schedules.

## Luma Sync

The shared server helper at `src/lib/server/luma.ts` calls `https://public-api.luma.com/v1/calendar/list-events` with `LUMA_API_KEY`. The planner sync stores normalized events in `luma_events` through `public.sync_workspace_luma_events`.

Initial sync is manual/server action:

- Fetch upcoming events.
- Upsert by `(workspace_id, luma_calendar_api_id, luma_event_id)` in standalone fallback mode.
- Let users create or open a timeline from each event.
- Owners/admins can sync Luma events. Owners/admins/members can create and edit timelines. Viewers can read.

Production sync can become a Railway cron job or Supabase Edge Function after deployment details are settled.

Open caveat: Luma console stores workspace-scoped calendar records in `luma_calendars`, including `luma_calendar_id`, encrypted API keys, and imported `events`. The planner's current `luma_calendar_api_id` field is a standalone fallback. For true shared workspace mode, timeline creation should attach to Luma console `events.id` and calendar/workspace ownership rather than re-syncing the same events into a separate `luma_events` table.

## Railway Deployment

Expected service settings:

- Root directory: `spring-summer-26`.
- Config-as-code: `railway.toml`.
- Build command: `bun install --frozen-lockfile && bun run build`.
- Start command: `bun run start`, which runs adapter-node via `node build/index.js`.
- Healthcheck path: `/health`.
- Runtime: `@sveltejs/adapter-node`, using Railway's `PORT`.

Environment variables:

```sh
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_PUBLISHABLE_KEY=
LUMA_API_KEY=
LUMA_CONSOLE_DATABASE_URL=
```

Google OAuth setup belongs in Supabase Dashboard once GCP OAuth credentials exist.
Allowlist the production callback URL in Supabase/Google OAuth: `https://<railway-domain>/auth/callback`.

## Near-Term Implementation Plan

1. Decide whether timeline tables live in the Luma console database or a separate Supabase Postgres project.
2. If sharing Luma console DB, add a `postgres` server data layer to the planner and map roles: `owner/admin` -> manage, `reviewer` -> view or edit depending on product policy.
3. If keeping separate Supabase DB, implement a bridge job that mirrors `users`, `workspaces`, `workspace_memberships`, `luma_calendars`, and `events` into planner tables.
4. Move the legacy landing page to a separate static service/repo/domain.
5. Add email delivery/provider integration for workspace invitations if planner-owned invites remain.
6. Add stale/cancelled Luma event handling so old synced rows can be marked inactive.

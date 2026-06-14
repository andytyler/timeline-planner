# Event Timeline Planner

A standalone SvelteKit app for planning event run-of-show timelines with Supabase Auth, Supabase workspaces, email invitations, optional Luma event sync, and Railway deployment.

## Stack

- Bun package manager
- SvelteKit with Svelte 5 and TypeScript
- Tailwind CSS v4 through `@tailwindcss/vite`
- shadcn-svelte Nova preset with Geist and Lucide icons
- Supabase SSR auth/data for `/planner`
- Railway adapter-node deployment
- ESLint, Prettier, and `svelte-check`

## Project Shape

- The app root redirects to `/planner`
- The planner app lives at `/planner`
- Supabase schema and RLS live in `supabase/migrations/0001_timeline_workspace_schema.sql`
- Runtime healthcheck endpoint: `/health`
- Railway config-as-code lives in `railway.toml`
- Local mode is available when Supabase env vars are absent; it is a browser-only prototype mode

## Environment

```sh
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_ORIGIN=
```

- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` enable login, workspaces, members, invitations, and timeline persistence.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. It lets the SvelteKit server read private workspace Luma credentials during sync.
- `APP_ORIGIN` should be the canonical deployed origin, for example `https://tline.ajt.dev`. It keeps Supabase OAuth and email confirmation links off localhost in production.
- Luma API keys are entered per workspace in the app and stored in `app_private.workspace_luma_credentials`; they are never returned to browser page data.
- Keep real keys in `.env.local` or the Railway service environment, not in committed files.
- Supabase Google OAuth must allow the production callback URL: `https://<railway-domain>/auth/callback`.

## Fresh Supabase Setup

1. Create a new Supabase project.
2. In Supabase SQL Editor, run `supabase/migrations/0001_timeline_workspace_schema.sql`.
3. In Supabase Auth, enable Google OAuth.
4. Add local and production callback URLs:
   - `http://localhost:5174/auth/callback`
   - `https://<railway-domain>/auth/callback`
5. Set `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN` locally and in Railway.

The migration creates:

- `profiles`: Auth-backed user identity for roster display.
- `workspaces`: planning workspaces owned by signed-in users.
- `workspace_members`: owner/admin/member/viewer access.
- `workspace_invitations`: pending email invites that can be accepted by a signed-in account with the same email.
- `timelines`, `timeline_lanes`, and `timeline_blocks`: persisted run-of-show data.
- Optional `luma_events` rows for workspace-scoped Luma event sync.
- `app_private.workspace_luma_credentials`: server-only per-workspace Luma API keys.

Workspace creation, invitation creation, invitation acceptance, member updates, member removal, timeline creation, timeline duplication, timeline saving, and Luma sync all go through signed-in Supabase RPCs with RLS and database-side permission checks.

## Commands

```sh
bun install
bun run dev
bun run check
bun run lint
bun run build
bun run start
```

## Railway

Create a Railway service rooted at this directory. The checked-in `railway.toml` sets:

- build: `bun install --frozen-lockfile && bun run build`
- start: `bun run start`
- healthcheck: `/health`

Set `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_ORIGIN=https://tline.ajt.dev` in Railway. The service-role key must stay private and server-side only.

After deploy, open `/health` on the Railway domain. A production Supabase-backed service should report:

```json
{
	"mode": "supabase",
	"readiness": {
		"supabaseAuthConfigured": true,
		"supabaseWorkspaceConfigured": true
	}
}
```

## Invitation Flow

Owners/admins invite by email from the workspace panel. The database stores the pending invite. When the invited person signs in with the same email address, `/planner` shows the pending invitation and lets them accept it.

There is no email-sending provider wired yet; invite delivery is currently out-of-band.

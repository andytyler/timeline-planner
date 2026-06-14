# Timeline App Architecture

## Direction

The timeline planner is a standalone SvelteKit app backed by a fresh Supabase project. Supabase Auth is the login authority, and the app owns its workspace, member, invitation, and timeline tables.

The app supports:

- Local prototype mode when Supabase env vars are absent.
- Supabase production mode when `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set.
- Optional Luma API event sync through per-workspace Luma API keys; this is not required for workspace/login/member flows.

## Runtime Modes

- `local`: no Supabase env vars; `/planner` renders sample state and does not persist edits.
- `supabase`: Supabase env vars are configured; `/planner` requires login and persists through Supabase RLS/RPCs.

There is no separate shared database bridge. Production should use the schema in `supabase/migrations/0001_timeline_workspace_schema.sql`.

## Data Model

- `profiles`: mirrors Supabase Auth users for workspace rosters.
- `workspaces`: planning workspace records.
- `workspace_members`: per-workspace `owner`, `admin`, `member`, or `viewer` roles.
- `workspace_invitations`: email-address invites. Acceptance requires signing in with the invited email.
- `timelines`: run-of-show timeline records.
- `timeline_lanes`: timeline lane definitions.
- `timeline_blocks`: editable timeline blocks.
- `luma_events`: optional synced Luma events scoped to a workspace and calendar source.
- `app_private.workspace_luma_credentials`: private per-workspace Luma API keys. Browser clients cannot select this table.

## Permission Model

Database functions enforce workspace permissions:

- Owners/admins can invite people, revoke invites, manage Luma source settings, sync Luma events, and manage members.
- Owners can invite/promote admins.
- Admins can manage members/viewers but cannot manage owners/admins.
- Owners/admins/members can create, duplicate, and save timelines.
- Viewers can read workspace content.

The browser uses the public Supabase key and relies on RLS plus signed-in RPCs. Normal workspace operations do not expose secrets. Luma sync uses the server-only `SUPABASE_SERVICE_ROLE_KEY` to read the private workspace API key after the signed-in user is confirmed as a workspace member.

## Auth Flow

- `/login` starts Google OAuth with Supabase.
- `/auth/callback` exchanges the OAuth code for a Supabase session.
- `src/hooks.server.ts` creates the SSR Supabase client and validates the user with `auth.getUser()`.
- `/planner` redirects signed-out users to `/login` when Supabase is configured.

## Invitation Flow

1. Owner/admin submits an email and role.
2. `public.invite_workspace_member` creates or refreshes a pending invitation.
3. The invited user signs in with the same email.
4. `/planner` lists matching pending invitations.
5. `public.accept_workspace_invitation` verifies the email, upserts membership, and marks the invite accepted.

Email delivery is intentionally not part of the first version; the invite can be communicated out-of-band.

## Deployment

Required Railway env vars:

```sh
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

```sh
SUPABASE_SERVICE_ROLE_KEY=
```

Supabase Auth should allow:

- `http://localhost:5174/auth/callback`
- `https://<railway-domain>/auth/callback`

## Verification

Use:

```sh
bun install --frozen-lockfile
bun run lint
bun run check
bun run build
```

Then verify `/health`. A Supabase-backed deployment should report `mode: "supabase"` and `readiness.supabaseAuthConfigured: true`.

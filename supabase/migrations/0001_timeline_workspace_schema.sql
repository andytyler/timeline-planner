create extension if not exists pgcrypto;
create schema if not exists app_private;

create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.timeline_block_type as enum ('planning', 'active', 'side');
create type public.timeline_visibility as enum ('internal', 'external');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  luma_calendar_api_id text,
  luma_api_key_updated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.workspace_luma_credentials (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  api_key text not null check (length(trim(api_key)) >= 8),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_members_user_profile_fk
    foreign key (user_id)
    references public.profiles(id)
    on delete cascade
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role public.workspace_role not null default 'member' check (role in ('admin', 'member', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create table public.luma_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  luma_calendar_api_id text not null,
  luma_event_id text not null,
  name text not null,
  url text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, luma_calendar_api_id, luma_event_id)
);

alter table public.luma_events
  add constraint luma_events_id_workspace_id_unique unique (id, workspace_id);

create table public.timelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  luma_event_id uuid,
  title text not null,
  date date,
  timezone text not null default 'Europe/London',
  view_start time not null default '08:00',
  view_end time not null default '18:30',
  pad_before_minutes integer not null default 30 check (pad_before_minutes >= 0),
  pad_after_minutes integer not null default 45 check (pad_after_minutes >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.timelines
  add constraint timelines_id_workspace_id_unique unique (id, workspace_id),
  add constraint timelines_luma_event_workspace_fk
    foreign key (luma_event_id, workspace_id)
    references public.luma_events(id, workspace_id)
    on delete set null (luma_event_id);

create table public.timeline_lanes (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.timeline_lanes
  add constraint timeline_lanes_id_timeline_id_unique unique (id, timeline_id);

create table public.timeline_blocks (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  lane_id uuid not null,
  title text not null,
  icon text not null default 'list',
  block_type public.timeline_block_type not null default 'planning',
  visibility public.timeline_visibility not null default 'internal',
  actual_start time not null,
  actual_end time not null,
  advertised_start time,
  advertised_end time,
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  owner_label text,
  notes text not null default '',
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint actual_time_order check (actual_end > actual_start),
  constraint advertised_time_order check (
    advertised_start is null
    or advertised_end is null
    or advertised_end > advertised_start
  )
);

alter table public.timeline_blocks
  add constraint timeline_blocks_lane_timeline_fk
    foreign key (lane_id, timeline_id)
    references public.timeline_lanes(id, timeline_id)
    on delete cascade;

create index workspace_members_user_id_idx on public.workspace_members(user_id);
create index profiles_email_idx on public.profiles(email);
create index workspace_invitations_workspace_id_idx on public.workspace_invitations(workspace_id);
create unique index workspace_invitations_pending_email_idx
  on public.workspace_invitations(workspace_id, email)
  where accepted_at is null and revoked_at is null;
create index luma_events_workspace_id_idx on public.luma_events(workspace_id);
create index luma_events_workspace_source_idx on public.luma_events(workspace_id, luma_calendar_api_id);
create index timelines_workspace_id_idx on public.timelines(workspace_id);
create unique index timelines_workspace_luma_event_unique_idx
  on public.timelines(workspace_id, luma_event_id)
  where luma_event_id is not null;
create index timeline_lanes_timeline_id_idx on public.timeline_lanes(timeline_id);
create index timeline_blocks_timeline_id_idx on public.timeline_blocks(timeline_id);
create index timeline_blocks_lane_id_idx on public.timeline_blocks(lane_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_touch_updated_at
before update on public.workspaces
for each row execute function public.touch_updated_at();

create trigger workspace_luma_credentials_touch_updated_at
before update on app_private.workspace_luma_credentials
for each row execute function public.touch_updated_at();

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger luma_events_touch_updated_at
before update on public.luma_events
for each row execute function public.touch_updated_at();

create trigger timelines_touch_updated_at
before update on public.timelines
for each row execute function public.touch_updated_at();

create trigger timeline_blocks_touch_updated_at
before update on public.timeline_blocks
for each row execute function public.touch_updated_at();

create or replace function app_private.sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(lower(new.email), new.id::text || '@missing-email.local'),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do update
  set
    email = excluded.email;

  return new;
end;
$$;

create trigger auth_users_sync_profile_insert
after insert on auth.users
for each row execute function app_private.sync_user_profile();

create trigger auth_users_sync_profile_update
after update of email, raw_user_meta_data on auth.users
for each row execute function app_private.sync_user_profile();

insert into public.profiles (id, email, full_name, avatar_url)
select
  id,
  coalesce(lower(email), id::text || '@missing-email.local'),
  nullif(raw_user_meta_data ->> 'full_name', ''),
  nullif(raw_user_meta_data ->> 'avatar_url', '')
from auth.users
on conflict (id) do update
set
  email = excluded.email;

create or replace function app_private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function app_private.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function app_private.can_edit_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'member')
  );
$$;

create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_email text;
  safe_name text;
  base_slug text;
  workspace_slug text;
  new_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before creating a workspace.'
      using errcode = '42501';
  end if;

  safe_name := coalesce(nullif(trim(workspace_name), ''), 'Event Operations');
  base_slug := lower(regexp_replace(safe_name, '[^a-z0-9]+', '-', 'g'));
  base_slug := left(trim(both '-' from base_slug), 40);
  workspace_slug := coalesce(nullif(base_slug, ''), 'workspace') || '-' || left(gen_random_uuid()::text, 8);

  select coalesce(lower(email), current_user_id::text || '@missing-email.local')
  into current_user_email
  from auth.users
  where id = current_user_id;

  insert into public.profiles (id, email)
  values (current_user_id, coalesce(current_user_email, current_user_id::text || '@missing-email.local'))
  on conflict (id) do update
  set email = excluded.email;

  insert into public.workspaces (name, slug, created_by)
  values (safe_name, workspace_slug, current_user_id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  return new_workspace_id;
end;
$$;

create or replace function public.accept_workspace_invitation(target_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_email text;
  target_invitation public.workspace_invitations%rowtype;
begin
  if current_user_id is null then
    raise exception 'Sign in before accepting an invitation.'
      using errcode = '42501';
  end if;

  select coalesce(lower(email), lower(auth.email()))
  into current_user_email
  from auth.users
  where id = current_user_id;

  if current_user_email is null then
    raise exception 'This account does not have an email address.'
      using errcode = '42501';
  end if;

  select *
  into target_invitation
  from public.workspace_invitations
  where id = target_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found.'
      using errcode = 'P0002';
  end if;

  if target_invitation.accepted_at is not null then
    raise exception 'Invitation has already been accepted.'
      using errcode = '22023';
  end if;

  if target_invitation.revoked_at is not null then
    raise exception 'Invitation has been revoked.'
      using errcode = '22023';
  end if;

  if target_invitation.expires_at <= now() then
    raise exception 'Invitation has expired.'
      using errcode = '22023';
  end if;

  if lower(target_invitation.email) <> current_user_email then
    raise exception 'This invitation is for a different email address.'
      using errcode = '42501';
  end if;

  insert into public.profiles (id, email)
  values (current_user_id, current_user_email)
  on conflict (id) do update
  set email = excluded.email;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_invitation.workspace_id, current_user_id, target_invitation.role)
  on conflict (workspace_id, user_id) do update
  set role = case
    when workspace_members.role = 'owner' then 'owner'::public.workspace_role
    when workspace_members.role = 'admin' then 'admin'::public.workspace_role
    when workspace_members.role = 'member' and excluded.role = 'admin' then 'admin'::public.workspace_role
    when workspace_members.role = 'member' then 'member'::public.workspace_role
    else excluded.role
  end;

  update public.workspace_invitations
  set
    accepted_at = now(),
    accepted_by = current_user_id
  where id = target_invitation.id;

  return target_invitation.workspace_id;
end;
$$;

create or replace function public.update_workspace_luma_source(
  target_workspace_id uuid,
  calendar_api_id text,
  luma_api_key text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  safe_calendar_api_id text := nullif(trim(calendar_api_id), '');
  safe_luma_api_key text := nullif(trim(luma_api_key), '');
begin
  if current_user_id is null then
    raise exception 'Sign in before updating workspace settings.'
      using errcode = '42501';
  end if;

  if not app_private.is_workspace_member(target_workspace_id) then
    raise exception 'Only workspace members can update Luma settings.'
      using errcode = '42501';
  end if;

  update public.workspaces
  set
    luma_calendar_api_id = safe_calendar_api_id,
    luma_api_key_updated_at = case
      when safe_luma_api_key is not null then now()
      else luma_api_key_updated_at
    end
  where id = target_workspace_id;

  if not found then
    raise exception 'Workspace not found.'
      using errcode = 'P0002';
  end if;

  if safe_luma_api_key is not null then
    insert into app_private.workspace_luma_credentials (
      workspace_id,
      api_key,
      created_by,
      updated_by
    )
    values (
      target_workspace_id,
      safe_luma_api_key,
      current_user_id,
      current_user_id
    )
    on conflict (workspace_id) do update
    set
      api_key = excluded.api_key,
      updated_by = current_user_id;
  end if;
end;
$$;

create or replace function public.workspace_luma_api_key_configured(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspaces
    where id = target_workspace_id
      and luma_api_key_updated_at is not null
      and app_private.is_workspace_member(id)
  );
$$;

create or replace function public.workspace_luma_api_key_for_server(target_workspace_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select api_key
  from app_private.workspace_luma_credentials
  where workspace_id = target_workspace_id;
$$;

create or replace function public.sync_workspace_luma_events(
  target_workspace_id uuid,
  source_calendar_api_id text,
  event_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  safe_calendar_api_id text := nullif(trim(source_calendar_api_id), '');
  configured_calendar_api_id text;
  affected_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in before syncing Luma events.'
      using errcode = '42501';
  end if;

  if not app_private.is_workspace_member(target_workspace_id) then
    raise exception 'Only workspace members can sync Luma events.'
      using errcode = '42501';
  end if;

  if safe_calendar_api_id is null then
    raise exception 'Set this workspace''s Luma calendar API ID before syncing.'
      using errcode = '22023';
  end if;

  select luma_calendar_api_id
  into configured_calendar_api_id
  from public.workspaces
  where id = target_workspace_id;

  if not found then
    raise exception 'Workspace not found.'
      using errcode = 'P0002';
  end if;

  if configured_calendar_api_id is distinct from safe_calendar_api_id then
    raise exception 'Luma source does not match this workspace.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(event_rows) is distinct from 'array' then
    raise exception 'Luma events must be an array.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(event_rows) > 200 then
    raise exception 'Sync at most 200 Luma events at once.'
      using errcode = '22023';
  end if;

  insert into public.luma_events (
    workspace_id,
    luma_calendar_api_id,
    luma_event_id,
    name,
    url,
    starts_at,
    ends_at,
    location,
    raw,
    synced_at
  )
  select
    target_workspace_id,
    safe_calendar_api_id,
    nullif(event_item ->> 'luma_event_id', ''),
    coalesce(nullif(event_item ->> 'name', ''), 'Untitled Luma event'),
    nullif(event_item ->> 'url', ''),
    nullif(event_item ->> 'starts_at', '')::timestamptz,
    nullif(event_item ->> 'ends_at', '')::timestamptz,
    nullif(event_item ->> 'location', ''),
    coalesce(event_item -> 'raw', event_item),
    now()
  from jsonb_array_elements(event_rows) as event_item
  where nullif(event_item ->> 'luma_event_id', '') is not null
  on conflict (workspace_id, luma_calendar_api_id, luma_event_id)
  do update set
    name = excluded.name,
    url = excluded.url,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    location = excluded.location,
    raw = excluded.raw,
    synced_at = excluded.synced_at;

  get diagnostics affected_count = row_count;

  return affected_count;
end;
$$;

create or replace function public.revoke_workspace_invitation(target_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_invitation public.workspace_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in before revoking an invitation.'
      using errcode = '42501';
  end if;

  select *
  into target_invitation
  from public.workspace_invitations
  where id = target_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found.'
      using errcode = 'P0002';
  end if;

  if not app_private.can_manage_workspace(target_invitation.workspace_id) then
    raise exception 'Only workspace owners and admins can revoke invitations.'
      using errcode = '42501';
  end if;

  if target_invitation.accepted_at is not null then
    raise exception 'Invitation has already been accepted.'
      using errcode = '22023';
  end if;

  update public.workspace_invitations
  set revoked_at = coalesce(revoked_at, now())
  where id = target_invitation.id;

  return target_invitation.workspace_id;
end;
$$;

create or replace function public.invite_workspace_member(
  target_workspace_id uuid,
  invite_email text,
  invite_role text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_role public.workspace_role;
  safe_email text := lower(trim(invite_email));
  safe_role public.workspace_role;
  existing_invitation_id uuid;
  next_expires_at timestamptz := now() + interval '14 days';
begin
  if current_user_id is null then
    raise exception 'Sign in before inviting people.'
      using errcode = '42501';
  end if;

  select role
  into current_user_role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = current_user_id;

  if current_user_role not in ('owner', 'admin') then
    raise exception 'Only workspace owners and admins can invite people.'
      using errcode = '42501';
  end if;

  if safe_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.'
      using errcode = '22023';
  end if;

  safe_role := case invite_role
    when 'admin' then 'admin'::public.workspace_role
    when 'viewer' then 'viewer'::public.workspace_role
    else 'member'::public.workspace_role
  end;

  if safe_role = 'admin' and current_user_role <> 'owner' then
    raise exception 'Only workspace owners can invite admins.'
      using errcode = '42501';
  end if;

  select id
  into existing_invitation_id
  from public.workspace_invitations
  where workspace_id = target_workspace_id
    and email = safe_email
    and accepted_at is null
    and revoked_at is null
  for update;

  if existing_invitation_id is not null then
    update public.workspace_invitations
    set
      role = safe_role,
      invited_by = current_user_id,
      expires_at = next_expires_at
    where id = existing_invitation_id;
  else
    insert into public.workspace_invitations (
      workspace_id,
      email,
      role,
      invited_by,
      expires_at
    )
    values (
      target_workspace_id,
      safe_email,
      safe_role,
      current_user_id,
      next_expires_at
    );
  end if;

  return target_workspace_id;
end;
$$;

create or replace function public.update_workspace_member_role(
  target_workspace_id uuid,
  target_user_id uuid,
  next_role text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_role public.workspace_role;
  target_member public.workspace_members%rowtype;
  safe_role public.workspace_role;
begin
  if current_user_id is null then
    raise exception 'Sign in before managing members.'
      using errcode = '42501';
  end if;

  if current_user_id = target_user_id then
    raise exception 'You cannot change your own role from member management.'
      using errcode = '42501';
  end if;

  select role
  into current_user_role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = current_user_id
  for update;

  if current_user_role not in ('owner', 'admin') then
    raise exception 'Only workspace owners and admins can manage members.'
      using errcode = '42501';
  end if;

  select *
  into target_member
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id
  for update;

  if not found then
    raise exception 'Member not found.'
      using errcode = 'P0002';
  end if;

  if target_member.role = 'owner' then
    raise exception 'Owner roles cannot be changed from member management.'
      using errcode = '42501';
  end if;

  if current_user_role = 'admin' and target_member.role = 'admin' then
    raise exception 'Only workspace owners can manage admins.'
      using errcode = '42501';
  end if;

  if next_role not in ('admin', 'member', 'viewer') then
    raise exception 'Choose a valid member role.'
      using errcode = '22023';
  end if;

  safe_role := next_role::public.workspace_role;

  if safe_role = 'admin' and current_user_role <> 'owner' then
    raise exception 'Only workspace owners can make admins.'
      using errcode = '42501';
  end if;

  update public.workspace_members
  set role = safe_role
  where workspace_id = target_workspace_id
    and user_id = target_user_id;

  return target_workspace_id;
end;
$$;

create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_role public.workspace_role;
  target_member public.workspace_members%rowtype;
begin
  if current_user_id is null then
    raise exception 'Sign in before managing members.'
      using errcode = '42501';
  end if;

  if current_user_id = target_user_id then
    raise exception 'You cannot remove yourself from member management.'
      using errcode = '42501';
  end if;

  select role
  into current_user_role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = current_user_id
  for update;

  if current_user_role not in ('owner', 'admin') then
    raise exception 'Only workspace owners and admins can remove members.'
      using errcode = '42501';
  end if;

  select *
  into target_member
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id
  for update;

  if not found then
    raise exception 'Member not found.'
      using errcode = 'P0002';
  end if;

  if target_member.role = 'owner' then
    raise exception 'Owners cannot be removed from member management.'
      using errcode = '42501';
  end if;

  if current_user_role = 'admin' and target_member.role = 'admin' then
    raise exception 'Only workspace owners can remove admins.'
      using errcode = '42501';
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id;

  return target_workspace_id;
end;
$$;

revoke execute on function public.create_workspace(text) from public;
revoke execute on function public.create_workspace(text) from anon;
revoke execute on function public.accept_workspace_invitation(uuid) from public;
revoke execute on function public.accept_workspace_invitation(uuid) from anon;
revoke execute on function public.update_workspace_luma_source(uuid, text, text) from public;
revoke execute on function public.update_workspace_luma_source(uuid, text, text) from anon;
revoke execute on function public.workspace_luma_api_key_configured(uuid) from public;
revoke execute on function public.workspace_luma_api_key_configured(uuid) from anon;
revoke execute on function public.workspace_luma_api_key_for_server(uuid) from public;
revoke execute on function public.workspace_luma_api_key_for_server(uuid) from anon;
revoke execute on function public.workspace_luma_api_key_for_server(uuid) from authenticated;
revoke execute on function public.sync_workspace_luma_events(uuid, text, jsonb) from public;
revoke execute on function public.sync_workspace_luma_events(uuid, text, jsonb) from anon;
revoke execute on function public.revoke_workspace_invitation(uuid) from public;
revoke execute on function public.revoke_workspace_invitation(uuid) from anon;
revoke execute on function public.invite_workspace_member(uuid, text, text) from public;
revoke execute on function public.invite_workspace_member(uuid, text, text) from anon;
revoke execute on function public.update_workspace_member_role(uuid, uuid, text) from public;
revoke execute on function public.update_workspace_member_role(uuid, uuid, text) from anon;
revoke execute on function public.remove_workspace_member(uuid, uuid) from public;
revoke execute on function public.remove_workspace_member(uuid, uuid) from anon;

create or replace function public.create_timeline_with_default_lanes(
  target_workspace_id uuid,
  timeline_title text,
  source_luma_event_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  source_event public.luma_events%rowtype;
  existing_timeline_id uuid;
  new_timeline_id uuid;
  safe_title text;
  event_date date;
begin
  if not app_private.can_edit_workspace(target_workspace_id) then
    raise exception 'You do not have edit access to this workspace.'
      using errcode = '42501';
  end if;

  safe_title := coalesce(nullif(trim(timeline_title), ''), 'Untitled run of show');

  if source_luma_event_id is not null then
    select *
    into source_event
    from public.luma_events
    where id = source_luma_event_id
      and workspace_id = target_workspace_id;

    if not found then
      raise exception 'That Luma event is not available in this workspace.'
        using errcode = 'P0002';
    end if;

    select id
    into existing_timeline_id
    from public.timelines
    where workspace_id = target_workspace_id
      and luma_event_id = source_luma_event_id;

    if existing_timeline_id is not null then
      return existing_timeline_id;
    end if;

    safe_title := coalesce(nullif(trim(timeline_title), ''), source_event.name);
    event_date := source_event.starts_at::date;
  end if;

  insert into public.timelines (
    workspace_id,
    luma_event_id,
    title,
    date,
    view_start,
    view_end,
    pad_before_minutes,
    pad_after_minutes,
    created_by
  )
  values (
    target_workspace_id,
    source_luma_event_id,
    safe_title,
    event_date,
    '08:00',
    '18:30',
    30,
    45,
    auth.uid()
  )
  returning id into new_timeline_id;

  insert into public.timeline_lanes (timeline_id, name, sort_order)
  values
    (new_timeline_id, 'Main Run', 0),
    (new_timeline_id, 'Prep', 1),
    (new_timeline_id, 'Crew', 2),
    (new_timeline_id, 'External', 3);

  return new_timeline_id;
end;
$$;

create or replace function public.save_timeline_snapshot(
  target_workspace_id uuid,
  timeline_snapshot jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_timeline_id uuid;
  source_timeline_id uuid;
  lane_item jsonb;
  lane_ordinal bigint;
  block_item jsonb;
  block_ordinal bigint;
  new_lane_id uuid;
  mapped_lane_id uuid;
  block_lane_key text;
  lane_map jsonb := '{}'::jsonb;
begin
  if not app_private.can_edit_workspace(target_workspace_id) then
    raise exception 'You do not have edit access to this workspace.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(timeline_snapshot -> 'lanes') is distinct from 'array' then
    raise exception 'Timeline lanes must be an array.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(timeline_snapshot -> 'lanes') = 0 then
    raise exception 'A timeline needs at least one lane.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(timeline_snapshot -> 'blocks') is distinct from 'array' then
    raise exception 'Timeline blocks must be an array.'
      using errcode = '22023';
  end if;

  source_timeline_id := nullif(timeline_snapshot ->> 'id', '')::uuid;

  if source_timeline_id is null then
    insert into public.timelines (
      workspace_id,
      title,
      view_start,
      view_end,
      pad_before_minutes,
      pad_after_minutes,
      created_by
    )
    values (
      target_workspace_id,
      coalesce(nullif(timeline_snapshot ->> 'title', ''), 'Run of Show'),
      (timeline_snapshot ->> 'viewStart')::time,
      (timeline_snapshot ->> 'viewEnd')::time,
      greatest(coalesce((timeline_snapshot ->> 'padBefore')::integer, 0), 0),
      greatest(coalesce((timeline_snapshot ->> 'padAfter')::integer, 0), 0),
      auth.uid()
    )
    returning id into target_timeline_id;
  else
    update public.timelines
    set
      title = coalesce(nullif(timeline_snapshot ->> 'title', ''), 'Run of Show'),
      view_start = (timeline_snapshot ->> 'viewStart')::time,
      view_end = (timeline_snapshot ->> 'viewEnd')::time,
      pad_before_minutes = greatest(coalesce((timeline_snapshot ->> 'padBefore')::integer, 0), 0),
      pad_after_minutes = greatest(coalesce((timeline_snapshot ->> 'padAfter')::integer, 0), 0),
      created_by = auth.uid()
    where id = source_timeline_id
      and workspace_id = target_workspace_id
    returning id into target_timeline_id;

    if target_timeline_id is null then
      raise exception 'Timeline not found in this workspace.'
        using errcode = 'P0002';
    end if;

    delete from public.timeline_lanes
    where timeline_id = target_timeline_id;
  end if;

  for lane_item, lane_ordinal in
    select value, ordinality
    from jsonb_array_elements(timeline_snapshot -> 'lanes') with ordinality
  loop
    insert into public.timeline_lanes (timeline_id, name, sort_order)
    values (
      target_timeline_id,
      coalesce(nullif(lane_item ->> 'label', ''), 'Lane'),
      lane_ordinal::integer - 1
    )
    returning id into new_lane_id;

    lane_map := lane_map || jsonb_build_object(
      coalesce(nullif(lane_item ->> 'id', ''), new_lane_id::text),
      new_lane_id::text
    );
  end loop;

  for block_item, block_ordinal in
    select value, ordinality
    from jsonb_array_elements(timeline_snapshot -> 'blocks') with ordinality
  loop
    block_lane_key := block_item ->> 'lane';
    mapped_lane_id := (lane_map ->> block_lane_key)::uuid;

    if mapped_lane_id is null then
      raise exception 'Timeline block references an unknown lane.'
        using errcode = '23503';
    end if;

    insert into public.timeline_blocks (
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
      sort_order,
      created_by
    )
    values (
      target_timeline_id,
      mapped_lane_id,
      coalesce(nullif(block_item ->> 'title', ''), 'Untitled block'),
      coalesce(nullif(block_item ->> 'icon', ''), 'list'),
      (block_item ->> 'type')::public.timeline_block_type,
      (block_item ->> 'visibility')::public.timeline_visibility,
      (block_item ->> 'start')::time,
      (block_item ->> 'end')::time,
      nullif(block_item ->> 'advertisedStart', '')::time,
      nullif(block_item ->> 'advertisedEnd', '')::time,
      greatest(coalesce((block_item ->> 'bufferBefore')::integer, 0), 0),
      greatest(coalesce((block_item ->> 'bufferAfter')::integer, 0), 0),
      nullif(block_item ->> 'owner', ''),
      coalesce(block_item ->> 'notes', ''),
      block_ordinal::integer - 1,
      auth.uid()
    );
  end loop;

  return target_timeline_id;
end;
$$;

create or replace function public.duplicate_timeline(
  source_timeline_id uuid,
  target_workspace_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  source_timeline public.timelines%rowtype;
  new_timeline_id uuid;
  source_lane record;
  source_block record;
  new_lane_id uuid;
  lane_map jsonb := '{}'::jsonb;
begin
  if not app_private.can_edit_workspace(target_workspace_id) then
    raise exception 'You do not have edit access to this workspace.'
      using errcode = '42501';
  end if;

  select *
  into source_timeline
  from public.timelines
  where id = source_timeline_id
    and workspace_id = target_workspace_id;

  if not found then
    raise exception 'Timeline not found in this workspace.'
      using errcode = 'P0002';
  end if;

  insert into public.timelines (
    workspace_id,
    title,
    date,
    timezone,
    view_start,
    view_end,
    pad_before_minutes,
    pad_after_minutes,
    created_by
  )
  values (
    target_workspace_id,
    source_timeline.title || ' copy',
    source_timeline.date,
    source_timeline.timezone,
    source_timeline.view_start,
    source_timeline.view_end,
    source_timeline.pad_before_minutes,
    source_timeline.pad_after_minutes,
    auth.uid()
  )
  returning id into new_timeline_id;

  for source_lane in
    select id, name, sort_order
    from public.timeline_lanes
    where timeline_id = source_timeline_id
    order by sort_order, created_at
  loop
    insert into public.timeline_lanes (timeline_id, name, sort_order)
    values (new_timeline_id, source_lane.name, source_lane.sort_order)
    returning id into new_lane_id;

    lane_map := lane_map || jsonb_build_object(source_lane.id::text, new_lane_id::text);
  end loop;

  for source_block in
    select *
    from public.timeline_blocks
    where timeline_id = source_timeline_id
    order by sort_order, created_at
  loop
    new_lane_id := (lane_map ->> source_block.lane_id::text)::uuid;

    if new_lane_id is not null then
      insert into public.timeline_blocks (
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
        sort_order,
        created_by
      )
      values (
        new_timeline_id,
        new_lane_id,
        source_block.title,
        source_block.icon,
        source_block.block_type,
        source_block.visibility,
        source_block.actual_start,
        source_block.actual_end,
        source_block.advertised_start,
        source_block.advertised_end,
        source_block.buffer_before_minutes,
        source_block.buffer_after_minutes,
        source_block.owner_label,
        source_block.notes,
        source_block.sort_order,
        auth.uid()
      );
    end if;
  end loop;

  return new_timeline_id;
end;
$$;

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.luma_events enable row level security;
alter table public.timelines enable row level security;
alter table public.timeline_lanes enable row level security;
alter table public.timeline_blocks enable row level security;

create policy "members can read workspaces"
on public.workspaces for select
to authenticated
using (app_private.is_workspace_member(id));

create policy "users can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "workspace members can read member profiles"
on public.profiles for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members viewer_membership
    join public.workspace_members target_membership
      on target_membership.workspace_id = viewer_membership.workspace_id
    where viewer_membership.user_id = auth.uid()
      and target_membership.user_id = profiles.id
  )
);

create policy "users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can read workspace membership"
on public.workspace_members for select
to authenticated
using (app_private.is_workspace_member(workspace_id));

create policy "admins can read workspace invitations"
on public.workspace_invitations for select
to authenticated
using (app_private.can_manage_workspace(workspace_id));

create policy "invited users can read own pending invitations"
on public.workspace_invitations for select
to authenticated
using (
  accepted_at is null
  and revoked_at is null
  and expires_at > now()
  and lower(email) = lower(auth.email())
);

create policy "members can read luma events"
on public.luma_events for select
to authenticated
using (app_private.is_workspace_member(workspace_id));

create policy "members can read timelines"
on public.timelines for select
to authenticated
using (app_private.is_workspace_member(workspace_id));

create policy "members can edit timelines"
on public.timelines for all
to authenticated
using (app_private.can_edit_workspace(workspace_id))
with check (app_private.can_edit_workspace(workspace_id));

create policy "members can read lanes"
on public.timeline_lanes for select
to authenticated
using (
  exists (
	    select 1 from public.timelines
	    where timelines.id = timeline_lanes.timeline_id
	      and app_private.is_workspace_member(timelines.workspace_id)
  )
);

create policy "members can edit lanes"
on public.timeline_lanes for all
to authenticated
using (
  exists (
    select 1 from public.timelines
    where timelines.id = timeline_lanes.timeline_id
      and app_private.can_edit_workspace(timelines.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.timelines
    where timelines.id = timeline_lanes.timeline_id
      and app_private.can_edit_workspace(timelines.workspace_id)
  )
);

create policy "members can read blocks"
on public.timeline_blocks for select
to authenticated
using (
  exists (
	    select 1 from public.timelines
	    where timelines.id = timeline_blocks.timeline_id
	      and app_private.is_workspace_member(timelines.workspace_id)
  )
);

create policy "members can edit blocks"
on public.timeline_blocks for all
to authenticated
using (
  exists (
    select 1 from public.timelines
    where timelines.id = timeline_blocks.timeline_id
      and app_private.can_edit_workspace(timelines.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.timelines
    where timelines.id = timeline_blocks.timeline_id
      and app_private.can_edit_workspace(timelines.workspace_id)
  )
);

grant usage on schema public to authenticated;
grant usage on schema app_private to authenticated;
grant select, update (full_name, avatar_url) on table public.profiles to authenticated;
grant select on table public.workspaces to authenticated;
grant select on table public.workspace_members to authenticated;
grant select on table public.workspace_invitations to authenticated;
grant select on table public.luma_events to authenticated;
grant select, insert, update, delete on table public.timelines to authenticated;
grant select, insert, update, delete on table public.timeline_lanes to authenticated;
grant select, insert, update, delete on table public.timeline_blocks to authenticated;
grant usage on type public.workspace_role to authenticated;
grant usage on type public.timeline_block_type to authenticated;
grant usage on type public.timeline_visibility to authenticated;
grant execute on function app_private.is_workspace_member(uuid) to authenticated;
grant execute on function app_private.can_manage_workspace(uuid) to authenticated;
grant execute on function app_private.can_edit_workspace(uuid) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.accept_workspace_invitation(uuid) to authenticated;
grant execute on function public.update_workspace_luma_source(uuid, text, text) to authenticated;
grant execute on function public.workspace_luma_api_key_configured(uuid) to authenticated;
grant execute on function public.sync_workspace_luma_events(uuid, text, jsonb) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;
grant execute on function public.invite_workspace_member(uuid, text, text) to authenticated;
grant execute on function public.update_workspace_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.create_timeline_with_default_lanes(uuid, text, uuid) to authenticated;
grant execute on function public.save_timeline_snapshot(uuid, jsonb) to authenticated;
grant execute on function public.duplicate_timeline(uuid, uuid) to authenticated;
grant usage on schema app_private to service_role;
grant select on table app_private.workspace_luma_credentials to service_role;
grant execute on function public.workspace_luma_api_key_for_server(uuid) to service_role;

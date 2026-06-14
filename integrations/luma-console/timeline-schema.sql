create extension if not exists pgcrypto;

create table if not exists event_timelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  title text not null default 'Run of Show',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  timezone text,
  view_start time not null default '08:00',
  view_end time not null default '18:30',
  pad_before_minutes integer not null default 30 check (pad_before_minutes >= 0),
  pad_after_minutes integer not null default 45 check (pad_after_minutes >= 0),
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_timelines_event_unique unique(event_id)
);

alter table event_timelines
  add column if not exists status text not null default 'draft';

alter table event_timelines
  add column if not exists timezone text;

alter table event_timelines
  alter column event_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_timelines_status_check'
  ) then
    alter table event_timelines
      add constraint event_timelines_status_check
      check (status in ('draft', 'active', 'archived'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_timelines_event_unique'
  ) then
    alter table event_timelines
      add constraint event_timelines_event_unique unique(event_id);
  end if;
end $$;

create index if not exists event_timelines_workspace_idx
  on event_timelines(workspace_id, created_at desc);

create index if not exists event_timelines_event_idx
  on event_timelines(event_id)
  where event_id is not null;

create or replace function validate_event_timeline_workspace()
returns trigger
language plpgsql
as $$
declare
  event_workspace_id uuid;
begin
  select luma_calendars.workspace_id
  into event_workspace_id
  from events
  join luma_calendars on luma_calendars.id = events.calendar_id
  where events.id = new.event_id;

  if event_workspace_id is null then
    raise exception 'Timeline event must belong to a Luma calendar workspace.';
  end if;

  if event_workspace_id is distinct from new.workspace_id then
    raise exception 'Timeline event does not belong to this workspace.';
  end if;

  return new;
end;
$$;

drop trigger if exists event_timelines_validate_workspace on event_timelines;
create trigger event_timelines_validate_workspace
before insert or update of workspace_id, event_id on event_timelines
for each row execute function validate_event_timeline_workspace();

create table if not exists event_timeline_lanes (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references event_timelines(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_timeline_lanes_timeline_idx
  on event_timeline_lanes(timeline_id, sort_order);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_timeline_lanes_id_timeline_unique'
  ) then
    alter table event_timeline_lanes
      add constraint event_timeline_lanes_id_timeline_unique unique (id, timeline_id);
  end if;
end $$;

create table if not exists event_timeline_blocks (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references event_timelines(id) on delete cascade,
  lane_id uuid not null,
  title text not null,
  icon text not null default 'list',
  block_type text not null default 'planning'
    check (block_type in ('planning', 'active', 'side')),
  visibility text not null default 'internal'
    check (visibility in ('internal', 'external')),
  actual_start time not null,
  actual_end time not null,
  advertised_start time,
  advertised_end time,
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  owner_label text,
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_timeline_blocks_lane_timeline_fk
    foreign key (lane_id, timeline_id)
    references event_timeline_lanes(id, timeline_id)
    on delete cascade,
  constraint event_timeline_blocks_actual_order
    check (actual_end > actual_start),
  constraint event_timeline_blocks_advertised_order
    check (
      advertised_start is null
      or advertised_end is null
      or advertised_end >= advertised_start
    )
);

create index if not exists event_timeline_blocks_timeline_idx
  on event_timeline_blocks(timeline_id, sort_order);

create index if not exists event_timeline_blocks_lane_idx
  on event_timeline_blocks(lane_id, sort_order);

create or replace function touch_event_timeline_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists event_timelines_touch_updated_at on event_timelines;
create trigger event_timelines_touch_updated_at
before update on event_timelines
for each row execute function touch_event_timeline_updated_at();

drop trigger if exists event_timeline_blocks_touch_updated_at on event_timeline_blocks;
create trigger event_timeline_blocks_touch_updated_at
before update on event_timeline_blocks
for each row execute function touch_event_timeline_updated_at();

create or replace function create_event_timeline_with_default_lanes(
  target_workspace_id uuid,
  target_event_id uuid,
  timeline_title text,
  actor_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  existing_timeline_id uuid;
  new_timeline_id uuid;
begin
  select id
  into existing_timeline_id
  from event_timelines
  where workspace_id = target_workspace_id
    and event_id = target_event_id;

  if existing_timeline_id is not null then
    return existing_timeline_id;
  end if;

  insert into event_timelines (
    workspace_id,
    event_id,
    title,
    created_by,
    updated_by
  )
  values (
    target_workspace_id,
    target_event_id,
    coalesce(nullif(trim(timeline_title), ''), 'Run of Show'),
    actor_user_id,
    actor_user_id
  )
  returning id into new_timeline_id;

  insert into event_timeline_lanes (timeline_id, name, sort_order)
  values
    (new_timeline_id, 'Main Run', 0),
    (new_timeline_id, 'Prep', 1),
    (new_timeline_id, 'Crew', 2),
    (new_timeline_id, 'External', 3);

  return new_timeline_id;
end;
$$;

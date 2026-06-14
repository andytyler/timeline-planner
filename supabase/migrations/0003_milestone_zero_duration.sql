alter table public.timeline_blocks
  drop constraint if exists actual_time_order;

alter table public.timeline_blocks
  add constraint actual_time_order check (
    actual_end > actual_start
    or (block_type = 'milestone' and actual_end = actual_start)
  );

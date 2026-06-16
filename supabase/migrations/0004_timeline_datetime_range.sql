alter table public.timelines
  add column if not exists starts_at timestamp without time zone,
  add column if not exists ends_at timestamp without time zone;

update public.timelines
set
  starts_at = coalesce(starts_at, date::timestamp + view_start),
  ends_at = coalesce(
    ends_at,
    date::timestamp + view_end + case when view_end <= view_start then interval '1 day' else interval '0 day' end
  )
where date is not null;

-- =====================================================================
-- Deduped "report views" for the owner dashboard.
--
-- Report pages re-log a view event on every load/refresh, so the raw
-- event count massively overstates real views (thousands of events across
-- ~30 reports). This counts ONE view per viewer, per report, per day --
-- i.e. reloads collapse to a single view -- which is the "legit" number.
--
-- viewer identity falls back email -> ip_hash -> ip_address -> 'anon'.
-- Pass days_back to limit the window (null = all time).
-- =====================================================================
create or replace function public.count_report_views_deduped(days_back int default null)
returns integer
language sql
stable
as $$
  select count(*)::int from (
    select distinct
      inspection_id_bigint,
      coalesce(nullif(viewer_email, ''), ip_hash, ip_address, 'anon') as viewer,
      (created_at at time zone 'UTC')::date as view_day
    from public.inspection_view_events
    where view_type in ('client_portal', 'report_share', 'environmental_share')
      and (days_back is null or created_at >= now() - make_interval(days => days_back))
  ) distinct_views;
$$;

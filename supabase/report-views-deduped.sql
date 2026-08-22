-- =====================================================================
-- "Report views" for the owner dashboard, counting real opens without
-- reload spam.
--
-- Report pages re-log a view event on every load/refresh, so the raw
-- event count massively overstates views (thousands of events across
-- ~30 reports). This counts one view per VIEWING SESSION: a new view is
-- counted only when there's a gap of more than `gap_minutes` (default 30)
-- since that viewer last opened that report. So:
--   * a client mashing refresh in one sitting  -> 1 view
--   * the same client coming back that evening  -> a 2nd view
--
-- viewer identity falls back email -> ip_hash -> ip_address -> 'anon'.
-- Pass days_back to limit the window (null = all time).
-- =====================================================================
create or replace function public.count_report_views_deduped(
  days_back int default null,
  gap_minutes int default 30
)
returns integer
language sql
stable
as $$
  with opens as (
    select
      inspection_id_bigint,
      coalesce(nullif(viewer_email, ''), ip_hash, ip_address, 'anon') as viewer,
      created_at
    from public.inspection_view_events
    where view_type in ('client_portal', 'report_share', 'environmental_share')
      and (days_back is null or created_at >= now() - make_interval(days => days_back))
  ),
  flagged as (
    select
      case
        when lag(created_at) over w is null
          or created_at - lag(created_at) over w > make_interval(mins => gap_minutes)
        then 1 else 0
      end as new_session
    from opens
    window w as (partition by inspection_id_bigint, viewer order by created_at)
  )
  select coalesce(sum(new_session), 0)::int from flagged;
$$;

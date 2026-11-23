-- The DM's open tables on the home screen say which are practice tables and
-- when each was last used, so test tables are easy to find and delete
-- (deleting uses dnd_end_table_v2, as ending a table from inside it does).
-- Safe to re-run.

create or replace function public.dnd_my_rooms() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.dnd_account();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', code,
      'created', (extract(epoch from created_at) * 1000)::bigint,
      'active', (extract(epoch from last_active) * 1000)::bigint,
      'practice', practice
    ) order by last_active desc)
    from public.dnd_rooms where host_id = uid and last_active > now() - interval '8 hours'
  ), '[]'::jsonb);
end $$;

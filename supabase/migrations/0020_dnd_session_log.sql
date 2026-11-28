-- The whole session for "Copy scene + whole party": every DM update and
-- player action at an open table, oldest first. The room read (dnd_room_v2 and
-- its wrappers) keeps only the latest 30 updates and 40 actions, so a long
-- night would otherwise lose its first half. Same access as the room read:
-- a signed-in account with the table's link, while the table is open.
-- Read-only; additive; safe to re-run.

create or replace function public.dnd_session_log(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); r public.dnd_rooms := public.dnd_live_room(p_code);
begin
  return jsonb_build_object(
    'scenes', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'text', s.text,
        'created', (extract(epoch from s.created_at) * 1000)::bigint) order by s.id)
      from (select * from public.dnd_scenes where code = r.code order by id desc limit 2000) s
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'character', a.character_index, 'name', a.character_name,
        'text', a.text, 'mine', a.user_id = uid, 'created', (extract(epoch from a.created_at) * 1000)::bigint) order by a.id)
      from (select * from public.dnd_actions where code = r.code order by id desc limit 2000) a
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.dnd_session_log(text) from public, anon;
grant execute on function public.dnd_session_log(text) to authenticated;

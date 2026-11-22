-- Story edits: the DM can edit or delete any update or player action at the
-- table, and players can edit or delete their own actions. (Editing an update
-- already works through dnd_post_scene with p_id.) Any change clears the
-- table's cached Claude suggestions so the next one reads the corrected story.
-- Additive only.

create function public.dnd_delete_scene(p_code text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code);
begin
  delete from public.dnd_scenes where code = r.code and id = p_id;
  if not found then
    raise exception 'That update is already gone.' using errcode = 'P0002';
  end if;
  delete from public.dnd_advice where code = r.code;
end $$;

create function public.dnd_edit_action(p_code text, p_id bigint, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  cleaned text := btrim(coalesce(p_text, ''));
begin
  if char_length(cleaned) not between 1 and 300 then
    raise exception 'Use 1 to 300 characters.' using errcode = '22023';
  end if;
  update public.dnd_actions set text = cleaned
  where code = r.code and id = p_id and (user_id = uid or r.host_id = uid);
  if not found then
    raise exception 'Only the DM or the player who wrote it can change this.' using errcode = '42501';
  end if;
  delete from public.dnd_advice where code = r.code;
end $$;

create function public.dnd_delete_action(p_code text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
begin
  delete from public.dnd_actions
  where code = r.code and id = p_id and (user_id = uid or r.host_id = uid);
  if not found then
    raise exception 'Only the DM or the player who wrote it can remove this.' using errcode = '42501';
  end if;
  delete from public.dnd_advice where code = r.code;
end $$;

revoke all on function public.dnd_delete_scene(text, bigint), public.dnd_edit_action(text, bigint, text),
  public.dnd_delete_action(text, bigint) from public, anon;
grant execute on function public.dnd_delete_scene(text, bigint), public.dnd_edit_action(text, bigint, text),
  public.dnd_delete_action(text, bigint) to authenticated;

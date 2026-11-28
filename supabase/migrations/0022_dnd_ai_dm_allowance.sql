-- AI DM turns (the dnd-advise edge function's mode "run") are counted in
-- dnd_ai_usage as character -2, with their own allowance per table (250, in
-- the edge function). They stay out of the players' counts: the 150 calls a
-- table gets for Ask Claude, and each account's 60 a day, so a night with the
-- AI DM doesn't use those up. dnd_advise_begin_v2 is unchanged otherwise.
-- Safe to re-run.

create or replace function public.dnd_advise_begin_v2(p_code text, p_character int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  ch jsonb := r.party -> p_character;
  latest public.dnd_scenes;
  campaign public.dnd_campaigns;
  hash text;
  cached jsonb;
begin
  if ch is null or p_character < 0 then
    raise exception 'Pick a character.' using errcode = '22023';
  end if;
  select * into latest from public.dnd_scenes where code = p_code order by id desc limit 1;
  if not found then
    raise exception 'Wait for a scene update.' using errcode = '22023';
  end if;
  select * into campaign from public.dnd_campaigns where id = public.dnd_default_campaign();
  hash := md5(concat_ws(chr(31), ch->>'name', ch->>'role', ch->>'moves', latest.text, campaign.updated_at::text,
    (select max(id) from public.dnd_actions where code = p_code)::text));
  select advice into cached from public.dnd_advice
    where code = p_code and character_index = p_character and scene_id = latest.id and sheet_hash = hash;
  if found then
    return jsonb_build_object('cached', cached, 'sceneId', latest.id);
  end if;
  if (select count(*) from public.dnd_ai_usage where created_at > now() - interval '1 day') >= 600 then
    return jsonb_build_object('limit', 'Claude suggestions are paused for today. Try again tomorrow.');
  end if;
  if (select count(*) from public.dnd_ai_usage where user_id = uid and character_index <> -2 and created_at > now() - interval '1 day') >= 60 then
    return jsonb_build_object('limit', 'You have used today''s Claude suggestions.');
  end if;
  if (select count(*) from public.dnd_ai_usage where code = p_code and character_index <> -2) >= 150 then
    return jsonb_build_object('limit', 'This session has used its Claude suggestions.');
  end if;
  if exists (select 1 from public.dnd_ai_usage where code = p_code and character_index = p_character
             and created_at > now() - interval '8 seconds') then
    return jsonb_build_object('limit', 'One moment — Claude was just asked for this character.');
  end if;
  insert into public.dnd_ai_usage (code, character_index, user_id) values (p_code, p_character, uid);
  return jsonb_build_object(
    'character', ch,
    'sceneId', latest.id,
    'hash', hash,
    'history', coalesce(campaign.history, ''),
    'scenes', (select jsonb_agg(jsonb_build_object('id', s.id, 'text', s.text) order by s.id)
               from (select id, text from public.dnd_scenes where code = p_code order by id desc limit 6) s),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('name', a.character_name, 'text', a.text,
               'created', (extract(epoch from a.created_at) * 1000)::bigint) order by a.id)
               from (select * from public.dnd_actions where code = p_code order by id desc limit 100) a), '[]'::jsonb)
  );
end $$;
revoke all on function public.dnd_advise_begin_v2(text, int) from public, anon;
grant execute on function public.dnd_advise_begin_v2(text, int) to authenticated;

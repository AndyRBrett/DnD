-- Player actions: what a character is doing ("The White Wizard views his
-- surroundings"), posted by any signed-in player at the table and woven into
-- the story between the DM's updates. Additive only: new table and new
-- functions (the _v2 functions supersede dnd_room, dnd_end_table and
-- dnd_advise_begin, which stay in place for older clients).

create table public.dnd_actions (
  id bigint generated always as identity primary key,
  code text not null references public.dnd_rooms(code) on delete cascade,
  character_index int not null,
  character_name text not null,
  user_id uuid not null,
  text text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now()
);
create index dnd_actions_room on public.dnd_actions (code, id);
alter table public.dnd_actions enable row level security;
revoke all on public.dnd_actions from anon, authenticated;

create function public.dnd_post_action(p_code text, p_character int, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  ch jsonb := r.party -> p_character;
  cleaned text := btrim(coalesce(p_text, ''));
begin
  if ch is null or p_character < 0 then
    raise exception 'Pick a character.' using errcode = '22023';
  end if;
  if char_length(cleaned) not between 1 and 300 then
    raise exception 'Use 1 to 300 characters.' using errcode = '22023';
  end if;
  if (select count(*) from public.dnd_actions where code = p_code) >= 400 then
    raise exception 'This table has reached its action limit.' using errcode = '22023';
  end if;
  insert into public.dnd_actions (code, character_index, character_name, user_id, text)
  values (p_code, p_character, ch->>'name', uid, cleaned);
end $$;

-- dnd_room plus the latest actions.
create function public.dnd_room_v2(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); r public.dnd_rooms := public.dnd_live_room(p_code);
begin
  return jsonb_build_object(
    'party', r.party,
    'isHost', r.host_id = uid,
    'ai', true,
    'historyChars', coalesce((select char_length(history) from public.dnd_campaigns where id = public.dnd_default_campaign()), 0),
    'scenes', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'text', s.text,
        'created', (extract(epoch from s.created_at) * 1000)::bigint) order by s.id)
      from (select * from public.dnd_scenes where code = p_code order by id desc limit 30) s
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'character', a.character_index, 'name', a.character_name,
        'text', a.text, 'mine', a.user_id = uid, 'created', (extract(epoch from a.created_at) * 1000)::bigint) order by a.id)
      from (select * from public.dnd_actions where code = p_code order by id desc limit 40) a
    ), '[]'::jsonb)
  );
end $$;

-- dnd_end_table with the session saved as one timeline: "DM: ..." and
-- "<Character>: ..." lines in the order they happened.
create function public.dnd_end_table_v2(p_code text, p_save_history boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code); session text; saved integer := 0;
begin
  if p_save_history and public.dnd_default_campaign() is not null then
    select string_agg(line, E'\n' order by at, ord) into session from (
      select created_at as at, 0 as ord, 'DM: ' || text as line
        from public.dnd_scenes where code = r.code and created_at > r.created_at
      union all
      select created_at, 1, character_name || ': ' || text
        from public.dnd_actions where code = r.code
    ) timeline;
    if btrim(coalesce(session, '')) <> '' then
      saved := public.dnd_set_history(public.dnd_default_campaign(), right(
        (select history from public.dnd_campaigns where id = public.dnd_default_campaign())
        || E'\n\n## Session ' || to_char(r.created_at at time zone 'America/Chicago', 'YYYY-MM-DD')
        || E' (live transcript)\n' || session, 400000), r.host_id);
    end if;
  end if;
  delete from public.dnd_rooms where code = r.code;
  return saved;
end $$;

-- dnd_advise_begin with actions: they are returned for the prompt, and the
-- latest action is part of the cache key so a new declaration gets a fresh answer.
create function public.dnd_advise_begin_v2(p_code text, p_character int) returns jsonb
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
  if (select count(*) from public.dnd_ai_usage where user_id = uid and created_at > now() - interval '1 day') >= 60 then
    return jsonb_build_object('limit', 'You have used today''s Claude suggestions.');
  end if;
  if (select count(*) from public.dnd_ai_usage where code = p_code) >= 200 then
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

revoke all on function public.dnd_post_action(text, int, text), public.dnd_room_v2(text),
  public.dnd_end_table_v2(text, boolean), public.dnd_advise_begin_v2(text, int) from public, anon;
grant execute on function public.dnd_post_action(text, int, text), public.dnd_room_v2(text),
  public.dnd_end_table_v2(text, boolean), public.dnd_advise_begin_v2(text, int) to authenticated;

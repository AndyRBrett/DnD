-- Campaign history that outlives tables. The group plays one campaign, so
-- there is one shared campaign row and every table uses it. The host of a live
-- table can replace the history (each save keeps the previous version in
-- dnd_campaign_versions), ending a table can append that session's updates,
-- and the dnd-advise edge function sends the history to Claude (prompt-cached).
-- Additive only: no existing table is altered and no function is dropped.
-- Every table uses the single campaign (dnd_default_campaign()).

create table public.dnd_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  history text not null default '' check (char_length(history) <= 400000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table public.dnd_campaign_versions (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.dnd_campaigns(id) on delete cascade,
  history text not null,
  saved_at timestamptz not null default now(),
  saved_by uuid references auth.users(id) on delete set null
);
create index dnd_campaign_versions_campaign on public.dnd_campaign_versions (campaign_id, id desc);
alter table public.dnd_campaigns enable row level security;
alter table public.dnd_campaign_versions enable row level security;
revoke all on public.dnd_campaigns, public.dnd_campaign_versions from anon, authenticated;

insert into public.dnd_campaigns (name) values ('The Onyx Jewel');

create function public.dnd_default_campaign() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.dnd_campaigns where name = 'The Onyx Jewel'
$$;

-- The poll stays small: only the history's size, not its text.
create or replace function public.dnd_room(p_code text) returns jsonb
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
    ), '[]'::jsonb)
  );
end $$;

create function public.dnd_history(p_code text) returns text
language plpgsql stable security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code);
begin
  return coalesce((select history from public.dnd_campaigns where id = public.dnd_default_campaign()), '');
end $$;

create function public.dnd_set_history(p_campaign uuid, p_history text, p_by uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare cleaned text := btrim(coalesce(p_history, ''));
begin
  if char_length(cleaned) > 400000 then
    raise exception 'The history is too long (400,000 characters max). Trim or summarize the oldest parts.' using errcode = '22023';
  end if;
  insert into public.dnd_campaign_versions (campaign_id, history, saved_by)
    select id, history, updated_by from public.dnd_campaigns where id = p_campaign and history <> '';
  delete from public.dnd_campaign_versions where campaign_id = p_campaign and id not in
    (select id from public.dnd_campaign_versions where campaign_id = p_campaign order by id desc limit 30);
  update public.dnd_campaigns set history = cleaned, updated_at = now(), updated_by = p_by where id = p_campaign;
  return char_length(cleaned);
end $$;

create function public.dnd_save_history(p_code text, p_history text) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code);
begin
  return public.dnd_set_history(public.dnd_default_campaign(), p_history, r.host_id);
end $$;

-- Ending a table, optionally appending its updates (oldest first) to the history.
create function public.dnd_end_table(p_code text, p_save_history boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code); session text; saved integer := 0;
begin
  if p_save_history and public.dnd_default_campaign() is not null then
    select string_agg(text, E'\n' order by id) into session
    from public.dnd_scenes where code = r.code and created_at > r.created_at;
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

-- Advice now carries the campaign history; the cache key covers its version.
create or replace function public.dnd_advise_begin(p_code text, p_character int) returns jsonb
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
  hash := md5(concat_ws(chr(31), ch->>'name', ch->>'role', ch->>'moves', latest.text, campaign.updated_at::text));
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
               from (select id, text from public.dnd_scenes where code = p_code order by id desc limit 6) s)
  );
end $$;

revoke all on function public.dnd_default_campaign(), public.dnd_set_history(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.dnd_history(text), public.dnd_save_history(text, text),
  public.dnd_end_table(text, boolean) from public, anon;
grant execute on function public.dnd_history(text), public.dnd_save_history(text, text),
  public.dnd_end_table(text, boolean) to authenticated;

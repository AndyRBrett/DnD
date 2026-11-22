-- Campaign history that outlives tables. One campaign per host account; every
-- table that account starts belongs to it. The host can upload or edit the
-- history, ending a table can append that session's updates to it, and the
-- dnd-advise edge function sends it to Claude (prompt-cached) with each request.

create table public.dnd_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'The Onyx Jewel',
  history text not null default '' check (char_length(history) <= 400000),
  updated_at timestamptz not null default now()
);
alter table public.dnd_campaigns enable row level security;
revoke all on public.dnd_campaigns from anon, authenticated;

alter table public.dnd_rooms add column campaign_id uuid references public.dnd_campaigns(id) on delete set null;

create function public.dnd_campaign_for(p_owner uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare found_id uuid;
begin
  select id into found_id from public.dnd_campaigns where owner_id = p_owner;
  if found_id is null then
    insert into public.dnd_campaigns (owner_id) values (p_owner)
    on conflict (owner_id) do nothing returning id into found_id;
    if found_id is null then
      select id into found_id from public.dnd_campaigns where owner_id = p_owner;
    end if;
  end if;
  return found_id;
end $$;

-- New tables join the host's campaign.
create or replace function public.dnd_create_room(p_party jsonb, p_recap text default null) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); new_code text;
begin
  delete from public.dnd_rooms where created_at < now() - interval '8 hours';
  if (select count(*) from public.dnd_rooms where host_id = uid) >= 3 then
    raise exception 'You already have three open tables. End one before starting another.' using errcode = '22023';
  end if;
  insert into public.dnd_rooms (host_id, party, campaign_id)
  values (uid, public.dnd_clean_party(p_party), public.dnd_campaign_for(uid))
  returning code into new_code;
  if btrim(coalesce(p_recap, '')) <> '' then
    insert into public.dnd_scenes (code, text) values (new_code, left(btrim(p_recap), 1500));
  end if;
  return new_code;
end $$;

-- Tables started before this migration join their host's campaign.
update public.dnd_rooms set campaign_id = public.dnd_campaign_for(host_id) where campaign_id is null;

-- The poll stays small: only the history's size, not its text.
create or replace function public.dnd_room(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); r public.dnd_rooms := public.dnd_live_room(p_code);
begin
  return jsonb_build_object(
    'party', r.party,
    'isHost', r.host_id = uid,
    'ai', true,
    'historyChars', coalesce((select char_length(history) from public.dnd_campaigns where id = r.campaign_id), 0),
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
  return coalesce((select history from public.dnd_campaigns where id = r.campaign_id), '');
end $$;

create function public.dnd_save_history(p_code text, p_history text) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code); cleaned text := btrim(coalesce(p_history, ''));
begin
  if char_length(cleaned) > 400000 then
    raise exception 'The history is too long (400,000 characters max). Trim the oldest parts or summarize them.' using errcode = '22023';
  end if;
  update public.dnd_campaigns set history = cleaned, updated_at = now() where id = r.campaign_id;
  return char_length(cleaned);
end $$;

-- Ending a table can first append its updates (oldest first) to the history.
drop function public.dnd_close_room(text);
create function public.dnd_close_room(p_code text, p_save_history boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code); session text;
begin
  if p_save_history and r.campaign_id is not null then
    select string_agg(text, E'\n' order by id) into session
    from public.dnd_scenes where code = r.code and created_at > r.created_at;
    if btrim(coalesce(session, '')) <> '' then
      update public.dnd_campaigns
      set history = right(btrim(history || E'\n\n## Session ' || to_char(r.created_at at time zone 'America/Chicago', 'YYYY-MM-DD') || E' (live transcript)\n' || session), 400000),
          updated_at = now()
      where id = r.campaign_id;
    end if;
  end if;
  delete from public.dnd_rooms where code = r.code;
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
  select * into campaign from public.dnd_campaigns where id = r.campaign_id;
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

revoke all on function public.dnd_campaign_for(uuid) from public, anon, authenticated;
revoke all on function public.dnd_history(text), public.dnd_save_history(text, text),
  public.dnd_close_room(text, boolean) from public, anon;
grant execute on function public.dnd_history(text), public.dnd_save_history(text, text),
  public.dnd_close_room(text, boolean) to authenticated;

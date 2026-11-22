-- D&D Table Live, hosted mode. Lives in the UFC app's Supabase project beside
-- its tables, so everything is prefixed dnd_ and touches nothing else.
--
-- Access model: the tables have RLS on and no policies, and anon/authenticated
-- hold no table privileges. Everything goes through the security-definer
-- functions below, which require a signed-in email account (not an anonymous
-- session). Anyone signed in who has a room's link can read it; only the
-- account that created a room can change or end it. Rooms expire 8 hours after
-- creation, like the local server.

create table public.dnd_rooms (
  code text primary key default encode(extensions.gen_random_bytes(12), 'hex'),
  host_id uuid not null references auth.users(id) on delete cascade,
  party jsonb not null,
  created_at timestamptz not null default now()
);
create index dnd_rooms_host on public.dnd_rooms (host_id, created_at);

create table public.dnd_scenes (
  id bigint generated always as identity primary key,
  code text not null references public.dnd_rooms(code) on delete cascade,
  text text not null check (char_length(text) between 1 and 1500),
  created_at timestamptz not null default now()
);
create index dnd_scenes_room on public.dnd_scenes (code, id);

-- Claude suggestions: one row per request (for limits) and a cache per
-- character, scene update, and sheet.
create table public.dnd_ai_usage (
  id bigint generated always as identity primary key,
  code text not null references public.dnd_rooms(code) on delete cascade,
  character_index int not null,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index dnd_ai_usage_room on public.dnd_ai_usage (code, character_index, created_at);
create index dnd_ai_usage_user on public.dnd_ai_usage (user_id, created_at);
create index dnd_ai_usage_time on public.dnd_ai_usage (created_at);

create table public.dnd_advice (
  code text not null references public.dnd_rooms(code) on delete cascade,
  character_index int not null,
  scene_id bigint not null,
  sheet_hash text not null,
  advice jsonb not null,
  created_at timestamptz not null default now(),
  primary key (code, character_index, scene_id, sheet_hash)
);

alter table public.dnd_rooms enable row level security;
alter table public.dnd_scenes enable row level security;
alter table public.dnd_ai_usage enable row level security;
alter table public.dnd_advice enable row level security;
revoke all on public.dnd_rooms, public.dnd_scenes, public.dnd_ai_usage, public.dnd_advice from anon, authenticated;

-- ── Helpers (not callable by clients) ────────────────────────────────────────

create function public.dnd_account() returns uuid
language plpgsql stable set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, true) then
    raise exception 'Sign in with your email to use D&D Table Live.' using errcode = '28000';
  end if;
  return uid;
end $$;

create function public.dnd_live_room(p_code text) returns public.dnd_rooms
language plpgsql stable security definer set search_path = public as $$
declare r public.dnd_rooms;
begin
  select * into r from public.dnd_rooms where code = p_code and created_at > now() - interval '8 hours';
  if not found then
    raise exception 'This room has ended or expired.' using errcode = 'P0002';
  end if;
  return r;
end $$;

create function public.dnd_host_room(p_code text) returns public.dnd_rooms
language plpgsql stable security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_live_room(p_code);
begin
  if r.host_id <> public.dnd_account() then
    raise exception 'Only the host can make changes.' using errcode = '42501';
  end if;
  return r;
end $$;

create function public.dnd_clean_party(p_party jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare cleaned jsonb := '[]'::jsonb; entry jsonb; name text;
begin
  if jsonb_typeof(p_party) is distinct from 'array' or jsonb_array_length(p_party) <> 5 then
    raise exception 'Enter five characters.' using errcode = '22023';
  end if;
  for entry in select value from jsonb_array_elements(p_party) loop
    name := left(btrim(coalesce(entry->>'name', '')), 70);
    if name = '' then
      raise exception 'Each character needs a name.' using errcode = '22023';
    end if;
    cleaned := cleaned || jsonb_build_array(jsonb_build_object(
      'name', name,
      'role', left(btrim(coalesce(entry->>'role', '')), 90),
      'moves', left(btrim(coalesce(entry->>'moves', '')), 5000),
      'historyImported', true
    ));
  end loop;
  return cleaned;
end $$;

-- ── Client API (PostgREST /rest/v1/rpc/...) ─────────────────────────────────

create function public.dnd_create_room(p_party jsonb, p_recap text default null) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); new_code text;
begin
  delete from public.dnd_rooms where created_at < now() - interval '8 hours';
  if (select count(*) from public.dnd_rooms where host_id = uid) >= 3 then
    raise exception 'You already have three open tables. End one before starting another.' using errcode = '22023';
  end if;
  insert into public.dnd_rooms (host_id, party) values (uid, public.dnd_clean_party(p_party))
  returning code into new_code;
  if btrim(coalesce(p_recap, '')) <> '' then
    insert into public.dnd_scenes (code, text) values (new_code, left(btrim(p_recap), 1500));
  end if;
  return new_code;
end $$;

create function public.dnd_room(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); r public.dnd_rooms := public.dnd_live_room(p_code);
begin
  return jsonb_build_object(
    'party', r.party,
    'isHost', r.host_id = uid,
    'ai', true,
    'scenes', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'text', s.text,
        'created', (extract(epoch from s.created_at) * 1000)::bigint) order by s.id)
      from (select * from public.dnd_scenes where code = p_code order by id desc limit 30) s
    ), '[]'::jsonb)
  );
end $$;

create function public.dnd_my_rooms() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.dnd_account();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('code', code, 'created', (extract(epoch from created_at) * 1000)::bigint) order by created_at desc)
    from public.dnd_rooms where host_id = uid and created_at > now() - interval '8 hours'
  ), '[]'::jsonb);
end $$;

create function public.dnd_post_scene(p_code text, p_text text, p_id bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code); cleaned text := btrim(coalesce(p_text, ''));
begin
  if char_length(cleaned) not between 1 and 1500 then
    raise exception 'Use 1 to 1,500 characters.' using errcode = '22023';
  end if;
  if p_id is not null and p_id > 0 then
    update public.dnd_scenes set text = cleaned where code = r.code and id = p_id;
  else
    insert into public.dnd_scenes (code, text) values (r.code, cleaned);
  end if;
end $$;

create function public.dnd_save_party(p_code text, p_party jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code);
begin
  update public.dnd_rooms set party = public.dnd_clean_party(p_party) where code = r.code;
end $$;

create function public.dnd_close_room(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code);
begin
  delete from public.dnd_rooms where code = r.code;
end $$;

-- Called by the dnd-advise edge function with the player's own token. Returns
-- either a cached answer, a limit message, or what to send to Claude (after
-- counting the request). The function stores answers with the service role.
create function public.dnd_advise_begin(p_code text, p_character int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  ch jsonb := r.party -> p_character;
  latest public.dnd_scenes;
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
  hash := md5(concat_ws(chr(31), ch->>'name', ch->>'role', ch->>'moves', latest.text));
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
    'scenes', (select jsonb_agg(jsonb_build_object('id', s.id, 'text', s.text) order by s.id)
               from (select id, text from public.dnd_scenes where code = p_code order by id desc limit 6) s)
  );
end $$;

revoke all on function public.dnd_account(), public.dnd_live_room(text), public.dnd_host_room(text),
  public.dnd_clean_party(jsonb) from public, anon, authenticated;
revoke all on function public.dnd_create_room(jsonb, text), public.dnd_room(text), public.dnd_my_rooms(),
  public.dnd_post_scene(text, text, bigint), public.dnd_save_party(text, jsonb), public.dnd_close_room(text),
  public.dnd_advise_begin(text, int) from public, anon;
grant execute on function public.dnd_create_room(jsonb, text), public.dnd_room(text), public.dnd_my_rooms(),
  public.dnd_post_scene(text, text, bigint), public.dnd_save_party(text, jsonb), public.dnd_close_room(text),
  public.dnd_advise_begin(text, int) to authenticated;

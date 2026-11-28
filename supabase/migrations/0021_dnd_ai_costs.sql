-- Claude costs: what each call really used, a running recap so long sessions
-- send less, and one per-table limit.
--
-- dnd_ai_tokens: one row per Claude call made by the dnd-advise edge function
-- (advice, questions, the DM's tools, and recaps), with the token counts
-- Claude reported. No link to dnd_rooms, so the costs outlive the table.
-- Written and read only with the service role.
--
-- dnd_recaps: the running recap of a table's session (text, the time of the
-- last line it covers, and a fingerprint of those lines so an edit or deletion
-- makes it rebuild). Removed with the table. Saved through dnd_recap_save,
-- which never moves a recap backwards when two phones ask at once, except to
-- replace one the story no longer matches. Service role only.
--
-- dnd_advise_begin_v2: unchanged except the per-table limit, 200 to 150 calls,
-- the same as the edge function and the local server now use.
-- Additive; safe to re-run.

create table if not exists public.dnd_ai_tokens (
  id bigint generated always as identity primary key,
  code text not null,
  mode text not null,
  model text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read integer not null default 0,
  cache_write integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.dnd_ai_tokens enable row level security;
revoke all on public.dnd_ai_tokens from anon, authenticated;
create index if not exists dnd_ai_tokens_created on public.dnd_ai_tokens (created_at);

create table if not exists public.dnd_recaps (
  code text primary key references public.dnd_rooms(code) on delete cascade,
  text text not null,
  upto_at bigint not null,
  sig text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.dnd_recaps enable row level security;
revoke all on public.dnd_recaps from anon, authenticated;

create or replace function public.dnd_recap_save(p_code text, p_text text, p_upto_at bigint, p_sig text) returns void
language sql security definer set search_path = public as $$
  insert into public.dnd_recaps (code, text, upto_at, sig) values (p_code, left(p_text, 6000), p_upto_at, p_sig)
  on conflict (code) do update set text = excluded.text, upto_at = excluded.upto_at, sig = excluded.sig, updated_at = now()
  where public.dnd_recaps.upto_at < excluded.upto_at or public.dnd_recaps.sig is distinct from excluded.sig;
$$;
revoke all on function public.dnd_recap_save(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.dnd_recap_save(text, text, bigint, text) to service_role;

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
  if (select count(*) from public.dnd_ai_usage where user_id = uid and created_at > now() - interval '1 day') >= 60 then
    return jsonb_build_object('limit', 'You have used today''s Claude suggestions.');
  end if;
  if (select count(*) from public.dnd_ai_usage where code = p_code) >= 150 then
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

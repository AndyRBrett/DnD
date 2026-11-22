-- Party hit points and AC: current, max, and temporary HP (and the confirmed
-- Armor Class, when it differs from the sheet) for each character, shared
-- with everyone at the table. Kept per campaign (not per table), so HP carries
-- from one session to the next; a practice table keeps its own. Anyone at the
-- table can change it (players their own, the DM anyone's). Additive only:
-- a new table and functions (dnd_room_v4 supersedes dnd_room_v3).

create table public.dnd_party_hp (
  scope text not null,
  name text not null check (char_length(name) <= 70),
  hp int not null check (hp between 0 and 999),
  max_hp int not null check (max_hp between 1 and 999),
  temp int not null default 0 check (temp between 0 and 999),
  ac int check (ac between 1 and 40),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (scope, name)
);
alter table public.dnd_party_hp enable row level security;
revoke all on public.dnd_party_hp from anon, authenticated;

-- Campaign tables share the campaign's HP; a practice table (its opening
-- update starts with PRACTICE TABLE) gets its own.
create function public.dnd_hp_scope(p_code text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.dnd_scenes where code = p_code and text like 'PRACTICE TABLE%')
      or public.dnd_default_campaign() is null then 'room:' || p_code
    else 'campaign:' || public.dnd_default_campaign()::text
  end
$$;

-- Sets the numbers outright (fixing max HP, a full heal after a rest, or the
-- confirmed AC; a null p_ac keeps the AC already saved).
create function public.dnd_hp_set(p_code text, p_character int, p_hp int, p_max int, p_temp int default 0, p_ac int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  who text := r.party -> p_character ->> 'name';
begin
  if who is null or p_character < 0 then
    raise exception 'Pick a character.' using errcode = '22023';
  end if;
  if p_max is null or p_max not between 1 and 999 then
    raise exception 'Max HP must be 1 to 999.' using errcode = '22023';
  end if;
  if p_ac is not null and p_ac not between 1 and 40 then
    raise exception 'AC must be 1 to 40.' using errcode = '22023';
  end if;
  insert into public.dnd_party_hp as h (scope, name, hp, max_hp, temp, ac, updated_by)
  values (public.dnd_hp_scope(r.code), who, greatest(0, least(p_max, coalesce(p_hp, p_max))), p_max,
          greatest(0, least(999, coalesce(p_temp, 0))), p_ac, uid)
  on conflict (scope, name) do update set
    hp = excluded.hp, max_hp = excluded.max_hp, temp = excluded.temp, ac = coalesce(excluded.ac, h.ac),
    updated_at = now(), updated_by = uid;
  delete from public.dnd_party_hp where scope like 'room:%' and updated_at < now() - interval '2 days';
end $$;

-- Damage (negative) or healing (positive), applied atomically so two phones
-- tapping at once don't overwrite each other. Damage uses temp HP first.
create function public.dnd_hp_adjust(p_code text, p_character int, p_change int) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  who text := r.party -> p_character ->> 'name';
begin
  if who is null or p_character < 0 then
    raise exception 'Pick a character.' using errcode = '22023';
  end if;
  if p_change is null or p_change = 0 or abs(p_change) > 999 then
    raise exception 'Enter an amount from 1 to 999.' using errcode = '22023';
  end if;
  if p_change < 0 then
    update public.dnd_party_hp set
      temp = greatest(0, temp + p_change),
      hp = greatest(0, hp - greatest(0, -p_change - temp)),
      updated_at = now(), updated_by = uid
    where scope = public.dnd_hp_scope(r.code) and name = who;
  else
    update public.dnd_party_hp set hp = least(max_hp, hp + p_change), updated_at = now(), updated_by = uid
    where scope = public.dnd_hp_scope(r.code) and name = who;
  end if;
  if not found then
    raise exception 'Set this character''s max HP first.' using errcode = '22023';
  end if;
end $$;

-- dnd_room_v3 plus the party's HP, by character name.
create function public.dnd_room_v4(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare base jsonb := public.dnd_room_v3(p_code);
begin
  return base || jsonb_build_object('hp', coalesce((
    select jsonb_object_agg(h.name, jsonb_strip_nulls(jsonb_build_object('hp', h.hp, 'max', h.max_hp, 'temp', h.temp, 'ac', h.ac)))
    from public.dnd_party_hp h
    where h.scope = public.dnd_hp_scope(p_code)
      and h.name in (select member ->> 'name' from jsonb_array_elements(base -> 'party') member)
  ), '{}'::jsonb));
end $$;

revoke all on function public.dnd_hp_scope(text) from public, anon, authenticated;
revoke all on function public.dnd_hp_set(text, int, int, int, int, int), public.dnd_hp_adjust(text, int, int),
  public.dnd_room_v4(text) from public, anon;
grant execute on function public.dnd_hp_set(text, int, int, int, int, int), public.dnd_hp_adjust(text, int, int),
  public.dnd_room_v4(text) to authenticated;

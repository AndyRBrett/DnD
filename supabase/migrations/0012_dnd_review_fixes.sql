-- Review fixes for earlier migrations. Safe to run on a database that already
-- has them (everything is "if not exists" / "create or replace").
--
-- 1. Party AC (moved here from an in-place edit of 0006): the confirmed Armor
--    Class column, dnd_hp_set with p_ac, and dnd_room_v4 returning it.
-- 2. dnd_remove_host takes a lock first, so two DMs removing each other at the
--    same moment can't leave the group with none.

alter table public.dnd_party_hp add column if not exists ac int check (ac between 1 and 40);

drop function if exists public.dnd_hp_set(text, int, int, int, int);

-- Sets the numbers outright (fixing max HP, a full heal after a rest, or the
-- confirmed AC; a null p_ac keeps the AC already saved).
create or replace function public.dnd_hp_set(p_code text, p_character int, p_hp int, p_max int, p_temp int default 0, p_ac int default null)
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

create or replace function public.dnd_room_v4(p_code text) returns jsonb
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


revoke all on function public.dnd_hp_set(text, int, int, int, int, int), public.dnd_room_v4(text) from public, anon;
grant execute on function public.dnd_hp_set(text, int, int, int, int, int), public.dnd_room_v4(text) to authenticated;

create or replace function public.dnd_remove_host(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); target uuid;
begin
  -- One removal at a time, so the "keep at least one DM" check holds.
  lock table public.dnd_hosts in share row exclusive mode;
  if not exists (select 1 from public.dnd_hosts where user_id = uid) then
    raise exception 'Only DMs can remove DMs.' using errcode = '42501';
  end if;
  select id into target from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if (select count(*) from public.dnd_hosts) <= 1 then
    raise exception 'Keep at least one DM.' using errcode = '22023';
  end if;
  delete from public.dnd_hosts where user_id = target;
end $$;

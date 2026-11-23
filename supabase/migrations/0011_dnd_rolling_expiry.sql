-- Tables stay open until 8 hours after their last activity (a DM update or
-- edit, a player action or shared roll, or a change to the fight) instead of
-- 8 hours after they were started, so a long session isn't cut off. Idle
-- tables still close. Changes only dnd_ objects; dnd_create_room keeps the
-- DMs-only check from 0010.

alter table public.dnd_rooms add column if not exists last_active timestamptz not null default now();

-- Existing tables: their real last activity (so a long-idle one stays closed).
update public.dnd_rooms r set last_active = greatest(
  r.created_at,
  coalesce((select max(created_at) from public.dnd_scenes s where s.code = r.code), r.created_at),
  coalesce((select max(created_at) from public.dnd_actions a where a.code = r.code), r.created_at),
  coalesce((select max(updated_at) from public.dnd_combats c where c.code = r.code), r.created_at)
);

create function public.dnd_touch_room() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.dnd_rooms set last_active = now() where code = new.code;
  return new;
end $$;
revoke all on function public.dnd_touch_room() from public, anon, authenticated;

create trigger dnd_scenes_touch_room after insert or update on public.dnd_scenes
  for each row execute function public.dnd_touch_room();
create trigger dnd_actions_touch_room after insert or update on public.dnd_actions
  for each row execute function public.dnd_touch_room();
create trigger dnd_combats_touch_room after insert or update on public.dnd_combats
  for each row execute function public.dnd_touch_room();

create or replace function public.dnd_live_room(p_code text) returns public.dnd_rooms
language plpgsql stable security definer set search_path = public as $$
declare r public.dnd_rooms;
begin
  select * into r from public.dnd_rooms where code = p_code and last_active > now() - interval '8 hours';
  if not found then
    raise exception 'This room has ended or expired.' using errcode = 'P0002';
  end if;
  return r;
end $$;

create or replace function public.dnd_create_room(p_party jsonb, p_recap text default null) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); new_code text;
begin
  if not exists (select 1 from public.dnd_hosts where user_id = uid) then
    raise exception 'Only your group''s DMs can start a table. Open the link your DM shares, or ask them to add you as a DM.' using errcode = '42501';
  end if;
  delete from public.dnd_rooms where last_active < now() - interval '8 hours';
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

create or replace function public.dnd_my_rooms() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.dnd_account();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('code', code, 'created', (extract(epoch from created_at) * 1000)::bigint) order by created_at desc)
    from public.dnd_rooms where host_id = uid and last_active > now() - interval '8 hours'
  ), '[]'::jsonb);
end $$;

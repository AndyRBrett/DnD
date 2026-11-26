-- Tables stay open until 3 days after their last activity (was 8 hours), so
-- a game paused overnight or over a weekend picks up where it stopped: the
-- fight, the story, and a practice table's own HP and spell slots are still
-- there. Only DMs in dnd_hosts can start a table and each has at most three,
-- so a longer window doesn't widen who can spend Claude calls; per-table
-- limits in dnd_advise_begin are unchanged. Changes only dnd_ functions.
-- Safe to re-run.

create or replace function public.dnd_live_room(p_code text) returns public.dnd_rooms
language plpgsql stable security definer set search_path = public as $$
declare r public.dnd_rooms;
begin
  select * into r from public.dnd_rooms where code = p_code and last_active > now() - interval '3 days';
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
  delete from public.dnd_rooms where last_active < now() - interval '3 days';
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
    select jsonb_agg(jsonb_build_object(
      'code', code,
      'created', (extract(epoch from created_at) * 1000)::bigint,
      'active', (extract(epoch from last_active) * 1000)::bigint,
      'practice', practice
    ) order by last_active desc)
    from public.dnd_rooms where host_id = uid and last_active > now() - interval '3 days'
  ), '[]'::jsonb);
end $$;

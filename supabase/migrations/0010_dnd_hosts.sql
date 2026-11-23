-- Only the group's DMs can start a table. Anyone can still sign in (that's
-- the UFC app's login, which we don't change), and players still join with
-- the DM's table link, but a stranger who signs up can't create a table and
-- so has nowhere to spend Ask Claude calls (every Claude request needs a live
-- table). DMs are listed in dnd_hosts; an existing DM adds another by email
-- from the DM tab. Additive except dnd_create_room, which gains the check.

create table public.dnd_hosts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_by uuid,
  added_at timestamptz not null default now()
);
alter table public.dnd_hosts enable row level security;
revoke all on public.dnd_hosts from anon, authenticated;

-- Start with whoever already runs tables or keeps the campaign history.
insert into public.dnd_hosts (user_id)
select u from (
  select host_id as u from public.dnd_rooms
  union select saved_by from public.dnd_campaign_versions where saved_by is not null
  union select updated_by from public.dnd_campaigns where updated_by is not null
) existing
where u in (select id from auth.users)
on conflict do nothing;

create or replace function public.dnd_create_room(p_party jsonb, p_recap text default null) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); new_code text;
begin
  if not exists (select 1 from public.dnd_hosts where user_id = uid) then
    raise exception 'Only your group''s DMs can start a table. Open the link your DM shares, or ask them to add you as a DM.' using errcode = '42501';
  end if;
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

-- Is the signed-in person one of the DMs? (The lobby shows "Start a table" only to them.)
create function public.dnd_is_host() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dnd_hosts where user_id = public.dnd_account())
$$;

-- DMs only: the list of DM emails.
create function public.dnd_host_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.dnd_account();
begin
  if not exists (select 1 from public.dnd_hosts where user_id = uid) then
    raise exception 'Only DMs can see this.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'you', u.id = uid) order by h.added_at)
    from public.dnd_hosts h join auth.users u on u.id = h.user_id), '[]'::jsonb);
end $$;

-- DMs only: add another DM by the email they sign in with (they must have
-- signed in once, so their account exists).
create function public.dnd_add_host(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); target uuid;
begin
  if not exists (select 1 from public.dnd_hosts where user_id = uid) then
    raise exception 'Only DMs can add DMs.' using errcode = '42501';
  end if;
  select id into target from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if target is null then
    raise exception 'No account with that email yet. They need to sign in to the app once first.' using errcode = 'P0002';
  end if;
  insert into public.dnd_hosts (user_id, added_by) values (target, uid) on conflict do nothing;
end $$;

-- DMs only: remove a DM (never the last one).
create function public.dnd_remove_host(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.dnd_account(); target uuid;
begin
  if not exists (select 1 from public.dnd_hosts where user_id = uid) then
    raise exception 'Only DMs can remove DMs.' using errcode = '42501';
  end if;
  select id into target from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if (select count(*) from public.dnd_hosts) <= 1 then
    raise exception 'Keep at least one DM.' using errcode = '22023';
  end if;
  delete from public.dnd_hosts where user_id = target;
end $$;

revoke all on function public.dnd_is_host(), public.dnd_host_list(), public.dnd_add_host(text), public.dnd_remove_host(text) from public, anon;
grant execute on function public.dnd_is_host(), public.dnd_host_list(), public.dnd_add_host(text), public.dnd_remove_host(text) to authenticated;

-- If you aren't listed yet (no table open when this ran), add yourself once
-- in the SQL editor, with the email you sign in with:
--   insert into public.dnd_hosts (user_id) select id from auth.users where email = 'you@example.com';

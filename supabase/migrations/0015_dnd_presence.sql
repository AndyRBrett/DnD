-- Who's at the table: each player's phone says which character it's playing
-- every 20 seconds or so (dnd_here), and dnd_room_v6 adds the characters seen
-- in the last two minutes, so the DM sees who has joined before anyone posts.
-- Players' accounts are never returned, only character numbers. Removed with
-- the table. Additive; safe to re-run.

create table if not exists public.dnd_presence (
  code text not null references public.dnd_rooms(code) on delete cascade,
  account uuid not null,
  character int not null check (character between 0 and 9),
  seen_at timestamptz not null default now(),
  primary key (code, account)
);
alter table public.dnd_presence enable row level security;
revoke all on public.dnd_presence from anon, authenticated;

create or replace function public.dnd_here(p_code text, p_character int) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
begin
  if p_character is null or p_character < 0 or r.party -> p_character is null then
    raise exception 'Pick a character.' using errcode = '22023';
  end if;
  insert into public.dnd_presence (code, account, character, seen_at)
  values (r.code, uid, p_character, now())
  on conflict (code, account) do update set character = excluded.character, seen_at = now();
end $$;

-- dnd_room_v5 plus "here": [{ character, seconds }] for phones seen in the last two minutes.
create or replace function public.dnd_room_v6(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare base jsonb := public.dnd_room_v5(p_code);
begin
  return base || jsonb_build_object('here', coalesce((
    select jsonb_agg(jsonb_build_object('character', p.character,
      'seconds', greatest(0, extract(epoch from now() - p.seen_at))::int) order by p.character)
    from public.dnd_presence p
    where p.code = p_code and p.seen_at > now() - interval '2 minutes'
  ), '[]'::jsonb));
end $$;

revoke all on function public.dnd_here(text, int), public.dnd_room_v6(text) from public, anon;
grant execute on function public.dnd_here(text, int), public.dnd_room_v6(text) to authenticated;

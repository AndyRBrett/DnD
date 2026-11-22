-- Combat mode: the DM starts combat and every phone at the table sees the
-- initiative order, whose turn it is, and each enemy as Healthy, Bloodied or
-- Down. Only that public view is stored here: enemy HP, AC and attacks stay on
-- the DM's phone. Players record their own initiative. Additive only: a new
-- table and new functions (dnd_room_v3 supersedes dnd_room_v2, which stays
-- in place for older clients).

create table public.dnd_combats (
  code text primary key references public.dnd_rooms(code) on delete cascade,
  round int not null default 1 check (round between 1 and 999),
  turn text check (char_length(turn) <= 60),
  enemies jsonb not null default '[]'::jsonb,
  party_init jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.dnd_combats enable row level security;
revoke all on public.dnd_combats from anon, authenticated;

-- Host only. Keeps just the public fields of each enemy (id, name,
-- initiative, status, conditions), so nothing else can be stored even if a
-- client sends it. p_reset starts a fresh fight (clears player initiative).
create function public.dnd_combat_set(p_code text, p_round int, p_turn text, p_enemies jsonb, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.dnd_rooms := public.dnd_host_room(p_code);
  cleaned jsonb;
begin
  if jsonb_typeof(coalesce(p_enemies, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_enemies, '[]'::jsonb)) > 40 then
    raise exception 'Use up to 40 enemies.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', left(coalesce(e->>'id', ''), 40),
      'name', left(coalesce(e->>'name', 'Enemy'), 60),
      'initiative', case when jsonb_typeof(e->'initiative') = 'number' then e->'initiative' end,
      'status', case when e->>'status' in ('ok', 'bloodied', 'down') then e->>'status' else 'ok' end,
      'conditions', coalesce((select jsonb_agg(left(c, 30)) from (
          select jsonb_array_elements_text(case when jsonb_typeof(e->'conditions') = 'array' then e->'conditions' else '[]'::jsonb end) c
          limit 16) list), '[]'::jsonb)
    ) order by ord), '[]'::jsonb)
  into cleaned
  from jsonb_array_elements(coalesce(p_enemies, '[]'::jsonb)) with ordinality as items(e, ord);

  insert into public.dnd_combats as c (code, round, turn, enemies, party_init, updated_at)
  values (r.code, greatest(1, least(999, coalesce(p_round, 1))), left(p_turn, 60), cleaned, '{}'::jsonb, now())
  on conflict (code) do update set
    round = excluded.round,
    turn = excluded.turn,
    enemies = excluded.enemies,
    party_init = case when p_reset then '{}'::jsonb else c.party_init end,
    updated_at = now();
end $$;

create function public.dnd_combat_end(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code);
begin
  delete from public.dnd_combats where code = r.code;
end $$;

-- Anyone at the table records a character's initiative (players their own;
-- the DM can fill one in for someone).
create function public.dnd_combat_initiative(p_code text, p_character int, p_value int) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
begin
  if r.party -> p_character is null or p_character < 0 then
    raise exception 'Pick a character.' using errcode = '22023';
  end if;
  if p_value is null or p_value not between -10 and 60 then
    raise exception 'Enter an initiative between -10 and 60.' using errcode = '22023';
  end if;
  update public.dnd_combats set party_init = party_init || jsonb_build_object(p_character::text, p_value), updated_at = now()
  where code = r.code;
  if not found then
    raise exception 'Combat has not started.' using errcode = '22023';
  end if;
end $$;

-- dnd_room_v2 plus the combat (null when there's no fight).
create function public.dnd_room_v3(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return public.dnd_room_v2(p_code) || jsonb_build_object('combat', (
    select jsonb_build_object('round', c.round, 'turn', c.turn, 'enemies', c.enemies, 'party', c.party_init)
    from public.dnd_combats c where c.code = p_code));
end $$;

revoke all on function public.dnd_combat_set(text, int, text, jsonb, boolean), public.dnd_combat_end(text),
  public.dnd_combat_initiative(text, int, int), public.dnd_room_v3(text) from public, anon;
grant execute on function public.dnd_combat_set(text, int, text, jsonb, boolean), public.dnd_combat_end(text),
  public.dnd_combat_initiative(text, int, int), public.dnd_room_v3(text) to authenticated;

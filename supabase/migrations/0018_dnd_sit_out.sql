-- Sitting out a fight: the DM marks a character who isn't in this fight (on
-- the other side of a door, say). Stored as "out" in place of that
-- character's initiative, so they get no turn and no initiative prompt.
-- Rolling initiative later brings them back in, as does the DM's "Join".
-- dnd_combat_pass_turn is replaced to skip sitting-out characters, matching
-- the app's combatOrder().

create function public.dnd_combat_sit_out(p_code text, p_character int, p_out boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.dnd_rooms := public.dnd_host_room(p_code);
begin
  if p_character is null or p_character < 0 or r.party -> p_character is null then
    raise exception 'Pick a character.' using errcode = '22023';
  end if;
  update public.dnd_combats
     set party_init = case when coalesce(p_out, false)
                           then party_init || jsonb_build_object(p_character::text, 'out')
                           else party_init - p_character::text end,
         updated_at = now()
   where code = r.code;
  if not found then
    raise exception 'Combat has not started.' using errcode = '22023';
  end if;
end $$;

create or replace function public.dnd_combat_pass_turn(p_code text, p_character int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  c public.dnd_combats;
  keys text[];
  at int;
  next_turn text;
  next_round int;
begin
  select * into c from public.dnd_combats where code = r.code for update;
  if not found then
    raise exception 'Combat has not started.' using errcode = '22023';
  end if;
  if c.turn is distinct from 'pc:' || p_character then
    raise exception 'It isn''t your turn anymore.' using errcode = '22023';
  end if;
  select array_agg(key order by rank desc, kind, ord) into keys from (
    select 'pc:' || (i - 1) as key,
           coalesce(case when (c.party_init ->> (i - 1)::text) ~ '^-?\d+$' then (c.party_init ->> (i - 1)::text)::int end, -1000) as rank,
           0 as kind, (i - 1)::int as ord
      from jsonb_array_elements(r.party) with ordinality as members(member, i)
      where coalesce(c.party_init ->> (i - 1)::text, '') <> 'out'
    union all
    select 'en:' || (e ->> 'id'),
           coalesce(case when jsonb_typeof(e -> 'initiative') = 'number' then floor((e ->> 'initiative')::numeric)::int end, -1000),
           1, (1000 + j)::int
      from jsonb_array_elements(c.enemies) with ordinality as foes(e, j)
      where coalesce(e ->> 'status', 'ok') <> 'down'
  ) entries;
  at := array_position(keys, c.turn);
  if at is null or at >= array_length(keys, 1) then
    next_turn := keys[1];
    next_round := c.round + case when at is null then 0 else 1 end;
  else
    next_turn := keys[at + 1];
    next_round := c.round;
  end if;
  update public.dnd_combats set turn = next_turn, round = least(999, next_round), updated_at = now() where code = r.code;
  return jsonb_build_object('turn', next_turn, 'round', least(999, next_round));
end $$;

revoke all on function public.dnd_combat_sit_out(text, int, boolean) from public, anon;
grant execute on function public.dnd_combat_sit_out(text, int, boolean) to authenticated;

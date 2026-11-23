-- End my turn, handled by the database: the player whose turn it is passes it
-- to the next combatant without waiting for the DM's phone (which may be
-- asleep). Same order as the app's combatOrder(): highest initiative first,
-- the party before enemies on ties, anyone who hasn't rolled last, downed
-- enemies skipped; passing the last one starts a new round. Additive only.

create function public.dnd_combat_pass_turn(p_code text, p_character int) returns jsonb
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

revoke all on function public.dnd_combat_pass_turn(text, int) from public, anon;
grant execute on function public.dnd_combat_pass_turn(text, int) to authenticated;

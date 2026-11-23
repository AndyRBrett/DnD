-- Party resources: spell slots used, Rage and other per-rest uses, and
-- whether a character is raging, shared with the table and kept per campaign
-- like HP (a practice table keeps its own, see dnd_hp_scope). The client
-- knows each sheet's limits; this stores what's been used. Additive only:
-- a new table and functions (dnd_room_v5 supersedes dnd_room_v4).

create table public.dnd_party_resources (
  scope text not null,
  name text not null check (char_length(name) <= 70),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object' and pg_column_size(state) <= 4000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (scope, name)
);
alter table public.dnd_party_resources enable row level security;
revoke all on public.dnd_party_resources from anon, authenticated;

-- Anyone at the table saves a character's resources (players their own; the
-- DM can fix anyone's). Keeps only { used: { key: 0..99 }, raging: bool }.
create function public.dnd_resources_set(p_code text, p_character int, p_state jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  who text := r.party -> p_character ->> 'name';
  used jsonb;
begin
  if who is null or p_character < 0 then
    raise exception 'Pick a character.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(coalesce(p_state -> 'used', '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid resources.' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(left(key, 40), least(99, greatest(0, value::int))), '{}'::jsonb) into used
  from (select key, value from jsonb_each_text(coalesce(p_state -> 'used', '{}'::jsonb))
        where value ~ '^\d{1,3}$' limit 40) entries;
  insert into public.dnd_party_resources (scope, name, state, updated_by)
  values (public.dnd_hp_scope(r.code), who,
          jsonb_build_object('used', used, 'raging', coalesce((p_state ->> 'raging')::boolean, false)), uid)
  on conflict (scope, name) do update set state = excluded.state, updated_at = now(), updated_by = uid;
  delete from public.dnd_party_resources where scope like 'room:%' and updated_at < now() - interval '2 days';
end $$;

-- dnd_room_v4 plus the party's resources, by character name.
create function public.dnd_room_v5(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare base jsonb := public.dnd_room_v4(p_code);
begin
  return base || jsonb_build_object('resources', coalesce((
    select jsonb_object_agg(x.name, x.state)
    from public.dnd_party_resources x
    where x.scope = public.dnd_hp_scope(p_code)
      and x.name in (select member ->> 'name' from jsonb_array_elements(base -> 'party') member)
  ), '{}'::jsonb));
end $$;

revoke all on function public.dnd_resources_set(text, int, jsonb), public.dnd_room_v5(text) from public, anon;
grant execute on function public.dnd_resources_set(text, int, jsonb), public.dnd_room_v5(text) to authenticated;

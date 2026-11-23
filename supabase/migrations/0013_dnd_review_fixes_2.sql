-- More review fixes. Safe to re-run.
--
-- 1. dnd_combat_enemies: the DM's enemy changes (HP, conditions) update only
--    the enemies of a fight that's still on, in one statement, so they can't
--    put back a turn a player just passed or reopen a fight that just ended.
--    Before this runs, the app falls back to re-reading the turn.
-- 2. A practice table is marked on the table itself (dnd_rooms.practice) when
--    it's started, so editing or deleting its opening update can't switch its
--    HP and resources over to the real campaign's.

create or replace function public.dnd_combat_enemies(p_code text, p_enemies jsonb)
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
  -- No fight on: nothing to update (never starts one).
  update public.dnd_combats set enemies = cleaned, updated_at = now() where code = r.code;
end $$;

revoke all on function public.dnd_combat_enemies(text, jsonb) from public, anon;
grant execute on function public.dnd_combat_enemies(text, jsonb) to authenticated;

alter table public.dnd_rooms add column if not exists practice boolean not null default false;
update public.dnd_rooms r set practice = true
  where exists (select 1 from public.dnd_scenes s where s.code = r.code and s.text like 'PRACTICE TABLE%');

-- The opening update of a practice table marks it (dnd_create_room posts it).
create or replace function public.dnd_mark_practice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.text like 'PRACTICE TABLE%'
     and not exists (select 1 from public.dnd_scenes where code = new.code and id <> new.id) then
    update public.dnd_rooms set practice = true where code = new.code;
  end if;
  return new;
end $$;
revoke all on function public.dnd_mark_practice() from public, anon, authenticated;
drop trigger if exists dnd_scenes_mark_practice on public.dnd_scenes;
create trigger dnd_scenes_mark_practice after insert on public.dnd_scenes
  for each row execute function public.dnd_mark_practice();

create or replace function public.dnd_hp_scope(p_code text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select practice from public.dnd_rooms where code = p_code), false)
      or public.dnd_default_campaign() is null then 'room:' || p_code
    else 'campaign:' || public.dnd_default_campaign()::text
  end
$$;
revoke all on function public.dnd_hp_scope(text) from public, anon, authenticated;

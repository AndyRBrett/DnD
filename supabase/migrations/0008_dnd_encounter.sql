-- The DM's encounter (enemies with HP, AC, attacks, abilities), saved with
-- the table so the DM can switch between phone and laptop mid-session. Only
-- the host can read or write it; players keep seeing just the public combat
-- view (dnd_combats). Removed with the table. Additive only.

create table public.dnd_encounters (
  code text primary key references public.dnd_rooms(code) on delete cascade,
  enemies jsonb not null default '[]'::jsonb check (jsonb_typeof(enemies) = 'array' and pg_column_size(enemies) <= 100000),
  updated_at timestamptz not null default now()
);
alter table public.dnd_encounters enable row level security;
revoke all on public.dnd_encounters from anon, authenticated;

create function public.dnd_encounter_save(p_code text, p_enemies jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code);
begin
  if jsonb_typeof(coalesce(p_enemies, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_enemies, '[]'::jsonb)) > 40 then
    raise exception 'Use up to 40 enemies.' using errcode = '22023';
  end if;
  insert into public.dnd_encounters (code, enemies) values (r.code, coalesce(p_enemies, '[]'::jsonb))
  on conflict (code) do update set enemies = excluded.enemies, updated_at = now();
end $$;

-- Host only: { enemies, updated } or null when nothing is saved yet.
create function public.dnd_encounter_get(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.dnd_rooms := public.dnd_host_room(p_code);
begin
  return (select jsonb_build_object('enemies', e.enemies, 'updated', (extract(epoch from e.updated_at) * 1000)::bigint)
          from public.dnd_encounters e where e.code = r.code);
end $$;

revoke all on function public.dnd_encounter_save(text, jsonb), public.dnd_encounter_get(text) from public, anon;
grant execute on function public.dnd_encounter_save(text, jsonb), public.dnd_encounter_get(text) to authenticated;

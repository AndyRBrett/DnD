-- A party of one to eight characters (it was exactly five), so a new player
-- can join: JPeso, the bard, makes six. Same cleaning as before. Additive:
-- only the size check changes.

create or replace function public.dnd_clean_party(p_party jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare cleaned jsonb := '[]'::jsonb; entry jsonb; name text;
begin
  if jsonb_typeof(p_party) is distinct from 'array' or jsonb_array_length(p_party) not between 1 and 8 then
    raise exception 'Enter one to eight characters.' using errcode = '22023';
  end if;
  for entry in select value from jsonb_array_elements(p_party) loop
    name := left(btrim(coalesce(entry->>'name', '')), 70);
    if name = '' then
      raise exception 'Each character needs a name.' using errcode = '22023';
    end if;
    cleaned := cleaned || jsonb_build_array(jsonb_build_object(
      'name', name,
      'role', left(btrim(coalesce(entry->>'role', '')), 90),
      'moves', left(btrim(coalesce(entry->>'moves', '')), 5000),
      'historyImported', true
    ));
  end loop;
  return cleaned;
end $$;

revoke all on function public.dnd_clean_party(jsonb) from public, anon, authenticated;

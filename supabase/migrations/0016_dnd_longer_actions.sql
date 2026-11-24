-- Player actions up to 1000 characters (was 300): posts were stopping
-- mid-word in play. Raises the column check and the two functions that
-- write actions; nothing else changes. Safe to re-run.

alter table public.dnd_actions drop constraint if exists dnd_actions_text_check;
alter table public.dnd_actions add constraint dnd_actions_text_check check (char_length(text) between 1 and 1000);

create or replace function public.dnd_post_action(p_code text, p_character int, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  ch jsonb := r.party -> p_character;
  cleaned text := btrim(coalesce(p_text, ''));
begin
  if ch is null or p_character < 0 then
    raise exception 'Pick a character.' using errcode = '22023';
  end if;
  if char_length(cleaned) not between 1 and 1000 then
    raise exception 'Use 1 to 1000 characters.' using errcode = '22023';
  end if;
  if (select count(*) from public.dnd_actions where code = p_code) >= 400 then
    raise exception 'This table has reached its action limit.' using errcode = '22023';
  end if;
  insert into public.dnd_actions (code, character_index, character_name, user_id, text)
  values (p_code, p_character, ch->>'name', uid, cleaned);
end $$;

create or replace function public.dnd_edit_action(p_code text, p_id bigint, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.dnd_account();
  r public.dnd_rooms := public.dnd_live_room(p_code);
  cleaned text := btrim(coalesce(p_text, ''));
begin
  if char_length(cleaned) not between 1 and 1000 then
    raise exception 'Use 1 to 1000 characters.' using errcode = '22023';
  end if;
  update public.dnd_actions set text = cleaned
  where code = r.code and id = p_id and (user_id = uid or r.host_id = uid);
  if not found then
    raise exception 'Only the DM or the player who wrote it can change this.' using errcode = '42501';
  end if;
  delete from public.dnd_advice where code = r.code;
end $$;

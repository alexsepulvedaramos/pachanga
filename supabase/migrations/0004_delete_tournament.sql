-- Lets the creator (whoever holds the admin PIN) delete a tournament. Everything hanging off it
-- (secrets, subscriptions, sent notifications, PIN failures) goes with it through ON DELETE CASCADE.
-- Returns 1 when deleted, -1 wrong PIN, -3 locked, like save_tournament.

create or replace function public.delete_tournament(p_id text, p_pin text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  outcome text := public.check_tournament_pin(p_id, p_pin);
begin
  if outcome = 'locked' then
    return -3;
  elsif outcome = 'wrong' then
    return -1;
  end if;
  delete from public.tournaments where id = p_id;
  return 1;
end;
$$;

revoke all on function public.delete_tournament(text, text) from public;
grant execute on function public.delete_tournament(text, text) to anon, authenticated;

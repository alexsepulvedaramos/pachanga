-- Brute-force protection for the admin PIN: after 5 wrong PINs in 10 minutes a tournament stops
-- accepting PINs until the window passes.
--
-- save_tournament now reports failures as negative return codes instead of exceptions, because an
-- exception would roll back the recorded failed attempt and make the lockout bypassable.

create table public.tournament_pin_failures (
  tournament_id text not null references public.tournaments (id) on delete cascade,
  failed_at     timestamptz not null default now()
);
create index tournament_pin_failures_lookup on public.tournament_pin_failures (tournament_id, failed_at);
alter table public.tournament_pin_failures enable row level security;

-- Returns 'ok', 'wrong' or 'locked', recording failures and clearing them on success.
create or replace function public.check_tournament_pin(p_id text, p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_failures integer;
begin
  select count(*) into recent_failures
    from public.tournament_pin_failures
    where tournament_id = p_id and failed_at > now() - interval '10 minutes';
  if recent_failures >= 5 then
    return 'locked';
  end if;

  if exists (
    select 1 from public.tournament_secrets s
    where s.tournament_id = p_id and s.pin_hash = extensions.crypt(p_pin, s.pin_hash)
  ) then
    delete from public.tournament_pin_failures where tournament_id = p_id;
    return 'ok';
  end if;

  if exists (select 1 from public.tournaments where id = p_id) then
    insert into public.tournament_pin_failures (tournament_id) values (p_id);
  end if;
  return 'wrong';
end;
$$;

-- Same signature as before so the client keeps working; returns null when locked.
drop function if exists public.verify_tournament_pin(text, text);
create function public.verify_tournament_pin(p_id text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  outcome text := public.check_tournament_pin(p_id, p_pin);
begin
  return case outcome when 'ok' then true when 'wrong' then false else null end;
end;
$$;

-- Returns the new version, or -1 wrong PIN, -2 version conflict, -3 locked.
create or replace function public.save_tournament(
  p_id text, p_state jsonb, p_pin text, p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  outcome text := public.check_tournament_pin(p_id, p_pin);
  new_version integer;
begin
  if outcome = 'locked' then
    return -3;
  elsif outcome = 'wrong' then
    return -1;
  end if;
  update public.tournaments
    set state = p_state,
        name = coalesce(p_state ->> 'name', name),
        version = version + 1,
        updated_at = now()
    where id = p_id and version = p_expected_version
    returning version into new_version;
  return coalesce(new_version, -2);
end;
$$;

revoke all on function public.check_tournament_pin(text, text) from public, anon, authenticated;
revoke all on function public.verify_tournament_pin(text, text) from public;
revoke all on function public.save_tournament(text, jsonb, text, integer) from public;
grant execute on function public.verify_tournament_pin(text, text) to anon, authenticated;
grant execute on function public.save_tournament(text, jsonb, text, integer) to anon, authenticated;

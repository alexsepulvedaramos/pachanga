-- Tournaments are public to read (anyone with the code) and only writable through the RPCs below,
-- which check the admin PIN and the version the change was based on.

create extension if not exists pgcrypto with schema extensions;

create table public.tournaments (
  id          text primary key check (id ~ '^[A-Z0-9]{4,12}$'),
  name        text not null,
  state       jsonb not null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.tournament_secrets (
  tournament_id text primary key references public.tournaments (id) on delete cascade,
  pin_hash      text not null
);

alter table public.tournaments enable row level security;
alter table public.tournament_secrets enable row level security;

create policy "Tournaments are readable by anyone with the code"
  on public.tournaments for select
  to anon, authenticated
  using (true);

-- No policies on tournament_secrets: it is only reachable from the security definer functions.

create or replace function public.create_tournament(p_id text, p_name text, p_state jsonb, p_pin text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(coalesce(p_pin, '')) < 4 then
    raise exception 'PIN_TOO_SHORT';
  end if;
  insert into public.tournaments (id, name, state) values (p_id, p_name, p_state);
  insert into public.tournament_secrets (tournament_id, pin_hash)
    values (p_id, extensions.crypt(p_pin, extensions.gen_salt('bf')));
  return 1;
end;
$$;

create or replace function public.verify_tournament_pin(p_id text, p_pin text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tournament_secrets s
    where s.tournament_id = p_id and s.pin_hash = extensions.crypt(p_pin, s.pin_hash)
  );
$$;

create or replace function public.save_tournament(
  p_id text, p_state jsonb, p_pin text, p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_version integer;
begin
  if not public.verify_tournament_pin(p_id, p_pin) then
    raise exception 'WRONG_PIN';
  end if;
  update public.tournaments
    set state = p_state,
        name = coalesce(p_state ->> 'name', name),
        version = version + 1,
        updated_at = now()
    where id = p_id and version = p_expected_version
    returning version into new_version;
  if new_version is null then
    raise exception 'CONFLICT';
  end if;
  return new_version;
end;
$$;

revoke all on function public.create_tournament(text, text, jsonb, text) from public;
revoke all on function public.verify_tournament_pin(text, text) from public;
revoke all on function public.save_tournament(text, jsonb, text, integer) from public;
grant execute on function public.create_tournament(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.verify_tournament_pin(text, text) to anon, authenticated;
grant execute on function public.save_tournament(text, jsonb, text, integer) to anon, authenticated;

alter publication supabase_realtime add table public.tournaments;

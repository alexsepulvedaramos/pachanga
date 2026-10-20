-- Push notifications: devices subscribe for one participant of one tournament; every saved change
-- triggers the `notify` Edge Function, which works out who to tell and records what it sent.

create extension if not exists pg_net with schema extensions;

-- Settings the Edge Function and the trigger need (VAPID keys, the function URL and a shared
-- secret). The `private` schema is not exposed through the API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.settings (
  key   text primary key,
  value text not null
);

create table public.push_subscriptions (
  endpoint        text primary key,
  tournament_id   text not null references public.tournaments (id) on delete cascade,
  participant_id  text not null,
  p256dh          text not null,
  auth            text not null,
  created_at      timestamptz not null default now()
);
create index push_subscriptions_target on public.push_subscriptions (tournament_id, participant_id);
alter table public.push_subscriptions enable row level security;
-- No policies: devices go through the functions below.

create table private.push_sent (
  tournament_id text not null references public.tournaments (id) on delete cascade,
  key           text not null,
  sent_at       timestamptz not null default now(),
  primary key (tournament_id, key)
);

-- A device subscribes (or switches who it is) without the admin PIN: it can only ask to receive
-- notifications, never change the tournament.
create or replace function public.subscribe_push(
  p_tournament_id text, p_participant_id text, p_endpoint text, p_p256dh text, p_auth text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id
      and exists (select 1 from jsonb_array_elements(t.state -> 'participants') p where p ->> 'id' = p_participant_id)
  ) then
    raise exception 'UNKNOWN_PARTICIPANT';
  end if;
  if length(p_endpoint) > 1000 or p_endpoint !~ '^https://' then
    raise exception 'BAD_ENDPOINT';
  end if;
  insert into public.push_subscriptions (endpoint, tournament_id, participant_id, p256dh, auth)
  values (p_endpoint, p_tournament_id, p_participant_id, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set tournament_id = excluded.tournament_id,
        participant_id = excluded.participant_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end;
$$;

create or replace function public.unsubscribe_push(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.subscribe_push(text, text, text, text, text) from public;
revoke all on function public.unsubscribe_push(text) from public;
grant execute on function public.subscribe_push(text, text, text, text, text) to anon, authenticated;
grant execute on function public.unsubscribe_push(text) to anon, authenticated;

-- Calls the Edge Function after every change to a tournament's state.
create or replace function private.notify_tournament_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text := (select value from private.settings where key = 'notify_url');
  fn_secret text := (select value from private.settings where key = 'notify_secret');
begin
  if fn_url is not null and exists (select 1 from public.push_subscriptions where tournament_id = new.id) then
    perform net.http_post(
      url := fn_url,
      body := jsonb_build_object('tournament_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', fn_secret)
    );
  end if;
  return new;
end;
$$;

create trigger tournaments_notify
  after update on public.tournaments
  for each row
  when (old.state is distinct from new.state)
  execute function private.notify_tournament_change();

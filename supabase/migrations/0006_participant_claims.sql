-- Each name in a tournament belongs to one phone. The first phone that picks a name keeps it (tied
-- to a random token kept on that phone, the same one its Ballon d'Or ballot is tied to); nobody
-- else can pick it until that phone lets it go or the admin frees it. The tournament state lists
-- the names taken (not by whom), so every screen can grey them out live.

create table public.participant_claims (
  tournament_id  text not null references public.tournaments (id) on delete cascade,
  participant_id text not null,
  token_hash     text not null,
  claimed_at     timestamptz not null default now(),
  primary key (tournament_id, participant_id)
);
alter table public.participant_claims enable row level security;
-- No policies: only reachable from the functions below.

-- Rewrites state.claimed from the claims and bumps the version, so every screen updates.
create or replace function private.publish_claims(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tournaments
    set state = jsonb_set(
          state,
          '{claimed}',
          coalesce(
            (select jsonb_agg(c.participant_id order by c.participant_id)
               from public.participant_claims c where c.tournament_id = p_id),
            '[]'::jsonb
          )
        ),
        version = version + 1,
        updated_at = now()
    where id = p_id;
end;
$$;

-- Takes a name for the phone holding p_token, letting go of any other name that phone had in the
-- tournament. Returns 1 when taken now, 2 when the phone already had it, -5 unknown name or bad
-- token, -6 the name belongs to another phone. Does not publish: callers do, once.
create or replace function private.claim_participant(p_id text, p_participant text, p_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  owner text;
begin
  if length(coalesce(p_token, '')) < 16 or not exists (
    select 1 from public.tournaments t, jsonb_array_elements(t.state -> 'participants') p
    where t.id = p_id and p ->> 'id' = p_participant
  ) then
    return -5;
  end if;
  select c.token_hash into owner from public.participant_claims c
    where c.tournament_id = p_id and c.participant_id = p_participant;
  if owner is not null and owner <> token then
    return -6;
  elsif owner is not null then
    return 2;
  end if;
  delete from public.participant_claims c
    where c.tournament_id = p_id and c.token_hash = token and c.participant_id <> p_participant;
  insert into public.participant_claims (tournament_id, participant_id, token_hash)
    values (p_id, p_participant, token)
    on conflict (tournament_id, participant_id) do nothing;
  return 1;
end;
$$;

create or replace function public.claim_participant(p_id text, p_participant text, p_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  outcome integer;
begin
  perform 1 from public.tournaments where id = p_id for update;
  outcome := private.claim_participant(p_id, p_participant, p_token);
  if outcome = 1 then
    perform private.publish_claims(p_id);
  end if;
  return least(outcome, 1);
end;
$$;

-- The phone that holds a name lets it go, and with p_drop_vote also deletes the Ballon d'Or ballot
-- it cast under that name (while the vote is open). Returns 1, or -6 when this phone doesn't hold it.
create or replace function public.release_participant(p_id text, p_participant text, p_token text, p_drop_vote boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  released integer;
begin
  perform 1 from public.tournaments where id = p_id for update;
  delete from public.participant_claims c
    where c.tournament_id = p_id and c.participant_id = p_participant and c.token_hash = token;
  get diagnostics released = row_count;
  if released = 0 then
    return -6;
  end if;
  if p_drop_vote and private.ballon_dor_open(p_id) is not null then
    delete from public.ballon_dor_votes v
      where v.tournament_id = p_id and v.voter_id = p_participant and v.token_hash = token;
    perform private.publish_ballon_dor(p_id, false);
  end if;
  perform private.publish_claims(p_id);
  return 1;
end;
$$;

-- The admin frees a name, e.g. for someone with a new phone. Returns 1, -1 wrong PIN, -3 locked.
create or replace function public.admin_release_participant(p_id text, p_pin text, p_participant text)
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
  perform 1 from public.tournaments where id = p_id for update;
  delete from public.participant_claims c where c.tournament_id = p_id and c.participant_id = p_participant;
  perform private.publish_claims(p_id);
  return 1;
end;
$$;

-- Voting now goes through the name: the ballot is cast by the phone holding it (taking it first
-- if nobody has), so a ballot can't be cast under someone else's name.
create or replace function public.cast_ballon_dor_vote(p_id text, p_voter text, p_picks text[], p_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  st jsonb := private.ballon_dor_open(p_id);
  ids text[];
  changed integer;
  claimed integer;
begin
  if st is null then
    return -4;
  end if;
  select array_agg(p ->> 'id') into ids from jsonb_array_elements(st -> 'participants') p;
  if not (p_voter = any (ids))
     or coalesce(array_length(p_picks, 1), 0) <> 3
     or (select count(distinct x) from unnest(p_picks) x) <> 3
     or p_voter = any (p_picks)
     or not (p_picks <@ ids)
     or length(coalesce(p_token, '')) < 16 then
    return -5;
  end if;
  claimed := private.claim_participant(p_id, p_voter, p_token);
  if claimed < 1 then
    return claimed;
  end if;

  insert into public.ballon_dor_votes as v (tournament_id, voter_id, picks, token_hash)
  values (p_id, p_voter, p_picks, encode(extensions.digest(p_token, 'sha256'), 'hex'))
  on conflict (tournament_id, voter_id) do update
    set picks = excluded.picks
    where v.token_hash = excluded.token_hash;
  get diagnostics changed = row_count;
  if changed = 0 then
    return -6;
  end if;

  perform private.publish_claims(p_id);
  perform private.publish_ballon_dor(p_id, false);
  return 1;
end;
$$;

revoke all on function private.publish_claims(text) from public;
revoke all on function private.claim_participant(text, text, text) from public;
revoke all on function public.claim_participant(text, text, text) from public;
revoke all on function public.release_participant(text, text, text, boolean) from public;
revoke all on function public.admin_release_participant(text, text, text) from public;
grant execute on function public.claim_participant(text, text, text) to anon, authenticated;
grant execute on function public.release_participant(text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_release_participant(text, text, text) to anon, authenticated;

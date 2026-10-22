-- Ballon d'Or: when a tournament set up with `config.ballonDor` finishes, every participant votes a
-- podium (3, 2 and 1 points) without the admin PIN. Ballots live in their own table, out of reach
-- of the public, so the vote stays secret; the tournament state only shows who has voted until the
-- vote closes (by the admin, or once everybody has voted), and then publishes every ballot so the
-- app can count them with its own tiebreakers.
--
-- The first ballot of a participant is tied to a random token kept on the phone that cast it: only
-- that phone can change it, and the admin can delete it if someone voted pretending to be someone
-- else.

create table public.ballon_dor_votes (
  tournament_id text not null references public.tournaments (id) on delete cascade,
  voter_id      text not null,
  picks         text[] not null,
  token_hash    text not null,
  voted_at      timestamptz not null default now(),
  primary key (tournament_id, voter_id)
);
alter table public.ballon_dor_votes enable row level security;
-- No policies: only reachable from the functions below.

-- Rewrites state.ballonDor from the ballots and bumps the version, so every screen updates through
-- Realtime. Closes the vote when asked or when every participant has voted.
create or replace function private.publish_ballon_dor(p_id text, p_close boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  st jsonb;
  voters jsonb;
  ballots jsonb;
  vote_count integer;
  ballon jsonb;
begin
  select state into st from public.tournaments where id = p_id;
  select coalesce(jsonb_agg(v.voter_id order by v.voted_at, v.voter_id), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('voterId', v.voter_id, 'picks', to_jsonb(v.picks))
                            order by v.voted_at, v.voter_id), '[]'::jsonb),
         count(*)
    into voters, ballots, vote_count
    from public.ballon_dor_votes v
    where v.tournament_id = p_id;

  if p_close or vote_count >= jsonb_array_length(st -> 'participants') then
    ballon := jsonb_build_object(
      'voters', voters,
      'votes', ballots,
      'closedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  else
    ballon := jsonb_build_object('voters', voters);
  end if;

  update public.tournaments
    set state = jsonb_set(state, '{ballonDor}', ballon),
        version = version + 1,
        updated_at = now()
    where id = p_id;
end;
$$;

-- Locks the tournament row and says whether its vote is open.
create or replace function private.ballon_dor_open(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st jsonb;
begin
  select state into st from public.tournaments where id = p_id for update;
  if st is null
     or st ->> 'stage' is distinct from 'finished'
     or coalesce((st -> 'config' ->> 'ballonDor')::boolean, false) is false
     or (st -> 'ballonDor') ? 'closedAt' then
    return null;
  end if;
  return st;
end;
$$;

-- Returns 1 when counted, -4 the vote is not open, -5 an invalid ballot, -6 this participant's
-- ballot was cast from another phone.
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

  insert into public.ballon_dor_votes as v (tournament_id, voter_id, picks, token_hash)
  values (p_id, p_voter, p_picks, encode(extensions.digest(p_token, 'sha256'), 'hex'))
  on conflict (tournament_id, voter_id) do update
    set picks = excluded.picks
    where v.token_hash = excluded.token_hash;
  get diagnostics changed = row_count;
  if changed = 0 then
    return -6;
  end if;

  perform private.publish_ballon_dor(p_id, false);
  return 1;
end;
$$;

-- Closes the vote with the ballots cast so far. Returns 1, -1 wrong PIN, -3 locked, -4 not open.
create or replace function public.close_ballon_dor(p_id text, p_pin text)
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
  if private.ballon_dor_open(p_id) is null then
    return -4;
  end if;
  perform private.publish_ballon_dor(p_id, true);
  return 1;
end;
$$;

-- Deletes a participant's ballot so they can vote again. Returns 1, -1 wrong PIN, -3 locked, -4 not open.
create or replace function public.reset_ballon_dor_vote(p_id text, p_pin text, p_voter text)
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
  if private.ballon_dor_open(p_id) is null then
    return -4;
  end if;
  delete from public.ballon_dor_votes where tournament_id = p_id and voter_id = p_voter;
  perform private.publish_ballon_dor(p_id, false);
  return 1;
end;
$$;

revoke all on function private.publish_ballon_dor(text, boolean) from public;
revoke all on function private.ballon_dor_open(text) from public;
revoke all on function public.cast_ballon_dor_vote(text, text, text[], text) from public;
revoke all on function public.close_ballon_dor(text, text) from public;
revoke all on function public.reset_ballon_dor_vote(text, text, text) from public;
grant execute on function public.cast_ballon_dor_vote(text, text, text[], text) to anon, authenticated;
grant execute on function public.close_ballon_dor(text, text) to anon, authenticated;
grant execute on function public.reset_ballon_dor_vote(text, text, text) to anon, authenticated;

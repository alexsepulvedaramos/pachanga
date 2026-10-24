import { describe, expect, it } from 'vitest';
import { loserOf, semiFinalists } from './knockout';
import { Rng, seededRng } from './rng';
import { Goal, Match, Tournament } from './types';
import {
  champions,
  choosePartner,
  createTournament,
  currentDecision,
  DEFAULT_CONFIG,
  drawPartner,
  finishDraw,
  isSolo,
  lineup,
  makeChoice,
  nextMatch,
  partnerPool,
  pendingPartnerChoice,
  recordResult,
  spin,
  startMatch,
  TournamentError,
} from './tournament';

const CLUBS = ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool', 'Barça', 'Arsenal'];

function drawn(players: number, seed: number, rng: Rng): Tournament {
  let t = createTournament({
    id: 'test',
    name: 'Test Cup',
    participantNames: Array.from({ length: players }, (_, i) => `Player ${i + 1}`),
    clubs: CLUBS.slice(0, Math.ceil(players / 2)),
    config: { ...DEFAULT_CONFIG, trackScorers: true, soloPartner: 'bestEliminated', seed },
  });
  while (t.draw.picks.length < t.participants.length) t = spin(t, rng).tournament;
  return finishDraw(t, rng);
}

const playoffOver = (t: Tournament) => {
  const playoff = t.matches.filter((m) => m.phase === 'playoff');
  return playoff.length > 0 && playoff.every((m) => m.status === 'done');
};

const throughToSemis = (t: Tournament, teamId: string) => !!semiFinalists(t.groupRanking!, t.matches)?.includes(teamId);

/**
 * Plays until the playoff is over. Group matches have no goal
 * scorers; in the first knockout round the home side wins 2–1, the winners' goal by its first
 * player and the losers' by its second, so each loser has one clear top scorer.
 */
function untilSemis(t: Tournament, rng: Rng): Tournament {
  let next = t;
  for (let guard = 0; guard < 100 && !playoffOver(next); guard++) {
    const decision = currentDecision(next);
    if (decision) {
      if (decision.kind === 'playoffOpponent') next = makeChoice(next, { playoffOpponentId: decision.options[0] });
      if (decision.kind === 'playoffOrder') next = makeChoice(next, { playoffChooserFirst: true });
      continue;
    }
    const m = nextMatch(next)!;
    next = startMatch(next, m.id, rng);
    const first = m.phase === 'playoff' || m.phase === 'quarter';
    const goals: Goal[] = first
      ? [
          { teamId: m.homeId, scorerId: lineup(next, m, m.homeId)[0] },
          { teamId: m.homeId, scorerId: lineup(next, m, m.homeId)[0] },
          { teamId: m.awayId, scorerId: lineup(next, m, m.awayId)[1] },
        ]
      : [];
    next = recordResult(next, m.id, first ? { homeGoals: 2, awayGoals: 1, goals } : { homeGoals: 1, awayGoals: 0 });
  }
  return next;
}

/** A tournament of 11 players (6 teams, playoff) stopped at the semis with the solo team in them. */
function soloInSemis(prepare: (t: Tournament) => Tournament = (t) => t): { t: Tournament; solo: string } {
  for (let seed = 1; seed <= 60; seed++) {
    const rng = seededRng(seed);
    const t = untilSemis(prepare(drawn(11, seed, rng)), rng);
    const solo = t.teams.find((x) => isSolo(t, x.id))!;
    if (throughToSemis(t, solo.id)) return { t, solo: solo.id };
  }
  throw new Error('No seed sent the solo team to the semi-finals');
}

/** The same tournament before the solo team was given its partner. */
const unassigned = (t: Tournament): Tournament => ({
  ...t,
  teams: t.teams.map(({ knockoutPartnerId: _, ...team }) => team),
});

describe('the solo player’s partner from the semi-finals', () => {
  it('is the top scorer of the best-ranked team knocked out in the playoff', () => {
    const { t, solo } = soloInSemis();
    const losers = t.matches.filter((m) => m.phase === 'playoff').map((m) => loserOf(m)!);
    const best = [...losers].sort((a, b) => t.groupRanking!.indexOf(a) - t.groupRanking!.indexOf(b))[0];
    const scorer = t.matches
      .filter((m) => m.phase === 'playoff' && m.awayId === best)
      .flatMap((m) => m.goals!.filter((g) => g.teamId === best).map((g) => g.scorerId))[0];
    expect(t.teams.find((x) => x.id === solo)!.knockoutPartnerId).toBe(scorer);
    expect(t.teams.find((x) => x.id === best)!.memberIds).toContain(scorer);
    expect(partnerPool(unassigned(t))).toMatchObject({ fromTeamId: best, playerIds: [scorer], goals: 1 });
    expect(pendingPartnerChoice(t)).toBeNull();
  });

  it('is the same one for the semi-final and the final or third place, and not a champion', () => {
    const { t: start, solo } = soloInSemis();
    const rng = seededRng(9);
    let t = start;
    const partner = t.teams.find((x) => x.id === solo)!.knockoutPartnerId!;
    while (t.stage !== 'finished') {
      const decision = currentDecision(t);
      if (decision) {
        if (decision.kind === 'semiOpponent') t = makeChoice(t, { semiOpponentId: decision.options[0] });
        if (decision.kind === 'semiOrder') t = makeChoice(t, { semiChooserFirst: false });
        continue;
      }
      const m = nextMatch(t)!;
      t = startMatch(t, m.id, rng);
      const played = t.matches.find((x) => x.id === m.id) as Match;
      if ([m.homeId, m.awayId].includes(solo)) {
        expect(lineup(t, played, solo)).toContain(partner);
        expect(played.standIns?.[solo]).toBeUndefined();
      }
      t = recordResult(t, m.id, { homeGoals: 1, awayGoals: 0 });
    }
    expect(champions(t)).not.toContain(partner);
  });

  it('waits for the admin when the two players of that team are level', () => {
    // Nobody scores, so both players of the best eliminated team are tied on zero goals.
    const rng = seededRng(3);
    let found: { t: Tournament; solo: string } | null = null;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      let t = drawn(11, seed, seededRng(seed));
      for (let guard = 0; guard < 100 && !playoffOver(t); guard++) {
        const decision = currentDecision(t);
        if (decision) {
          if (decision.kind === 'playoffOpponent') t = makeChoice(t, { playoffOpponentId: decision.options[0] });
          if (decision.kind === 'playoffOrder') t = makeChoice(t, { playoffChooserFirst: true });
          continue;
        }
        const m = nextMatch(t)!;
        t = recordResult(startMatch(t, m.id, rng), m.id, { homeGoals: 1, awayGoals: 0 });
      }
      const solo = t.teams.find((x) => isSolo(t, x.id))!;
      if (throughToSemis(t, solo.id)) found = { t, solo: solo.id };
    }
    const { t, solo } = found!;
    const waiting = pendingPartnerChoice(t)!;
    expect(waiting.teamId).toBe(solo);
    expect(waiting.playerIds).toHaveLength(2);
    expect(t.teams.find((x) => x.id === solo)!.knockoutPartnerId).toBeUndefined();

    expect(() => choosePartner(t, 'nobody')).toThrow(TournamentError);

    // The semi-finals can be set up meanwhile, but the solo team's cannot start.
    let ready = t;
    for (let decision = currentDecision(ready); decision; decision = currentDecision(ready)) {
      ready = makeChoice(ready, decision.kind === 'semiOpponent' ? { semiOpponentId: decision.options[0] } : { semiChooserFirst: false });
    }
    const semi = ready.matches.find((m) => m.phase === 'semi' && [m.homeId, m.awayId].includes(solo))!;
    expect(() => startMatch(ready, semi.id, rng)).toThrow(TournamentError);
    expect(lineup(startMatch(choosePartner(ready, waiting.playerIds[1]), semi.id, rng), semi, solo)).toContain(waiting.playerIds[1]);

    const [first, second] = waiting.playerIds;
    const chosen = choosePartner(t, second);
    expect(chosen.teams.find((x) => x.id === solo)!.knockoutPartnerId).toBe(second);
    expect(pendingPartnerChoice(chosen)).toBeNull();

    const luck = drawPartner(t, seededRng(5));
    expect([first, second]).toContain(luck.teams.find((x) => x.id === solo)!.knockoutPartnerId);
    expect(() => drawPartner(luck, rng)).toThrow(TournamentError);
  });

  it('skips a player the admin kept out of the stand-in draw', () => {
    const t = unassigned(soloInSemis().t);
    const pool = partnerPool(t)!;
    const other = t.teams.find((x) => x.id === pool.fromTeamId)!.memberIds.find((id) => id !== pool.playerIds[0])!;
    const kept = { ...t, participants: t.participants.map((p) => (p.id === pool.playerIds[0] ? { ...p, noStandIn: true } : p)) };
    expect(partnerPool(kept)!.playerIds).toEqual([other]);
  });

  it('leaves the draw in charge when nobody is knocked out before the semi-finals', () => {
    const rng = seededRng(2);
    let t = drawn(7, 2, rng);
    while (t.stage === 'groups') {
      const m = nextMatch(t)!;
      t = recordResult(startMatch(t, m.id, rng), m.id, { homeGoals: 1, awayGoals: 0 });
    }
    expect(partnerPool(t)).toBeNull();
    const solo = t.teams.find((x) => isSolo(t, x.id))!;
    const semi = t.matches.find((m) => m.phase === 'semi' && [m.homeId, m.awayId].includes(solo.id))!;
    expect(startMatch(t, semi.id, rng).matches.find((m) => m.id === semi.id)!.standIns?.[solo.id]).toBeTruthy();
  });

  it('keeps drawing a stand-in when the rule is not asked for', () => {
    const rng = seededRng(4);
    const base = drawn(11, 4, rng);
    const t = untilSemis({ ...base, config: { ...base.config, soloPartner: 'draw' } }, rng);
    expect(t.teams.every((x) => !x.knockoutPartnerId)).toBe(true);
    expect(pendingPartnerChoice(t)).toBeNull();
  });
});

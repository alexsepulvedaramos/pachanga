import { describe, expect, it } from 'vitest';
import { seededRng, Rng } from './rng';
import { backToBackCount, buildGroupSchedule } from './schedule';
import { computeStandings } from './standings';
import { nextKnockoutMatches, pendingDecision, winnerOf } from './knockout';
import { Match, Tournament } from './types';
import {
  champions,
  createTournament,
  currentDecision,
  DEFAULT_CONFIG,
  disqualify,
  estimatedRemainingMinutes,
  finishDraw,
  isSolo,
  lineup,
  makeChoice,
  nextMatch,
  recordResult,
  reopenMatch,
  spin,
  startMatch,
  totalMatchCount,
  TournamentError,
  wheelEntries,
} from './tournament';

const CLUBS = ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool', 'Barça'];

function newTournament(players: number, seed = 1): Tournament {
  return createTournament({
    id: 'test',
    name: 'Test Cup',
    participantNames: Array.from({ length: players }, (_, i) => `Player ${i + 1}`),
    clubs: CLUBS.slice(0, Math.ceil(players / 2)),
    config: { ...DEFAULT_CONFIG, seed },
  });
}

function drawAll(t: Tournament, rng: Rng): Tournament {
  let next = t;
  while (next.draw.picks.length < next.participants.length) next = spin(next, rng).tournament;
  return finishDraw(next, rng);
}

function randomResult(m: Match, rng: Rng) {
  const homeGoals = Math.floor(rng() * 5);
  const awayGoals = Math.floor(rng() * 5);
  const level = homeGoals === awayGoals;
  return {
    homeGoals,
    awayGoals,
    homePens: m.phase !== 'group' && level ? 5 : null,
    awayPens: m.phase !== 'group' && level ? 4 : null,
  };
}

/** Plays a whole tournament, taking the first option whenever someone has to choose. */
function playThrough(t: Tournament, rng: Rng): Tournament {
  let next = t;
  for (let guard = 0; guard < 100 && next.stage !== 'finished'; guard++) {
    const decision = currentDecision(next);
    if (decision) {
      if (decision.kind === 'playoffOpponent') next = makeChoice(next, { playoffOpponentId: decision.options[0] });
      if (decision.kind === 'playoffOrder') next = makeChoice(next, { playoffChooserFirst: true });
      if (decision.kind === 'semiOpponent') next = makeChoice(next, { semiOpponentId: decision.options[0] });
      if (decision.kind === 'semiOrder') next = makeChoice(next, { semiChooserFirst: false });
      continue;
    }
    const m = nextMatch(next)!;
    next = startMatch(next, m.id, rng);
    next = recordResult(next, m.id, randomResult(m, rng));
  }
  return next;
}

describe('group schedule', () => {
  for (const teams of [5, 6, 7]) {
    it(`pairs everyone once with nobody playing twice in a row (${teams} teams)`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const ids = Array.from({ length: teams }, (_, i) => `t${i}`);
        const matches = buildGroupSchedule(ids, seededRng(seed));
        expect(matches).toHaveLength((teams * (teams - 1)) / 2);
        const pairs = new Set(matches.map((m) => [m.homeId, m.awayId].sort().join('-')));
        expect(pairs.size).toBe(matches.length);
        expect(backToBackCount(matches)).toBe(0);
      }
    });
  }

  it('balances home games', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const matches = buildGroupSchedule(ids, seededRng(7));
    for (const id of ids) {
      const home = matches.filter((m) => m.homeId === id).length;
      expect(home === 2 || home === 3).toBe(true);
    }
  });
});

describe('standings', () => {
  const done = (homeId: string, awayId: string, homeGoals: number, awayGoals: number): Match => ({
    id: `${homeId}${awayId}`,
    phase: 'group',
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    status: 'done',
  });

  // a and b both on 6 points; b has the better goal difference, a won the head-to-head.
  const matches = [
    done('a', 'b', 1, 0),
    done('a', 'c', 0, 1),
    done('a', 'd', 1, 0),
    done('b', 'c', 5, 0),
    done('b', 'd', 3, 0),
    done('c', 'd', 0, 0),
  ];

  it('scores 3/1/0 and orders by the configured criteria', () => {
    const table = computeStandings(['a', 'b', 'c', 'd'], matches, ['goalDifference'], 1);
    expect(table.map((r) => r.teamId)).toEqual(['b', 'a', 'c', 'd']);
    expect(table[0]).toMatchObject({ points: 6, won: 2, lost: 1, goalsFor: 8, goalsAgainst: 1 });
    expect(table[2]).toMatchObject({ points: 4, drawn: 1 });
  });

  it('respects the order chosen at setup', () => {
    const table = computeStandings(['a', 'b', 'c', 'd'], matches, ['headToHeadPoints', 'goalDifference'], 1);
    expect(table.map((r) => r.teamId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('settles an unbreakable tie by the seeded lot', () => {
    const first = computeStandings(['x', 'y'], [], ['goalDifference', 'lot'], 3).map((r) => r.teamId);
    expect(first).toHaveLength(2);
    expect(computeStandings(['x', 'y'], [], ['goalDifference', 'lot'], 3).map((r) => r.teamId)).toEqual(first);
  });
});

describe('knockout', () => {
  const ranking = ['s1', 's2', 's3', 's4', 's5', 's6'];

  it('lets the 3rd pick the playoff opponent and the 4th pick the order', () => {
    expect(pendingDecision(ranking, {}, [])).toEqual({
      kind: 'playoffOpponent',
      chooserId: 's3',
      options: ['s4', 's5', 's6'],
    });
    expect(pendingDecision(ranking, { playoffOpponentId: 's6' }, [])).toEqual({
      kind: 'playoffOrder',
      chooserId: 's4',
    });
    const later = nextKnockoutMatches(ranking, { playoffOpponentId: 's6', playoffChooserFirst: false }, []);
    expect(later.map((m) => [m.homeId, m.awayId])).toEqual([
      ['s3', 's6'],
      ['s4', 's5'],
    ]);
    const first = nextKnockoutMatches(ranking, { playoffOpponentId: 's6', playoffChooserFirst: true }, []);
    expect(first.map((m) => [m.homeId, m.awayId])).toEqual([
      ['s4', 's5'],
      ['s3', 's6'],
    ]);
  });

  it('uses penalties to decide level knockout matches', () => {
    const m: Match = {
      id: 'x', phase: 'semi', homeId: 'a', awayId: 'b', status: 'done',
      homeGoals: 2, awayGoals: 2, homePens: 3, awayPens: 4,
    };
    expect(winnerOf(m)).toBe('b');
  });
});

describe('full tournament', () => {
  for (const players of [10, 11, 12, 13, 14]) {
    it(`runs from the draw to the champion with ${players} players`, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const rng = seededRng(seed);
        let t = drawAll(newTournament(players, seed), rng);
        const teams = Math.ceil(players / 2);
        expect(t.teams).toHaveLength(teams);
        expect(t.teams.filter((x) => x.memberIds.length === 1)).toHaveLength(players % 2);

        t = playThrough(t, rng);
        expect(t.stage).toBe('finished');
        expect(t.matches).toHaveLength(totalMatchCount(teams));
        expect(champions(t)).toHaveLength(2);
        expect(estimatedRemainingMinutes(t)).toBe(0);

        for (const m of t.matches) {
          const home = lineup(t, m, m.homeId);
          const away = lineup(t, m, m.awayId);
          expect(home).toHaveLength(2);
          expect(away).toHaveLength(2);
          expect(new Set([...home, ...away]).size).toBe(4);
        }
      }
    });
  }

  it('gives the solo player a fixed knockout partner from the eliminated players', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = seededRng(seed);
      const t = playThrough(drawAll(newTournament(11, seed), rng), rng);
      const solo = t.teams.find((x) => isSolo(t, x.id))!;
      const semi = t.matches.find((m) => m.phase === 'semi' && [m.homeId, m.awayId].includes(solo.id));
      if (!semi) continue;
      const eliminated = t.matches
        .filter((m) => m.phase === 'playoff')
        .map((m) => (winnerOf(m) === m.homeId ? m.awayId : m.homeId));
      const pool = t.teams.filter((x) => eliminated.includes(x.id)).flatMap((x) => x.memberIds);
      expect(pool).toContain(solo.knockoutPartnerId);
      return;
    }
    throw new Error('No seed sent the solo team to the semi-finals');
  });

  it('draws one leftover wheel entry with an odd number of players', () => {
    const rng = seededRng(4);
    let t = newTournament(11);
    expect(wheelEntries(t)).toHaveLength(12);
    while (t.draw.picks.length < 11) t = spin(t, rng).tournament;
    expect(wheelEntries(t)).toHaveLength(1);
  });

  it('refuses to edit a group result once the knockout has started', () => {
    const rng = seededRng(2);
    let t = drawAll(newTournament(12), rng);
    while (t.stage === 'groups') {
      const m = nextMatch(t)!;
      t = recordResult(t, m.id, randomResult(m, rng));
    }
    expect(() => reopenMatch(t, 'g1')).toThrow(TournamentError);
  });

  it('requires a penalty winner for a level knockout match', () => {
    const rng = seededRng(2);
    let t = playThrough(drawAll(newTournament(12), rng), rng);
    expect(t.stage).toBe('finished');
    t = { ...t, stage: 'knockout', matches: t.matches.map((m) => (m.phase === 'final' ? { ...m, status: 'pending' } : m)) };
    expect(() => recordResult(t, 'final', { homeGoals: 1, awayGoals: 1 })).toThrow(TournamentError);
  });

  it('turns the partner of an injured player into a solo player who gets stand-ins', () => {
    const rng = seededRng(5);
    let t = drawAll(newTournament(12), rng);
    const injured = t.teams[0].memberIds[0];
    t = disqualify(t, injured);
    expect(isSolo(t, t.teams[0].id)).toBe(true);
    t = playThrough(t, rng);
    expect(t.stage).toBe('finished');
    for (const m of t.matches) {
      const players = [...lineup(t, m, m.homeId), ...lineup(t, m, m.awayId)];
      expect(players).not.toContain(injured);
      expect(new Set(players).size).toBe(4);
    }
  });

  it('rejects participant counts outside the supported range', () => {
    expect(() => newTournament(9)).toThrow(TournamentError);
    expect(() => newTournament(15)).toThrow(TournamentError);
  });
});

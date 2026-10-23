import { describe, expect, it } from 'vitest';
import { seededRng, Rng } from './rng';
import { backToBackCount, buildGroupSchedule } from './schedule';
import { computeStandings } from './standings';
import { knockoutFormat, nextKnockoutMatches, pendingDecision, podium, winnerOf } from './knockout';
import { Match, Tournament } from './types';
import {
  assignClub,
  champions,
  myTurn,
  playsIn,
  nextToSpin,
  unavailableFor,
  createTournament,
  currentDecision,
  DEFAULT_CONFIG,
  defaultHalfMinutes,
  groupMatches,
  disqualify,
  estimatedRemainingMinutes,
  finishDraw,
  isSolo,
  moveMember,
  renameClub,
  reportResult,
  playerStartMatch,
  swapMembers,
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

const CLUBS = ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool', 'Barça', 'Arsenal'];

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

  it('does not let the group winner pick the 2nd as their semi-final opponent', () => {
    const matches = ['po1', 'po2'].map((id, i) => ({
      id,
      phase: 'playoff' as const,
      homeId: i ? 's4' : 's3',
      awayId: i ? 's5' : 's6',
      status: 'done' as const,
      homeGoals: 1,
      awayGoals: 0,
    }));
    const decision = pendingDecision(ranking, { playoffOpponentId: 's6', playoffChooserFirst: true }, matches);
    expect(decision).toEqual({ kind: 'semiOpponent', chooserId: 's1', options: ['s3', 's4'] });
  });

  it('lets the 3rd semi-finalist pick which semi-final goes first', () => {
    const matches = ['po1', 'po2'].map((id, i) => ({
      id,
      phase: 'playoff' as const,
      homeId: i ? 's4' : 's3',
      awayId: i ? 's5' : 's6',
      status: 'done' as const,
      homeGoals: 1,
      awayGoals: 0,
    }));
    // The playoff winners are the 3rd and the 4th: the 3rd of the four semi-finalists is the 3rd.
    const choices = { playoffOpponentId: 's6', playoffChooserFirst: true, semiOpponentId: 's4' };
    expect(pendingDecision(ranking, choices, matches)).toEqual({ kind: 'semiOrder', chooserId: 's3' });
  });

  it('lets the 3rd pick the playoff opponent and the 5th pick the order', () => {
    expect(pendingDecision(ranking, {}, [])).toEqual({
      kind: 'playoffOpponent',
      chooserId: 's3',
      // The 4th can't be picked: it plays whoever is left.
      options: ['s5', 's6'],
    });
    expect(pendingDecision(ranking, { playoffOpponentId: 's6' }, [])).toEqual({
      kind: 'playoffOrder',
      chooserId: 's5',
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
  for (const players of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
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

  it('rules a sent-off or injured footballer out of their club’s next match, but not the final', () => {
    const rng = seededRng(8);
    let t = drawAll(newTournament(12), rng);
    const first = nextMatch(t)!;
    const club = first.homeId;
    t = recordResult(t, first.id, {
      homeGoals: 1,
      awayGoals: 0,
      incidents: [{ teamId: club, player: 'Mohamed Salah', kind: 'redCard' }],
    });

    const clubMatches = t.matches.filter((m) => [m.homeId, m.awayId].includes(club));
    const [, next, afterNext] = clubMatches;
    expect(unavailableFor(t, next)).toEqual([{ teamId: club, player: 'Mohamed Salah', kind: 'redCard' }]);
    // The people holding the controllers are not affected.
    expect(lineup(t, next, club)).toHaveLength(2);
    // Matches before the club plays again are unaffected, and so is the one after.
    for (const m of t.matches.slice(1, t.matches.indexOf(next))) {
      expect(unavailableFor(t, m).filter((x) => x.teamId === club)).toEqual([]);
    }
    expect(unavailableFor(t, afterNext)).toEqual([]);
  });

  it('never rules anyone out of the final', () => {
    const rng = seededRng(3);
    let t = playThrough(drawAll(newTournament(12), rng), rng);
    const final = t.matches.find((m) => m.phase === 'final')!;
    const semi = t.matches.find((m) => m.phase === 'semi' && [m.homeId, m.awayId].includes(final.homeId))!;
    t = {
      ...t,
      matches: t.matches.map((m) =>
        m.id === semi.id ? { ...m, incidents: [{ teamId: final.homeId, player: 'Vini Jr.', kind: 'injury' }] } : m,
      ),
    };
    expect(unavailableFor(t, final)).toEqual([]);
  });

  it('rejects incidents for clubs that are not in the match', () => {
    const rng = seededRng(2);
    const t = drawAll(newTournament(12), rng);
    const m = nextMatch(t)!;
    const other = t.teams.find((x) => x.id !== m.homeId && x.id !== m.awayId)!.id;
    expect(() =>
      recordResult(t, m.id, { homeGoals: 0, awayGoals: 0, incidents: [{ teamId: other, player: 'X', kind: 'injury' }] }),
    ).toThrow(TournamentError);
  });

  it('assigns pairs by hand as an alternative to the wheel', () => {
    let t = newTournament(11);
    const ids = t.participants.map((p) => p.id);
    t.clubs.forEach((club, i) => {
      t = assignClub(t, ids[i * 2], club);
      if (ids[i * 2 + 1]) t = assignClub(t, ids[i * 2 + 1], club);
    });
    expect(() => assignClub(t, ids[0], t.clubs[1])).toThrow(TournamentError);
    t = assignClub(t, ids[0], null);
    expect(nextToSpin(t)?.id).toBe(ids[0]);
    t = assignClub(t, ids[0], t.clubs[0]);
    t = finishDraw(t, seededRng(1));
    expect(t.teams.map((x) => x.memberIds.length).sort()).toEqual([1, 2, 2, 2, 2, 2]);
  });

  it('tells each participant when they play next', () => {
    const rng = seededRng(6);
    let t = drawAll(newTournament(12), rng);
    const first = nextMatch(t)!;
    const playing = t.teams.find((x) => x.id === first.homeId)!.memberIds[0];
    expect(myTurn(t, playing)).toMatchObject({ kind: 'now', match: { id: first.id } });

    const resting = t.participants.find((p) => !playsIn(t, first, p.id))!.id;
    const turn = myTurn(t, resting);
    expect(turn.kind).toBe('later');
    if (turn.kind === 'later') {
      expect(turn.matchesBefore).toBe(t.matches.indexOf(turn.match));
      expect(turn.minutes).toBe(turn.matchesBefore * 13);
    }

    t = playThrough(t, rng);
    expect(myTurn(t, playing).kind).toBe('done');
  });

  it('reports eliminated players as done and qualified ones as waiting', () => {
    const rng = seededRng(4);
    let t = drawAll(newTournament(12), rng);
    while (t.stage === 'groups') {
      const m = nextMatch(t)!;
      t = recordResult(t, m.id, randomResult(m, rng));
    }
    // Playoff not created yet: the 3rd still has to choose an opponent.
    const winner = t.teams.find((x) => x.id === t.groupRanking![0])!.memberIds[0];
    expect(myTurn(t, winner).kind).toBe('waiting');
    const decision = currentDecision(t);
    if (decision?.kind !== 'playoffOpponent') throw new Error('Expected the playoff opponent choice');
    t = makeChoice(t, { playoffOpponentId: decision.options[0] });
    t = makeChoice(t, { playoffChooserFirst: true });
    for (const m of t.matches.filter((x) => x.phase === 'playoff')) {
      t = recordResult(t, m.id, { homeGoals: 2, awayGoals: 0 });
    }
    const playoffLoser = t.matches.find((m) => m.phase === 'playoff')!.awayId;
    const loserPlayer = t.teams.find((x) => x.id === playoffLoser)!.memberIds[0];
    expect(myTurn(t, loserPlayer).kind).toBe('done');
    expect(myTurn(t, winner).kind).toBe('waiting');
  });

});

describe('tournament sizes', () => {
  const finishGroups = (t: Tournament, rng: Rng) => {
    let next = t;
    while (next.stage === 'groups') {
      const m = nextMatch(next)!;
      next = recordResult(next, m.id, randomResult(m, rng));
    }
    return next;
  };
  const pairOf = (m: Match) => [m.homeId, m.awayId];

  it('plays a double round-robin with 3 teams, home and away, then 2nd vs 3rd for the final', () => {
    const rng = seededRng(3);
    let t = drawAll(newTournament(6), rng);
    const groups = groupMatches(t);
    expect(groups).toHaveLength(6);
    for (const m of groups) {
      const back = groups.find((x) => x.homeId === m.awayId && x.awayId === m.homeId);
      expect(back).toBeDefined();
    }

    t = finishGroups(t, rng);
    const [first, second, third] = t.groupRanking!;
    expect(t.matches.filter((m) => m.phase === 'semi').map(pairOf)).toEqual([[second, third]]);
    expect(currentDecision(t)).toBeNull();

    t = playThrough(t, rng);
    expect(t.stage).toBe('finished');
    expect(t.matches.some((m) => m.phase === 'third')).toBe(false);
    expect(t.matches.find((m) => m.phase === 'final')!.homeId).toBe(first);
    expect(podium(t.matches)).toHaveLength(3);
    expect(t.matches).toHaveLength(8);
  });

  it('plays fixed semi-finals 1st vs 4th and 2nd vs 3rd with 4 teams', () => {
    const rng = seededRng(4);
    let t = finishGroups(drawAll(newTournament(8), rng), rng);
    expect(groupMatches(t)).toHaveLength(12);
    const [a, b, c, d] = t.groupRanking!;
    expect(t.matches.filter((m) => m.phase === 'semi').map(pairOf)).toEqual([[a, d], [b, c]]);
    expect(currentDecision(t)).toBeNull();
    t = playThrough(t, rng);
    expect(t.matches).toHaveLength(16);
  });

  it('plays quarter-finals 1–8, 4–5, 2–7, 3–6 with 8 teams and seeds the semis from them', () => {
    const rng = seededRng(5);
    let t = finishGroups(drawAll(newTournament(16), rng), rng);
    expect(groupMatches(t)).toHaveLength(28);
    const r = t.groupRanking!;
    const quarters = t.matches.filter((m) => m.phase === 'quarter');
    expect(quarters.map(pairOf)).toEqual([[r[0], r[7]], [r[3], r[4]], [r[1], r[6]], [r[2], r[5]]]);

    t = playThrough(t, rng);
    const [qf1, qf2, qf3, qf4] = quarters.map((m) => winnerOf(t.matches.find((x) => x.id === m.id)!)!);
    const semis = t.matches.filter((m) => m.phase === 'semi').map((m) => new Set(pairOf(m)));
    expect(semis).toEqual([new Set([qf1, qf2]), new Set([qf3, qf4])]);
    expect(t.matches).toHaveLength(36);
  });

  it('plays the group at 4-minute halves by default with 8 teams', () => {
    expect(defaultHalfMinutes(8).group).toBe(4);
    expect(defaultHalfMinutes(6).group).toBe(5);
  });

  it('estimates every match before the draw', () => {
    for (const players of [6, 8, 10, 12, 16]) {
      const t = newTournament(players);
      const teams = Math.ceil(players / 2);
      const perMatch = (half: number) => half * 2 + DEFAULT_CONFIG.changeoverMinutes;
      expect(estimatedRemainingMinutes(t)).toBeGreaterThanOrEqual(totalMatchCount(teams) * perMatch(4));
      expect(knockoutFormat(teams)).toBeDefined();
    }
  });

  it('refuses fewer than 6 or more than 16 players', () => {
    expect(() => newTournament(5)).toThrow(TournamentError);
    expect(() => createTournament({
      id: 'x', name: 'x',
      participantNames: Array.from({ length: 17 }, (_, i) => `P${i}`),
      clubs: [...CLUBS, 'Napoli'],
      config: { ...DEFAULT_CONFIG, seed: 1 },
    })).toThrow(TournamentError);
  });
});

describe('editing pairs', () => {
  const ready = (players: number) => {
    const rng = seededRng(9);
    return drawAll(newTournament(players), rng);
  };

  it('swaps two players between pairs', () => {
    const t = ready(12);
    const [a] = t.teams[0].memberIds;
    const [b] = t.teams[1].memberIds;
    const next = swapMembers(t, a, b);
    expect(next.teams[0].memberIds).toContain(b);
    expect(next.teams[1].memberIds).toContain(a);
    expect(next.teams[0].memberIds).toHaveLength(2);
  });

  it('moves a player into the solo player’s team and leaves the other one solo', () => {
    const t = ready(11);
    const solo = t.teams.find((x) => x.memberIds.length === 1)!;
    const pair = t.teams.find((x) => x.memberIds.length === 2)!;
    const next = moveMember(t, pair.memberIds[0], solo.id);
    expect(isSolo(next, solo.id)).toBe(false);
    expect(isSolo(next, pair.id)).toBe(true);
    expect(() => moveMember(next, pair.memberIds[1], solo.id)).toThrow(TournamentError);
  });

  it('renames a club and keeps names unique', () => {
    const t = ready(12);
    const next = renameClub(t, t.teams[0].id, 'Napoli');
    expect(next.teams[0].club).toBe('Napoli');
    expect(next.clubs).toContain('Napoli');
    expect(next.clubs).not.toContain(t.teams[0].club);
    expect(() => renameClub(next, t.teams[1].id, 'napoli')).toThrow(TournamentError);
  });

  it('waits for the live match to finish', () => {
    const t = ready(12);
    const live = startMatch(t, nextMatch(t)!.id, seededRng(1));
    expect(() => swapMembers(live, t.teams[0].memberIds[0], t.teams[1].memberIds[0])).toThrow(TournamentError);
  });
});

describe('results entered by players', () => {
  const live = () => {
    const rng = seededRng(4);
    const t = drawAll(newTournament(8, 4), rng);
    const m = nextMatch(t)!;
    return { t: startMatch(t, m.id, rng), m };
  };

  it('lets a player of the live match enter its result, and says who did', () => {
    const { t, m } = live();
    const player = lineup(t, m, m.homeId)[0];
    const next = reportResult(t, player, m.id, { homeGoals: 2, awayGoals: 0 });
    const done = next.matches.find((x) => x.id === m.id)!;
    expect(done).toMatchObject({ status: 'done', homeGoals: 2, awayGoals: 0, reportedBy: player });
  });

  it("refuses someone who isn't playing, a match not started and one already in", () => {
    const { t, m } = live();
    const outsider = t.participants.find((p) => !playsIn(t, m, p.id))!.id;
    const player = lineup(t, m, m.awayId)[0];
    expect(() => reportResult(t, outsider, m.id, { homeGoals: 1, awayGoals: 0 })).toThrow(TournamentError);
    const later = t.matches.find((x) => x.status === 'pending')!;
    const laterPlayer = lineup(t, later, later.homeId)[0];
    expect(() => reportResult(t, laterPlayer, later.id, { homeGoals: 1, awayGoals: 0 })).toThrow('aún no ha empezado');
    const done = reportResult(t, player, m.id, { homeGoals: 1, awayGoals: 1 });
    expect(() => reportResult(done, player, m.id, { homeGoals: 3, awayGoals: 1 })).toThrow('ya tiene resultado');
  });

  it("forgets who entered it when the admin corrects the result", () => {
    const { t, m } = live();
    const player = lineup(t, m, m.homeId)[0];
    const reported = reportResult(t, player, m.id, { homeGoals: 2, awayGoals: 0 });
    const corrected = recordResult(reported, m.id, { homeGoals: 2, awayGoals: 1 });
    expect(corrected.matches.find((x) => x.id === m.id)!.reportedBy).toBeUndefined();
  });
});

describe('matches started by players', () => {
  it('lets a player start the match that is up, and nobody else', () => {
    const rng = seededRng(5);
    const t = drawAll(newTournament(8, 5), rng);
    const up = nextMatch(t)!;
    const player = lineup(t, up, up.awayId)[0];
    const outsider = t.participants.find((p) => !playsIn(t, up, p.id))!.id;
    expect(() => playerStartMatch(t, outsider, up.id, rng)).toThrow('Solo pueden empezarlo');
    const later = t.matches.find((m) => m.id !== up.id && playsIn(t, m, player))!;
    expect(() => playerStartMatch(t, player, later.id, rng)).toThrow('aún no toca');

    const started = playerStartMatch(t, player, up.id, rng);
    expect(started.matches.find((m) => m.id === up.id)!.status).toBe('live');
    expect(playerStartMatch(started, player, up.id, rng)).toBe(started);
  });
});

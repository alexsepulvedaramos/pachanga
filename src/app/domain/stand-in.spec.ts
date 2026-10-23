import { describe, expect, it } from 'vitest';
import { seededRng, Rng } from './rng';
import { nextKnockoutMatches } from './knockout';
import { groupStake, knockoutStake, lowestBy } from './stand-in';
import { Match, Tournament } from './types';
import {
  createTournament,
  DEFAULT_CONFIG,
  finishDraw,
  groupMatches,
  isSolo,
  lineup,
  nextMatch,
  recordResult,
  redrawStandIn,
  spin,
  startMatch,
} from './tournament';

const CLUBS = ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool', 'Barça', 'Arsenal'];

function game(id: string, homeId: string, awayId: string, score?: [number, number]): Match {
  return {
    id,
    phase: 'group',
    homeId,
    awayId,
    status: score ? 'done' : 'pending',
    homeGoals: score?.[0] ?? null,
    awayGoals: score?.[1] ?? null,
  };
}

function drawn(players: number, seed: number, rng: Rng): Tournament {
  let t = createTournament({
    id: 'test',
    name: 'Test Cup',
    participantNames: Array.from({ length: players }, (_, i) => `Player ${i + 1}`),
    clubs: CLUBS.slice(0, Math.ceil(players / 2)),
    config: { ...DEFAULT_CONFIG, seed },
  });
  while (t.draw.picks.length < t.participants.length) t = spin(t, rng).tournament;
  return finishDraw(t, rng);
}

describe('group stake', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('is involved for everybody before anything is played', () => {
    const matches = [game('m', 'a', 'b'), game('n', 'c', 'd'), game('o', 'c', 'e')];
    expect(groupStake('c', matches[0], ids, matches)).toBe(2);
    expect(groupStake('e', matches[0], ids, matches)).toBe(2);
  });

  it('is none when no result can change the team’s place', () => {
    // a and b are on 6 and can reach 9; d lost everything and has nothing left to play.
    const matches = [
      game('m', 'a', 'b'),
      game('1', 'a', 'd', [2, 0]),
      game('2', 'b', 'd', [2, 0]),
      game('3', 'a', 'e', [1, 0]),
      game('4', 'b', 'e', [1, 0]),
      game('5', 'd', 'e', [0, 3]),
    ];
    expect(groupStake('d', matches[0], ids, matches)).toBe(0);
  });

  it('is still at stake when a team could only be tied, never passed', () => {
    // c is on 9 and done; a and b are on 6 and can reach 9, which would tie it and go to the tiebreakers.
    const tied = [
      game('m', 'a', 'b'),
      game('1', 'c', 'a', [1, 0]),
      game('2', 'c', 'b', [1, 0]),
      game('3', 'c', 'd', [1, 0]),
      game('4', 'a', 'd', [1, 0]),
      game('5', 'a', 'e', [1, 0]),
      game('6', 'b', 'd', [1, 0]),
      game('7', 'b', 'e', [1, 0]),
      game('8', 'c', 'e', [0, 1]),
    ];
    expect(groupStake('c', tied[0], ids, tied)).not.toBe(0);
  });

  it('is far when more than a win away from both teams but still reachable', () => {
    // c is on 0 with two matches left (6 at most); a and b are on 6.
    const matches = [
      game('m', 'a', 'b'),
      game('1', 'a', 'c', [2, 0]),
      game('2', 'b', 'c', [2, 0]),
      game('3', 'a', 'd', [2, 0]),
      game('4', 'b', 'd', [2, 0]),
      game('5', 'c', 'd'),
      game('6', 'c', 'e'),
    ];
    expect(groupStake('c', matches[0], ids, matches)).toBe(1);
  });
});

describe('knockout stake', () => {
  const ranking = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
  const quarters = nextKnockoutMatches(ranking, {}, []);

  it('only worries the same half of the bracket in the quarter-finals', () => {
    const [qf1] = quarters;
    expect(knockoutStake('t4', qf1, ranking, quarters)).toBe(2);
    expect(knockoutStake('t2', qf1, ranking, quarters)).toBe(1);
  });

  it('is none for a team that has been knocked out', () => {
    const played = quarters.map((m, i) => (i === 0 ? { ...m, status: 'done' as const, homeGoals: 3, awayGoals: 0 } : m));
    expect(knockoutStake('t8', played[1], ranking, played)).toBe(0);
  });

  it('is none for anyone but the finalists in the third-place match and the final', () => {
    const final: Match = { ...quarters[0], id: 'final', phase: 'final' };
    expect(knockoutStake('t3', final, ranking, quarters)).toBe(0);
    expect(knockoutStake('t3', { ...final, id: 'third', phase: 'third' }, ranking, quarters)).toBe(0);
  });
});

describe('lowestBy', () => {
  it('keeps every item sharing the lowest key, comparing one value after another', () => {
    const items = [
      { id: 'a', key: [1, 0] },
      { id: 'b', key: [0, 5] },
      { id: 'c', key: [0, 2] },
      { id: 'd', key: [0, 2] },
    ];
    expect(lowestBy(items, (x) => x.key).map((x) => x.id)).toEqual(['c', 'd']);
  });
});

describe('drawing the stand-in', () => {
  it('takes someone with the least at stake whenever a solo team plays in the group stage', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seededRng(seed);
      let t = drawn(11, seed, rng);
      const solo = t.teams.find((x) => isSolo(t, x.id))!;
      let checked = 0;
      while (t.stage === 'groups') {
        const m = nextMatch(t)!;
        if ([m.homeId, m.awayId].includes(solo.id)) {
          const started = startMatch(t, m.id, rng);
          const guest = started.matches.find((x) => x.id === m.id)!.standIns![solo.id];
          const busy = new Set([...lineup(started, m, m.homeId), ...lineup(started, m, m.awayId)]);
          const stake = (id: string) =>
            groupStake(started.teams.find((x) => x.memberIds.includes(id))!.id, m, started.teams.map((x) => x.id), groupMatches(t));
          const free = started.participants.filter((p) => !busy.has(p.id) && p.id !== guest);
          const lowest = Math.min(stake(guest), ...free.map((p) => stake(p.id)));
          expect(stake(guest)).toBe(lowest);
          t = started;
          checked++;
        }
        t = recordResult(t, m.id, { homeGoals: seed % 3, awayGoals: (seed + 1) % 3 });
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('never brings back a discarded stand-in and records who was discarded', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seededRng(seed);
      let t = drawn(11, seed, rng);
      const solo = t.teams.find((x) => isSolo(t, x.id))!;
      const m = t.matches.find((x) => [x.homeId, x.awayId].includes(solo.id))!;
      t = startMatch(t, m.id, rng);
      const discarded: string[] = [];
      for (let i = 0; i < 3; i++) {
        discarded.push(t.matches.find((x) => x.id === m.id)!.standIns![solo.id]);
        t = redrawStandIn(t, m.id, solo.id, rng);
        const now = t.matches.find((x) => x.id === m.id)!;
        expect(discarded).not.toContain(now.standIns![solo.id]);
        expect(now.redrawn![solo.id]).toEqual(discarded);
      }
    }
  });
});

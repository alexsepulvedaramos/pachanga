import { describe, expect, it } from 'vitest';
import { seededRng } from './rng';
import { allowedClubs, apartFrom, drawIsPossible, keepsApart, toggleApart } from './apart';
import { createTournament, DEFAULT_CONFIG, drawnPairs, nextToSpin, spin } from './tournament';
import { Tournament } from './types';

const CLUBS = ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool', 'Barça', 'Arsenal'];

function fresh(players: number): Tournament {
  return createTournament({
    id: 'test',
    name: 'Test Cup',
    participantNames: Array.from({ length: players }, (_, i) => `Player ${i + 1}`),
    clubs: CLUBS.slice(0, Math.ceil(players / 2)),
    config: { ...DEFAULT_CONFIG, seed: 1 },
  });
}

function wheel(t: Tournament, seed: number, apart = {}, noSolo: string[] = []): Tournament {
  const rng = seededRng(seed);
  while (nextToSpin(t)) t = spin(t, rng, { apart, noSolo }).tournament;
  return t;
}

describe('keeping players apart', () => {
  it('toggles a restriction both ways', () => {
    const a = toggleApart({}, 'p1', 'p2');
    expect(keepsApart(a, 'p2', 'p1')).toBe(true);
    expect(apartFrom(a, 'p2')).toEqual(['p1']);
    expect(toggleApart(a, 'p2', 'p1')).toEqual({});
  });

  it('never pairs restricted players, whatever the draw', () => {
    const apart = toggleApart(toggleApart({}, 'p1', 'p2'), 'p3', 'p4');
    for (let seed = 1; seed <= 200; seed++) {
      const pairs = [...drawnPairs(wheel(fresh(8), seed, apart))].map(([, ids]) => ids);
      for (const ids of pairs) {
        expect(ids.length === 2 && keepsApart(apart, ids[0], ids[1])).toBe(false);
      }
    }
  });

  it('still manages when only one way out is left, with an odd number of players', () => {
    // p1 can only play with p2 or alone, so everybody else is pushed away from p1.
    let apart = {};
    for (const o of ['p3', 'p4', 'p5', 'p6']) apart = toggleApart(apart, 'p1', o);
    for (let seed = 1; seed <= 100; seed++) {
      const t = wheel(fresh(7), seed, apart);
      for (const [, ids] of drawnPairs(t)) {
        expect(ids.length === 2 && keepsApart(apart, ids[0], ids[1])).toBe(false);
      }
    }
  });

  it('spots restrictions nobody can meet and falls back to a plain draw', () => {
    let apart = {};
    for (const o of ['p2', 'p3', 'p4', 'p5', 'p6']) apart = toggleApart(apart, 'p1', o);
    const t = fresh(6);
    expect(drawIsPossible(t, { apart, noSolo: [] })).toBe(false);
    expect(allowedClubs(t, 'p1', { apart, noSolo: [] }).size).toBe(0);
    expect(nextToSpin(wheel(t, 3, apart))).toBeNull();
  });
});

describe('keeping players from playing alone', () => {
  it('never leaves them as the solo player', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = wheel(fresh(7), seed, {}, ['p1', 'p2']);
      for (const [, ids] of drawnPairs(t)) {
        if (ids.length === 1) expect(['p1', 'p2']).not.toContain(ids[0]);
      }
    }
  });

  it('is impossible when everybody is protected and the number is odd', () => {
    const everyone = Array.from({ length: 7 }, (_, i) => `p${i + 1}`);
    expect(drawIsPossible(fresh(7), { apart: {}, noSolo: everyone })).toBe(false);
  });
});

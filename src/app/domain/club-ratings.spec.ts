import { describe, expect, it } from 'vitest';
import { bestLineup, ClubRating, rateClub, starsFor, suggestClubs } from './club-ratings';
import { seededRng } from './rng';

const p = (position: string, overall: number, name = `${position}${overall}`) => ({ name, position, overall });

const squad = [
  p('GK', 85), p('GK', 70),
  p('LB', 80), p('CB', 84), p('CB', 82), p('CB', 75), p('RB', 79),
  p('CDM', 83), p('CM', 81), p('CAM', 86), p('CM', 70),
  p('ST', 88), p('LW', 84), p('RM', 80), p('ST', 72),
];

describe('club ratings', () => {
  it('picks the best 4-3-3 by position', () => {
    const xi = bestLineup(squad)!;
    expect(xi).toHaveLength(11);
    expect(xi.map((s) => `${s.line}:${s.position}${s.overall}`)).toEqual([
      'gk:GK85',
      'def:LB80', 'def:CB84', 'def:CB82', 'def:RB79',
      'mid:CAM86', 'mid:CDM83', 'mid:CM81',
      'att:ST88', 'att:LW84', 'att:RM80',
    ]);
  });

  it('chooses the formation that fits the squad best', () => {
    const twoStrikersNoWingers = [
      p('GK', 80), p('LB', 78), p('CB', 80), p('CB', 80), p('CB', 79), p('RB', 78),
      p('CM', 80), p('CM', 80), p('CDM', 79), p('CAM', 79), p('LM', 77), p('RM', 77),
      p('ST', 86), p('ST', 85),
    ];
    const club = rateClub(2, 'Two Strikers', 'Test', twoStrikersNoWingers)!;
    expect(['4-4-2', '3-5-2']).toContain(club.formation);
    expect(club.lineup.filter((s) => s.position === 'ST')).toHaveLength(2);
    expect(rateClub(1, 'Test FC', 'Test', squad)!.formation).toBe('4-3-3');
  });

  it('fills a missing position with the best remaining player of a related line', () => {
    const noRightBack = squad.filter((s) => s.position !== 'RB');
    const xi = bestLineup(noRightBack)!;
    expect(xi.filter((s) => s.line === 'def').map((s) => s.position)).toEqual(['LB', 'CB', 'CB', 'CB']);
  });

  it('rejects a squad without a goalkeeper', () => {
    expect(bestLineup(squad.filter((s) => s.position !== 'GK'))).toBeNull();
  });

  it('averages the lineup and each line', () => {
    const club = rateClub(1, 'Test FC', 'Test League', squad)!;
    expect(club.overall).toBe(83);
    expect(club.attack).toBe(84);
    expect(club.midfield).toBe(83);
    expect(club.defence).toBe(82);
    expect(club.stars).toBe(4.5);
  });

  it('maps ratings to half stars', () => {
    expect(starsFor(87)).toBe(5);
    expect(starsFor(82)).toBe(4.5);
    expect(starsFor(76)).toBe(3.5);
    expect(starsFor(50)).toBe(1.5);
  });

  it('suggests clubs as close to the target as possible', () => {
    const clubs = [87, 86, 84, 83, 83, 82, 82, 81, 79, 75].map(
      (overall, i) => ({ id: i, name: `C${i}`, overall }) as ClubRating,
    );
    const picks = suggestClubs(clubs, 4, 82, seededRng(1));
    expect(picks).toHaveLength(4);
    expect(picks.every((c) => Math.abs(c.overall - 82) <= 1)).toBe(true);
    const wide = suggestClubs(clubs, 6, 86, seededRng(2));
    expect(wide.every((c) => Math.abs(c.overall - 86) <= 4)).toBe(true);
  });
});

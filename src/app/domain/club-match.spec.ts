import { describe, expect, it } from 'vitest';
import { findClub } from './club-match';

const NAMES = [
  'Manchester City', 'Man Utd', 'FC Barcelona', 'Real Madrid', 'Atlético de Madrid', 'FC Bayern München',
  'Paris SG', 'Lombardia FC', 'Milano FC', 'Liverpool', 'Real Betis', 'Real Sociedad', 'Spurs', 'AS Roma',
];

describe('findClub', () => {
  it.each([
    ['Man City', 'Manchester City'],
    ['Barça', 'FC Barcelona'],
    ['barcelona', 'FC Barcelona'],
    ['Atlético', 'Atlético de Madrid'],
    ['Bayern', 'FC Bayern München'],
    ['PSG', 'Paris SG'],
    ['Inter', 'Lombardia FC'],
    ['Milan', 'Milano FC'],
    ['liverpool', 'Liverpool'],
    ['Real Madrid', 'Real Madrid'],
    ['Tottenham', 'Spurs'],
    ['Roma', 'AS Roma'],
  ])('%s → %s', (query, expected) => {
    expect(findClub(NAMES, query)).toBe(expected);
  });

  it('gives up rather than guessing between several clubs', () => {
    expect(findClub(NAMES, 'Real')).toBeNull();
    expect(findClub(NAMES, 'Los Galácticos')).toBeNull();
  });
});

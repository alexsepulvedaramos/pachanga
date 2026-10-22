import { describe, expect, it } from 'vitest';
import { rematchDraft } from './rematch';
import { createTournament, DEFAULT_CONFIG, disqualify } from './tournament';

const base = () =>
  createTournament({
    id: 'REMATCH1',
    name: 'Pachanga',
    participantNames: ['Ana', 'Bea', 'Carla', 'Dani', 'Eva', 'Fer', 'Gus'],
    clubs: ['Real Madrid', 'Man City', 'Bayern', 'PSG'],
    config: { ...DEFAULT_CONFIG, trackScorers: true, ballonDor: true, seed: 9 },
  });

describe('rematch', () => {
  it('keeps the players, clubs and rules, with a fresh draw to come', () => {
    const draft = rematchDraft(base());
    expect(draft.playerNames).toEqual(['Ana', 'Bea', 'Carla', 'Dani', 'Eva', 'Fer', 'Gus']);
    expect(draft.clubs).toEqual(['Real Madrid', 'Man City', 'Bayern', 'PSG']);
    expect(draft.config).toMatchObject({ trackScorers: true, ballonDor: true });
    expect(draft.config).not.toHaveProperty('seed');
  });

  it('leaves out who withdrew, and the clubs they no longer fill', () => {
    const draft = rematchDraft(disqualify(base(), 'p7'));
    expect(draft.playerNames).not.toContain('Gus');
    expect(draft.clubs).toHaveLength(3);
  });

  it('numbers the rematches', () => {
    expect(rematchDraft(base()).name).toBe('Pachanga · Revancha');
    expect(rematchDraft({ ...base(), name: 'Pachanga · Revancha' }).name).toBe('Pachanga · Revancha 2');
    expect(rematchDraft({ ...base(), name: 'Pachanga · Revancha 2' }).name).toBe('Pachanga · Revancha 3');
  });
});

import { describe, expect, it } from 'vitest';
import { formatGuide } from './format-guide';
import { createTournament, DEFAULT_CONFIG } from './tournament';
import { TournamentConfig } from './types';

function tournament(players: number, config: Partial<TournamentConfig> = {}) {
  const names = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  const clubs = ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool', 'Barcelona', 'Arsenal'].slice(0, Math.ceil(players / 2));
  return createTournament({ id: 'GUIDE', name: 'Guía', participantNames: names, clubs, config: { ...DEFAULT_CONFIG, seed: 1, ...config } });
}

const text = (players: number, config: Partial<TournamentConfig> = {}) =>
  formatGuide(tournament(players, config))
    .flatMap((s) => s.items)
    .join('\n');

describe('formatGuide', () => {
  it('explains the playoff choices of a 6-team tournament, and that the runner-up cannot be picked', () => {
    const guide = text(12);
    expect(guide).toContain('el 3º elige su rival entre el 5º y el 6º');
    expect(guide).toContain('No puede elegir al 2º');
  });

  it('counts the matches of the whole tournament', () => {
    expect(text(16)).toContain('36 partidos en total');
    expect(text(14)).toContain('27 partidos en total');
  });

  it('only talks about solo players, scorers and the Ballon d\'Or when they apply', () => {
    expect(text(12)).not.toContain('juega solo');
    expect(text(11)).toContain('juega solo');
    expect(text(12)).not.toContain('Balón de Oro');
    expect(text(12, { ballonDor: true, trackScorers: true })).toContain('Balón de Oro');
    expect(text(12, { trackScorers: true })).toContain('Bota de Oro');
  });
  it('explains where the solo player’s partner comes from when the rule asks for the best eliminated team', () => {
    const merit = text(11, { trackScorers: true, soloPartner: 'bestEliminated' });
    expect(merit).toContain('eliminado en la repesca que mejor quedó en la liguilla');
    expect(merit).toContain('el admin elige entre ellos o lo deja a suertes');
    expect(text(15, { trackScorers: true, soloPartner: 'bestEliminated' })).toContain('eliminado en los cuartos');
    // With 4 teams nobody is out before the semi-finals: the draw stays.
    expect(text(7, { trackScorers: true, soloPartner: 'bestEliminated' })).not.toContain('que mejor quedó');
    expect(text(11)).not.toContain('que mejor quedó');
  });
});

import { describe, expect, it } from 'vitest';
import { seededRng } from './rng';
import { createTournament, DEFAULT_CONFIG, finishDraw, nextMatch, recordResult, spin } from './tournament';
import { invitationText, standingsText, tournamentUrl, whatsappUrl } from './share-text';
import { Tournament } from './types';

function tournament(): Tournament {
  const rng = seededRng(1);
  let t = createTournament({
    id: 'ABC123',
    name: 'Pachanga del sábado',
    participantNames: ['Ana', 'Bea', 'Carlos', 'Dani', 'Eva', 'Fran'],
    clubs: ['Real Madrid', 'Arsenal', 'Inter'],
    config: { ...DEFAULT_CONFIG, seed: 1 },
  });
  while (t.draw.picks.length < t.participants.length) t = spin(t, rng).tournament;
  return finishDraw(t, rng);
}

describe('share texts', () => {
  it('invites with the link and the code', () => {
    const t = tournament();
    const url = tournamentUrl('https://pachanga-fc.vercel.app', t);
    expect(url).toBe('https://pachanga-fc.vercel.app/t/ABC123');
    const text = invitationText(t, url);
    expect(text).toContain('Pachanga del sábado');
    expect(text).toContain(url);
    expect(text).toContain('ABC123');
  });

  it('lists the standings and the next match', () => {
    let t = tournament();
    const first = nextMatch(t)!;
    t = recordResult(t, first.id, { homeGoals: 2, awayGoals: 0 });
    const winner = t.teams.find((x) => x.id === first.homeId)!.club;
    const text = standingsText(t, 'https://x/t/ABC123');
    expect(text).toContain(`1. ${winner} · 3 pts (1 PJ, +2)`);
    expect(text).toContain('Siguiente:');
  });

  it('encodes the text for WhatsApp', () => {
    expect(whatsappUrl('Hola & adiós\nhttps://x')).toBe('https://wa.me/?text=Hola%20%26%20adi%C3%B3s%0Ahttps%3A%2F%2Fx');
  });
});

import { PHASE_LABELS } from './knockout';
import { Tournament } from './types';
import { champions, nextMatch, standings } from './tournament';

/** Link that opens a tournament: anyone with it can follow along and say who they are. */
export function tournamentUrl(origin: string, t: Tournament): string {
  return `${origin}/t/${t.id}`;
}

/** Invitation for the group chat. */
export function invitationText(t: Tournament, url: string): string {
  return [
    `⚽ *${t.name}*`,
    'Partidos, clasificación y cuándo te toca, en directo:',
    url,
    `Código: *${t.id}*`,
  ].join('\n');
}

/** Standings (and the next match, or the champions) as plain text for a chat. */
export function standingsText(t: Tournament, url: string): string {
  const club = (teamId: string) => t.teams.find((x) => x.id === teamId)?.club ?? '';
  const name = (id: string) => t.participants.find((p) => p.id === id)?.name ?? '';
  const rows = t.groupRanking
    ? t.groupRanking.map((id) => standings(t).find((r) => r.teamId === id)!)
    : standings(t);
  const lines = rows.map((r, i) => {
    const diff = r.goalDifference > 0 ? `+${r.goalDifference}` : `${r.goalDifference}`;
    return `${i + 1}. ${club(r.teamId)} · ${r.points} pts (${r.played} PJ, ${diff})`;
  });

  const footer: string[] = [];
  const winners = champions(t);
  const next = nextMatch(t);
  if (t.stage === 'finished' && winners) {
    footer.push(`🏆 Campeones: ${winners.map(name).join(' + ')}`);
  } else if (next) {
    const label = next.phase === 'group' ? `Jornada ${next.round}` : PHASE_LABELS[next.phase];
    footer.push(`Siguiente: ${club(next.homeId)} vs ${club(next.awayId)} · ${label}`);
  }
  return [`📊 *${t.name}* · Clasificación`, '', ...lines, '', ...footer, url].join('\n');
}

/** WhatsApp link that opens a chat picker with the text ready to send. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// Who to notify for the current state of a tournament. Bundled with the app's domain code into
// domain.js (npm run build:functions) so the Edge Function uses exactly the same rules as the app.

import { PHASE_LABELS } from '../../../src/app/domain/knockout';
import {
  activeMembers,
  champions,
  currentDecision,
  lineup,
  participant,
  unavailableFor,
} from '../../../src/app/domain/tournament';
import { votingOpen } from '../../../src/app/domain/ballon-dor';
import { galaLive } from '../../../src/app/domain/gala';
import type { Match, Tournament } from '../../../src/app/domain/types';

export interface PushMessage {
  /** Unique per event, so each person gets each notification once. */
  key: string;
  participantIds: string[];
  title: string;
  body: string;
}

const club = (t: Tournament, teamId: string) => t.teams.find((x) => x.id === teamId)?.club ?? '';
const name = (t: Tournament, id: string) => participant(t, id).name;

function fixture(t: Tournament, m: Match): string {
  const label = m.phase === 'group' ? `Jornada ${m.round}` : PHASE_LABELS[m.phase];
  return `${club(t, m.homeId)} vs ${club(t, m.awayId)} · ${label}`;
}

export function buildMessages(t: Tournament): PushMessage[] {
  if (t.stage === 'finished') {
    const final = t.matches.find((m) => m.phase === 'final');
    const winners = champions(t) ?? [];
    if (!final || winners.length === 0) return [];
    const everybody = t.participants.map((p) => p.id);
    const winnerTeam = t.teams.find((x) => winners.some((id) => x.memberIds.includes(id)));
    const messages: PushMessage[] = [
      {
        key: 'champions',
        participantIds: everybody,
        title: `Campeones: ${winnerTeam?.club ?? ''}`,
        body: `${winners.map((id) => name(t, id)).join(' + ')} ganan ${t.name}.`,
      },
    ];
    if (votingOpen(t)) {
      messages.push({
        key: 'vote',
        participantIds: everybody.filter((id) => !t.ballonDor?.voters.includes(id)),
        title: 'Vota al Balón de Oro',
        body: `Elige tu podio de ${t.name}: 3, 2 y 1 puntos.`,
      });
    }
    // Never says who won anything: that's for the gala.
    if (t.gala && galaLive(t)) {
      messages.push({
        key: `gala:${t.gala.startedAt}`,
        participantIds: everybody,
        title: '¡Empieza la gala!',
        body: 'Abre Pachanga: campeones, Bota de Oro y Balón de Oro, en directo.',
      });
    }
    return messages;
  }
  if (t.stage !== 'groups' && t.stage !== 'knockout') return [];

  const messages: PushMessage[] = [];
  const pending = t.matches.filter((m) => m.status !== 'done');
  const now = pending.find((m) => m.status === 'live') ?? pending[0];

  if (now) {
    const players = [...lineup(t, now, now.homeId), ...lineup(t, now, now.awayId)];
    const out = unavailableFor(t, now);
    for (const id of players) {
      const team = [now.homeId, now.awayId].find((teamId) => lineup(t, now, teamId).includes(id))!;
      const guest = !t.teams.find((x) => x.id === team)!.memberIds.includes(id);
      const partner = lineup(t, now, team).find((x) => x !== id);
      const missing = out
        .filter((x) => x.teamId === team)
        .map((x) => `${x.player} (${x.kind === 'redCard' ? 'roja' : 'lesión'})`);
      const warning = missing.length ? ` Sin ${missing.join(', ')}.` : '';
      messages.push({
        key: `turn:${now.id}`,
        participantIds: [id],
        title: '¡Te toca!',
        body: guest
          ? `Juegas de invitado con ${partner ? name(t, partner) : club(t, team)}: ${fixture(t, now)}.${warning}`
          : `${fixture(t, now)}. Coge el mando.${warning}`,
      });
    }
    const next = pending.find((m) => m.id !== now.id);
    if (next) {
      const nextPlayers = [...lineup(t, next, next.homeId), ...lineup(t, next, next.awayId)];
      messages.push({
        key: `soon:${next.id}`,
        participantIds: nextPlayers.filter((id) => !players.includes(id)),
        title: 'Juegas en el siguiente',
        body: `Prepárate: ${fixture(t, next)} va después de este partido.`,
      });
    }
  }

  const decision = currentDecision(t);
  if (decision) {
    const opponent = decision.kind === 'playoffOpponent' || decision.kind === 'semiOpponent';
    const round = decision.kind.startsWith('playoff') ? 'la repesca' : 'semifinales';
    messages.push({
      key: `choose:${decision.kind}`,
      participantIds: activeMembers(t, decision.chooserId),
      title: 'Te toca elegir',
      body: opponent
        ? `Elegís rival para ${round}. Avisad al admin.`
        : `Elegís si jugáis primero o segundo en ${round}. Avisad al admin.`,
    });
  }
  return messages;
}

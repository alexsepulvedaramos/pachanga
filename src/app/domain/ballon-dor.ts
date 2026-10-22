import { podium } from './knockout';
import { seededRng, shuffle } from './rng';
import { topScorers, TournamentError } from './tournament';
import { BallonDorState, BallonDorVote, Id, Tournament } from './types';

/** Points for first, second and third on a ballot. */
export const PODIUM_POINTS = [3, 2, 1] as const;

export interface BallonDorRow {
  participantId: Id;
  points: number;
  /** Ballots that put them first, second and third. */
  places: [number, number, number];
}

/** Whether the tournament was set up with a Ballon d'Or vote. */
export function hasBallonDor(t: Tournament): boolean {
  return !!t.config.ballonDor;
}

/** Adds the vote to a tournament set up without it, before the gala starts. */
export function enableBallonDor(t: Tournament): Tournament {
  if (t.gala) throw new TournamentError('La gala ya ha empezado.');
  return { ...t, config: { ...t.config, ballonDor: true } };
}

export function votingOpen(t: Tournament): boolean {
  return hasBallonDor(t) && t.stage === 'finished' && !t.ballonDor?.closedAt;
}

export function votingClosed(t: Tournament): boolean {
  return hasBallonDor(t) && !!t.ballonDor?.closedAt;
}

export function hasVoted(t: Tournament, participantId: Id): boolean {
  return t.ballonDor?.voters.includes(participantId) ?? false;
}

/** Everyone who took part votes, and can be voted, except for themselves. */
export function validateVote(t: Tournament, voterId: Id, picks: readonly Id[]): void {
  if (!votingOpen(t)) throw new TournamentError('La votación no está abierta.');
  const ids = new Set(t.participants.map((p) => p.id));
  if (!ids.has(voterId)) throw new TournamentError('Solo votan los participantes.');
  if (picks.length !== PODIUM_POINTS.length || new Set(picks).size !== picks.length) {
    throw new TournamentError('Elige a tres jugadores distintos: 1º, 2º y 3º.');
  }
  if (picks.includes(voterId)) throw new TournamentError('No puedes votarte a ti mismo.');
  if (!picks.every((id) => ids.has(id))) throw new TournamentError('Ese jugador no está en el torneo.');
}

/**
 * The public part of the vote given every ballot cast so far: who has voted and, once closed (by
 * the admin or because everybody has voted), the ballots themselves. The server builds the same.
 */
export function ballonDorState(
  t: Tournament,
  votes: readonly BallonDorVote[],
  close: boolean,
  now = new Date(),
): BallonDorState {
  const voters = votes.map((v) => v.voterId);
  if (!close && voters.length < t.participants.length) return { voters };
  return { voters, votes: votes.map((v) => ({ voterId: v.voterId, picks: [...v.picks] })), closedAt: now.toISOString() };
}

/**
 * Everybody who got points, best first. Ties go to more first places, then more second places,
 * then more goals, then how far their team got, then the drawing of lots.
 */
export function ballonDorRanking(t: Tournament): BallonDorRow[] {
  const rows = new Map<Id, BallonDorRow>();
  for (const vote of t.ballonDor?.votes ?? []) {
    vote.picks.forEach((id, place) => {
      const row = rows.get(id) ?? { participantId: id, points: 0, places: [0, 0, 0] };
      row.points += PODIUM_POINTS[place] ?? 0;
      row.places[place]++;
      rows.set(id, row);
    });
  }
  const goals = new Map(topScorers(t).map((s) => [s.participantId, s.goals]));
  const teams = finalTeamOrder(t);
  const teamPosition = (id: Id) => {
    const index = teams.findIndex((teamId) => t.teams.find((x) => x.id === teamId)?.memberIds.includes(id));
    return index < 0 ? teams.length : index;
  };
  const lots = shuffle(t.participants.map((p) => p.id).sort(), seededRng(t.config.seed ^ 0xba11));
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.places[0] - a.places[0] ||
      b.places[1] - a.places[1] ||
      (goals.get(b.participantId) ?? 0) - (goals.get(a.participantId) ?? 0) ||
      teamPosition(a.participantId) - teamPosition(b.participantId) ||
      lots.indexOf(a.participantId) - lots.indexOf(b.participantId),
  );
}

/** Teams by where they finished: the knockout podium first, then the group table. */
export function finalTeamOrder(t: Tournament): Id[] {
  const top = podium(t.matches) ?? [];
  const rest = (t.groupRanking ?? t.teams.map((x) => x.id)).filter((id) => !top.includes(id));
  return [...top, ...rest];
}

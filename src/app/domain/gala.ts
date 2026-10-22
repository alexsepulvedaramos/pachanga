import { ballonDorRanking, hasBallonDor, votingClosed } from './ballon-dor';
import { winnerOf } from './knockout';
import { champions, lineup, topScorers, TournamentError } from './tournament';
import { Id, Match, Tournament } from './types';

/** One screen of the closing ceremony. The Ballon d'Or comes last, third place first. */
export type GalaSlide =
  | { kind: 'intro'; matches: number; goals: number; biggestWin: Match | null }
  | { kind: 'champions'; teamId: Id; playerIds: Id[]; final: Match }
  | { kind: 'goldenBoot'; participantIds: Id[]; goals: number }
  | {
      kind: 'ballonDor';
      place: 1 | 2 | 3;
      participantId: Id;
      points: number;
      /** Ballots that put them first, and ballots that put them anywhere on the podium. */
      firsts: number;
      ballots: number;
    };

/** A player's night, for their Ballon d'Or card. */
export interface PlayerRecord {
  played: number;
  wins: number;
  goals: number;
}

/** The gala can start once the final is played and, if there is one, the vote has closed. */
export function galaReady(t: Tournament): boolean {
  return t.stage === 'finished' && (!hasBallonDor(t) || votingClosed(t));
}

export function galaSlides(t: Tournament): GalaSlide[] {
  if (t.stage !== 'finished') return [];
  const played = t.matches.filter((m) => m.status === 'done');
  const goals = played.reduce((sum, m) => sum + (m.homeGoals ?? 0) + (m.awayGoals ?? 0), 0);
  const margin = (m: Match) => Math.abs((m.homeGoals ?? 0) - (m.awayGoals ?? 0));
  const biggestWin = played.reduce<Match | null>(
    (best, m) =>
      margin(m) > 0 && (!best || margin(m) > margin(best) || (margin(m) === margin(best) && goalsIn(m) > goalsIn(best)))
        ? m
        : best,
    null,
  );
  const slides: GalaSlide[] = [{ kind: 'intro', matches: played.length, goals, biggestWin }];

  const final = t.matches.find((m) => m.phase === 'final');
  const winner = final && winnerOf(final);
  if (final && winner) slides.push({ kind: 'champions', teamId: winner, playerIds: champions(t) ?? [], final });

  const scorers = topScorers(t);
  if (t.config.trackScorers && scorers.length) {
    const most = scorers[0].goals;
    slides.push({
      kind: 'goldenBoot',
      participantIds: scorers.filter((s) => s.goals === most).map((s) => s.participantId),
      goals: most,
    });
  }

  if (votingClosed(t)) {
    const podium = ballonDorRanking(t).slice(0, 3);
    for (let i = podium.length - 1; i >= 0; i--) {
      const row = podium[i];
      slides.push({
        kind: 'ballonDor',
        place: (i + 1) as 1 | 2 | 3,
        participantId: row.participantId,
        points: row.points,
        firsts: row.places[0],
        ballots: row.places[0] + row.places[1] + row.places[2],
      });
    }
  }
  return slides;
}

/** Matches played and won (as a member, partner or stand-in) and goals scored. */
export function playerRecord(t: Tournament, participantId: Id): PlayerRecord {
  let played = 0;
  let wins = 0;
  for (const m of t.matches) {
    if (m.status !== 'done') continue;
    const side = [m.homeId, m.awayId].find((teamId) => lineup(t, m, teamId).includes(participantId));
    if (!side) continue;
    played++;
    if (winnerOf(m) === side) wins++;
  }
  const goals = topScorers(t).find((s) => s.participantId === participantId)?.goals ?? 0;
  return { played, wins, goals };
}

const goalsIn = (m: Match) => (m.homeGoals ?? 0) + (m.awayGoals ?? 0);

/** Whether a gala started by the admin is still going on. */
export function galaLive(t: Tournament): boolean {
  return !!t.gala && t.gala.step < galaSlides(t).length;
}

export function startGala(t: Tournament, now = new Date()): Tournament {
  if (!galaReady(t)) throw new TournamentError('La gala empieza cuando se cierre la votación.');
  return { ...t, gala: { startedAt: now.toISOString(), step: 0 } };
}

/** Moves the live gala to a slide; one past the last ends it. */
export function setGalaStep(t: Tournament, step: number): Tournament {
  if (!t.gala) throw new TournamentError('La gala no ha empezado.');
  const last = galaSlides(t).length;
  return { ...t, gala: { ...t.gala, step: Math.max(0, Math.min(step, last)) } };
}

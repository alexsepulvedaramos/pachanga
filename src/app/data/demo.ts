import { seededRng } from '../domain/rng';
import { Tournament } from '../domain/types';
import {
  createTournament,
  DEFAULT_CONFIG,
  finishDraw,
  groupMatches,
  nextMatch,
  recordResult,
  spin,
  startMatch,
} from '../domain/tournament';
import { DEMO_PREFIX, newTournamentCode } from './tournament-repository';

export const DEMO_PIN = '0000';

const NAMES = ['Guille', 'Miguel', 'Alex', 'Dani', 'Javi', 'Pablo', 'Sergio', 'Hugo', 'Rubén', 'Iván', 'Marcos'];
const CLUBS = ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool'];

/**
 * An 11-player (six-team) tournament on the last group match, being played: entering its result
 * closes the group stage, so the recap and the knockout choices come next. It votes a Ballon d'Or
 * at the end, its made-up players voting by themselves.
 */
export function buildDemoTournament(): Tournament {
  const seed = Math.floor(Math.random() * 1e6);
  const rng = seededRng(seed);
  let t = createTournament({
    id: `${DEMO_PREFIX}${newTournamentCode(4)}`,
    name: 'Pachanga · Demo',
    participantNames: NAMES,
    clubs: CLUBS,
    config: { ...DEFAULT_CONFIG, trackScorers: true, ballonDor: true, seed },
  });
  t = { ...t, demo: true };
  while (t.draw.picks.length < t.participants.length) t = spin(t, rng).tournament;
  t = finishDraw(t, rng);

  for (let i = 0; i < groupMatches(t).length - 1; i++) {
    const m = nextMatch(t)!;
    t = startMatch(t, m.id, rng);
    const homeGoals = Math.floor(rng() * 4);
    const awayGoals = Math.floor(rng() * 4);
    const scorers = (teamId: string, count: number) => {
      const lineup = t.teams.find((x) => x.id === teamId)!.memberIds;
      return Array.from({ length: count }, () => ({
        teamId,
        scorerId: lineup[Math.floor(rng() * lineup.length)],
      }));
    };
    t = recordResult(t, m.id, {
      homeGoals,
      awayGoals,
      goals: [...scorers(m.homeId, homeGoals), ...scorers(m.awayId, awayGoals)],
    });
  }
  return startMatch(t, nextMatch(t)!.id, rng);
}

import { seededRng } from '../domain/rng';
import { Tournament } from '../domain/types';
import {
  createTournament,
  DEFAULT_CONFIG,
  finishDraw,
  nextMatch,
  recordResult,
  spin,
  startMatch,
} from '../domain/tournament';
import { DEMO_PREFIX } from './tournament-store';
import { newTournamentCode } from './tournament-repository';

export const DEMO_PIN = '0000';

const NAMES = ['Guille', 'Miguel', 'Alex', 'Dani', 'Javi', 'Pablo', 'Sergio', 'Hugo', 'Rubén', 'Iván', 'Marcos'];
const CLUBS = ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool'];

/** An 11-player tournament halfway through the group stage, with one match being played. */
export function buildDemoTournament(): Tournament {
  const seed = Math.floor(Math.random() * 1e6);
  const rng = seededRng(seed);
  let t = createTournament({
    id: `${DEMO_PREFIX}${newTournamentCode(4)}`,
    name: 'P0PPER CUP · Demo',
    participantNames: NAMES,
    clubs: CLUBS,
    config: { ...DEFAULT_CONFIG, trackScorers: true, seed },
  });
  while (t.draw.picks.length < t.participants.length) t = spin(t, rng).tournament;
  t = finishDraw(t, rng);

  for (let i = 0; i < 7; i++) {
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

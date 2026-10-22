import { hasBallonDor, validateVote } from '../domain/ballon-dor';
import { playerRecord } from '../domain/gala';
import { seededRng } from '../domain/rng';
import { BallonDorVote, Id, Tournament } from '../domain/types';

/**
 * Ballots for the demo's made-up players, so its Ballon d'Or vote waits only on whoever is trying
 * it. Each votes for the three with the best night (wins and goals), give or take a little luck,
 * never for themselves.
 */
export function demoBallots(t: Tournament, skip: Id[]): BallonDorVote[] {
  if (!hasBallonDor(t)) return [];
  const rng = seededRng(t.config.seed ^ 0xdeb0);
  const score = new Map(
    t.participants.map((p) => {
      const r = playerRecord(t, p.id);
      return [p.id, r.wins * 2 + r.goals];
    }),
  );
  return t.participants
    .filter((voter) => !skip.includes(voter.id))
    .map((voter) => {
      const picks = t.participants
        .filter((p) => p.id !== voter.id)
        .map((p) => ({ id: p.id, rating: score.get(p.id)! + rng() * 4 }))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 3)
        .map((p) => p.id);
      validateVote(t, voter.id, picks);
      return { voterId: voter.id, picks };
    });
}

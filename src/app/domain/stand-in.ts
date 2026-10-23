import { Id, Match } from './types';
import { POINTS, tally } from './standings';
import { teamAlive } from './knockout';

/**
 * How much a team has riding on a match it doesn't play, which is what decides whether its players
 * make a fair stand-in: 0 means none, 1 is far from it, 2 is in the thick of it.
 */
export type Stake = 0 | 1 | 2;

/**
 * Stake of a team in a group match. A match only moves its two teams' points, so a team can only be
 * affected through its position relative to them: when the points each can still reach leave it
 * strictly above or below both, no result can change its place (stake 0). Otherwise it is far (1)
 * when it is more than a win away from both right now, and involved (2) if not.
 */
export function groupStake(
  candidateId: Id,
  m: Match,
  teamIds: readonly Id[],
  groupMatches: readonly Match[],
): Stake {
  const rows = tally(teamIds, groupMatches);
  const reach = (id: Id) => {
    const points = rows.get(id)?.points ?? 0;
    const left = groupMatches.filter((x) => x.status !== 'done' && (x.homeId === id || x.awayId === id));
    return { points, max: points + POINTS.win * left.length };
  };
  const candidate = reach(candidateId);
  const rivals = [m.homeId, m.awayId].map(reach);
  if (rivals.every((r) => candidate.points > r.max || candidate.max < r.points)) return 0;
  return rivals.every((r) => Math.abs(candidate.points - r.points) > POINTS.win) ? 1 : 2;
}

/**
 * Stake of a team in a knockout match. Whoever is out has none, and the third-place match and the
 * final move nobody else. Every team still in cares about a playoff or a semi-final, as the winners
 * are who they will meet; in the quarter-finals only the teams in the same half of the bracket do.
 */
export function knockoutStake(
  candidateId: Id,
  m: Match,
  ranking: readonly Id[],
  matches: readonly Match[],
): Stake {
  if (m.phase === 'third' || m.phase === 'final') return 0;
  if (!teamAlive(ranking, matches, candidateId)) return 0;
  if (m.phase !== 'quarter') return 2;
  const quarters = matches.filter((x) => x.phase === 'quarter');
  const half = (quarter: Match | undefined) => Math.floor(quarters.indexOf(quarter!) / 2);
  const own = quarters.find((x) => x.homeId === candidateId || x.awayId === candidateId);
  return own && half(own) === half(m) ? 2 : 1;
}

/** Every item whose key, compared one value after another, is the lowest. */
export function lowestBy<T>(items: readonly T[], keyOf: (item: T) => number[]): T[] {
  let best: T[] = [];
  let bestKey: number[] | null = null;
  for (const item of items) {
    const key = keyOf(item);
    const order = bestKey ? compareKeys(key, bestKey) : -1;
    if (order < 0) {
      best = [item];
      bestKey = key;
    } else if (order === 0) {
      best.push(item);
    }
  }
  return best;
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

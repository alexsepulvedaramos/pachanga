import { Id, Match } from './types';
import { Rng, shuffle } from './rng';

type Pair = readonly [Id, Id];

const SEARCH_BUDGET = 50_000;

/**
 * Round-robin for a group played on one console: every team meets every other team once (or twice,
 * home and away, with `legs` 2), in an order where (whenever the team count allows it) nobody plays
 * two matches in a row and the number of matches played stays balanced between teams.
 */
export function buildGroupSchedule(teamIds: readonly Id[], rng: Rng, legs: 1 | 2 = 1): Match[] {
  if (teamIds.length < 2) return [];
  const pairs = allPairs(shuffle(teamIds, rng));
  const firstLeg = findOrder(teamIds, pairs, rng, true) ?? findOrder(teamIds, pairs, rng, false)!;
  const order = legs === 2 ? [...firstLeg, ...returnLeg(firstLeg)] : firstLeg;
  const perRound = Math.max(1, Math.floor(teamIds.length / 2));
  const homeCount = new Map<Id, number>(teamIds.map((id) => [id, 0]));
  /** Home team of the first meeting of each pair, so the return match swaps it. */
  const firstHome = new Map<string, Id>();

  return order.map(([a, b], index) => {
    const key = [a, b].sort().join('|');
    const previous = firstHome.get(key);
    const [homeId, awayId] = previous
      ? previous === a ? [b, a] : [a, b]
      : homeCount.get(a)! <= homeCount.get(b)! ? [a, b] : [b, a];
    if (!previous) firstHome.set(key, homeId);
    homeCount.set(homeId, homeCount.get(homeId)! + 1);
    return {
      id: `g${index + 1}`,
      phase: 'group',
      round: Math.floor(index / perRound) + 1,
      homeId,
      awayId,
      status: 'pending',
      homeGoals: null,
      awayGoals: null,
    } satisfies Match;
  });
}

/**
 * The return matches in the same order as the first leg, starting wherever gives the fewest
 * back-to-back matches across both legs.
 */
function returnLeg(firstLeg: readonly Pair[]): Pair[] {
  const rotations = firstLeg.map((_, i) => [...firstLeg.slice(i), ...firstLeg.slice(0, i)]);
  const backToBacks = (order: readonly Pair[]) =>
    order.slice(1).filter((pair, i) => sharesTeam(pair, order[i])).length;
  return rotations.reduce((best, rotation) =>
    backToBacks([...firstLeg, ...rotation]) < backToBacks([...firstLeg, ...best]) ? rotation : best,
  );
}

function allPairs(ids: readonly Id[]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  }
  return pairs;
}

/**
 * Depth-first search guided by rest time. With `strict`, consecutive matches must not share a
 * team; returns null when no such order is found within the search budget.
 */
function findOrder(
  teamIds: readonly Id[],
  pairs: readonly Pair[],
  rng: Rng,
  strict: boolean,
): Pair[] | null {
  const lastPlayed = new Map<Id, number>(teamIds.map((id) => [id, -Infinity]));
  const played = new Map<Id, number>(teamIds.map((id) => [id, 0]));
  const used = new Array<boolean>(pairs.length).fill(false);
  const order: Pair[] = [];
  const tieBreak = pairs.map(() => rng());
  let budget = SEARCH_BUDGET;

  const step = (): boolean => {
    if (order.length === pairs.length) return true;
    if (--budget < 0) return false;
    const position = order.length;
    const previous = order[position - 1];

    const candidates = pairs
      .map((pair, index) => ({ pair, index }))
      .filter(({ pair, index }) => {
        if (used[index]) return false;
        if (strict && previous && sharesTeam(pair, previous)) return false;
        return balancedAfter(pair, played);
      })
      .sort((x, y) => score(y.pair) - score(x.pair) || tieBreak[x.index] - tieBreak[y.index]);

    for (const { pair, index } of candidates) {
      const [a, b] = pair;
      const saved = [lastPlayed.get(a)!, lastPlayed.get(b)!];
      used[index] = true;
      order.push(pair);
      lastPlayed.set(a, position).set(b, position);
      played.set(a, played.get(a)! + 1).set(b, played.get(b)! + 1);

      if (step()) return true;

      used[index] = false;
      order.pop();
      lastPlayed.set(a, saved[0]).set(b, saved[1]);
      played.set(a, played.get(a)! - 1).set(b, played.get(b)! - 1);
      if (budget < 0) return false;
    }
    return false;
  };

  /** Prefer the match whose teams have rested the longest, then the ones with fewer games. */
  const score = ([a, b]: Pair): number => {
    const position = order.length;
    const restA = Math.min(position - lastPlayed.get(a)!, 99);
    const restB = Math.min(position - lastPlayed.get(b)!, 99);
    return Math.min(restA, restB) * 1000 + (restA + restB) * 10 - (played.get(a)! + played.get(b)!);
  };

  return step() ? order : null;
}

function sharesTeam([a, b]: Pair, [c, d]: Pair): boolean {
  return a === c || a === d || b === c || b === d;
}

/** Keeps the gap between the most and least played teams at two matches at most. */
function balancedAfter([a, b]: Pair, played: Map<Id, number>): boolean {
  let min = Infinity;
  let max = -Infinity;
  for (const [id, count] of played) {
    const next = id === a || id === b ? count + 1 : count;
    min = Math.min(min, next);
    max = Math.max(max, next);
  }
  return max - min <= 2;
}

/** Number of times a team plays two matches in a row in the given order. */
export function backToBackCount(matches: readonly Match[]): number {
  let count = 0;
  for (let i = 1; i < matches.length; i++) {
    const prev = matches[i - 1];
    const curr = matches[i];
    if (sharesTeam([prev.homeId, prev.awayId], [curr.homeId, curr.awayId])) count++;
  }
  return count;
}

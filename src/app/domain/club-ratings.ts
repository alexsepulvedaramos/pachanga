// Club ratings estimated from EA's public player ratings. EA publishes neither team ratings nor
// each club's default formation, so a club's rating is the average of its best possible starting
// XI across the common formations, as the game averages the starting XI.
// This module has no imports so the Node update script can run it directly.

export interface RatedPlayer {
  name: string;
  /** Short position label as given by EA: GK, CB, LB, CM, ST… */
  position: string;
  overall: number;
}

export type Line = 'gk' | 'def' | 'mid' | 'att';

export interface LineupSlot extends RatedPlayer {
  line: Line;
}

export interface ClubRating {
  id: number;
  name: string;
  league: string;
  overall: number;
  attack: number;
  midfield: number;
  defence: number;
  /** Approximation of the in-game star rating, in half stars. */
  stars: number;
  /** Formation of the best lineup found, e.g. "4-2-3-1". */
  formation: string;
  lineup: LineupSlot[];
}

export interface ClubRatingsFile {
  /** Game edition the ratings belong to, e.g. "EA SPORTS FC 26". */
  edition: string;
  /** Where the numbers come from, shown in the app. */
  source: string;
  updatedAt: string;
  clubs: ClubRating[];
}

/** data/clubs/index.json: the editions available, newest first. */
export interface EditionIndexEntry {
  id: string;
  edition: string;
  file: string;
  updatedAt: string;
}

const LEFT_BACKS = ['LB', 'LWB'];
const RIGHT_BACKS = ['RB', 'RWB'];
const CENTRE_BACKS = ['CB'];
const HOLDING = ['CDM', 'CM'];
const MIDFIELDERS = ['CDM', 'CM', 'CAM'];
const PLAYMAKERS = ['CAM', 'CM', 'CF'];
const LEFT_WIDE = ['LW', 'LM', 'LF'];
const RIGHT_WIDE = ['RW', 'RM', 'RF'];
const STRIKERS = ['ST', 'CF'];
const FORWARDS = [...STRIKERS, ...LEFT_WIDE, ...RIGHT_WIDE];
const DEFENDERS = [...CENTRE_BACKS, ...LEFT_BACKS, ...RIGHT_BACKS];

type Slot = [positions: string[], line: Line];

const GK: Slot = [['GK'], 'gk'];
const BACK_FOUR: Slot[] = [
  [LEFT_BACKS, 'def'],
  [CENTRE_BACKS, 'def'],
  [CENTRE_BACKS, 'def'],
  [RIGHT_BACKS, 'def'],
];

/** Common formations, each slot listing the positions that fit it best. */
export const FORMATIONS: Record<string, Slot[]> = {
  '4-3-3': [
    GK,
    ...BACK_FOUR,
    [MIDFIELDERS, 'mid'],
    [MIDFIELDERS, 'mid'],
    [MIDFIELDERS, 'mid'],
    // The striker goes first so a wide slot never takes the best centre-forward.
    [STRIKERS, 'att'],
    [[...LEFT_WIDE, ...STRIKERS], 'att'],
    [[...RIGHT_WIDE, ...STRIKERS], 'att'],
  ],
  '4-2-3-1': [
    GK,
    ...BACK_FOUR,
    [HOLDING, 'mid'],
    [HOLDING, 'mid'],
    [PLAYMAKERS, 'mid'],
    [LEFT_WIDE, 'att'],
    [STRIKERS, 'att'],
    [RIGHT_WIDE, 'att'],
  ],
  '4-4-2': [
    GK,
    ...BACK_FOUR,
    [LEFT_WIDE, 'mid'],
    [MIDFIELDERS, 'mid'],
    [MIDFIELDERS, 'mid'],
    [RIGHT_WIDE, 'mid'],
    [STRIKERS, 'att'],
    [STRIKERS, 'att'],
  ],
  '3-5-2': [
    GK,
    [CENTRE_BACKS, 'def'],
    [CENTRE_BACKS, 'def'],
    [CENTRE_BACKS, 'def'],
    [['LWB', 'LM', 'LB'], 'mid'],
    [HOLDING, 'mid'],
    [HOLDING, 'mid'],
    [PLAYMAKERS, 'mid'],
    [['RWB', 'RM', 'RB'], 'mid'],
    [STRIKERS, 'att'],
    [STRIKERS, 'att'],
  ],
};

const FALLBACK: Record<Line, string[]> = {
  gk: ['GK'],
  def: DEFENDERS,
  mid: [...MIDFIELDERS, ...FORWARDS, ...DEFENDERS],
  att: [...FORWARDS, ...MIDFIELDERS],
};

/**
 * Best lineup for a squad in one formation: each slot takes the best unused player of a fitting
 * position, falling back to the best unused player of a related line when there is none.
 */
export function bestLineup(
  squad: readonly RatedPlayer[],
  formation: Slot[] = FORMATIONS['4-3-3'],
): LineupSlot[] | null {
  const pool = [...squad].sort((a, b) => b.overall - a.overall);
  const used = new Set<RatedPlayer>();
  const take = (positions: string[], line: Line): LineupSlot | null => {
    const player = pool.find((p) => !used.has(p) && positions.includes(p.position));
    if (!player) return null;
    used.add(player);
    return { ...player, line };
  };

  const lineup: LineupSlot[] = [];
  for (const [positions, line] of formation) {
    const slot = take(positions, line) ?? take(FALLBACK[line], line);
    if (!slot) return null;
    lineup.push(slot);
  }
  return lineup;
}

/** The formation whose best lineup has the highest total rating (4-3-3 wins ties). */
export function bestFormation(
  squad: readonly RatedPlayer[],
): { formation: string; lineup: LineupSlot[] } | null {
  let best: { formation: string; lineup: LineupSlot[]; total: number } | null = null;
  for (const [formation, slots] of Object.entries(FORMATIONS)) {
    const lineup = bestLineup(squad, slots);
    if (!lineup) continue;
    const total = lineup.reduce((sum, p) => sum + p.overall, 0);
    if (!best || total > best.total) best = { formation, lineup, total };
  }
  return best && { formation: best.formation, lineup: best.lineup };
}

const average = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

/** Rough mapping to the game's star ratings, calibrated against the published FC 26 stars. */
export function starsFor(overall: number): number {
  const thresholds: [number, number][] = [
    [85, 5],
    [80, 4.5],
    [77, 4],
    [74, 3.5],
    [71, 3],
    [68, 2.5],
    [65, 2],
  ];
  return thresholds.find(([min]) => overall >= min)?.[1] ?? 1.5;
}

export function rateClub(
  id: number,
  name: string,
  league: string,
  squad: readonly RatedPlayer[],
): ClubRating | null {
  const best = bestFormation(squad);
  if (!best) return null;
  const { formation, lineup } = best;
  const line = (l: Line) => lineup.filter((p) => p.line === l).map((p) => p.overall);
  const overall = average(lineup.map((p) => p.overall));
  return {
    id,
    name,
    league,
    overall,
    attack: average(line('att')),
    midfield: average(line('mid')),
    defence: average([...line('gk'), ...line('def')]),
    stars: starsFor(overall),
    formation,
    lineup,
  };
}

/**
 * `count` clubs as close as possible to `target`: widens the allowed gap one point at a time until
 * enough clubs fit, then picks at random among them.
 */
export function suggestClubs(
  clubs: readonly ClubRating[],
  count: number,
  target: number,
  random: () => number = Math.random,
): ClubRating[] {
  if (clubs.length <= count) return [...clubs];
  for (let gap = 0; ; gap++) {
    const fitting = clubs.filter((c) => Math.abs(c.overall - target) <= gap);
    if (fitting.length >= count) {
      const shuffled = [...fitting];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, count).sort((a, b) => b.overall - a.overall);
    }
  }
}

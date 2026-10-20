import { Id, Match, TiebreakCriterion } from './types';
import { seededRng, shuffle } from './rng';

export interface StandingRow {
  teamId: Id;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Last results, oldest first. */
  form: ('W' | 'D' | 'L')[];
}

export const POINTS = { win: 3, draw: 1, loss: 0 } as const;

export const TIEBREAKER_LABELS: Record<TiebreakCriterion, string> = {
  goalDifference: 'Diferencia de goles',
  goalsFor: 'Goles a favor',
  goalsAgainst: 'Menos goles en contra',
  headToHeadPoints: 'Enfrentamiento directo (puntos)',
  headToHeadGoalDifference: 'Enfrentamiento directo (diferencia de goles)',
  wins: 'Más victorias',
  lot: 'Sorteo',
};

export const DEFAULT_TIEBREAKERS: TiebreakCriterion[] = [
  'goalDifference',
  'goalsFor',
  'headToHeadPoints',
  'headToHeadGoalDifference',
  'lot',
];

function emptyRow(teamId: Id): StandingRow {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: [],
  };
}

function isScored(match: Match): match is Match & { homeGoals: number; awayGoals: number } {
  return match.status === 'done' && match.homeGoals !== null && match.awayGoals !== null;
}

/** Aggregates rows for the given teams using only finished matches between those teams. */
export function tally(teamIds: readonly Id[], matches: readonly Match[]): Map<Id, StandingRow> {
  const rows = new Map<Id, StandingRow>(teamIds.map((id) => [id, emptyRow(id)]));
  for (const match of matches) {
    if (!isScored(match)) continue;
    const home = rows.get(match.homeId);
    const away = rows.get(match.awayId);
    if (!home || !away) continue;
    apply(home, match.homeGoals, match.awayGoals);
    apply(away, match.awayGoals, match.homeGoals);
  }
  return rows;
}

function apply(row: StandingRow, scored: number, conceded: number): void {
  row.played++;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.won++;
    row.points += POINTS.win;
    row.form.push('W');
  } else if (scored === conceded) {
    row.drawn++;
    row.points += POINTS.draw;
    row.form.push('D');
  } else {
    row.lost++;
    row.points += POINTS.loss;
    row.form.push('L');
  }
}

/**
 * Group table sorted by points and then by the configured tiebreakers, applied in order.
 * Head-to-head criteria are evaluated as a mini-league among the teams still tied at that point.
 */
export function computeStandings(
  teamIds: readonly Id[],
  groupMatches: readonly Match[],
  tiebreakers: readonly TiebreakCriterion[],
  seed: number,
): StandingRow[] {
  const rows = tally(teamIds, groupMatches);
  const lotOrder = shuffle([...teamIds].sort(), seededRng(seed));

  const metric = (criterion: TiebreakCriterion, tied: readonly Id[]): Map<Id, number> => {
    switch (criterion) {
      case 'goalDifference':
        return new Map(tied.map((id) => [id, rows.get(id)!.goalDifference]));
      case 'goalsFor':
        return new Map(tied.map((id) => [id, rows.get(id)!.goalsFor]));
      case 'goalsAgainst':
        return new Map(tied.map((id) => [id, -rows.get(id)!.goalsAgainst]));
      case 'wins':
        return new Map(tied.map((id) => [id, rows.get(id)!.won]));
      case 'headToHeadPoints': {
        const mini = tally(tied, groupMatches);
        return new Map(tied.map((id) => [id, mini.get(id)!.points]));
      }
      case 'headToHeadGoalDifference': {
        const mini = tally(tied, groupMatches);
        return new Map(tied.map((id) => [id, mini.get(id)!.goalDifference]));
      }
      case 'lot':
        return new Map(tied.map((id) => [id, -lotOrder.indexOf(id)]));
    }
  };

  /** Recursively splits a tied block using the remaining criteria. */
  const resolve = (tied: Id[], criteria: readonly TiebreakCriterion[]): Id[] => {
    if (tied.length <= 1) return tied;
    if (criteria.length === 0) return [...tied].sort((a, b) => lotOrder.indexOf(a) - lotOrder.indexOf(b));
    const [criterion, ...rest] = criteria;
    const values = metric(criterion, tied);
    return groupByValue(tied, values).flatMap((block) => resolve(block, rest));
  };

  const byPoints = new Map(teamIds.map((id) => [id, rows.get(id)!.points]));
  const ordered = groupByValue([...teamIds], byPoints).flatMap((block) =>
    resolve(block, tiebreakers),
  );
  return ordered.map((id) => rows.get(id)!);
}

/** Groups ids into blocks of equal value, best (highest) value first. */
function groupByValue(ids: Id[], values: Map<Id, number>): Id[][] {
  const sorted = [...ids].sort((a, b) => values.get(b)! - values.get(a)!);
  const blocks: Id[][] = [];
  for (const id of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && values.get(last[0]) === values.get(id)) last.push(id);
    else blocks.push([id]);
  }
  return blocks;
}

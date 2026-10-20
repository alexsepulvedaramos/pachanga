import { Id, KnockoutChoices, Match, Phase } from './types';

/**
 * Knockout layout by number of teams, as written in the rulebook:
 * - 5 teams (10 players): top 3 straight to the semis, 4th vs 5th playoff.
 * - 6 teams (11–12 players): top 2 straight to the semis, 3rd–6th play the playoff.
 * - 7 teams (13–14 players): like 6 teams, the 7th is eliminated.
 */
export interface KnockoutFormat {
  /** Group positions (1-based) that go straight to the semi-finals. */
  direct: number;
  /** Group positions (1-based) that play the playoff round. */
  playoff: number[];
}

export const MIN_TEAMS = 5;
export const MAX_TEAMS = 7;

export function knockoutFormat(teamCount: number): KnockoutFormat {
  switch (teamCount) {
    case 5:
      return { direct: 3, playoff: [4, 5] };
    case 6:
    case 7:
      return { direct: 2, playoff: [3, 4, 5, 6] };
    default:
      throw new Error(`Unsupported team count: ${teamCount}`);
  }
}

export const PHASE_LABELS: Record<Phase, string> = {
  group: 'Liguilla',
  playoff: 'Repesca',
  semi: 'Semifinal',
  third: '3er puesto',
  final: 'Final',
};

export type KnockoutDecision =
  | { kind: 'playoffOpponent'; chooserId: Id; options: Id[] }
  | { kind: 'playoffOrder'; chooserId: Id }
  | { kind: 'semiOpponent'; chooserId: Id; options: Id[] }
  | { kind: 'semiOrder'; chooserId: Id };

/** Winner of a finished match, using penalties when the score (extra time included) is level. */
export function winnerOf(match: Match): Id | null {
  if (match.status !== 'done' || match.homeGoals === null || match.awayGoals === null) return null;
  if (match.homeGoals > match.awayGoals) return match.homeId;
  if (match.awayGoals > match.homeGoals) return match.awayId;
  const home = match.homePens ?? null;
  const away = match.awayPens ?? null;
  if (home === null || away === null || home === away) return null;
  return home > away ? match.homeId : match.awayId;
}

export function loserOf(match: Match): Id | null {
  const winner = winnerOf(match);
  if (!winner) return null;
  return winner === match.homeId ? match.awayId : match.homeId;
}

function knockoutMatch(id: Id, phase: Phase, homeId: Id, awayId: Id): Match {
  return { id, phase, homeId, awayId, status: 'pending', homeGoals: null, awayGoals: null };
}

function byPhase(matches: readonly Match[], phase: Phase): Match[] {
  return matches.filter((m) => m.phase === phase);
}

const allDone = (matches: readonly Match[]) =>
  matches.length > 0 && matches.every((m) => winnerOf(m) !== null);

/** Teams playing the playoff, best-ranked first. */
export function playoffTeams(ranking: readonly Id[]): Id[] {
  return knockoutFormat(ranking.length).playoff.map((pos) => ranking[pos - 1]);
}

/** Teams in the semi-finals, best group position first, once the playoff is over. */
export function semiFinalists(ranking: readonly Id[], matches: readonly Match[]): Id[] | null {
  const playoff = byPhase(matches, 'playoff');
  if (!allDone(playoff)) return null;
  const winners = new Set(playoff.map((m) => winnerOf(m)!));
  const direct = ranking.slice(0, knockoutFormat(ranking.length).direct);
  return [...direct, ...ranking.filter((id) => winners.has(id))];
}

/** The next choice someone has to make before more knockout matches can be created. */
export function pendingDecision(
  ranking: readonly Id[],
  choices: KnockoutChoices,
  matches: readonly Match[],
): KnockoutDecision | null {
  const pool = playoffTeams(ranking);

  if (pool.length === 4 && byPhase(matches, 'playoff').length === 0) {
    const [chooser, orderChooser] = pool;
    if (!choices.playoffOpponentId) {
      return { kind: 'playoffOpponent', chooserId: chooser, options: pool.slice(1) };
    }
    if (choices.playoffChooserFirst === undefined) {
      return { kind: 'playoffOrder', chooserId: orderChooser };
    }
  }

  const semis = semiFinalists(ranking, matches);
  if (semis && byPhase(matches, 'semi').length === 0) {
    const [chooser, orderChooser] = semis;
    if (!choices.semiOpponentId) {
      return { kind: 'semiOpponent', chooserId: chooser, options: semis.slice(1) };
    }
    if (choices.semiChooserFirst === undefined) {
      return { kind: 'semiOrder', chooserId: orderChooser };
    }
  }
  return null;
}

/**
 * Knockout matches that can be created now given the ranking, the choices made so far and the
 * results already in. Returns only the new matches; existing ones are never rebuilt.
 */
export function nextKnockoutMatches(
  ranking: readonly Id[],
  choices: KnockoutChoices,
  matches: readonly Match[],
): Match[] {
  const pool = playoffTeams(ranking);

  if (byPhase(matches, 'playoff').length === 0) {
    if (pool.length === 2) return [knockoutMatch('po1', 'playoff', pool[0], pool[1])];
    if (!choices.playoffOpponentId || choices.playoffChooserFirst === undefined) return [];
    return pairUp('po', 'playoff', pool, choices.playoffOpponentId, choices.playoffChooserFirst);
  }

  const semis = semiFinalists(ranking, matches);
  if (!semis) return [];
  if (byPhase(matches, 'semi').length === 0) {
    if (!choices.semiOpponentId || choices.semiChooserFirst === undefined) return [];
    return pairUp('sf', 'semi', semis, choices.semiOpponentId, choices.semiChooserFirst);
  }

  const semiMatches = byPhase(matches, 'semi');
  if (!allDone(semiMatches) || byPhase(matches, 'final').length > 0) return [];
  const [sf1, sf2] = semiMatches;
  return [
    knockoutMatch('third', 'third', loserOf(sf1)!, loserOf(sf2)!),
    knockoutMatch('final', 'final', winnerOf(sf1)!, winnerOf(sf2)!),
  ];
}

/**
 * Builds two matches from four teams (best first): the best picks its opponent, the remaining two
 * play each other, and the second best decides whether its own match goes first.
 */
function pairUp(
  prefix: string,
  phase: Phase,
  teams: readonly Id[],
  opponentId: Id,
  orderChooserFirst: boolean,
): Match[] {
  const [chooser, orderChooser] = teams;
  const rest = teams.filter((id) => id !== chooser && id !== opponentId);
  const chooserMatch: [Id, Id] = [chooser, opponentId];
  const otherMatch: [Id, Id] = [rest[0], rest[1]];
  const orderChooserMatch = chooserMatch.includes(orderChooser) ? chooserMatch : otherMatch;
  const otherOne = orderChooserMatch === chooserMatch ? otherMatch : chooserMatch;
  const ordered = orderChooserFirst ? [orderChooserMatch, otherOne] : [otherOne, orderChooserMatch];
  return ordered.map(([home, away], i) => knockoutMatch(`${prefix}${i + 1}`, phase, home, away));
}

/** Final placing once the tournament is over: champion, runner-up, third, fourth. */
export function podium(matches: readonly Match[]): Id[] | null {
  const final = matches.find((m) => m.phase === 'final');
  const third = matches.find((m) => m.phase === 'third');
  if (!final || !third || !winnerOf(final) || !winnerOf(third)) return null;
  return [winnerOf(final)!, loserOf(final)!, winnerOf(third)!, loserOf(third)!];
}

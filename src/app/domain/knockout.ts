import { Id, KnockoutChoices, Match, Phase } from './types';

/**
 * Tournament layout by number of teams. 5–7 teams follow the rulebook; the other sizes were
 * agreed with the organiser:
 * - 3 teams (6 players): double round-robin, the 1st goes straight to the final and the 2nd and
 *   3rd play a semi-final for the other place. No third-place match.
 * - 4 teams (7–8 players): double round-robin, semi-finals 1st vs 4th and 2nd vs 3rd.
 * - 5 teams (9–10 players): top 3 straight to the semis, 4th vs 5th playoff.
 * - 6 teams (11–12 players): top 2 straight to the semis, 3rd–6th play the playoff.
 * - 7 teams (13–14 players): like 6 teams, the 7th is eliminated.
 * - 8 teams (15–16 players): single round-robin, quarter-finals 1–8, 4–5, 2–7, 3–6.
 */
export interface KnockoutFormat {
  /** Times every pair of teams meets in the group stage. */
  legs: 1 | 2;
  /** Group positions (1-based) that skip the first knockout round. */
  direct: number;
  /** Group positions (1-based) that play the first knockout round. */
  playoff: number[];
  firstRound: 'playoff' | 'quarter' | 'semi';
  /** Whether the playoff and semi-final pairings are chosen by the best-ranked teams. */
  choices: boolean;
  thirdPlace: boolean;
  /** Standings legend for the two qualifying zones. */
  directLabel: string;
  playoffLabel: string;
}

export const MIN_TEAMS = 3;
export const MAX_TEAMS = 8;

const REPECHAGE = {
  legs: 1,
  firstRound: 'playoff',
  choices: true,
  thirdPlace: true,
  directLabel: 'Directo a semis',
  playoffLabel: 'Repesca',
} as const;

export function knockoutFormat(teamCount: number): KnockoutFormat {
  switch (teamCount) {
    case 3:
      return {
        legs: 2,
        direct: 1,
        playoff: [2, 3],
        firstRound: 'semi',
        choices: false,
        thirdPlace: false,
        directLabel: 'Directo a la final',
        playoffLabel: 'Semifinal',
      };
    case 4:
      return {
        legs: 2,
        direct: 0,
        playoff: [1, 2, 3, 4],
        firstRound: 'semi',
        choices: false,
        thirdPlace: true,
        directLabel: '',
        playoffLabel: 'Semifinales',
      };
    case 5:
      return { ...REPECHAGE, direct: 3, playoff: [4, 5] };
    case 6:
    case 7:
      return { ...REPECHAGE, direct: 2, playoff: [3, 4, 5, 6] };
    case 8:
      return {
        legs: 1,
        direct: 0,
        playoff: [1, 2, 3, 4, 5, 6, 7, 8],
        firstRound: 'quarter',
        choices: false,
        thirdPlace: true,
        directLabel: '',
        playoffLabel: 'Cuartos',
      };
    default:
      throw new Error(`Unsupported team count: ${teamCount}`);
  }
}

/** Group positions in each quarter-final; winners of 1 and 2, and of 3 and 4, meet in the semis. */
export const QUARTER_SEEDS: readonly (readonly [number, number])[] = [
  [1, 8],
  [4, 5],
  [2, 7],
  [3, 6],
];

/** Every knockout match the format will produce, in playing order. */
export function knockoutPhases(teamCount: number): Phase[] {
  const format = knockoutFormat(teamCount);
  const first: Phase[] =
    format.firstRound === 'quarter'
      ? Array(4).fill('quarter')
      : format.firstRound === 'playoff'
        ? Array(format.playoff.length / 2).fill('playoff')
        : [];
  const semis: Phase[] = teamCount === 3 ? ['semi'] : ['semi', 'semi'];
  return [...first, ...semis, ...(format.thirdPlace ? (['third'] as Phase[]) : []), 'final'];
}

export function groupMatchCount(teamCount: number): number {
  return (knockoutFormat(teamCount).legs * teamCount * (teamCount - 1)) / 2;
}

export const PHASE_LABELS: Record<Phase, string> = {
  group: 'Liguilla',
  playoff: 'Repesca',
  quarter: 'Cuartos',
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
  const format = knockoutFormat(ranking.length);
  if (format.firstRound !== 'playoff') return [];
  return format.playoff.map((pos) => ranking[pos - 1]);
}

/**
 * Teams still in when the semi-finals are drawn, best group position first: once the playoff or
 * the quarter-finals are over, or straight after the group stage (with 3 teams the 1st waits for
 * the final).
 */
export function semiFinalists(ranking: readonly Id[], matches: readonly Match[]): Id[] | null {
  const format = knockoutFormat(ranking.length);
  if (format.firstRound === 'semi') return ranking.slice(0, format.direct + format.playoff.length);
  const first = byPhase(matches, format.firstRound);
  if (!allDone(first)) return null;
  const winners = new Set(first.map((m) => winnerOf(m)!));
  const direct = ranking.slice(0, format.direct);
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
    // One privilege each: the 3rd picks the rival, the 4th can't be picked, the 5th sets the order.
    const [chooser, , orderChooser] = pool;
    if (!choices.playoffOpponentId) {
      // The 4th can't be picked, like the 2nd in the semis: being better ranked is the privilege.
      return { kind: 'playoffOpponent', chooserId: chooser, options: pool.slice(2) };
    }
    if (choices.playoffChooserFirst === undefined) {
      return { kind: 'playoffOrder', chooserId: orderChooser };
    }
  }

  const semis = knockoutFormat(ranking.length).choices ? semiFinalists(ranking, matches) : null;
  if (semis && byPhase(matches, 'semi').length === 0) {
    // The same: the 1st picks, the 2nd can't be picked, the 3rd semi-finalist sets the order.
    const [chooser, , orderChooser] = semis;
    if (!choices.semiOpponentId) {
      // The 2nd can't be picked: being 2nd is what keeps the group winner away from them.
      return { kind: 'semiOpponent', chooserId: chooser, options: semis.slice(2) };
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
  const format = knockoutFormat(ranking.length);
  const seed = (position: number) => ranking[position - 1];
  /** Better group position at home. */
  const ranked = (a: Id, b: Id): [Id, Id] =>
    ranking.indexOf(a) <= ranking.indexOf(b) ? [a, b] : [b, a];

  if (format.firstRound === 'playoff' && byPhase(matches, 'playoff').length === 0) {
    const pool = playoffTeams(ranking);
    if (pool.length === 2) return [knockoutMatch('po1', 'playoff', pool[0], pool[1])];
    if (!choices.playoffOpponentId || choices.playoffChooserFirst === undefined) return [];
    return pairUp('po', 'playoff', pool, choices.playoffOpponentId, choices.playoffChooserFirst);
  }
  if (format.firstRound === 'quarter' && byPhase(matches, 'quarter').length === 0) {
    return QUARTER_SEEDS.map(([a, b], i) => knockoutMatch(`qf${i + 1}`, 'quarter', seed(a), seed(b)));
  }

  const semis = semiFinalists(ranking, matches);
  if (!semis) return [];
  if (byPhase(matches, 'semi').length === 0) {
    if (ranking.length === 3) return [knockoutMatch('sf1', 'semi', seed(2), seed(3))];
    if (format.firstRound === 'quarter') {
      const [qf1, qf2, qf3, qf4] = byPhase(matches, 'quarter').map((m) => winnerOf(m)!);
      return [
        knockoutMatch('sf1', 'semi', ...ranked(qf1, qf2)),
        knockoutMatch('sf2', 'semi', ...ranked(qf3, qf4)),
      ];
    }
    if (!format.choices) {
      return [
        knockoutMatch('sf1', 'semi', seed(1), seed(4)),
        knockoutMatch('sf2', 'semi', seed(2), seed(3)),
      ];
    }
    if (!choices.semiOpponentId || choices.semiChooserFirst === undefined) return [];
    return pairUp('sf', 'semi', semis, choices.semiOpponentId, choices.semiChooserFirst);
  }

  const semiMatches = byPhase(matches, 'semi');
  if (!allDone(semiMatches) || byPhase(matches, 'final').length > 0) return [];
  if (!format.thirdPlace) {
    return [knockoutMatch('final', 'final', seed(1), winnerOf(semiMatches[0])!)];
  }
  const [sf1, sf2] = semiMatches;
  return [
    knockoutMatch('third', 'third', loserOf(sf1)!, loserOf(sf2)!),
    knockoutMatch('final', 'final', winnerOf(sf1)!, winnerOf(sf2)!),
  ];
}

/**
 * Builds two matches from four teams (best first): the best picks its opponent, the remaining two
 * play each other, and the third best decides whether its own match goes first.
 */
function pairUp(
  prefix: string,
  phase: Phase,
  teams: readonly Id[],
  opponentId: Id,
  orderChooserFirst: boolean,
): Match[] {
  const [chooser, , orderChooser] = teams;
  const rest = teams.filter((id) => id !== chooser && id !== opponentId);
  const chooserMatch: [Id, Id] = [chooser, opponentId];
  const otherMatch: [Id, Id] = [rest[0], rest[1]];
  const orderChooserMatch = chooserMatch.includes(orderChooser) ? chooserMatch : otherMatch;
  const otherOne = orderChooserMatch === chooserMatch ? otherMatch : chooserMatch;
  const ordered = orderChooserFirst ? [orderChooserMatch, otherOne] : [otherOne, orderChooserMatch];
  return ordered.map(([home, away], i) => knockoutMatch(`${prefix}${i + 1}`, phase, home, away));
}

/**
 * Final placing once the tournament is over: champion, runner-up, third and fourth. Without a
 * third-place match (3 teams) the semi-final loser is third.
 */
export function podium(matches: readonly Match[]): Id[] | null {
  const final = matches.find((m) => m.phase === 'final');
  const third = matches.find((m) => m.phase === 'third');
  if (!final || !winnerOf(final)) return null;
  const top = [winnerOf(final)!, loserOf(final)!];
  if (third) return winnerOf(third) ? [...top, winnerOf(third)!, loserOf(third)!] : null;
  const semi = matches.find((m) => m.phase === 'semi');
  return semi && loserOf(semi) ? [...top, loserOf(semi)!] : null;
}

/** One-line description of the format, shown when setting the tournament up. */
export function formatSummary(teamCount: number): string {
  const format = knockoutFormat(teamCount);
  const league = format.legs === 2 ? 'Liga a doble vuelta' : 'Liga a una vuelta';
  switch (teamCount) {
    case 3:
      return `${league} · el 1º va directo a la final y el 2º y el 3º se juegan la otra plaza`;
    case 4:
      return `${league} · semis 1º–4º y 2º–3º, 3er puesto y final`;
    case 5:
      return `${league} · los 3 primeros a semis, 4º y 5º a la repesca`;
    case 6:
      return `${league} · los 2 primeros a semis, del 3º al 6º a la repesca`;
    case 7:
      return `${league} · los 2 primeros a semis, del 3º al 6º a la repesca y el 7º fuera`;
    default:
      return `${league} · cuartos 1º–8º, 4º–5º, 2º–7º y 3º–6º, semis, 3er puesto y final`;
  }
}

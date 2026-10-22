import { knockoutFormat, KnockoutDecision } from './knockout';
import { StandingRow } from './standings';
import { currentDecision, groupMatches, standings } from './tournament';
import { Id, Match, Tournament } from './types';

/** Where a team ends the group stage. */
export type LeagueZone = 'direct' | 'playoff' | 'out';

export interface LeagueRecapRow extends StandingRow {
  zone: LeagueZone;
}

/** The short break when the group stage ends: final table, its numbers and what comes next. */
export interface LeagueRecap {
  table: LeagueRecapRow[];
  /** What each zone means in this format ("Directo a semis", "Repesca", …). */
  zoneLabels: Record<LeagueZone, string>;
  matches: number;
  goals: number;
  biggestWin: Match | null;
  /** Most goals for, and fewest against; ties go to the better placed team. */
  bestAttack: StandingRow;
  bestDefence: StandingRow;
  /** Group stage top scorers, when scorers are tracked. */
  topScorers: { participantIds: Id[]; goals: number } | null;
  /** A choice to make before the knockout can be drawn up, or its first round once it is set. */
  decision: KnockoutDecision | null;
  nextMatches: Match[];
}

export function leagueRecap(t: Tournament): LeagueRecap | null {
  if ((t.stage !== 'knockout' && t.stage !== 'finished') || !t.groupRanking) return null;
  const format = knockoutFormat(t.teams.length);
  const rows = standings(t);
  const table = t.groupRanking.map((teamId, i): LeagueRecapRow => {
    const position = i + 1;
    const zone: LeagueZone =
      position <= format.direct ? 'direct' : format.playoff.includes(position) ? 'playoff' : 'out';
    return { ...rows.find((r) => r.teamId === teamId)!, zone };
  });

  const played = groupMatches(t).filter((m) => m.status === 'done');
  const goalsIn = (m: Match) => (m.homeGoals ?? 0) + (m.awayGoals ?? 0);
  const margin = (m: Match) => Math.abs((m.homeGoals ?? 0) - (m.awayGoals ?? 0));
  const biggestWin = played.reduce<Match | null>(
    (best, m) =>
      margin(m) > 0 && (!best || margin(m) > margin(best) || (margin(m) === margin(best) && goalsIn(m) > goalsIn(best)))
        ? m
        : best,
    null,
  );

  const firstBy = (better: (a: StandingRow, b: StandingRow) => boolean) =>
    table.reduce((best, row) => (better(row, best) ? row : best));

  return {
    table,
    zoneLabels: { direct: format.directLabel, playoff: format.playoffLabel, out: 'Eliminados' },
    matches: played.length,
    goals: played.reduce((sum, m) => sum + goalsIn(m), 0),
    biggestWin,
    bestAttack: firstBy((a, b) => a.goalsFor > b.goalsFor),
    bestDefence: firstBy((a, b) => a.goalsAgainst < b.goalsAgainst),
    topScorers: t.config.trackScorers ? groupTopScorers(played) : null,
    decision: currentDecision(t),
    nextMatches: firstKnockoutRound(t),
  };
}

function groupTopScorers(played: Match[]): LeagueRecap['topScorers'] {
  const counts = new Map<Id, number>();
  for (const m of played) {
    for (const g of m.goals ?? []) if (g.scorerId) counts.set(g.scorerId, (counts.get(g.scorerId) ?? 0) + 1);
  }
  const most = Math.max(0, ...counts.values());
  if (most === 0) return null;
  return { participantIds: [...counts].filter(([, goals]) => goals === most).map(([id]) => id), goals: most };
}

/** The knockout's opening matches, played or not, so the recap reads the same seen later on. */
function firstKnockoutRound(t: Tournament): Match[] {
  const first = t.matches.find((m) => m.phase !== 'group');
  return first ? t.matches.filter((m) => m.phase === first.phase) : [];
}

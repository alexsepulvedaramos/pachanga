import { describe, expect, it } from 'vitest';
import { leagueRecap } from './league-recap';
import { seededRng } from './rng';
import {
  choosers,
  createTournament,
  currentDecision,
  DEFAULT_CONFIG,
  finishDraw,
  playerMakeChoice,
  recordResult,
  spin,
  startMatch,
} from './tournament';
import { Tournament } from './types';

/** A 12-player (6-team) tournament with its group stage played, home side winning by the match number. */
function afterGroups(trackScorers = true): Tournament {
  const rng = seededRng(3);
  let t = createTournament({
    id: 'LIGA01',
    name: 'Liga Cup',
    participantNames: Array.from({ length: 12 }, (_, i) => `P${i + 1}`),
    clubs: ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool'],
    config: { ...DEFAULT_CONFIG, trackScorers, seed: 3 },
  });
  while (t.draw.picks.length < t.participants.length) t = spin(t, rng).tournament;
  t = finishDraw(t, rng);
  const groups = t.matches.filter((m) => m.phase === 'group');
  groups.forEach((m, i) => {
    t = startMatch(t, m.id, rng);
    const scorer = t.teams.find((x) => x.id === m.homeId)!.memberIds[0];
    const goals = i % 3;
    t = recordResult(t, m.id, {
      homeGoals: goals,
      awayGoals: 0,
      goals: trackScorers ? Array.from({ length: goals }, () => ({ teamId: m.homeId, scorerId: scorer })) : [],
    });
  });
  return t;
}

describe('leagueRecap', () => {
  it('waits for the group stage to end', () => {
    const t = afterGroups();
    expect(leagueRecap({ ...t, stage: 'groups', groupRanking: undefined })).toBeNull();
    expect(leagueRecap(t)).not.toBeNull();
  });

  it('shows the final table in group order, with where each team goes', () => {
    const t = afterGroups();
    const recap = leagueRecap(t)!;
    expect(recap.table.map((r) => r.teamId)).toEqual(t.groupRanking);
    // Six teams: two straight to the semis, four to the playoff.
    expect(recap.table.map((r) => r.zone)).toEqual(['direct', 'direct', 'playoff', 'playoff', 'playoff', 'playoff']);
    expect(recap.zoneLabels.direct).toBe('Directo a semis');
  });

  it('counts the group stage only', () => {
    const t = afterGroups();
    const recap = leagueRecap(t)!;
    const groups = t.matches.filter((m) => m.phase === 'group');
    expect(recap.matches).toBe(groups.length);
    expect(recap.goals).toBe(groups.reduce((sum, m) => sum + m.homeGoals! + m.awayGoals!, 0));
    expect(recap.biggestWin!.homeGoals).toBe(2);
    expect(recap.bestAttack.goalsFor).toBe(Math.max(...recap.table.map((r) => r.goalsFor)));
    expect(recap.bestDefence.goalsAgainst).toBe(Math.min(...recap.table.map((r) => r.goalsAgainst)));
    expect(recap.topScorers!.goals).toBeGreaterThan(0);
  });

  it('leaves the top scorers out when scorers are not tracked', () => {
    expect(leagueRecap(afterGroups(false))!.topScorers).toBeNull();
  });

  it('says who has to pick before the knockout is set', () => {
    const recap = leagueRecap(afterGroups())!;
    expect(recap.decision?.kind).toBe('playoffOpponent');
    expect(recap.nextMatches).toEqual([]);
  });
});

describe('playerMakeChoice', () => {
  it('lets a player of the team whose turn it is choose', () => {
    const t = afterGroups();
    const d = currentDecision(t);
    if (d?.kind !== 'playoffOpponent') throw new Error('expected a playoff choice');
    const [player] = choosers(t, d.chooserId);
    const next = playerMakeChoice(t, player, { playoffOpponentId: d.options[1] });
    expect(next.knockout.playoffOpponentId).toBe(d.options[1]);
    expect(currentDecision(next)?.kind).toBe('playoffOrder');
  });

  it("won't let anyone else choose for them", () => {
    const t = afterGroups();
    const d = currentDecision(t)!;
    const outsider = t.participants.find((p) => !choosers(t, d.chooserId).includes(p.id))!;
    expect(() => playerMakeChoice(t, outsider.id, { playoffOpponentId: t.groupRanking![3] })).toThrow(
      'Esta elección le toca a otro equipo.',
    );
  });

  it('only takes the choice that is pending', () => {
    const t = afterGroups();
    const [player] = choosers(t, currentDecision(t)!.chooserId);
    expect(() => playerMakeChoice(t, player, { semiChooserFirst: true })).toThrow('Esa elección no toca ahora.');
  });
});

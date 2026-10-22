import { describe, expect, it } from 'vitest';
import { buildMessages } from '../../../supabase/functions/notify/messages';
import {
  ballonDorRanking,
  ballonDorState,
  enableBallonDor,
  finalTeamOrder,
  validateVote,
  votingClosed,
  votingOpen,
} from './ballon-dor';
import { galaLive, galaReady, galaSlides, playerRecord, setGalaStep, startGala } from './gala';
import { podium } from './knockout';
import { Rng, seededRng } from './rng';
import {
  createTournament,
  currentDecision,
  DEFAULT_CONFIG,
  finishDraw,
  makeChoice,
  nextMatch,
  recordResult,
  spin,
  startMatch,
  TournamentError,
} from './tournament';
import { BallonDorVote, Tournament } from './types';

const CLUBS = ['Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool'];

/** A finished 10-player tournament where every match ends 1–0 to the home side, scored by its first member. */
function finished(config: Partial<Tournament['config']> = {}, players = 10): Tournament {
  const rng: Rng = seededRng(7);
  let t = createTournament({
    id: 'GALA01',
    name: 'Gala Cup',
    participantNames: Array.from({ length: players }, (_, i) => `P${i + 1}`),
    clubs: CLUBS.slice(0, Math.ceil(players / 2)),
    config: { ...DEFAULT_CONFIG, trackScorers: true, ballonDor: true, seed: 7, ...config },
  });
  while (t.draw.picks.length < players) t = spin(t, rng).tournament;
  t = finishDraw(t, rng);
  for (let guard = 0; guard < 100 && t.stage !== 'finished'; guard++) {
    const decision = currentDecision(t);
    if (decision) {
      if (decision.kind === 'playoffOpponent') t = makeChoice(t, { playoffOpponentId: decision.options[0] });
      if (decision.kind === 'playoffOrder') t = makeChoice(t, { playoffChooserFirst: true });
      if (decision.kind === 'semiOpponent') t = makeChoice(t, { semiOpponentId: decision.options[0] });
      if (decision.kind === 'semiOrder') t = makeChoice(t, { semiChooserFirst: true });
      continue;
    }
    const m = nextMatch(t)!;
    t = startMatch(t, m.id, rng);
    const scorer = t.teams.find((x) => x.id === m.homeId)!.memberIds[0];
    t = recordResult(t, m.id, { homeGoals: 1, awayGoals: 0, goals: [{ teamId: m.homeId, scorerId: scorer }] });
  }
  return t;
}

const vote = (voterId: string, ...picks: string[]): BallonDorVote => ({ voterId, picks });

describe('Ballon d’Or vote', () => {
  it('opens when the final is played, only if the tournament has it', () => {
    const t = finished();
    expect(t.stage).toBe('finished');
    expect(votingOpen(t)).toBe(true);
    expect(votingOpen(finished({ ballonDor: false }))).toBe(false);
    expect(votingOpen(enableBallonDor(finished({ ballonDor: false })))).toBe(true);
  });

  it('takes a podium of three different players, never yourself', () => {
    const t = finished();
    expect(() => validateVote(t, 'p1', ['p2', 'p3', 'p4'])).not.toThrow();
    expect(() => validateVote(t, 'p1', ['p1', 'p3', 'p4'])).toThrow(TournamentError);
    expect(() => validateVote(t, 'p1', ['p2', 'p2', 'p4'])).toThrow(TournamentError);
    expect(() => validateVote(t, 'p1', ['p2', 'p3'])).toThrow(TournamentError);
    expect(() => validateVote(t, 'p1', ['p2', 'p3', 'nobody'])).toThrow(TournamentError);
    expect(() => validateVote(t, 'nobody', ['p2', 'p3', 'p4'])).toThrow(TournamentError);
  });

  it('keeps the ballots secret while open and closes by itself when everybody has voted', () => {
    const t = finished();
    const votes = t.participants.map((p, i) => {
      const others = t.participants.filter((x) => x.id !== p.id).map((x) => x.id);
      return vote(p.id, ...others.slice(i % 3, (i % 3) + 3));
    });
    const partial = ballonDorState(t, votes.slice(0, 4), false);
    expect(partial).toEqual({ voters: ['p1', 'p2', 'p3', 'p4'] });

    const all = ballonDorState(t, votes, false);
    expect(all.closedAt).toBeDefined();
    expect(all.votes).toHaveLength(t.participants.length);
    expect(votingClosed({ ...t, ballonDor: all })).toBe(true);

    const early = ballonDorState(t, votes.slice(0, 2), true);
    expect(early.closedAt).toBeDefined();
    expect(early.votes).toHaveLength(2);
  });

  it('counts 3, 2 and 1 points', () => {
    const t = finished();
    const ballonDor = ballonDorState(
      t,
      [vote('p1', 'p2', 'p3', 'p4'), vote('p5', 'p2', 'p4', 'p3'), vote('p6', 'p4', 'p2', 'p7')],
      true,
    );
    const ranking = ballonDorRanking({ ...t, ballonDor });
    expect(ranking.map((r) => [r.participantId, r.points])).toEqual([
      ['p2', 8],
      ['p4', 6],
      ['p3', 3],
      ['p7', 1],
    ]);
  });

  it('breaks ties with first places, then second places, then goals, then how far the team got', () => {
    const t = finished();
    // p2 and p3 both on 3 points: p2 has a first place.
    let ranking = ballonDorRanking({
      ...t,
      ballonDor: ballonDorState(t, [vote('p1', 'p2', 'p4', 'p5'), vote('p6', 'p4', 'p3', 'p5')], true),
    });
    expect(ranking.findIndex((r) => r.participantId === 'p2')).toBeLessThan(
      ranking.findIndex((r) => r.participantId === 'p3'),
    );

    // Same points and places: more goals wins.
    const scorers = new Map<string, number>();
    for (const m of t.matches) for (const g of m.goals ?? []) scorers.set(g.scorerId!, (scorers.get(g.scorerId!) ?? 0) + 1);
    const byGoals = t.participants.map((p) => p.id).sort((a, b) => (scorers.get(b) ?? 0) - (scorers.get(a) ?? 0));
    const most = byGoals[0];
    const fewest = byGoals[byGoals.length - 1];
    expect(scorers.get(most) ?? 0).toBeGreaterThan(scorers.get(fewest) ?? 0);
    const voters = t.participants.map((p) => p.id).filter((id) => id !== most && id !== fewest);
    ranking = ballonDorRanking({
      ...t,
      ballonDor: ballonDorState(t, [vote(voters[0], fewest, most, voters[1]), vote(voters[2], most, fewest, voters[1])], true),
    });
    expect(ranking[0].participantId).toBe(most);
  });

  it('orders teams by the knockout podium, then the group table', () => {
    const t = finished();
    const order = finalTeamOrder(t);
    expect(order.slice(0, 4)).toEqual(podium(t.matches));
    expect(new Set(order).size).toBe(t.teams.length);
  });
});

describe('gala', () => {
  it('waits for the vote to close', () => {
    const t = finished();
    expect(galaReady(t)).toBe(false);
    expect(() => startGala(t)).toThrow(TournamentError);
    expect(galaReady(finished({ ballonDor: false }))).toBe(true);
  });

  it('goes intro, champions, Golden Boot and then the Ballon d’Or from third to first', () => {
    let t = finished();
    t = { ...t, ballonDor: ballonDorState(t, [vote('p1', 'p2', 'p3', 'p4'), vote('p5', 'p2', 'p3', 'p4')], true) };
    const slides = galaSlides(t);
    expect(slides.map((s) => (s.kind === 'ballonDor' ? `ballonDor${s.place}` : s.kind))).toEqual([
      'intro',
      'champions',
      'goldenBoot',
      'ballonDor3',
      'ballonDor2',
      'ballonDor1',
    ]);
    const winner = slides[slides.length - 1];
    expect(winner).toMatchObject({ participantId: 'p2', points: 6, firsts: 2, ballots: 2 });
    const intro = slides[0];
    expect(intro).toMatchObject({ kind: 'intro', matches: t.matches.length, goals: t.matches.length });
  });

  it('shares the Golden Boot between everybody on the most goals', () => {
    const t = finished({ ballonDor: false });
    const boot = galaSlides(t).find((s) => s.kind === 'goldenBoot');
    const counts = new Map<string, number>();
    for (const m of t.matches) for (const g of m.goals ?? []) counts.set(g.scorerId!, (counts.get(g.scorerId!) ?? 0) + 1);
    const most = Math.max(...counts.values());
    expect(boot).toMatchObject({ goals: most });
    expect(boot && boot.kind === 'goldenBoot' && boot.participantIds.sort()).toEqual(
      [...counts].filter(([, n]) => n === most).map(([id]) => id).sort(),
    );
  });

  it('leaves out the Golden Boot without scorers and the Ballon d’Or without a vote', () => {
    const t = finished({ ballonDor: false, trackScorers: false });
    expect(galaSlides(t).map((s) => s.kind)).toEqual(['intro', 'champions']);
  });

  it('counts the matches each player played and won, stand-ins included', () => {
    const t = finished({ ballonDor: false });
    const total = t.participants.reduce((sum, p) => sum + playerRecord(t, p.id).played, 0);
    // Every match has two sides of two players (one of them may be a stand-in).
    expect(total).toBe(t.matches.length * 4);
    const champion = galaSlides(t).find((s) => s.kind === 'champions');
    const record = playerRecord(t, champion && champion.kind === 'champions' ? champion.playerIds[0] : 'p1');
    expect(record.wins).toBeGreaterThan(0);
    expect(record.wins).toBeLessThanOrEqual(record.played);
  });

  it('is live until the admin moves past the last slide', () => {
    let t = startGala(finished({ ballonDor: false }), new Date('2026-10-22T22:00:00Z'));
    expect(galaLive(t)).toBe(true);
    t = setGalaStep(t, 1);
    expect(t.gala?.step).toBe(1);
    t = setGalaStep(t, 99);
    expect(t.gala?.step).toBe(galaSlides(t).length);
    expect(galaLive(t)).toBe(false);
  });

  it('notifies the vote and the start of the gala without giving away any winner', () => {
    let t = finished();
    t = { ...t, ballonDor: ballonDorState(t, [vote('p1', 'p2', 'p3', 'p4')], false) };
    const vote1 = buildMessages(t).find((m) => m.key === 'vote')!;
    expect(vote1.participantIds).not.toContain('p1');
    expect(vote1.participantIds).toHaveLength(t.participants.length - 1);

    t = { ...t, ballonDor: ballonDorState(t, [vote('p1', 'p2', 'p3', 'p4')], true) };
    t = startGala(t, new Date('2026-10-22T22:00:00Z'));
    const messages = buildMessages(t);
    expect(messages.some((m) => m.key === 'vote')).toBe(false);
    const gala = messages.find((m) => m.key.startsWith('gala:'))!;
    expect(gala.participantIds).toHaveLength(t.participants.length);
    expect(gala.body).not.toContain('P2');
  });
});

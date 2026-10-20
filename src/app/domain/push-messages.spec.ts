import { describe, expect, it } from 'vitest';
import { buildMessages } from '../../../supabase/functions/notify/messages';
import { seededRng } from './rng';
import {
  createTournament,
  currentDecision,
  DEFAULT_CONFIG,
  finishDraw,
  lineup,
  nextMatch,
  recordResult,
  spin,
  startMatch,
} from './tournament';
import { Tournament } from './types';

function groupsReady(players: number): Tournament {
  const rng = seededRng(3);
  let t = createTournament({
    id: 'PUSH01',
    name: 'Test',
    participantNames: Array.from({ length: players }, (_, i) => `P${i + 1}`),
    clubs: ['A', 'B', 'C', 'D', 'E', 'F'],
    config: { ...DEFAULT_CONFIG, seed: 3 },
  });
  while (t.draw.picks.length < players) t = spin(t, rng).tournament;
  return finishDraw(t, rng);
}

describe('push messages', () => {
  it('tells the players of the current match it is their turn, and the next ones to get ready', () => {
    const t = groupsReady(12);
    const [now, next] = t.matches;
    const messages = buildMessages(t);
    const turn = messages.filter((m) => m.key === `turn:${now.id}`).flatMap((m) => m.participantIds);
    expect(turn.sort()).toEqual([...lineup(t, now, now.homeId), ...lineup(t, now, now.awayId)].sort());
    const soon = messages.find((m) => m.key === `soon:${next.id}`)!;
    expect(soon.participantIds.length).toBeGreaterThan(0);
    expect(soon.participantIds.every((id) => !turn.includes(id))).toBe(true);
  });

  it('tells a drawn stand-in they play as a guest', () => {
    let t = groupsReady(11);
    const solo = t.teams.find((x) => x.memberIds.length === 1)!;
    while (![nextMatch(t)!.homeId, nextMatch(t)!.awayId].includes(solo.id)) {
      t = recordResult(t, nextMatch(t)!.id, { homeGoals: 1, awayGoals: 0 });
    }
    const m = nextMatch(t)!;
    t = startMatch(t, m.id, seededRng(1));
    const guest = t.matches.find((x) => x.id === m.id)!.standIns![solo.id];
    const message = buildMessages(t).find((x) => x.participantIds.includes(guest) && x.key.startsWith('turn'))!;
    expect(message.body).toContain('invitado');
  });

  it('warns which footballers the club cannot pick', () => {
    let t = groupsReady(12);
    const first = nextMatch(t)!;
    t = recordResult(t, first.id, {
      homeGoals: 0,
      awayGoals: 0,
      incidents: [{ teamId: first.homeId, player: 'Mohamed Salah', kind: 'redCard' }],
    });
    while (![nextMatch(t)!.homeId, nextMatch(t)!.awayId].includes(first.homeId)) {
      t = recordResult(t, nextMatch(t)!.id, { homeGoals: 1, awayGoals: 0 });
    }
    const m = nextMatch(t)!;
    const player = lineup(t, m, first.homeId)[0];
    const message = buildMessages(t).find((x) => x.key.startsWith('turn') && x.participantIds.includes(player))!;
    expect(message.body).toContain('Sin Mohamed Salah (roja)');
  });

  it('asks the team that has to choose', () => {
    let t = groupsReady(12);
    while (t.stage === 'groups') t = recordResult(t, nextMatch(t)!.id, { homeGoals: 1, awayGoals: 0 });
    const decision = currentDecision(t)!;
    const choose = buildMessages(t).find((m) => m.key.startsWith('choose'))!;
    expect(choose.participantIds).toEqual(t.teams.find((x) => x.id === decision.chooserId)!.memberIds);
  });
});

// Tournaments built with the app's own domain code and put straight into the browser-only storage,
// so each test starts where it needs to without the backend.

import type { Page } from '@playwright/test';
import { hashPin } from '../src/app/data/tournament-repository';
import { seededRng } from '../src/app/domain/rng';
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
} from '../src/app/domain/tournament';
import type { Tournament, TournamentConfig } from '../src/app/domain/types';

export const PIN = '0000';
export const PLAYERS = ['Ana', 'Bea', 'Carla', 'Dani', 'Eva', 'Fer'];
const CLUBS = ['Real Madrid', 'Man City', 'Bayern'];

/** Demo ids live in the tab's session storage. */
export function newTournament(id: string, config: Partial<TournamentConfig> = {}): Tournament {
  const rng = seededRng(5);
  let t = createTournament({
    id,
    name: 'Pachanga E2E',
    participantNames: PLAYERS,
    clubs: CLUBS,
    config: { ...DEFAULT_CONFIG, seed: 5, ...config },
  });
  while (t.draw.picks.length < t.participants.length) t = spin(t, rng).tournament;
  return finishDraw(t, rng);
}

/** Plays every match, home side winning 2–1 with its first member scoring the home goals. */
export function playAll(t: Tournament): Tournament {
  const rng = seededRng(6);
  let next = t;
  for (let guard = 0; guard < 100 && next.stage !== 'finished'; guard++) {
    const decision = currentDecision(next);
    if (decision) {
      if (decision.kind === 'playoffOpponent') next = makeChoice(next, { playoffOpponentId: decision.options[0] });
      if (decision.kind === 'playoffOrder') next = makeChoice(next, { playoffChooserFirst: true });
      if (decision.kind === 'semiOpponent') next = makeChoice(next, { semiOpponentId: decision.options[0] });
      if (decision.kind === 'semiOrder') next = makeChoice(next, { semiChooserFirst: true });
      continue;
    }
    const m = nextMatch(next)!;
    next = startMatch(next, m.id, rng);
    const scorer = next.teams.find((x) => x.id === m.homeId)!.memberIds[0];
    next = recordResult(next, m.id, {
      homeGoals: 2,
      awayGoals: 1,
      goals: next.config.trackScorers ? [{ teamId: m.homeId, scorerId: scorer }, { teamId: m.homeId, scorerId: scorer }] : [],
    });
  }
  return next;
}

/** Opens the app with the tournament stored, this tab holding the admin PIN. */
export async function openWith(page: Page, t: Tournament, path = 'partidos'): Promise<void> {
  const record = { tournament: t, version: 1, pinHash: await hashPin(t.id, PIN) };
  await page.goto('/');
  await page.evaluate(
    ([id, json, pin]) => {
      sessionStorage.setItem(`pachanga:tournament:${id}`, json);
      sessionStorage.setItem(`pachanga:pin:${id}`, pin);
    },
    [t.id, JSON.stringify(record), PIN],
  );
  await page.goto(`/t/${t.id}/${path}`);
}

/** Picks a name on the "who are you?" screen. */
export async function pickName(page: Page, name: string): Promise<void> {
  await page.getByRole('heading', { name: '¿Quién eres?' }).waitFor();
  await page.getByRole('button', { name, exact: true }).click();
}

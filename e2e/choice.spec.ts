import { expect, test } from '@playwright/test';
import { choosers, currentDecision } from '../src/app/domain/tournament';
import { newTournament, openWith, pickName, playAll, TWELVE } from './fixtures';

test("the team whose turn it is picks its rival from a phone, and every screen sees it", async ({ page }) => {
  const fresh = newTournament('DEMOELIGE', {}, TWELVE);
  const t = playAll(fresh, fresh.matches.filter((m) => m.phase === 'group').length);
  const decision = currentDecision(t);
  if (decision?.kind !== 'playoffOpponent') throw new Error('expected a playoff choice');
  const team = (id: string) => t.teams.find((x) => x.id === id)!.club;
  const player = t.participants.find((p) => p.id === choosers(t, decision.chooserId)[0])!.name;
  const rival = team(decision.options[1]);

  await openWith(page, t);
  await pickName(page, player);

  // The moment to choose opens by itself; closed, it can be opened again from the matches.
  const moment = page.getByRole('dialog', { name: 'Momento de elegir' });
  await moment.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: /salir del modo admin/ }).click();
  await page.getByRole('button', { name: 'Ver en pantalla completa' }).click();

  // Not the admin: the choice is this team's own.
  await expect(moment.getByText('elige rival para la repesca')).toBeVisible();
  await moment.getByRole('button', { name: new RegExp(rival) }).click();
  await moment.getByRole('button', { name: `Elegir a ${rival}` }).click();

  // Revealed, then the next team decides the order of play.
  await expect(moment.getByText('elige a…')).toBeVisible();
  await expect(moment.getByRole('heading', { name: rival })).toBeVisible();
  await expect(moment.getByText('¿su partido va primero o segundo?')).toBeVisible({ timeout: 10_000 });
  await expect(moment.getByText('Esperando a que elijan…')).toBeVisible();
  await moment.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByText('¿juega primero o segundo?')).toBeVisible();
});

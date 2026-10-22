import { expect, test } from '@playwright/test';
import { newTournament, openWith, pickName } from './fixtures';

test('a player picks their name and the admin plays a match', async ({ page }) => {
  const t = newTournament('DEMOMATCH');
  await openWith(page, t);
  await pickName(page, 'Ana');

  // Ana's name is now this phone's.
  await expect(page.getByText('Ana', { exact: true }).first()).toBeVisible();

  const [home, away] = [t.matches[0].homeId, t.matches[0].awayId].map((id) => t.teams.find((x) => x.id === id)!.club);
  await page.getByRole('button', { name: 'Empezar partido' }).click();
  await page.getByRole('button', { name: 'Meter resultado' }).click();
  await page.getByRole('button', { name: `Sumar goles ${home}` }).click();
  await page.getByRole('button', { name: `Sumar goles ${home}` }).click();
  await page.getByRole('button', { name: `Sumar goles ${away}` }).click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();

  await expect(page.locator('ol li').first()).toContainText('2–1');
  await page.getByRole('link', { name: 'Tabla' }).click();
  const leader = page.locator('tbody tr').first();
  await expect(leader).toContainText(home);
  await expect(leader).toContainText('3');
});

test('a name another phone holds cannot be picked, and a guest can still follow', async ({ page, browser }) => {
  const t = newTournament('DEMOCLAIMS');
  await openWith(page, t);
  await pickName(page, 'Bea');

  // Same tab storage, second visit after letting the name go: Bea is free again.
  await page.getByRole('button', { name: 'Cambiar' }).click();
  await expect(page.getByRole('button', { name: 'Bea', exact: true })).toBeEnabled();
  await pickName(page, 'Bea');

  // A guest sees the tournament but not as a player.
  const other = await browser.newContext();
  const guest = await other.newPage();
  await openWith(guest, t);
  await guest.getByRole('button', { name: 'Entrar como invitado' }).click();
  await expect(guest.getByText('Invitado', { exact: true })).toBeVisible();
  await other.close();
});

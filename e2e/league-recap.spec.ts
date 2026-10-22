import { expect, test } from '@playwright/test';
import { newTournament, openWith, pickName, playAll } from './fixtures';

test('the group stage closes with a short recap on screen', async ({ page }) => {
  const fresh = newTournament('DEMOLIGA');
  const groups = fresh.matches.filter((m) => m.phase === 'group').length;
  const t = playAll(fresh, groups - 1);
  await openWith(page, t);
  await pickName(page, 'Ana');

  // The admin plays the last group match: the recap opens by itself.
  await page.getByRole('button', { name: 'Empezar partido' }).click();
  await page.getByRole('button', { name: 'Meter resultado' }).click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();

  const recap = page.getByRole('dialog', { name: 'Resumen de la liguilla' });
  await expect(recap.getByText('Clasificación final')).toBeVisible();
  await expect(recap.locator('ol li')).toHaveCount(t.teams.length);
  await recap.click({ position: { x: 300, y: 300 } });
  await expect(recap.getByText('La liguilla en números')).toBeVisible();
  await expect(recap.getByText('Mejor ataque')).toBeVisible();
  await recap.click({ position: { x: 300, y: 300 } });
  await expect(recap.getByText('Empieza lo bueno')).toBeVisible();
  await recap.click({ position: { x: 300, y: 300 } });
  await recap.getByRole('button', { name: 'A por las eliminatorias' }).click();
  await expect(recap).toBeHidden();

  // It can be seen again from the fixtures.
  await page.getByRole('button', { name: 'Ver resumen' }).click();
  await expect(page.getByText('Clasificación final')).toBeVisible();
});

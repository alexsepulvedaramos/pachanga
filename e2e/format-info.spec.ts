import { expect, test } from '@playwright/test';
import { newTournament, openWith, pickName, TWELVE } from './fixtures';

test('the info button explains the format and the rules of this tournament', async ({ page }) => {
  const t = newTournament('DEMOINFO', { ballonDor: true }, TWELVE);
  await openWith(page, t);
  await pickName(page, 'Ana');

  await page.getByRole('button', { name: 'Formato y reglas' }).click();
  const sheet = page.getByRole('dialog', { name: 'Formato y reglas' });
  await expect(sheet.getByText('12 jugadores en 6 parejas.')).toBeVisible();
  await expect(sheet.getByText('el 3º elige su rival entre el 5º y el 6º')).toBeVisible();
  await expect(sheet.getByText(/vota desde su móvil un podio/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Cerrar' }).click();
  await expect(sheet).toBeHidden();
});

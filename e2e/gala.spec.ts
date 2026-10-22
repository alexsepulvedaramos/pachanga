import { expect, test } from '@playwright/test';
import { newTournament, openWith, pickName, PLAYERS, playAll } from './fixtures';

test('everybody votes the Ballon d’Or and the admin runs the gala', async ({ page }) => {
  const t = playAll(newTournament('DEMOGALA', { trackScorers: true, ballonDor: true }));
  await openWith(page, t);

  for (const [i, name] of PLAYERS.entries()) {
    await pickName(page, name);
    const panel = page.locator('app-ballon-dor-panel');
    await expect(panel.getByText(`Vota como ${name}`)).toBeVisible();
    // Everybody puts the next three players on their podium.
    const candidates = panel.locator('ul button');
    for (const pick of [0, 1, 2]) await candidates.nth((i + pick) % 5).click();
    await panel.getByRole('button', { name: 'Votar', exact: true }).click();
    if (i === PLAYERS.length - 1) break; // the last ballot closes the vote
    await expect(panel.getByText(`${i + 1}/${PLAYERS.length}`)).toBeVisible();
    await panel.getByRole('button', { name: 'No soy yo' }).click();
    await page.getByRole('button', { name: 'Dejarlo' }).click();
  }

  // Closed by itself: the gala can start.
  await page.getByRole('button', { name: 'Empezar la gala' }).click();
  const gala = page.getByRole('dialog', { name: /Gala/ });
  await expect(gala.getByText('Así fue')).toBeVisible();
  await gala.getByRole('button', { name: /Siguiente/ }).click();
  await expect(gala.getByText('Campeones')).toBeVisible();
  await gala.getByRole('button', { name: /Siguiente/ }).click();
  await expect(gala.getByText(/Bota de Oro/)).toBeVisible();

  for (const place of ['3er puesto', '2º puesto', 'Ganador']) {
    await gala.getByRole('button', { name: /Siguiente/ }).click();
    // Walkout: clues first, then the card.
    await expect(gala.getByText('Su club')).toBeVisible();
    await expect(gala.getByText(`Balón de Oro · ${place}`)).toBeVisible({ timeout: 15_000 });
    await expect(gala.getByText('PTS', { exact: true })).toBeVisible();
  }
  await gala.getByRole('button', { name: 'Terminar la gala' }).click();
  // The summary picture: shared from a phone, downloaded where files can't be shared.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    gala.getByRole('button', { name: 'Compartir', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('pachanga-e2e.png');
  await gala.getByRole('button', { name: 'Cerrar', exact: true }).click();

  // And straight into a rematch with the same people.
  await page.getByRole('button', { name: 'Revancha' }).click();
  await expect(page.getByRole('textbox').first()).toHaveValue('Pachanga E2E · Revancha');
  for (const name of PLAYERS) await expect(page.getByText(name, { exact: true })).toBeVisible();
});

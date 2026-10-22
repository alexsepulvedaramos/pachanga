import { expect, test } from '@playwright/test';
import { newTournament, openWith, playAll } from './fixtures';

test('the TV screen fits a tablet and shows a QR to follow it from a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const t = playAll(newTournament('DEMOTV'), 2);
  await openWith(page, t, 'tv');

  await expect(page.getByRole('img', { name: `QR para abrir ${t.name}` })).toBeVisible();
  await expect(page.getByText('En juego').or(page.getByText('Clasificación'))).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Leaving the TV screen puts the app's own sizes back.
  await page.getByRole('link').first().click();
  await expect(page.locator('html')).not.toHaveClass(/tv-screen/);
});

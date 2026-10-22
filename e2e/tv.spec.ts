import { expect, test } from '@playwright/test';
import { newTournament, openWith, playAll } from './fixtures';

test('the TV screen fits a tablet, and says a demo cannot be followed from a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const t = playAll(newTournament('DEMOTV'), 2);
  await openWith(page, t, 'tv');

  // Demos live in this browser only, so no QR to a page a phone can't open.
  await expect(page.getByText('Demo: solo existe en este navegador')).toBeVisible();
  await expect(page.getByRole('img', { name: `QR para abrir ${t.name}` })).toHaveCount(0);
  await expect(page.getByText('En juego').or(page.getByText('Clasificación'))).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Leaving the TV screen puts the app's own sizes back.
  await page.getByRole('link').first().click();
  await expect(page.locator('html')).not.toHaveClass(/tv-screen/);
});

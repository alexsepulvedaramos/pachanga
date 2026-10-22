import { defineConfig, devices } from '@playwright/test';

/** Browser tests of whole flows, on a phone-sized screen, against the dev server and the browser-only storage. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx ng serve --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});

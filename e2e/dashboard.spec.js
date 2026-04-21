import { test, expect } from '@playwright/test';
import { injectHivemindMock } from './helpers.js';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('renders the Dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('renders the goal input area', async ({ page }) => {
    const goalInput = page.locator('main textarea, main input[type="text"]').first();
    await expect(goalInput).toBeVisible();
  });

  test('renders agent cards from mock data', async ({ page }) => {
    await page.waitForTimeout(500);
    const main = page.locator('main');
    await expect(main.getByText('Orchestrator').first()).toBeVisible();
    await expect(main.getByText('Coder').first()).toBeVisible();
  });

  test('renders activity feed section', async ({ page }) => {
    await expect(page.locator('main').getByText('Activity')).toBeVisible();
  });

  test('can type in goal input', async ({ page }) => {
    const goalInput = page.locator('main textarea, main input[type="text"]').first();
    await goalInput.fill('Build me a landing page');
    await expect(goalInput).toHaveValue('Build me a landing page');
  });

  test('shows agent status indicators', async ({ page }) => {
    await page.waitForTimeout(500);
    // Agent cards should be visible - look for card-like containers in main
    const cards = page.locator('main [data-slot="card"], main .rounded-lg.border');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });
});

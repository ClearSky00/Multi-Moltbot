import { test, expect } from '@playwright/test';
import { injectHivemindMock } from './helpers.js';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('navigates to Agents page', async ({ page }) => {
    await page.locator('nav').getByText('Agents').click();
    await expect(page).toHaveURL(/#\/agents/);
    // Main content should have an Agents heading or content
    await expect(page.locator('main')).toContainText('Agents');
  });

  test('navigates to Builder page', async ({ page }) => {
    await page.locator('nav').getByText('Builder').click();
    await expect(page).toHaveURL(/#\/builder/);
  });

  test('navigates to Tasks page', async ({ page }) => {
    await page.locator('nav').getByText('Tasks').click();
    await expect(page).toHaveURL(/#\/tasks/);
  });

  test('navigates to Skills page', async ({ page }) => {
    await page.locator('nav').getByText('Skills').click();
    await expect(page).toHaveURL(/#\/skills/);
  });

  test('navigates to Memory page', async ({ page }) => {
    await page.locator('nav').getByText('Memory').click();
    await expect(page).toHaveURL(/#\/memory/);
  });

  test('navigates to Settings page', async ({ page }) => {
    await page.locator('nav').getByText('Settings').click();
    await expect(page).toHaveURL(/#\/settings/);
  });

  test('navigates to Onboarding page', async ({ page }) => {
    await page.goto('/#/onboarding');
    await page.waitForLoadState('networkidle');
    // Onboarding should render some content
    await expect(page.locator('main')).not.toBeEmpty();
  });

  test('navigates back to Dashboard', async ({ page }) => {
    await page.locator('nav').getByText('Settings').click();
    await page.locator('nav').getByText('Dashboard').click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});

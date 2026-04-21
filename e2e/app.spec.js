import { test, expect } from '@playwright/test';
import { injectHivemindMock } from './helpers.js';

test.describe('App Shell', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('renders the titlebar with app name', async ({ page }) => {
    const titlebar = page.locator('header.drag-region');
    await expect(titlebar).toBeVisible();
    await expect(titlebar).toContainText('HiveMind OS');
  });

  test('renders window control buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Minimize window' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Maximize window' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close window' })).toBeVisible();
  });

  test('renders sidebar navigation', async ({ page }) => {
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
    await expect(nav.getByText('Dashboard')).toBeVisible();
    await expect(nav.getByText('Agents')).toBeVisible();
    await expect(nav.getByText('Builder')).toBeVisible();
    await expect(nav.getByText('Tasks')).toBeVisible();
    await expect(nav.getByText('Skills')).toBeVisible();
    await expect(nav.getByText('Memory')).toBeVisible();
    await expect(nav.getByText('Settings')).toBeVisible();
  });

  test('shows gateway disconnected status', async ({ page }) => {
    await expect(page.getByText('Disconnected')).toBeVisible();
  });

  test('dashboard is the default route', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});

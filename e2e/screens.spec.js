import { test, expect } from '@playwright/test';
import { injectHivemindMock } from './helpers.js';

test.describe('Settings Screen', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/#/settings');
    await page.waitForLoadState('networkidle');
  });

  test('renders Settings heading', async ({ page }) => {
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toContainText('Settings');
  });

  test('has settings tabs', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toBeVisible();
  });
});

test.describe('Tasks Screen', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/#/tasks');
    await page.waitForLoadState('networkidle');
  });

  test('renders Tasks heading', async ({ page }) => {
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toContainText('Tasks');
  });

  test('shows empty state when no tasks', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page.locator('main')).toContainText('No tasks');
  });
});

test.describe('Skills Screen', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/#/skills');
    await page.waitForLoadState('networkidle');
  });

  test('renders Skills heading', async ({ page }) => {
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toContainText('Skills');
  });
});

test.describe('Memory Screen', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/#/memory');
    await page.waitForLoadState('networkidle');
  });

  test('renders Memory heading', async ({ page }) => {
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toContainText('Memory');
  });
});

test.describe('Agents Screen', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/#/agents');
    await page.waitForLoadState('networkidle');
  });

  test('renders Agents heading', async ({ page }) => {
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toContainText('Agents');
  });

  test('shows agent list from mock data', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page.locator('main').getByText('Orchestrator').first()).toBeVisible();
  });
});

test.describe('Builder Screen', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/#/builder');
    await page.waitForLoadState('networkidle');
  });

  test('renders Builder content', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).not.toBeEmpty();
  });
});

test.describe('Onboarding Screen', () => {
  test.beforeEach(async ({ page }) => {
    await injectHivemindMock(page);
    await page.goto('/#/onboarding');
    await page.waitForLoadState('networkidle');
  });

  test('renders Onboarding content', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).not.toBeEmpty();
  });

  test('shows welcome heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
  });
});

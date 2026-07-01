import { test, expect, Page } from '@playwright/test';

// One real login per describe block, reused (serially) across its tests —
// avoids re-triggering the login flow (and its rate limit) for every test.
test.describe.configure({ mode: 'serial' });

test.describe('Reports & Analytics (admin)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@manzil.com');
    await page.locator('input[type="password"]').fill('Admin@123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('an admin (reports:read) sees the analytics section with populated charts', async () => {
    await page.goto('/dashboard');

    await expect(page.getByText('Reports & Analytics')).toBeVisible();
    await expect(page.getByText('Cases by Stage')).toBeVisible();
    await expect(page.getByText('Top Destinations')).toBeVisible();
    await expect(page.getByText('Financials')).toBeVisible();
    await expect(page.getByText('Invoices by Status')).toBeVisible();
    await expect(page.getByText('Client Demographics')).toBeVisible();
    await expect(page.getByText('Top Nationalities')).toBeVisible();
  });

  test('applying a destination filter refetches analytics', async () => {
    await page.goto('/dashboard');
    await expect(page.getByText('Reports & Analytics')).toBeVisible();

    const destinationSelect = page.locator('#analytics-destination');
    await expect(destinationSelect.locator('option')).not.toHaveCount(1); // more than just "All destinations"

    const responsePromise = page.waitForResponse(res =>
      res.url().includes('/api/dashboard/analytics') && res.url().includes('destination=UK')
    );
    await destinationSelect.selectOption('UK');
    await page.getByRole('button', { name: 'Apply' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
  });

  test('reset clears the destination filter back to "All destinations"', async () => {
    await page.goto('/dashboard');
    await expect(page.getByText('Reports & Analytics')).toBeVisible();

    const destinationSelect = page.locator('#analytics-destination');
    await destinationSelect.selectOption('UK');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(destinationSelect).toHaveValue('UK');

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(destinationSelect).toHaveValue('');
  });
});

test.describe('Reports & Analytics (manager, no reports:read)', () => {
  test('a user without reports:read does not see the analytics section', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('manager@manzil.com');
    await page.locator('input[type="password"]').fill('Team@123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');

    await expect(page.getByText('Welcome back,')).toBeVisible();
    await expect(page.getByText('Reports & Analytics')).not.toBeVisible();
  });
});

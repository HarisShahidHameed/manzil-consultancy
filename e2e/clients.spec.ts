import { test, expect, Page } from '@playwright/test';

// One real login for this file, reused (serially) across its tests — avoids
// re-triggering the login flow (and its rate limit) for every single test.
test.describe.configure({ mode: 'serial' });

test.describe('Clients smoke', () => {
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

  test('the clients list renders the seeded sample clients', async () => {
    await page.goto('/clients');

    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
    await expect(page.getByText('Ali')).toBeVisible();
    await expect(page.getByText('Khan')).toBeVisible();
  });

  test('opening a client shows its detail page', async () => {
    await page.goto('/clients');
    await page.getByText('Ali').first().click();

    await expect(page).toHaveURL(/\/clients\/[a-f0-9-]+$/);
    await expect(page.getByText('Khan')).toBeVisible();
  });
});

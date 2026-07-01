import { test, expect, Page } from '@playwright/test';

// One real login for this file, reused (serially) across its tests — avoids
// re-triggering the login flow (and its rate limit) for every single test.
test.describe.configure({ mode: 'serial' });

test.describe('Appointments / File Processing smoke', () => {
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

  test('the appointments page loads without error', async () => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'Appointments' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('the file processing page loads without error', async () => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/file-processing');
    await expect(page.locator('main')).toBeVisible();

    expect(errors).toEqual([]);
  });
});

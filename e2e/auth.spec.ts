import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('logs in successfully with valid credentials and redirects to the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@manzil.com');
    await page.locator('input[type="password"]').fill('Admin@123456');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL('**/dashboard');
    await expect(page.getByText('Welcome back,')).toBeVisible();
  });

  test('shows an error for invalid credentials and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@manzil.com');
    await page.locator('input[type="password"]').fill('WrongPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('logs out and redirects back to the login page', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@manzil.com');
    await page.locator('input[type="password"]').fill('Admin@123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');

    await page.getByText('Sign out').click();
    await page.waitForURL('**/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});

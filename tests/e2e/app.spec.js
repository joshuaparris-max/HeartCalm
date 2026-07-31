import { test, expect } from '@playwright/test';

test('homepage loads and shows HeartCalm sections', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
});

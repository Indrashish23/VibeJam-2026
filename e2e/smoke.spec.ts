import { test, expect } from '@playwright/test';

test('loads game shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('game-root')).toBeVisible();
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect(page.getByTestId('click-to-play')).toBeVisible();
  await expect(page.getByTestId('mic-db')).toBeVisible();
});

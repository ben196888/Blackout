import { expect, test } from '@playwright/test';

test('readers can select draft rules, reload and return to the released default', async ({ page, request }) => {
  await page.goto('/rules');
  const selector = page.getByLabel('Rules version', { exact: true });
  await expect(selector).toHaveValue('0.0.1');
  await expect(page.locator('.rules-status')).toHaveText('Release');
  await expect(page.getByRole('group', { name: 'Ways to reach and see' })).toBeVisible();

  await selector.selectOption('0.0.2');
  await expect(page).toHaveURL(/\/rules\?version=v0\.0\.2$/);
  await expect(page.locator('.rules-status')).toHaveText('Draft');
  await expect(page.getByLabel('Rule version lifecycle').locator('[aria-current="step"]')).toHaveText('Draft');
  await expect(page.getByText('Games currently use', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Three authored scales' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ways to reach and see' })).toHaveCount(0);
  for (const name of ['Village', 'Town', 'Valley']) {
    const diagram = page.getByRole('img', { name: `${name} map: every node and connection grouped by neighborhood` });
    await expect(diagram).toBeVisible();
    await expect.poll(() => diagram.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  const mapLink = page.getByRole('link', { name: 'maps-v0.0.2.json', exact: true });
  const mapResponse = await request.get((await mapLink.getAttribute('href'))!);
  expect(mapResponse.ok()).toBeTruthy();
  expect(await mapResponse.json()).toHaveLength(3);

  await page.reload();
  await expect(selector).toHaveValue('0.0.2');
  await page.goBack();
  await expect(selector).toHaveValue('0.0.1');
  await page.goto('/rules?version=v0.0.2');
  await page.getByRole('link', { name: 'v0.0.1', exact: true }).last().click();
  await expect(selector).toHaveValue('0.0.1');
  await page.goto('/rules');
  await expect(selector).toHaveValue('0.0.1');
});

test('unknown versions fall back, and draft rules fit a narrow screen', async ({ page }) => {
  await page.goto('/rules?version=v9.9.9');
  await expect(page.getByRole('status')).toContainText('That rule version is unavailable');
  await expect(page.getByLabel('Rules version', { exact: true })).toHaveValue('0.0.1');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/rules?version=v0.0.2');
  await expect(page.getByRole('heading', { name: 'Three authored scales' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

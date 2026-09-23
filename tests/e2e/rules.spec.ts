import { expect, test } from '@playwright/test';

test('readers can select draft rules, reload and return to the released default', async ({ page, request }) => {
  await page.goto('/rules');
  const selector = page.getByLabel('Rule version', { exact: true });
  await expect(selector).toHaveValue('0.0.1');
  await expect(selector.locator('option:checked')).toHaveText('v0.0.1 · Release · In play');
  await expect(page.getByRole('group', { name: 'Ways to reach and see' })).toBeVisible();

  await selector.selectOption('0.0.2');
  await expect(page).toHaveURL(/\/rules\?version=v0\.0\.2$/);
  await expect(selector.locator('option:checked')).toHaveText('v0.0.2 · Draft');
  await expect(page.getByRole('heading', { name: '01 · How a day runs' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ways to reach' })).toBeVisible();
  await page.getByText('Complete v0.0.2 proposal and map data', { exact: true }).click();
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
  await page.getByText('Complete v0.0.2 proposal and map data', { exact: true }).click();
  await page.getByRole('link', { name: 'v0.0.1', exact: true }).last().click();
  await expect(selector).toHaveValue('0.0.1');
  await page.goto('/rules');
  await expect(selector).toHaveValue('0.0.1');
});

test('unknown versions fall back, and draft rules fit a narrow screen', async ({ page }) => {
  await page.goto('/rules?version=v9.9.9');
  await expect(page.getByRole('status')).toContainText('That rule version is unavailable');
  await expect(page.getByLabel('Rule version', { exact: true })).toHaveValue('0.0.1');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/rules?version=v0.0.2');
  await expect(page.getByRole('heading', { name: '01 · How a day runs' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('draft maps support scale, movement, closures and Mesh high ground', async ({ page }) => {
  await page.goto('/rules?version=v0.0.2');
  const scale = page.getByLabel('Map scale', { exact: true });
  const picker = page.getByRole('group', { name: 'Ways to reach' });
  for (const [id, count, roads, regions] of [['village', 18, 26, 4], ['town', 28, 46, 6], ['valley', 40, 72, 8]] as const) {
    await scale.selectOption(id);
    await expect(page.locator('.draft-map-node')).toHaveCount(count);
    await expect(page.locator('.draft-road')).toHaveCount(roads);
    await expect(page.locator('.draft-region')).toHaveCount(regions);
    expect(await page.getByLabel('Scrollable map').evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(650);
    await page.getByLabel('Stand at', { exact: true }).selectOption('BARN');
    for (const node of ['COOP', 'TEA', 'POND', 'FIELD', 'QUARRY']) {
      await expect(page.locator(`[data-node="${node}"]`)).toHaveAttribute('data-reach', 'direct');
    }
    await expect(page.locator('[data-node="SCHOOL"]')).toHaveAttribute('data-reach', 'none');
    await picker.getByRole('button', { name: /^Walkie-talkie · Reservist/ }).click();
    await expect(page.locator('[data-node="SCHOOL"]')).toHaveAttribute('data-reach', 'direct');
    await picker.getByRole('button', { name: 'Walkie-talkie', exact: false }).first().click();
    await page.getByRole('button', { name: 'Stand at Village Office', exact: true }).click();
    await expect(page.getByLabel('Stand at', { exact: true })).toHaveValue('VO');
    await expect(page.locator('[data-node="SCHOOL"]')).toHaveAttribute('data-reach', 'direct');
    await page.getByLabel('Road conditions').selectOption('2');
    await expect(page.locator('[data-node="SCHOOL"]')).toHaveAttribute('data-reach', 'direct');
    await expect(page.locator('.draft-road[data-closed="true"]')).toHaveCount(2);
    await picker.getByRole('button', { name: /^Mesh zone \+ border \+ relay/ }).click();
    await expect(page.locator('[data-node="CLINIC"]')).toHaveAttribute('data-reach', 'relay');
    await page.getByLabel('Stand at', { exact: true }).selectOption('LOOKOUT');
    await expect(page.locator('[data-node="FIELD"]')).toHaveAttribute('data-reach', 'direct');
    await expect(page.locator('[data-node="SCHOOL"]')).toHaveAttribute('data-reach', 'relay');
    if (id !== 'village') {
      await page.getByLabel('Stand at', { exact: true }).selectOption('QUARRY');
      await expect(page.locator('[data-node="DOCK"]')).toHaveAttribute('data-reach', 'direct');
    }
    if (id === 'valley') {
      await page.getByLabel('Stand at', { exact: true }).selectOption('OBSERVATORY');
      await expect(page.locator('[data-node="SHELTER"]')).toHaveAttribute('data-reach', 'direct');
    }
    const temple = page.getByRole('button', { name: 'Stand at Temple', exact: true });
    await temple.focus();
    await temple.press('Enter');
    await expect(page.getByLabel('Stand at', { exact: true })).toHaveValue('TEMPLE');
    await picker.getByRole('button', { name: /^Walkie-talkie zone \+ border$/ }).click();
    await page.getByLabel('Road conditions').selectOption('0');
  }
  await picker.getByRole('button', { name: /^Village Office broadcaster/ }).click();
  await expect(page.locator('[data-node="SCHOOL"]')).toHaveAttribute('data-reach', 'direct');
  await expect(page.locator('[data-node="HALL"]')).toHaveAttribute('data-reach', 'none');
  await expect(picker.getByRole('button', { name: /^High ground/ })).toHaveCount(0);
  await picker.getByRole('button', { name: /^Mesh zone \+ border/ }).click();
  await page.getByLabel('Stand at', { exact: true }).selectOption('OBSERVATORY');
  await expect(page.locator('[data-node="TEMPLE"]')).toHaveAttribute('data-reach', 'direct');
  await expect(page.locator('[data-node="STORE"]')).not.toHaveAttribute('data-reach', 'direct');
  await expect(page.locator('[data-node="TEA"]')).not.toHaveAttribute('data-reach', 'direct');
  await picker.getByRole('button', { name: /^Walkie-talkie zone \+ border$/ }).click();
  await page.getByLabel('Neighborhood focus').selectOption('UPLAND');
  await page.getByLabel('Stand at', { exact: true }).selectOption('RADIO');
  await expect(page.getByRole('button', { name: 'Stand at Radio Hut', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Map zoom').selectOption('2');
  await expect(page.locator('.draft-map')).toHaveAttribute('style', 'width: 200%;');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await scale.selectOption('village');
  await expect(page.getByLabel('Stand at', { exact: true })).toHaveValue('SCHOOL');
  await expect(page.getByLabel('Neighborhood focus')).toHaveValue('all');
});

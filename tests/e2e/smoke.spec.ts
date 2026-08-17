import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test('four isolated players create, join, plan, advance and reconnect', async ({ browser, request, baseURL }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({ status: 'ok' });

  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (let index = 0; index < 4; index += 1) {
      const context = await browser.newContext();
      contexts.push(context);
      pages.push(await context.newPage());
    }

    const first = pages[0]!;
    await first.goto('/');
    await first.getByLabel('Your name').fill('Player 1');
    await first.getByRole('button', { name: 'Create game' }).click();
    await expect(first).toHaveURL(/\/play\/[A-Za-z0-9_-]+/);
    await expect(first.getByText(/Waiting room/)).toBeVisible();
    const invite = await first.getByLabel('Invite link').inputValue();
    expect(invite).toContain(`${baseURL}/play/`);

    for (let index = 1; index < 4; index += 1) {
      const page = pages[index]!;
      await page.goto(invite);
      await page.getByLabel('Your name').fill(`Player ${index + 1}`);
      await page.getByRole('button', { name: 'Join first free seat' }).click();
      await expect(page.getByText(/Waiting room|Day 0/)).toBeVisible();
    }

    for (const page of pages) {
      await expect(page.getByText('Day 0 · Planning')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Connected')).toBeVisible();
      const rolePanel = page.getByText('Your role').locator('..');
      const isStudent = await rolePanel.getByRole('heading', { name: 'Student' }).isVisible().catch(() => false);
      const needed = isStudent ? 5 : 4;
      const checkboxes = rolePanel.getByRole('checkbox');
      for (let index = 0; index < needed; index += 1) await checkboxes.nth(index).check();
      await rolePanel.getByRole('button', { name: 'Save methods' }).click();
    }

    await pages[0]!.getByLabel('Fallback protocol').fill('If isolated, reach SCHOOL after Day 7.');
    await pages[0]!.getByLabel('Reporting shorthand').fill('LOC / FOOD? / BAT?');
    await pages[0]!.getByRole('button', { name: 'Save shared plan' }).click();
    for (const page of pages) {
      await page.getByRole('button', { name: 'Ready — lock my choices' }).click();
    }
    for (const page of pages) {
      await expect(page.getByText('Day 1')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Move')).toBeVisible();
      await page.reload();
      await expect(page.getByText('Day 1')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Connected')).toBeVisible();
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

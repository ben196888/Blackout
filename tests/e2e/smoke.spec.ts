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

    for (const [playerIndex, page] of pages.entries()) {
      await expect(page.getByText('Day 0 · Planning')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Connected')).toBeVisible();
      if (playerIndex > 0) {
        await expect(page.getByText(`Seat ${playerIndex}`).locator('..')).toContainText('Mobile data');
      }
      const rolePanel = page.getByText('Your role').locator('..');
      const isStudent = await rolePanel.getByRole('heading', { name: 'Student' }).isVisible().catch(() => false);
      const needed = isStudent ? 5 : 4;
      const checkboxes = rolePanel.getByRole('checkbox');
      for (let index = 0; index < needed; index += 1) await checkboxes.nth(index).check();
      await rolePanel.getByRole('button', { name: 'Save methods' }).click();
      await expect(page.getByText(`Seat ${playerIndex + 1}`).locator('..')).toContainText('Mobile data');
    }

    await pages[0]!.getByLabel('Fallback protocol').fill('If isolated, reach SCHOOL after Day 7.');
    await pages[0]!.getByLabel('Reporting shorthand').fill('LOC / FOOD? / BAT?');
    await pages[0]!.getByRole('button', { name: 'Save shared plan' }).click();
    for (const page of pages) await expect(page.getByText('Shared comms plan · revision 1')).toBeVisible();
    for (const [playerIndex, page] of pages.entries()) {
      if (playerIndex > 0) {
        await expect(page.getByText(`Seat ${playerIndex}`).locator('..')).toContainText('Ready');
      }
      await page.getByRole('button', { name: 'Ready — lock my choices' }).click();
      if (playerIndex === 3) await expect(page.getByText('Day 1')).toBeVisible({ timeout: 15_000 });
      else await expect(page.getByText(`Seat ${playerIndex + 1}`).locator('..')).toContainText('Ready');
    }
    const starts = ['VO', 'SCHOOL', 'COOP', 'FOREST'];
    for (const [playerIndex, page] of pages.entries()) {
      await expect(page.getByText('Day 1')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Move', { exact: true })).toBeVisible();
      await expect(page.getByTestId('current-location')).toHaveText(starts[playerIndex]!);
      await expect(page.getByLabel('Village map')).toBeVisible();
      await page.reload();
      await expect(page.getByText('Day 1')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Connected')).toBeVisible();
      await expect(page.getByTestId('current-location')).toHaveText(starts[playerIndex]!);
    }

    for (const [playerIndex, page] of pages.entries()) {
      if (playerIndex > 0) await expect(page.getByTestId(`player-state-${playerIndex - 1}`)).toContainText('Ready');
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Done moving' }).click();
      if (playerIndex === 3) await expect(page.getByText('Contact', { exact: true })).toBeVisible({ timeout: 15_000 });
      else await expect(page.getByTestId(`player-state-${playerIndex}`)).toContainText('Ready');
    }
    for (const page of pages) await expect(page.getByText('Contact', { exact: true })).toBeVisible({ timeout: 15_000 });
    for (const page of pages) await expect(page.getByText('Local facilities')).toBeVisible();
    const radioListen = pages[0]!.getByLabel(/Listen to the nightly radio/);
    await radioListen.click();
    await expect(radioListen).toBeChecked();

    await pages[0]!.getByLabel('Method').selectOption('SMS');
    await pages[0]!.getByLabel('Message').fill('MEET AT SCHOOL');
    await pages[0]!.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(pages[0]!.getByRole('status')).toHaveText('Sent');
    await expect(pages[1]!.getByText('MEET AT SCHOOL')).toBeVisible({ timeout: 15_000 });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('four isolated players complete seven nights to the same outcome', async ({ browser }) => {
  test.setTimeout(300_000);
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (let index = 0; index < 4; index += 1) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      page.on('dialog', (dialog) => void dialog.accept());
      pages.push(page);
    }

    await pages[0]!.goto('/');
    await pages[0]!.getByLabel('Your name').fill('Survivor 1');
    await pages[0]!.getByRole('button', { name: 'Create game' }).click();
    await expect(pages[0]!).toHaveURL(/\/play\/[A-Za-z0-9_-]+/);
    const invite = await pages[0]!.getByLabel('Invite link').inputValue();
    for (let index = 1; index < 4; index += 1) {
      const page = pages[index]!;
      await page.goto(invite);
      await page.getByLabel('Your name').fill(`Survivor ${index + 1}`);
      await page.getByRole('button', { name: 'Join first free seat' }).click();
    }

    for (const [playerIndex, page] of pages.entries()) {
      await expect(page.getByText('Day 0 · Planning')).toBeVisible({ timeout: 15_000 });
      const rolePanel = page.getByText('Your role').locator('..');
      const isStudent = await rolePanel.getByRole('heading', { name: 'Student' }).isVisible().catch(() => false);
      const count = isStudent ? 5 : 4;
      for (let index = 0; index < count; index += 1) await rolePanel.getByRole('checkbox').nth(index).check();
      await rolePanel.getByRole('button', { name: 'Save methods' }).click();
      await expect(page.getByText(`Seat ${playerIndex + 1}`).locator('..')).toContainText('Mobile data');
    }
    for (const [playerIndex, page] of pages.entries()) {
      await page.getByRole('button', { name: 'Ready — lock my choices' }).click();
      if (playerIndex < 3) {
        await expect(pages[0]!.getByText(`Seat ${playerIndex + 1}`).locator('..')).toContainText('Ready');
      }
    }
    for (const page of pages) await expect(page.getByText('Day 1')).toBeVisible({ timeout: 15_000 });

    await pages[0]!.getByRole('button', { name: 'Temple' }).click();
    await expect(pages[0]!.getByTestId('current-location')).toHaveText('TEMPLE');
    await pages[0]!.getByRole('button', { name: 'Store' }).click();
    await expect(pages[0]!.getByTestId('current-location')).toHaveText('STORE');
    for (const [playerIndex, page] of pages.entries()) {
      await page.getByRole('button', { name: 'Done moving' }).click();
      if (playerIndex < 3) {
        await expect(pages[0]!.getByTestId(`player-state-${playerIndex}`)).toContainText('Ready');
      }
    }
    for (const page of pages) await expect(page.getByText('Contact', { exact: true })).toBeVisible({ timeout: 15_000 });
    for (const [playerIndex, page] of pages.entries()) {
      await page.getByRole('button', { name: 'Ready for night' }).click();
      if (playerIndex < 3) {
        await expect(pages[0]!.getByTestId(`player-state-${playerIndex}`)).toContainText('Ready');
      }
    }

    for (const day of [2, 3, 4, 5, 6, 7]) {
      for (const page of pages) await expect(page.getByText(`Day ${day}`)).toBeVisible({ timeout: 15_000 });
      if (day <= 4) {
        const scavenge = pages[0]!.getByRole('group', { name: 'Scavenge' });
        await scavenge.getByLabel('Food').fill('2');
        await pages[0]!.getByRole('button', { name: 'Take items' }).click();
        await expect(pages[0]!.getByText('Actions 1', { exact: true })).toBeVisible();
      }

      const living: number[] = [];
      for (const [playerIndex, page] of pages.entries()) {
        const done = page.getByRole('button', { name: 'Done moving' });
        if (await done.isVisible().catch(() => false)) living.push(playerIndex);
      }
      for (const [livingIndex, playerIndex] of living.entries()) {
        await pages[playerIndex]!.getByRole('button', { name: 'Done moving' }).click();
        if (livingIndex < living.length - 1) {
          await expect(pages[0]!.getByTestId(`player-state-${playerIndex}`)).toContainText('Ready');
        }
      }
      for (const page of pages) {
        await expect(page.getByText('Contact', { exact: true })).toBeVisible({ timeout: 15_000 });
      }
      for (const [livingIndex, playerIndex] of living.entries()) {
        await pages[playerIndex]!.getByRole('button', { name: 'Ready for night' }).click();
        if (livingIndex < living.length - 1) {
          await expect(pages[0]!.getByTestId(`player-state-${playerIndex}`)).toContainText('Ready');
        }
      }
    }

    for (const page of pages) {
      await expect(page.getByRole('heading', { name: '1 star' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('1 of 4 survived.')).toBeVisible();
      await expect(page.getByText(/complete truth revealed/)).toBeVisible();
      await expect(page.getByRole('button', { name: /rematch|play again/i })).toHaveCount(0);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

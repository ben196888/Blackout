import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/** Day 0 claims are buttons now, and the Student's quota is one larger. */
async function claimMethods(page: Page) {
  const save = page.getByRole('button', { name: /^Save \d methods$/ });
  await expect(save).toBeVisible();
  const needed = Number((await save.textContent())!.match(/\d/)![0]);
  const options = page.getByRole('group', { name: 'Communication methods' }).getByRole('button');
  for (let index = 0; index < needed; index += 1) await options.nth(index).click();
  await save.click();
}

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
    await expect(first.getByLabel('Playtest notice')).toContainText('fictional disaster');
    await expect(first.getByLabel('Playtest notice')).toContainText('message text');
    await first.getByLabel('Your name').fill('Player 1');
    await first.getByRole('button', { name: 'Create game' }).click();
    await expect(first).toHaveURL(/\/play\/[A-Za-z0-9_-]+/);
    await expect(first.getByText(/Waiting room/)).toBeVisible();
    const invite = await first.getByLabel('Invite link').inputValue();
    expect(invite).toContain(`${baseURL}/play/`);
    const matchID = new URL(invite).pathname.split('/').at(-1)!;
    const storedIdentity = await first.evaluate((id) => localStorage.getItem(`pace.identity.${id}`), matchID);
    const seat = JSON.parse(storedIdentity!) as { playerID: string; credentials: string };
    const validAuth = await request.post(`/games/blackout/${matchID}/auth`, {
      headers: { Authorization: `Bearer ${seat.credentials}`, 'X-Player-ID': seat.playerID },
    });
    expect(validAuth.status()).toBe(204);
    expect(validAuth.headers()['cache-control']).toBe('no-store');
    expect(await validAuth.body()).toHaveLength(0);
    const invalidAuth = await request.post(`/games/blackout/${matchID}/auth`, {
      headers: { Authorization: 'Bearer tampered-token', 'X-Player-ID': seat.playerID },
    });
    expect(invalidAuth.status()).toBe(401);
    expect(invalidAuth.headers()['cache-control']).toBe('no-store');
    expect(await invalidAuth.text()).not.toContain('tampered-token');

    for (let index = 1; index < 4; index += 1) {
      const page = pages[index]!;
      await page.goto(invite);
      await expect(page.getByLabel('Playtest notice')).toContainText('authoritative delivery outcomes');
      await page.getByLabel('Your name').fill(`Player ${index + 1}`);
      await page.getByRole('button', { name: 'Join first free seat' }).click();
      await expect(page.getByText(/Waiting room|PLANNING · OPEN CHANNEL/)).toBeVisible();
    }

    for (const [playerIndex, page] of pages.entries()) {
      await expect(page.getByText('PLANNING · OPEN CHANNEL')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Connected')).toBeVisible();
      if (playerIndex > 0) {
        await expect(page.getByTestId(`planning-player-${playerIndex - 1}`)).toContainText('CLAIMED');
      }
      await claimMethods(page);
      await expect(page.getByTestId(`planning-player-${playerIndex}`)).toContainText('CLAIMED');
    }

    await pages[0]!.getByRole('textbox', { name: 'Planning message', exact: true })
      .fill('Who can cover walkie and mesh?');
    await pages[0]!.getByRole('button', { name: 'Send to everyone' }).click();
    for (const page of pages) {
      await expect(page.getByLabel('Planning messages', { exact: true }))
        .toContainText('Who can cover walkie and mesh?');
    }

    await pages[0]!.getByLabel('Fallback protocol').fill('If isolated, reach SCHOOL after Day 7.');
    await pages[0]!.getByLabel('Reporting shorthand').fill('LOC / FOOD? / BAT?');
    await pages[0]!.getByRole('button', { name: 'Save shared plan' }).click();
    for (const page of pages) {
      await expect(page.getByText('Shared comms plan · rev 1')).toBeVisible();
      await expect(page.getByLabel('Fallback protocol')).toHaveValue('If isolated, reach SCHOOL after Day 7.');
      await expect(page.getByLabel('Reporting shorthand')).toHaveValue('LOC / FOOD? / BAT?');
    }
    for (const [playerIndex, page] of pages.entries()) {
      if (playerIndex > 0) {
        await expect(page.getByTestId(`planning-player-${playerIndex - 1}`)).toContainText('READY');
      }
      await page.getByRole('button', { name: 'Ready — lock my choices' }).click();
      if (playerIndex === 3) await expect(page.getByText('DAY 1', { exact: true })).toBeVisible({ timeout: 15_000 });
      else await expect(page.getByTestId(`planning-player-${playerIndex}`)).toContainText('READY');
    }
    const starts = ['VO', 'SCHOOL', 'COOP', 'FOREST'];
    for (const [playerIndex, page] of pages.entries()) {
      await expect(page.getByText('DAY 1', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('MOVE', { exact: true })).toBeVisible();
      await expect(page.getByTestId('shared-comms-plan')).toContainText('Shared comms plan · locked');
      await expect(page.getByTestId('shared-comms-plan')).toContainText('If isolated, reach SCHOOL after Day 7.');
      await expect(page.getByTestId('shared-comms-plan')).toContainText('LOC / FOOD? / BAT?');
      await expect(page.getByTestId('current-location')).toHaveText(starts[playerIndex]!);
      await expect(page.getByLabel('Village map')).toBeVisible();
      await expect(page.getByTestId(`telecom-row-${playerIndex}`)).toBeVisible();
      await expect(page.getByTitle(/^Walkie-talkie · held/).first()).toBeVisible();
      await expect(page.getByTestId(`player-public-${playerIndex}`)).toContainText(/act/);
      const privateInventory = await page.getByTestId('private-inventory').textContent();
      await page.reload();
      await expect(page.getByText('DAY 1', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Connected')).toBeVisible();
      await expect(page.getByTestId('current-location')).toHaveText(starts[playerIndex]!);
      await expect(page.getByTestId('private-inventory')).toHaveText(privateInventory!);
    }

    for (const [playerIndex, page] of pages.entries()) {
      if (playerIndex > 0) await expect(page.getByTestId(`player-state-${playerIndex - 1}`)).toContainText('READY');
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Done moving' }).click();
      if (playerIndex === 3) await expect(page.getByText('CONTACT', { exact: true })).toBeVisible({ timeout: 15_000 });
      else {
        await expect(page.getByTestId(`player-state-${playerIndex}`)).toContainText('READY');
        await expect(page.getByText('Ready locked.')).toBeVisible();
        await expect(page.getByText('Scavenge here')).toHaveCount(0);
      }
    }
    for (const page of pages) await expect(page.getByText('CONTACT', { exact: true })).toBeVisible({ timeout: 15_000 });
    for (const page of pages) await expect(page.getByText('Local facilities')).toBeVisible();
    const radioListen = pages[0]!.getByLabel(/Listen to the nightly radio/);
    await radioListen.click();
    await expect(radioListen).toBeChecked();

    await pages[0]!.getByRole('group', { name: 'Method' }).getByRole('button', { name: 'SMS', exact: true }).click();
    await pages[0]!.getByLabel('Message').fill('MEET AT SCHOOL');
    await pages[0]!.getByRole('button', { name: 'SEND', exact: true }).click();
    await expect(pages[0]!.getByRole('status')).toContainText('Sent. Delivery is unknown.');
    await expect(pages[1]!.getByText('MEET AT SCHOOL')).toBeVisible({ timeout: 15_000 });

    await pages[0]!.evaluate((id) => {
      const key = `pace.identity.${id}`;
      const identity = JSON.parse(localStorage.getItem(key)!) as { credentials: string };
      identity.credentials = 'tampered-token';
      localStorage.setItem(key, JSON.stringify(identity));
    }, matchID);
    await pages[0]!.reload();
    await expect(pages[0]!.getByRole('alert')).toHaveText('This game is already in progress. Spectator access is not available.');
    await expect(pages[0]!.getByText('DAY 1', { exact: true })).toHaveCount(0);
    await expect.poll(() => pages[0]!.evaluate((id) => localStorage.getItem(`pace.identity.${id}`), matchID)).toBeNull();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('invalid pregame identity clears and may claim a free seat', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.getByLabel('Your name').fill('Original Player');
    await page.getByRole('button', { name: 'Create game' }).click();
    await expect(page).toHaveURL(/\/play\/[A-Za-z0-9_-]+/);
    const matchID = new URL(page.url()).pathname.split('/').at(-1)!;
    await page.evaluate((id) => {
      const key = `pace.identity.${id}`;
      const identity = JSON.parse(localStorage.getItem(key)!) as { credentials: string };
      identity.credentials = 'tampered-token';
      localStorage.setItem(key, JSON.stringify(identity));
    }, matchID);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Join first free seat' })).toBeVisible();
    await expect.poll(() => page.evaluate((id) => localStorage.getItem(`pace.identity.${id}`), matchID)).toBeNull();
    await page.getByLabel('Your name').fill('Replacement Player');
    await page.getByRole('button', { name: 'Join first free seat' }).click();
    await expect(page.getByText('Waiting room · 2/4 seats')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('simultaneous last-seat claims refetch the authoritative full room', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (let index = 0; index < 5; index += 1) {
      const context = await browser.newContext();
      contexts.push(context);
      pages.push(await context.newPage());
    }

    await pages[0]!.goto('/');
    await pages[0]!.getByLabel('Your name').fill('Host');
    await pages[0]!.getByRole('button', { name: 'Create game' }).click();
    const invite = await pages[0]!.getByLabel('Invite link').inputValue();
    for (let index = 1; index < 3; index += 1) {
      await pages[index]!.goto(invite);
      await pages[index]!.getByLabel('Your name').fill(`Joined ${index}`);
      await pages[index]!.getByRole('button', { name: 'Join first free seat' }).click();
      await expect(pages[index]!.getByText(`Waiting room · ${index + 1}/4 seats`)).toBeVisible();
    }
    for (let index = 3; index < 5; index += 1) {
      await pages[index]!.goto(invite);
      await pages[index]!.getByLabel('Your name').fill(`Contender ${index}`);
    }

    await Promise.all([
      pages[3]!.getByRole('button', { name: 'Join first free seat' }).click(),
      pages[4]!.getByRole('button', { name: 'Join first free seat' }).click(),
    ]);
    await expect.poll(async () => {
      const planning = await Promise.all(pages.slice(3).map((page) => page.getByText('PLANNING · OPEN CHANNEL').isVisible().catch(() => false)));
      return planning.filter(Boolean).length;
    }).toBe(1);
    await expect.poll(async () => {
      const rejected = await Promise.all(pages.slice(3).map((page) => page.getByText('This game is already in progress. Spectator access is not available.').isVisible().catch(() => false)));
      return rejected.filter(Boolean).length;
    }).toBe(1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('simultaneous equal names cannot claim two seats', async ({ browser, request }) => {
  const contexts: BrowserContext[] = [];
  try {
    for (let index = 0; index < 3; index += 1) contexts.push(await browser.newContext());
    const pages = await Promise.all(contexts.map((context) => context.newPage()));

    await pages[0]!.goto('/');
    await pages[0]!.getByLabel('Your name').fill('Creator');
    await pages[0]!.getByRole('button', { name: 'Create game' }).click();
    const invite = await pages[0]!.getByLabel('Invite link').inputValue();
    const matchID = new URL(invite).pathname.split('/').at(-1)!;

    for (const page of pages.slice(1)) {
      await page.goto(invite);
      await page.getByLabel('Your name').fill('Same Name');
    }
    await Promise.all(pages.slice(1).map((page) =>
      page.getByRole('button', { name: 'Join first free seat' }).click()
    ));

    await expect.poll(async () => {
      const response = await request.get(`/games/blackout/${matchID}`);
      if (!response.ok()) return -1;
      const match = await response.json() as { players: Array<{ name?: string }> };
      return match.players.filter(({ name }) => name?.toLowerCase() === 'same name').length;
    }).toBe(1);
    await expect.poll(async () => {
      const errors = await Promise.all(pages.slice(1).map((page) =>
        page.getByRole('alert').isVisible().catch(() => false)
      ));
      return errors.filter(Boolean).length;
    }).toBe(1);
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
      await expect(page.getByText('PLANNING · OPEN CHANNEL')).toBeVisible({ timeout: 15_000 });
      await claimMethods(page);
      await expect(page.getByTestId(`planning-player-${playerIndex}`)).toContainText('CLAIMED');
    }
    for (const [playerIndex, page] of pages.entries()) {
      await page.getByRole('button', { name: 'Ready — lock my choices' }).click();
      if (playerIndex < 3) {
        await expect(pages[0]!.getByTestId(`planning-player-${playerIndex}`)).toContainText('READY');
      }
    }
    for (const page of pages) await expect(page.getByText('DAY 1', { exact: true })).toBeVisible({ timeout: 15_000 });

    await pages[0]!.getByRole('button', { name: 'Temple' }).click();
    await expect(pages[0]!.getByTestId('current-location')).toHaveText('TEMPLE');
    await pages[0]!.getByRole('button', { name: 'Store' }).click();
    await expect(pages[0]!.getByTestId('current-location')).toHaveText('STORE');
    for (const [playerIndex, page] of pages.entries()) {
      await page.getByRole('button', { name: 'Done moving' }).click();
      if (playerIndex < 3) {
        await expect(pages[0]!.getByTestId(`player-state-${playerIndex}`)).toContainText('READY');
      }
    }
    for (const page of pages) await expect(page.getByText('CONTACT', { exact: true })).toBeVisible({ timeout: 15_000 });
    for (const [playerIndex, page] of pages.entries()) {
      await page.getByRole('button', { name: 'Ready for night' }).click();
      if (playerIndex < 3) {
        await expect(pages[0]!.getByTestId(`player-state-${playerIndex}`)).toContainText('READY');
      }
    }

    for (const day of [2, 3, 4, 5, 6, 7]) {
      for (const page of pages) {
        await expect(page.getByText(`DAY ${day}`, { exact: true })).toBeVisible({ timeout: 15_000 });
      }
      if (day <= 4) {
        const takeMoreFood = pages[0]!.getByRole('button', { name: 'Take one more food' });
        await takeMoreFood.click();
        await expect(pages[0]!.getByTestId('take-food')).toHaveText('1');
        await takeMoreFood.click();
        await expect(pages[0]!.getByTestId('take-food')).toHaveText('2');
        await pages[0]!.getByRole('button', { name: 'TAKE 2 — 1 ACTION' }).click();
        await expect(pages[0]!.getByText('1 ACTION LEFT')).toBeVisible();
      }

      const living: number[] = [];
      for (const [playerIndex, page] of pages.entries()) {
        const done = page.getByRole('button', { name: 'Done moving' });
        if (await done.isVisible().catch(() => false)) living.push(playerIndex);
      }
      for (const [livingIndex, playerIndex] of living.entries()) {
        await pages[playerIndex]!.getByRole('button', { name: 'Done moving' }).click();
        if (livingIndex < living.length - 1) {
          await expect(pages[0]!.getByTestId(`player-state-${playerIndex}`)).toContainText('READY');
        }
      }
      for (const page of pages) {
        await expect(page.getByText('CONTACT', { exact: true })).toBeVisible({ timeout: 15_000 });
      }
      for (const [livingIndex, playerIndex] of living.entries()) {
        await pages[playerIndex]!.getByRole('button', { name: 'Ready for night' }).click();
        if (livingIndex < living.length - 1) {
          await expect(pages[0]!.getByTestId(`player-state-${playerIndex}`)).toContainText('READY');
          await expect(pages[playerIndex]!.getByText('Ready locked.')).toBeVisible();
          await expect(pages[playerIndex]!.getByLabel('Message')).toHaveCount(0);
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

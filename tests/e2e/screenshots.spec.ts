import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

const VIEWPORT = { width: 1440, height: 980 };

// Text metrics vary enough between machines to move the page by a pixel and fail a
// full-page comparison, so the baselines and every comparison run in one pinned
// image. `pnpm shots` sets BLACKOUT_SHOTS inside that container; a plain `pnpm
// smoke` on a laptop or a bare CI runner skips this file rather than failing on
// antialiasing. The deployed server has no fixed seed, so it is skipped too.

/** A missing webfont changes every glyph, so fail on the font, not on a pixel wall. */
async function awaitFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const pixelFontLoaded = await page.evaluate(() => document.fonts.check('12px "Press Start 2P"'));
  expect(pixelFontLoaded, 'Press Start 2P did not load; the screenshot cannot match its baseline').toBe(true);
}

async function shot(page: Page, name: string, mask: Locator[] = []) {
  await awaitFonts(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    mask,
    // Relative to the repo root, which is where Playwright runs from.
    stylePath: 'tests/e2e/screenshot.css',
  });
}

/** Day 0 claims are buttons; the quota is printed on the save button. */
async function claimMethods(page: Page) {
  const save = page.getByRole('button', { name: /^Save \d methods$/ });
  await expect(save).toBeVisible();
  const needed = Number((await save.textContent())!.match(/\d/)![0]);
  const options = page.getByRole('group', { name: 'Communication methods' }).getByRole('button');
  for (let index = 0; index < needed; index += 1) await options.nth(index).click();
  await save.click();
}

test('every stage matches its screenshot baseline', async ({ browser }) => {
  test.skip(!process.env.BLACKOUT_SHOTS, 'run `pnpm shots`; baselines only match inside the pinned Playwright image');
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'the deployed server deals characters at random');
  test.setTimeout(180_000);
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (let index = 0; index < 4; index += 1) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      contexts.push(context);
      const page = await context.newPage();
      page.on('dialog', (dialog) => void dialog.accept());
      pages.push(page);
    }
    const host = pages[0]!;
    // Installed before the first navigation so the last shot can freeze the clock.
    // Resumed straight away, so the socket and the game keep real time until then.
    await host.clock.install();
    await host.clock.resume();

    await host.goto('/');
    await host.getByLabel('Your name').fill('Survivor 1');
    await host.getByRole('button', { name: 'Create game' }).click();
    await expect(host).toHaveURL(/\/play\/[A-Za-z0-9_-]+/);
    const invite = await host.getByLabel('Invite link').inputValue();

    // --- 1. lobby, still waiting for seats ---
    for (let index = 1; index < 3; index += 1) {
      const page = pages[index]!;
      await page.goto(invite);
      await page.getByLabel('Your name').fill(`Survivor ${index + 1}`);
      await page.getByRole('button', { name: 'Join first free seat' }).click();
      await expect(page.getByText(`Waiting room · ${index + 1}/4 seats`)).toBeVisible();
    }
    await expect(host.getByText('Waiting room · 3/4 seats')).toBeVisible();
    // The match ID is new every run; everything around it is not.
    await shot(host, '01-lobby-waiting', [host.getByLabel('Invite link')]);

    await pages[3]!.goto(invite);
    await pages[3]!.getByLabel('Your name').fill('Survivor 4');
    await pages[3]!.getByRole('button', { name: 'Join first free seat' }).click();

    // --- 2. discussion (Day 0 planning, open channel) ---
    for (const [playerIndex, page] of pages.entries()) {
      await expect(page.getByText('PLANNING · OPEN CHANNEL')).toBeVisible({ timeout: 15_000 });
      await claimMethods(page);
      await expect(page.getByTestId(`planning-player-${playerIndex}`)).toContainText('CLAIMED');
    }
    await host.getByRole('textbox', { name: 'Planning message', exact: true })
      .fill('Who can cover walkie and mesh?');
    await host.getByRole('button', { name: 'Send to everyone' }).click();
    await pages[1]!.getByRole('textbox', { name: 'Planning message', exact: true })
      .fill('I have walkie. Falling back to SCHOOL if I go dark.');
    await pages[1]!.getByRole('button', { name: 'Send to everyone' }).click();
    await host.getByLabel('Fallback protocol').fill('If isolated, reach SCHOOL after Day 7.');
    await host.getByLabel('Reporting shorthand').fill('LOC / FOOD? / BAT?');
    await host.getByRole('button', { name: 'Save shared plan' }).click();
    await expect(host.getByText('Shared comms plan · rev 1')).toBeVisible();
    await expect(host.getByLabel('Planning messages', { exact: true }))
      .toContainText('Falling back to SCHOOL');
    await shot(host, '02-discussion-planning');

    // --- 3. move stage (Day 1) ---
    for (const page of pages) await page.getByRole('button', { name: 'Ready — lock my choices' }).click();
    for (const page of pages) await expect(page.getByText('DAY 1', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(host.getByText('MOVE', { exact: true })).toBeVisible();
    await expect(host.getByLabel('Village map')).toBeVisible();
    await shot(host, '03-move-stage');

    // --- 4. action stage (spend an action scavenging) ---
    // The seeded server deals the same characters every run, but the Store Owner
    // starts at full capacity, so still pick a seat that can lift rather than one
    // that happens to work under this seed.
    async function tryScavenge(page: Page): Promise<boolean> {
      const plus = page.getByRole('button', { name: 'Take one more food' });
      if (!(await plus.isVisible().catch(() => false))) return false;
      await plus.click();
      if ((await page.getByTestId('take-food').textContent()) !== '1') return false;
      await page.getByRole('button', { name: 'TAKE 1 — 1 ACTION' }).click();
      await expect(page.getByTestId('take-food')).toHaveText('0');
      return true;
    }

    let actor = pages[1]!; // starts at SCHOOL, which has food on the ground
    if (!(await tryScavenge(actor))) {
      actor = host;
      await host.getByRole('button', { name: 'Temple' }).click();
      await expect(host.getByTestId('current-location')).toHaveText('TEMPLE');
      expect(await tryScavenge(host)).toBe(true);
    }
    await expect(actor.getByText(/Actions · \d left/)).toBeVisible();
    await shot(actor, '04-action-stage');

    // --- 5. communication stage (contact phase) ---
    for (const page of pages) await page.getByRole('button', { name: 'Done moving' }).click();
    for (const page of pages) await expect(page.getByText('CONTACT', { exact: true })).toBeVisible({ timeout: 15_000 });
    await host.getByLabel(/Listen to the nightly radio/).click();
    await host.getByRole('group', { name: 'Method' }).getByRole('button', { name: 'SMS', exact: true }).click();
    await host.getByLabel('Message').fill('MEET AT SCHOOL');
    await host.getByRole('button', { name: 'SEND', exact: true }).click();
    await expect(host.getByRole('status')).toContainText('Sent. Delivery is unknown.');
    await shot(host, '05-communication-stage');

    // --- 6. the toast that tells you the click landed ---
    const toasts = host.getByRole('log', { name: 'Action feedback' }).locator('.toast');
    const listen = host.getByLabel(/Listen to the nightly radio/);
    // Wait the earlier toasts out, so exactly one is up and its text does not depend
    // on how many actions this run happened to take.
    // The box is server-controlled, so click and wait for the state rather than
    // using check/uncheck, which want the change to land on the click itself.
    if (await listen.isChecked()) {
      await listen.click();
      await expect(listen).not.toBeChecked();
    }
    await expect(toasts).toHaveCount(0, { timeout: 15_000 });
    await listen.click();
    await expect(listen).toBeChecked();
    await expect(toasts).toHaveCount(1);
    // Toasts expire on a timer, so freeze the page clock: nothing else stops this one
    // ageing out mid-capture. A small margin ahead, because pauseAt refuses to travel
    // backwards and the page clock moves on while the instruction is in flight.
    await host.clock.pauseAt(await host.evaluate(() => Date.now() + 200));
    await awaitFonts(host);
    // The toast itself, not the transparent full-width region holding it, so the
    // board behind it cannot bleed into the comparison.
    await expect(toasts).toHaveScreenshot('06-action-toast.png');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('the reach explorer matches its screenshot baselines', async ({ browser }) => {
  test.skip(!process.env.BLACKOUT_SHOTS, 'run `pnpm shots`; baselines only match inside the pinned Playwright image');
  // No match and no dealt characters here, so this one is safe against a deployed
  // server too — but it shares the image requirement.
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    const page = await context.newPage();
    await page.goto('/rules');
    const stand = page.getByRole('group', { name: 'Stand at' });

    // Mesh: the green ring it reaches alone beside the amber ring it only reaches
    // when a third player stands in the gap.
    await page.getByRole('button', { name: /^Mesh 1 hop \+ relay$/ }).click();
    await expect(page.getByLabel(/showing Mesh reach from the School/)).toBeVisible();
    await shot(page, '07-rules-mesh-relay');

    // The vantage is movable on mesh, and the reach follows it.
    await stand.getByRole('button', { name: 'Co-op' }).click();
    await expect(page.getByLabel(/showing Mesh reach from the Co-op/)).toBeVisible();
    await shot(page, '08-rules-mesh-moved');

    // High ground is sight, not reach: every open node, none of the enclosed five.
    await page.getByRole('button', { name: /^High ground/ }).click();
    await expect(page.getByLabel(/showing High ground reach from the Mountain Shrine/)).toBeVisible();
    await expect(stand).toHaveCount(0);
    await shot(page, '09-rules-high-ground');
  } finally {
    await context.close();
  }
});

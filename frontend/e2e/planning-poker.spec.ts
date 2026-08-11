import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page): Promise<void> {
  const response = await page.goto('/sprint-planning-poker/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function register(page: Page, name: string, observer = false): Promise<void> {
  await openApp(page);
  await page.getByLabel('Name').fill(name);
  if (observer) {
    await page.getByLabel('Observer mode').check();
  }
  await page.getByRole('button', { name: 'Submit' }).click();
}

test('completes and resets a matching multiplayer round', async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();

  await register(alice, 'Alice');
  await register(bob, 'Bob');
  await expect(alice.getByRole('heading', { name: 'Your Choice' })).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Bob' })).toBeVisible();

  await alice.getByRole('button', { name: '5' }).click();
  await bob.getByRole('button', { name: '5' }).click();
  await expect(alice.getByRole('button', { name: 'Reset round' })).toBeVisible();
  await expect(alice.getByRole('region', { name: 'Players' }).getByText('5', { exact: true })).toHaveCount(2);
  await expect(alice.getByRole('button', { name: '3', exact: true })).toBeDisabled();

  await alice.getByRole('button', { name: 'Reset round' }).click();
  await expect(alice.getByRole('button', { name: 'Reset round' })).toBeHidden();
  await expect(alice.getByRole('button', { name: '3', exact: true })).toBeEnabled();

  await aliceContext.close();
  await bobContext.close();
});

test('keeps observers out of voting without blocking a reveal', async ({ browser }) => {
  const firstPlayerContext = await browser.newContext();
  const secondPlayerContext = await browser.newContext();
  const observerContext = await browser.newContext();
  const firstPlayer = await firstPlayerContext.newPage();
  const secondPlayer = await secondPlayerContext.newPage();
  const observer = await observerContext.newPage();

  await register(firstPlayer, 'Jordan');
  await register(secondPlayer, 'Riley');
  await register(observer, 'Watcher', true);
  await expect(observer.getByRole('heading', { name: 'Your Choice' })).toBeHidden();
  await expect(observer.getByText('observer')).toBeVisible();

  await firstPlayer.getByRole('button', { name: '3', exact: true }).click();
  await secondPlayer.getByRole('button', { name: '3', exact: true }).click();
  await expect(observer.getByRole('button', { name: 'Reset round' })).toBeVisible();
  await expect(observer.getByRole('region', { name: 'Players' }).getByText('3', { exact: true })).toHaveCount(2);

  await firstPlayerContext.close();
  await secondPlayerContext.close();
  await observerContext.close();
});

test('rejects duplicate registration and keeps the registration form usable', async ({ browser }) => {
  const playerContext = await browser.newContext();
  const duplicateContext = await browser.newContext();
  const player = await playerContext.newPage();
  const duplicate = await duplicateContext.newPage();

  await register(player, 'Casey');
  await openApp(duplicate);
  await duplicate.getByLabel('Name').fill('Casey');
  await duplicate.getByRole('button', { name: 'Submit' }).click();

  await expect(duplicate.getByRole('alert')).toContainText('name is already taken');
  await expect(duplicate.getByLabel('Name')).toHaveValue('Casey');
  await expect(duplicate.getByRole('button', { name: 'Submit' })).toBeEnabled();

  await playerContext.close();
  await duplicateContext.close();
});

test('reconnects and automatically restores registration', async ({ page }) => {
  await page.addInitScript(() => {
    const sockets: WebSocket[] = [];
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, argumentsList) {
        const socket = Reflect.construct(target, argumentsList) as WebSocket;
        sockets.push(socket);
        return socket;
      },
    });
    window.addEventListener('__test_disconnect_socket', () => sockets.at(-1)?.close());
  });
  await register(page, 'Reconnect Alice');
  await expect(page.getByRole('heading', { name: 'Reconnect Alice' })).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('__test_disconnect_socket')));
  await expect(page.getByRole('dialog')).toContainText('Connecting...');

  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5_000 });
  await expect(page.getByRole('heading', { name: 'Reconnect Alice' })).toBeVisible();
});

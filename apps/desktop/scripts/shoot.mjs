import { _electron as electron } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const SHOT = '/tmp/shots';
mkdirSync(SHOT, { recursive: true });

console.log('launching…');
const app = await electron.launch({
  args: ['.'],
  cwd: appRoot,
  env: { ...process.env, NODE_ENV: 'production' },
});

const main = await app.waitForEvent('window', {
  predicate: async (w) => {
    try {
      return (await w.title()) === 'OpenStory';
    } catch {
      return false;
    }
  },
  timeout: 15_000,
});
await main.waitForLoadState('domcontentloaded');
await main.waitForTimeout(1200);
await main.screenshot({ path: join(SHOT, 'main.png') });
console.log('shot: main');

// Pop out the detached preview window to capture its restyled chrome.
try {
  const second = app.waitForEvent('window', { timeout: 10_000 });
  await main.locator('button', { hasText: 'Pop out' }).click();
  const detached = await second;
  await detached.waitForLoadState('domcontentloaded');
  await detached.waitForTimeout(800);
  await detached.screenshot({ path: join(SHOT, 'detached.png') });
  console.log('shot: detached');
} catch (e) {
  console.log('detached failed:', e.message);
}

await app.close();
console.log('done');

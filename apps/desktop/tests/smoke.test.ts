import { test, expect, _electron as electron } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('launches HUD with title', async () => {
  const app = await electron.launch({
    args: ['.'],
    cwd: resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  const proc = app.process();
  proc.stdout?.on('data', (data) => console.log('MAIN STDOUT:', data.toString().trim()));
  proc.stderr?.on('data', (data) => console.error('MAIN STDERR:', data.toString().trim()));

  const hud = await app.waitForEvent('window', {
    predicate: async (win) => {
      try {
        const title = await win.title();
        return title === 'OpenStory';
      } catch {
        return false;
      }
    },
    timeout: 10000,
  });

  await expect(hud.locator('text=OpenStory')).toBeVisible();

  await app.close();
});




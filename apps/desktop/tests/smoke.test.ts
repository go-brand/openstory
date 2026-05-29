import { test, expect, _electron as electron } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Launch the Electron app and wait for the main "OpenStory" window. */
async function launchApp() {
  const app = await electron.launch({
    args: ['.'],
    cwd: resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  const proc = app.process();
  proc.stdout?.on('data', (data) =>
    console.log('MAIN STDOUT:', data.toString().trim())
  );
  proc.stderr?.on('data', (data) =>
    console.error('MAIN STDERR:', data.toString().trim())
  );

  const main = await app.waitForEvent('window', {
    predicate: async (win) => {
      try {
        const title = await win.title();
        return title === 'OpenStory';
      } catch {
        return false;
      }
    },
    timeout: 10_000,
  });

  return { app, main };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('launches main window with OpenStory title', async () => {
  const { app, main } = await launchApp();
  try {
    // Use the exact header element to avoid strict-mode collisions with any
    // other node that happens to contain the word "OpenStory" (e.g. the
    // "No previews found in openstory.config.ts" hint text).
    await expect(
      main.locator('header').filter({ hasText: 'OpenStory' })
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test('sidebar is rendered', async () => {
  const { app, main } = await launchApp();
  try {
    // The <aside> sidebar is always rendered in main-app.tsx regardless of
    // whether a project is loaded. Confirm the full component tree mounted.
    await expect(main.locator('aside').first()).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});

test('main canvas has a <main> element', async () => {
  const { app, main } = await launchApp();
  try {
    // The <main> element wraps the canvas/preview area in main-app.tsx.
    // This confirms the full React tree has mounted and rendered the correct role.
    await expect(main.locator('main')).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});

test('viewport toggle buttons are rendered (Desktop / Mobile)', async () => {
  const { app, main } = await launchApp();
  try {
    // Viewport buttons live in the toolbar and are always rendered regardless
    // of whether a project is loaded (main-app.tsx toolbar row).
    await expect(main.locator('text=Desktop')).toBeVisible({ timeout: 8_000 });
    await expect(main.locator('text=Mobile')).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});

test('empty state: shows "Open a project…" when no project is stored', async () => {
  const { app, main } = await launchApp();
  try {
    // This assertion is only valid when the electron-store has no persisted
    // projects (fresh machine / cleared store). When a project is already
    // stored the app shows the project-select dropdown instead.
    // We detect which state we're in by checking for the sidebar content.
    const hasNoProjects = await main
      .locator('text=Open a project…')
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (hasNoProjects) {
      await expect(main.locator('text=Open a project…')).toBeVisible();
    } else {
      // A project is already loaded — confirm the project selector is rendered
      // instead, so the test stays meaningful in either state.
      // The SelectTrigger renders a <button> with role="combobox".
      await expect(main.locator('[role="combobox"]').first()).toBeVisible({
        timeout: 8_000,
      });
    }
  } finally {
    await app.close();
  }
});

test('pop-out: "Pop out" button opens a second window (detached preview)', async () => {
  const { app, main } = await launchApp();
  try {
    // "Pop out" is always rendered in the toolbar regardless of project state
    // (main-app.tsx L146). Use it as both the readiness signal and the trigger.
    const popOutBtn = main.locator('button', { hasText: 'Pop out' });
    await expect(popOutBtn).toBeVisible({ timeout: 8_000 });

    // Register the listener BEFORE clicking to avoid a timing race.
    const secondWindowPromise = app.waitForEvent('window', { timeout: 10_000 });

    await popOutBtn.click();

    const detached = await secondWindowPromise;

    // Both windows load the same index.html whose <title> is "OpenStory", so
    // page.title() can't distinguish them. Instead assert on the DOM content
    // that is unique to the detached renderer (role=detached → DetachedPreview).
    // detached-preview.tsx renders "OpenStory Preview · drag" in its drag-bar.
    await expect(detached.locator('text=OpenStory Preview')).toBeVisible({
      timeout: 8_000,
    });

    // Exactly two windows are now open.
    expect(app.windows().length).toBe(2);
  } finally {
    await app.close();
  }
});

// ---------------------------------------------------------------------------
// TODO (requires live Vite server — not automatable in this harness without a
// running vite dev server serving the manifest):
//
// - Component tree lists preview entries after project:add + project:select
//   triggers viteHost.start() and fetchManifest().  Without a live vite server
//   the manifest stays [] and no tree buttons are rendered.
//
// - Clicking a non-first tree item changes the active preview (button variant
//   switches from 'ghost' to 'active').
//
// - Editing a text control fires preview:setProps and the input reflects the
//   typed value — requires a preview with controls to be loaded.
//
// These are covered by manual testing against examples/linkedin-starter.
// To enable them in CI: pre-build the example, spawn `vite preview` on a known
// port, and seed the store via a test-only IPC channel (or electron-store file
// injection before launch) so project:select can bypass the native folder dialog.
// ---------------------------------------------------------------------------

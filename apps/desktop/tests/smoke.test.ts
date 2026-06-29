import { test, expect, _electron as electron } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Launch the Electron app and wait for the main "OpenStory" window. */
async function launchApp() {
  const app = await electron.launch({
    args: ["."],
    cwd: resolve(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  const proc = app.process();
  proc.stdout?.on("data", (data) => console.log("MAIN STDOUT:", data.toString().trim()));
  proc.stderr?.on("data", (data) => console.error("MAIN STDERR:", data.toString().trim()));

  const main = await app.waitForEvent("window", {
    predicate: async (win) => {
      try {
        const title = await win.title();
        return title === "OpenStory";
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

test("launches main window with OpenStory title", async () => {
  const { app, main } = await launchApp();
  try {
    // Use the exact header element to avoid strict-mode collisions with any
    // other node that happens to contain the word "OpenStory" (e.g. the
    // "No stories found in openstory.config.ts" hint text).
    await expect(main.locator("header").filter({ hasText: "OpenStory" })).toBeVisible();
  } finally {
    await app.close();
  }
});

test("sidebar is rendered", async () => {
  const { app, main } = await launchApp();
  try {
    // The <aside> sidebar is always rendered in main-app.tsx regardless of
    // whether a project is loaded. Confirm the full component tree mounted.
    await expect(main.locator("aside").first()).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});

test("main canvas has a <main> element", async () => {
  const { app, main } = await launchApp();
  try {
    // The <main> element wraps the canvas/preview area in main-app.tsx.
    // This confirms the full React tree has mounted and rendered the correct role.
    await expect(main.locator("main")).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});

test("viewport toggle buttons are rendered (Desktop / Mobile)", async () => {
  const { app, main } = await launchApp();
  try {
    // Viewport buttons live in the toolbar and are always rendered regardless
    // of whether a project is loaded (main-app.tsx toolbar row).
    await expect(main.locator("text=Desktop")).toBeVisible({ timeout: 8_000 });
    await expect(main.locator("text=Mobile")).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});

test("sidebar renders the repo switcher and component search", async () => {
  const { app, main } = await launchApp();
  try {
    // The search input is always rendered in the sidebar regardless of project state.
    await expect(main.getByPlaceholder("Find components…")).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});

test('repo switcher dropdown offers "Add repository…"', async () => {
  const { app, main } = await launchApp();
  try {
    // Open the switcher (first button in the <aside>), then assert the add action.
    await main.locator("aside button").first().click();
    await expect(main.locator("text=Add repository")).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});

test("⌘K opens the command palette", async () => {
  const { app, main } = await launchApp();
  try {
    // Palette is closed initially; the search input only mounts when open.
    const input = main.getByPlaceholder("Search components…");
    await expect(input).toHaveCount(0);

    await main.locator("body").press("Meta+k");

    await expect(input).toBeVisible({ timeout: 8_000 });
    await expect(input).toBeFocused();
  } finally {
    await app.close();
  }
});

test("pop-out: toolbar button opens a second window (detached preview)", async () => {
  const { app, main } = await launchApp();
  try {
    // The icon-only pop-out button is always in the toolbar regardless of project
    // state; locate it by its accessible name. Use it as readiness + trigger.
    const popOutBtn = main.getByRole("button", { name: "Open in new window" });
    await expect(popOutBtn).toBeVisible({ timeout: 8_000 });

    // Register the listener BEFORE clicking to avoid a timing race.
    const secondWindowPromise = app.waitForEvent("window", { timeout: 10_000 });

    await popOutBtn.click();

    const detached = await secondWindowPromise;

    // Both windows load the same index.html whose <title> is "OpenStory", so
    // page.title() can't distinguish them. Assert on DOM unique to the detached
    // renderer (role=detached → DetachedPreview): its overlay controls.
    await expect(detached.locator("text=Difference blend")).toBeVisible({
      timeout: 8_000,
    });

    // Exactly two windows are now open.
    expect(app.windows().length).toBe(2);
  } finally {
    await app.close();
  }
});

test("app defaults to light theme (no dark class on <html>)", async () => {
  const { app, main } = await launchApp();
  try {
    await expect(main.locator("header").filter({ hasText: "OpenStory" })).toBeVisible();
    const hasDark = await main.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(hasDark).toBe(false);
  } finally {
    await app.close();
  }
});

test("settings menu toggles to dark theme and persists across reload", async () => {
  const { app, main } = await launchApp();
  try {
    await expect(main.locator("header").filter({ hasText: "OpenStory" })).toBeVisible();

    // Open settings → Theme submenu → Dark.
    // The Theme submenu trigger is a `menuitem` whose accessible text also
    // includes the current-theme indicator ("Light"/"Dark"), so scope by role
    // + hasText. base-ui submenus open on hover; hover the trigger, then click
    // the Dark item (exact name, to avoid matching the trigger's indicator).
    await main.getByRole("button", { name: "Settings" }).click();
    await main.getByRole("menuitem").filter({ hasText: "Theme" }).hover();
    await main.getByRole("menuitem", { name: "Dark", exact: true }).click();

    // <html> gains the `dark` class.
    await expect
      .poll(() => main.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);

    // Persisted: reload the renderer and confirm it boots dark.
    await main.reload();
    await expect(main.locator("header").filter({ hasText: "OpenStory" })).toBeVisible();
    await expect
      .poll(() => main.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);
  } finally {
    // Restore default (light) so the shared store doesn't leak dark into other tests.
    try {
      await main.getByRole("button", { name: "Settings" }).click();
      await main.getByRole("menuitem").filter({ hasText: "Theme" }).hover();
      await main.getByRole("menuitem", { name: "Light", exact: true }).click();
    } catch {
      // best-effort cleanup
    }
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
// These are covered by manual testing against examples/starter.
// To enable them in CI: pre-build the example, spawn `vite preview` on a known
// port, and seed the store via a test-only IPC channel (or electron-store file
// injection before launch) so project:select can bypass the native folder dialog.
// ---------------------------------------------------------------------------

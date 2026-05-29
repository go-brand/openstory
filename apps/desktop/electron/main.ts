import { app, BrowserWindow } from 'electron';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppStore } from './store';
import { ViteHost } from './vite-host';
import { createHudWindow } from './windows/hud';
import { registerIpc } from './ipc';
import { registerShortcuts } from './shortcuts';

// --- Crash hardening -------------------------------------------------------
// When the launching terminal closes its read end of stdout/stderr, any write
// (including Node's own warning emitter) throws EPIPE and would crash the main
// process. Swallow broken-pipe errors on the std streams and as a backstop;
// re-throw everything else so real bugs still surface.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') throw err;
  });
}
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') throw err;
});

// Mirror process warnings to a log file. stderr is unreliable (it may be a
// closed pipe), so the default console.warn path can be lost; this gives us a
// durable record of which warning fired without ever crashing the app.
process.on('warning', (w) => {
  try {
    appendFileSync(
      join(app.getPath('logs'), 'warnings.log'),
      `${new Date().toISOString()} [${w.name}] ${w.message}\n${w.stack ?? ''}\n\n`
    );
  } catch {
    // diagnostics must never become the crash source
  }
});

const viteHost = new ViteHost();
const store = new AppStore();
let hudWindow: BrowserWindow | null = null;
let isQuitting = false;

function attachBoundsPersistence(win: BrowserWindow) {
  // Debounce: drag/resize fire continuously; persist once the gesture settles
  // so we don't hammer electron-store (synchronous disk writes) per frame.
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => store.set('hudBounds', win.getBounds()), 250);
  };
  win.on('moved', save);
  win.on('resized', save);
}

async function createHud() {
  const hudBounds = store.state.hudBounds ?? undefined;
  hudWindow = await createHudWindow(hudBounds ? { bounds: hudBounds } : {});
  attachBoundsPersistence(hudWindow);

  if (store.state.overlay.alwaysOnTop) {
    hudWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  if (process.env.ELECTRON_RENDERER_URL) {
    hudWindow.webContents.openDevTools({ mode: 'detach' });
  }
  hudWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    console.error('[HUD preload-error]', preloadPath, err);
  });
  hudWindow.on('closed', () => {
    hudWindow = null;
  });
  hudWindow.focus();
  return hudWindow;
}

async function bootstrap() {
  // Reset click-through on every launch so users can never relaunch into a
  // locked, un-clickable window.
  store.patchOverlay({ clickThrough: false });

  await createHud();

  const { broadcastState } = registerIpc({
    store,
    viteHost,
    getHud: () => hudWindow,
  });
  registerShortcuts({ store, getHud: () => hudWindow, broadcastState });

  // Resume the last project, if any.
  const { projectId } = store.state.selection;
  if (projectId) {
    const project = store.state.projects.find((p) => p.id === projectId);
    if (project) viteHost.start(project.path).catch(() => {});
  }
}

app.whenReady().then(bootstrap);

// macOS: re-open a window when the dock icon is clicked and none are open.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createHud();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Ensure the child Vite server is torn down before we exit. Electron does not
// await async before-quit listeners, so we defer the quit until stop resolves.
app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  viteHost.stop().finally(() => app.quit());
});

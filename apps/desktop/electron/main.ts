import { app, BrowserWindow } from 'electron';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppStore } from './store';
import { ViteHost } from './vite-host';
import { createMainWindow } from './windows/main-window';
import { createDetachedWindow } from './windows/detached-window';
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
let mainWindow: BrowserWindow | null = null;
let detachedWindow: BrowserWindow | null = null;
let detachedOpening = false;
let isQuitting = false;
// Captured from registerIpc in bootstrap so openDetached can bind the overlay
// shortcut layer to each freshly created detached window.
let broadcastState: () => void = () => {};

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
  // A pending debounce would call getBounds() on a destroyed window (throws).
  win.on('closed', () => {
    if (timer) clearTimeout(timer);
  });
}

async function createMain() {
  // 'hudBounds' is the legacy persisted key name for the main window bounds —
  // the original "hud" window concept is gone, but the store key is kept stable.
  const hudBounds = store.state.hudBounds ?? undefined;
  mainWindow = await createMainWindow(hudBounds ? { bounds: hudBounds } : {});
  attachBoundsPersistence(mainWindow);
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
  mainWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    console.error('[main preload-error]', preloadPath, err);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.focus();
  return mainWindow;
}

async function openDetached() {
  if (detachedWindow) {
    detachedWindow.focus();
    return;
  }
  // Synchronous in-flight guard: detachedWindow is only assigned after the
  // await, so without this two back-to-back calls would both pass the null
  // check and create duplicate windows.
  if (detachedOpening) return;
  detachedOpening = true;
  try {
    detachedWindow = await createDetachedWindow({});
    if (store.state.overlay.alwaysOnTop) {
      detachedWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    // Bind the overlay shortcut layer to this freshly created window. The
    // listener is torn down with the webContents on close, so re-popOut
    // re-binds cleanly without leaking listeners.
    registerShortcuts({ store, broadcastState }, detachedWindow);
    detachedWindow.on('closed', () => {
      detachedWindow = null;
    });
  } finally {
    detachedOpening = false;
  }
}

function closeDetached() {
  // close() is async; the 'closed' handler is the single owner of nulling the
  // ref. Nulling here synchronously would let a quick popIn→popOut build a
  // second window while the first is mid-close, then orphan the live one when
  // the first's 'closed' fires.
  detachedWindow?.close();
}

async function bootstrap() {
  // Reset click-through on every launch so users can never relaunch into a
  // locked, un-clickable window.
  store.patchOverlay({ clickThrough: false });

  await createMain();

  const ipc = registerIpc({
    store,
    viteHost,
    getMain: () => mainWindow,
    getDetached: () => detachedWindow,
    openDetached: () => {
      void openDetached();
    },
    closeDetached,
  });
  // Stash for openDetached, which binds the overlay shortcut layer to each
  // detached window as it is created (the window does not exist yet here).
  broadcastState = ipc.broadcastState;

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
  if (BrowserWindow.getAllWindows().length === 0) void createMain();
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

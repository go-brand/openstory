import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type CreateHudOptions = {
  bounds?: { x?: number; y?: number; width?: number; height?: number };
};

export async function createHudWindow(
  opts: CreateHudOptions = {}
): Promise<BrowserWindow> {
  const bounds = opts.bounds ?? {};
  const win = new BrowserWindow({
    width: bounds.width ?? 980,
    height: bounds.height ?? 820,
    x: bounds.x ?? 80,
    y: bounds.y ?? 80,
    title: 'OpenStory',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    transparent: true,
    hasShadow: false,
    resizable: true,
    minWidth: 600,
    minHeight: 500,
    backgroundColor: '#00000000',
    alwaysOnTop: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      // The preload only touches contextBridge/ipcRenderer, both available in
      // the sandbox, so we keep the renderer fully sandboxed.
      sandbox: true,
    },
  });
  win.setVisibleOnAllWorkspaces(true);
  if (process.env.ELECTRON_RENDERER_URL) {
    const loadWithRetry = async (retries = 10, delay = 500) => {
      for (let i = 0; i < retries; i++) {
        try {
          await win.loadURL(process.env.ELECTRON_RENDERER_URL!);
          return;
        } catch (err) {
          if (i === retries - 1) throw err;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    };
    await loadWithRetry();
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

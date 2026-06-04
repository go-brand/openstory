import { BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type CreateMainOptions = {
  bounds?: { x?: number; y?: number; width?: number; height?: number };
};

async function loadRenderer(win: BrowserWindow, role: string) {
  if (process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL;
    const url = `${base}?role=${role}`;
    for (let i = 0; i < 10; i++) {
      try {
        await win.loadURL(url);
        return;
      } catch (err) {
        if (i === 9) throw err;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  } else {
    await win.loadFile(join(__dirname, "../renderer/index.html"), {
      query: { role },
    });
  }
}

export async function createMainWindow(opts: CreateMainOptions = {}): Promise<BrowserWindow> {
  const bounds = opts.bounds ?? {};
  const win = new BrowserWindow({
    width: bounds.width ?? 1100,
    height: bounds.height ?? 760,
    ...(bounds.x !== undefined && { x: bounds.x }),
    ...(bounds.y !== undefined && { y: bounds.y }),
    title: "OpenStory",
    titleBarStyle: "hiddenInset",
    // Vertically centered in the 44px (h-11) full-width titlebar.
    trafficLightPosition: { x: 14, y: 15 },
    backgroundColor: "#0f0f10",
    minWidth: 720,
    minHeight: 520,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  await loadRenderer(win, "main");
  return win;
}

export { loadRenderer };

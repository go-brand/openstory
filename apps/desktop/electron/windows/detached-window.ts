import { BrowserWindow } from "electron";
import { join } from "node:path";
import { loadRenderer } from "./main-window";

// `__dirname` is provided by electron-vite's ESM main output (it injects
// `const __dirname = import.meta.dirname`), so no manual shim is needed.

export type CreateDetachedOptions = {
  bounds?: { x?: number; y?: number; width?: number; height?: number };
};

export async function createDetachedWindow(
  opts: CreateDetachedOptions = {},
): Promise<BrowserWindow> {
  const bounds = opts.bounds ?? {};
  const win = new BrowserWindow({
    width: bounds.width ?? 600,
    height: bounds.height ?? 700,
    ...(bounds.x !== undefined && { x: bounds.x }),
    ...(bounds.y !== undefined && { y: bounds.y }),
    title: "OpenStory Preview",
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    resizable: true,
    minWidth: 280,
    minHeight: 320,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setVisibleOnAllWorkspaces(true);
  await loadRenderer(win, "detached");
  return win;
}

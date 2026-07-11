import { BrowserWindow } from "electron";
import { AppStore } from "./store";

type Deps = {
  store: AppStore;
  broadcastState: () => void;
};

function adjustOpacity(deps: Deps, delta: number) {
  const next = Math.max(0, Math.min(1, deps.store.state.overlay.opacity + delta));
  deps.store.patchOverlay({ opacity: next });
  deps.broadcastState();
}

function toggleClickThrough(deps: Deps, win: BrowserWindow) {
  const enabled = !deps.store.state.overlay.clickThrough;
  deps.store.patchOverlay({ clickThrough: enabled });
  win.setIgnoreMouseEvents(enabled, { forward: true });
  deps.broadcastState();
}

function toggleBlend(deps: Deps) {
  const mode = deps.store.state.overlay.blendMode === "normal" ? "difference" : "normal";
  deps.store.patchOverlay({ blendMode: mode });
  deps.broadcastState();
}

function reloadWindow(win: BrowserWindow) {
  win.webContents.reload();
}

type InputEvent = Electron.Input;

function matches(
  input: InputEvent,
  key: string,
  mods: { cmd?: boolean; shift?: boolean; alt?: boolean } = {},
) {
  if (input.key.toLowerCase() !== key.toLowerCase()) return false;
  const cmd = input.meta || input.control;
  if (Boolean(mods.cmd) !== cmd) return false;
  if (Boolean(mods.shift) !== input.shift) return false;
  if (Boolean(mods.alt) !== input.alt) return false;
  return true;
}

// Bind the overlay shortcut layer to a specific window's webContents. The
// detached/overlay window is created lazily (and recreated on every
// popOut→popIn cycle), so this must be called from openDetached after the
// window exists — not once at bootstrap when no overlay window yet exists.
// The listener lives on the window's webContents and is torn down with it on
// close, so each fresh window re-binds cleanly with no leaked listeners.
export function registerShortcuts(deps: Deps, win: BrowserWindow): void {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    // Click-through toggle: F8 OR Cmd+Alt+T
    if (matches(input, "F8") || matches(input, "t", { cmd: true, alt: true })) {
      toggleClickThrough(deps, win);
      event.preventDefault();
      return;
    }

    // Opacity ±10%: Cmd+Up / Cmd+Down
    if (matches(input, "ArrowUp", { cmd: true })) {
      adjustOpacity(deps, 0.1);
      event.preventDefault();
      return;
    }
    if (matches(input, "ArrowDown", { cmd: true })) {
      adjustOpacity(deps, -0.1);
      event.preventDefault();
      return;
    }

    // Opacity ±1%: Cmd+Shift+Up / Cmd+Shift+Down
    if (matches(input, "ArrowUp", { cmd: true, shift: true })) {
      adjustOpacity(deps, 0.01);
      event.preventDefault();
      return;
    }
    if (matches(input, "ArrowDown", { cmd: true, shift: true })) {
      adjustOpacity(deps, -0.01);
      event.preventDefault();
      return;
    }

    // Blend mode: Cmd+B
    if (matches(input, "b", { cmd: true })) {
      toggleBlend(deps);
      event.preventDefault();
      return;
    }

    // Reload: Cmd+R
    if (matches(input, "r", { cmd: true })) {
      reloadWindow(win);
      event.preventDefault();
      return;
    }
  });
}

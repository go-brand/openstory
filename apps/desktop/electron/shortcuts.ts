import { BrowserWindow } from 'electron';
import { AppStore } from './store';

type Deps = {
  store: AppStore;
  getHud: () => BrowserWindow | null;
  broadcastState: () => void;
};

function adjustOpacity(deps: Deps, delta: number) {
  const next = Math.max(
    0,
    Math.min(1, deps.store.state.overlay.opacity + delta)
  );
  deps.store.patchOverlay({ opacity: next });
  deps.broadcastState();
}

function toggleClickThrough(deps: Deps) {
  const enabled = !deps.store.state.overlay.clickThrough;
  deps.store.patchOverlay({ clickThrough: enabled });
  deps.getHud()?.setIgnoreMouseEvents(enabled, { forward: true });
  deps.broadcastState();
}

function toggleBlend(deps: Deps) {
  const mode =
    deps.store.state.overlay.blendMode === 'normal' ? 'difference' : 'normal';
  deps.store.patchOverlay({ blendMode: mode });
  deps.broadcastState();
}

function reloadHud(deps: Deps) {
  deps.getHud()?.webContents.reload();
}

type InputEvent = Electron.Input;

function matches(
  input: InputEvent,
  key: string,
  mods: { cmd?: boolean; shift?: boolean; alt?: boolean } = {}
) {
  if (input.key.toLowerCase() !== key.toLowerCase()) return false;
  const cmd = input.meta || input.control;
  if (Boolean(mods.cmd) !== cmd) return false;
  if (Boolean(mods.shift) !== input.shift) return false;
  if (Boolean(mods.alt) !== input.alt) return false;
  return true;
}

export function registerShortcuts(deps: Deps): void {
  const hud = deps.getHud();
  if (!hud) return;

  hud.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // Click-through toggle: F8 OR Cmd+Alt+T
    if (matches(input, 'F8') || matches(input, 't', { cmd: true, alt: true })) {
      toggleClickThrough(deps);
      event.preventDefault();
      return;
    }

    // Opacity ±10%: Cmd+Up / Cmd+Down
    if (matches(input, 'ArrowUp', { cmd: true })) {
      adjustOpacity(deps, 0.1);
      event.preventDefault();
      return;
    }
    if (matches(input, 'ArrowDown', { cmd: true })) {
      adjustOpacity(deps, -0.1);
      event.preventDefault();
      return;
    }

    // Opacity ±1%: Cmd+Shift+Up / Cmd+Shift+Down
    if (matches(input, 'ArrowUp', { cmd: true, shift: true })) {
      adjustOpacity(deps, 0.01);
      event.preventDefault();
      return;
    }
    if (matches(input, 'ArrowDown', { cmd: true, shift: true })) {
      adjustOpacity(deps, -0.01);
      event.preventDefault();
      return;
    }

    // Blend mode: Cmd+B
    if (matches(input, 'b', { cmd: true })) {
      toggleBlend(deps);
      event.preventDefault();
      return;
    }

    // Reload: Cmd+R
    if (matches(input, 'r', { cmd: true })) {
      reloadHud(deps);
      event.preventDefault();
      return;
    }
  });
}

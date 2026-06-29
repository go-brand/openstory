#!/usr/bin/env bash
# Build a macOS .app that launches the OpenStory desktop dev server. Clicking it
# is the equivalent of `pnpm dev` at the repo root (turbo: watch-builds the
# packages AND launches Electron), so code edits hot-reload with no rebuild.
#
# It keeps your opened-projects history (electron-store is untouched) but always
# starts a CLEAN process tree: on macOS the app stays alive when you close the
# window, so each launch first kills any prior dev instance from THIS repo —
# otherwise a relaunch would stack a second server + Electron and serve stale
# state. Re-run this script only if paths change.
set -euo pipefail

# apps/desktop/scripts -> apps/desktop -> repo root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DESKTOP_DIR/../.." && pwd)"

APP_NAME="OpenStory Dev"
OUT_DIR="${1:-$HOME/Applications}"
APP="$OUT_DIR/$APP_NAME.app"

# Resolve pnpm absolutely — GUI apps don't inherit the shell PATH.
PNPM_BIN="$(command -v pnpm)"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Copy the generated app icon if present (see icon.html + this dir's README).
ICON_LINE=""
if [[ -f "$SCRIPT_DIR/AppIcon.icns" ]]; then
  cp "$SCRIPT_DIR/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
  ICON_LINE="  <key>CFBundleIconFile</key><string>AppIcon</string>"
fi

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>app.gobrand.openstory.dev</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launch</string>
$ICON_LINE
  <key>LSMinimumSystemVersion</key><string>11.0</string>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/launch" <<LAUNCH
#!/usr/bin/env bash
# Logs to /tmp so you can tail them: tail -f /tmp/openstory-dev.log
exec >> /tmp/openstory-dev.log 2>&1
echo "=== launch \$(date) ==="

# Kill any prior dev instance from THIS repo so the relaunch is clean. macOS does
# not quit the app when its window closes, so without this a second click would
# stack another turbo + Vite host + Electron and surface stale state. The match
# patterns are this repo's node_modules paths only — no editor or unrelated app
# shares them, so nothing else is touched. Projects history is in electron-store
# and is left untouched, so your opened projects persist across launches.
pkill -f "$REPO_ROOT/node_modules/.bin/turbo" 2>/dev/null || true
pkill -f "$REPO_ROOT/apps/desktop/node_modules/.bin/electron-vite" 2>/dev/null || true
pkill -f "$REPO_ROOT/apps/desktop/node_modules/electron/" 2>/dev/null || true
sleep 0.4

# Root \`pnpm dev\` = turbo: watch-build every workspace package (no stale dist)
# AND launch Electron. Running the desktop package alone would skip the package
# rebuilds and could serve a stale @gobrand/* build.
cd "$REPO_ROOT"
exec "$PNPM_BIN" dev
LAUNCH

chmod +x "$APP/Contents/MacOS/launch"

echo "Built: $APP"
echo "Open it once to verify, then drag it into the Dock."

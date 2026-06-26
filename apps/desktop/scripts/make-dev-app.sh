#!/usr/bin/env bash
# Build a macOS .app that launches the OpenStory desktop dev server (pnpm dev).
# Drag the resulting .app to your Dock; clicking it runs the LOCAL dev build
# with hot reload. Re-run this script only if paths change — the .app reads
# live source each launch, so code edits need no rebuild.
set -euo pipefail

# Repo root = two levels up from this script (apps/desktop/scripts -> repo).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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
cd "$DESKTOP_DIR"
exec "$PNPM_BIN" dev
LAUNCH

chmod +x "$APP/Contents/MacOS/launch"

echo "Built: $APP"
echo "Open it once to verify, then drag it into the Dock."

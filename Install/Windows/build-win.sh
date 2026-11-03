#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"
VERSION=$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || echo "1.0.18")
BUILD_DIR="$DIR/dist/brave-music_${VERSION}_win64"
OUTPUT_ZIP="$DIR/brave-music_${VERSION}_win64.zip"
OUTPUT_EXE="$DIR/BraveMusic-Setup-${VERSION}.exe"
TOOLS_DIR="$DIR/tools"

echo "=================================================================="
echo "=== Building Brave Music Windows Suite (.exe & .zip) v${VERSION} ==="
echo "=== Provider: COSL Codemo Open Source Labs (codemoteams.org)   ==="
echo "=================================================================="

# 1. Ensure tools and electron runtime exist
mkdir -p "$TOOLS_DIR"
ELECTRON_ZIP="$TOOLS_DIR/electron-win32-x64.zip"
if [ ! -f "$ELECTRON_ZIP" ] || [ $(stat -c%s "$ELECTRON_ZIP") -lt 50000000 ]; then
  echo "Downloading CastLabs Widevine Electron Windows x64 Runtime..."
  curl -sL -o "$ELECTRON_ZIP" "https://github.com/castlabs/electron-releases/releases/download/v42.11.18%2Bwvcus/electron-v42.11.18+wvcus-win32-x64.zip"
fi

YTDLP_EXE="$TOOLS_DIR/yt-dlp.exe"
if [ ! -f "$YTDLP_EXE" ]; then
  echo "Downloading yt-dlp.exe for Windows..."
  curl -sL -o "$YTDLP_EXE" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
fi

SFX_BIN="$TOOLS_DIR/7z.sfx"
if [ ! -f "$SFX_BIN" ]; then
  echo "Extracting Windows 7z.sfx installer stub..."
  if [ ! -f "$TOOLS_DIR/7z-installer.exe" ]; then
    curl -sL -o "$TOOLS_DIR/7z-installer.exe" "https://github.com/ip7z/7zip/releases/download/24.08/7z2408-x64.exe"
  fi
  7z e -y "$TOOLS_DIR/7z-installer.exe" -o"$TOOLS_DIR" 7z.sfx > /dev/null
fi

# 2. Clean previous build artifacts
rm -rf "$DIR/dist" "$OUTPUT_ZIP" "$OUTPUT_EXE"
mkdir -p "$BUILD_DIR/resources/app"
mkdir -p "$BUILD_DIR/resources/app/bin"

# 3. Extract Electron Windows binaries
echo "Extracting Electron Windows runtime..."
7z x -y "$ELECTRON_ZIP" -o"$BUILD_DIR" > /dev/null

# Rename electron.exe to brave-music.exe
if [ -f "$BUILD_DIR/electron.exe" ]; then
  mv "$BUILD_DIR/electron.exe" "$BUILD_DIR/brave-music.exe"
fi

# 4. Copy Application Code & Assets into resources/app/
echo "Packaging Brave Music application files..."
cp "$ROOT_DIR/package.json" "$BUILD_DIR/resources/app/"
cp "$ROOT_DIR/main.js" "$BUILD_DIR/resources/app/"
cp "$ROOT_DIR/preload.js" "$BUILD_DIR/resources/app/"
cp -r "$ROOT_DIR/backend" "$BUILD_DIR/resources/app/"
cp -r "$ROOT_DIR/src" "$BUILD_DIR/resources/app/"

# Copy bundled Windows yt-dlp.exe
cp "$YTDLP_EXE" "$BUILD_DIR/resources/app/bin/yt-dlp.exe"
mkdir -p "$BUILD_DIR/bin"
cp "$YTDLP_EXE" "$BUILD_DIR/bin/yt-dlp.exe"

# Copy node_modules (excluding linux-only native modules like dbus-next/mpris-service)
echo "Bundling dependencies..."
mkdir -p "$BUILD_DIR/resources/app/node_modules"
cp -r "$ROOT_DIR/node_modules/ws" "$BUILD_DIR/resources/app/node_modules/" 2>/dev/null || true

# Copy Windows icon
if [ -f "$ROOT_DIR/src/assets/app-icon.ico" ]; then
  cp "$ROOT_DIR/src/assets/app-icon.ico" "$BUILD_DIR/brave-music.ico"
fi

# 5. Create Portable ZIP Suite
echo "Creating portable ZIP archive ($OUTPUT_ZIP)..."
cd "$DIR/dist"
7z a -tzip -mx=9 "$OUTPUT_ZIP" "brave-music_${VERSION}_win64" > /dev/null
cd "$ROOT_DIR"

# 6. Create Native Windows Self-Extracting Suite (.exe)
echo "Generating Native Windows Suite Installer ($OUTPUT_EXE)..."
CONFIG_TXT="$DIR/dist/config.txt"
cat << 'EOF' > "$CONFIG_TXT"
;!@Install@!UTF-8!
Title="Brave Music Desktop Suite v1.0.18 Setup"
BeginPrompt="Install Brave Music Desktop (COSL Codemo Open Source Labs) on your computer?"
Progress="yes"
Directory="%LOCALAPPDATA%\\Programs\\BraveMusic"
ExecuteFile="brave-music.exe"
;!@InstallEnd@!
EOF

APP_7Z="$DIR/dist/app.7z"
cd "$BUILD_DIR"
7z a -t7z -mx=9 -ms=on "$APP_7Z" * > /dev/null
cd "$ROOT_DIR"

cat "$SFX_BIN" "$CONFIG_TXT" "$APP_7Z" > "$OUTPUT_EXE"
chmod +x "$OUTPUT_EXE"

echo "=== Successfully built Windows Release Packages ==="
ls -lh "$OUTPUT_ZIP" "$OUTPUT_EXE"

echo ""
echo "=== Checksums ==="
cd "$DIR"
sha256sum "$(basename "$OUTPUT_ZIP")" "$(basename "$OUTPUT_EXE")"


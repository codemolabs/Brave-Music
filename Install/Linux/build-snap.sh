#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"
VERSION=$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || echo "1.0.19-r")
STAGE_DIR="$DIR/dist/snap-stage"
OUTPUT_SNAP="$DIR/brave-music_${VERSION}_amd64.snap"

echo "=== Building Brave Music Ubuntu Snap (.snap) Package (v${VERSION}) ==="

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/meta/gui"
mkdir -p "$STAGE_DIR/bin"
mkdir -p "$STAGE_DIR/opt/brave-music"

# 1. Generate meta/snap.yaml
cat << EOF > "$STAGE_DIR/meta/snap.yaml"
name: brave-music
version: ${VERSION}
summary: Ad-free YouTube Music, Spotify & Offline Music OTT Platform
description: |
  Brave Music is a high-performance, open-source Linux desktop Music OTT platform
  developed by Codemo Open Source Labs (COSL). It brings together ad-free YouTube
  Music, Spotify Web with Widevine DRM playback, a local high-bitrate audio
  downloader, and an integrated offline music library with native Linux MPRIS2
  media controls.
license: GPL-3.0+
base: core22
grade: stable
confinement: strict
architectures:
  - amd64
slots:
  mpris:
    interface: mpris
    name: brave-music
plugs:
  browser-sandbox:
    interface: browser-support
    allow-sandbox: false
apps:
  brave-music:
    command: bin/brave-music-snap
    common-id: org.codemolabs.BraveMusic
    slots:
      - mpris
    plugs:
      - desktop
      - desktop-legacy
      - wayland
      - x11
      - opengl
      - audio-playback
      - pulseaudio
      - network
      - network-bind
      - home
      - removable-media
      - browser-sandbox
      - screen-inhibit-control
EOF

# 2. Copy Official App Icon and GUI Desktop Entry
cp "$ROOT_DIR/src/assets/app-icon.png" "$STAGE_DIR/meta/gui/icon.png"
chmod 644 "$STAGE_DIR/meta/gui/icon.png"

cat << 'EOF' > "$STAGE_DIR/meta/gui/brave-music.desktop"
[Desktop Entry]
Name=Brave Music
Comment=Ad-free Music OTT Platform with YouTube, Spotify & Offline Player
Exec=brave-music %U
Icon=${SNAP}/meta/gui/icon.png
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;
StartupWMClass=brave-music
StartupNotify=true
Keywords=Music;YouTube;Spotify;Download;Audio;Player;
EOF
chmod 644 "$STAGE_DIR/meta/gui/brave-music.desktop"

# 3. Copy Application Payload into opt/brave-music
DEB_STAGE="$DIR/dist/brave-music_${VERSION}_amd64/opt/brave-music"
if [ -d "$DEB_STAGE" ] && [ -f "$DEB_STAGE/main.js" ]; then
  echo "Reusing staged application files from $DEB_STAGE..."
  cp -a "$DEB_STAGE/." "$STAGE_DIR/opt/brave-music/"
else
  echo "Staging application files from workspace..."
  cp "$ROOT_DIR/package.json" "$STAGE_DIR/opt/brave-music/"
  cp "$ROOT_DIR/main.js" "$STAGE_DIR/opt/brave-music/"
  cp "$ROOT_DIR/preload.js" "$STAGE_DIR/opt/brave-music/"
  cp -r "$ROOT_DIR/backend" "$STAGE_DIR/opt/brave-music/"
  cp -r "$ROOT_DIR/src" "$STAGE_DIR/opt/brave-music/"
  cp -r "$ROOT_DIR/node_modules" "$STAGE_DIR/opt/brave-music/"

  mkdir -p "$STAGE_DIR/opt/brave-music/WidevineCdm"
  if [ -d "/opt/google/chrome/WidevineCdm" ]; then
    cp -r /opt/google/chrome/WidevineCdm/* "$STAGE_DIR/opt/brave-music/WidevineCdm/" 2>/dev/null || true
  fi
fi

chmod +x "$STAGE_DIR/opt/brave-music/node_modules/electron/dist/electron" 2>/dev/null || true
chmod +x "$STAGE_DIR/opt/brave-music/node_modules/.bin/electron" 2>/dev/null || true
chmod +x "$STAGE_DIR/opt/brave-music/backend/engine/musikcube/musikcubed" 2>/dev/null || true

# 4. Create Snap Launcher Script (bin/brave-music-snap)
cat << 'EOF' > "$STAGE_DIR/bin/brave-music-snap"
#!/bin/bash
unset ELECTRON_RUN_AS_NODE
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export ELECTRON_DISABLE_SECURITY_WARNINGS=true
APP_DIR="${SNAP:-}/opt/brave-music"
if [ ! -d "$APP_DIR" ]; then
  APP_DIR="/opt/brave-music"
fi
cd "$APP_DIR"
FLAGS="--no-sandbox --no-zygote --disable-gpu-sandbox --class=brave-music --name=brave-music"
if [ -x "$APP_DIR/node_modules/electron/dist/electron" ]; then
  exec "$APP_DIR/node_modules/electron/dist/electron" "$APP_DIR" $FLAGS "$@"
elif [ -x "$APP_DIR/node_modules/.bin/electron" ]; then
  exec "$APP_DIR/node_modules/.bin/electron" . $FLAGS "$@"
else
  exec npx --yes electron . $FLAGS "$@"
fi
EOF
chmod +x "$STAGE_DIR/bin/brave-music-snap"

# 5. Validate and Pack Snap Package
echo "Validating snap skeleton..."
snap pack --check-skeleton "$STAGE_DIR"

echo "Packing Snap with LZO compression..."
rm -f "$OUTPUT_SNAP"
snap pack --compression=lzo "$STAGE_DIR" "$DIR" --filename="brave-music_${VERSION}_amd64.snap"

# Clean temporary staging directory to save disk space
rm -rf "$STAGE_DIR"

echo "=== Successfully built Snap Package: $OUTPUT_SNAP ==="
ls -lh "$OUTPUT_SNAP"

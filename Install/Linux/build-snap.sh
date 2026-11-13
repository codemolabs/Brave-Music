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
# Mirrors the metadata produced by the `gnome` extension in snap/snapcraft.yaml:
# content plugs for the GNOME runtime + themes, layouts and desktop-launch.
cat << 'EOF' > "$STAGE_DIR/meta/snap.yaml"
name: brave-music
version: __VERSION__
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
assumes:
  - snapd2.43
architectures:
  - amd64
environment:
  SNAP_DESKTOP_RUNTIME: $SNAP/gnome-platform
  GTK_USE_PORTAL: '1'
layout:
  /usr/share/libdrm:
    bind: $SNAP/gnome-platform/usr/share/libdrm
  /usr/lib/x86_64-linux-gnu/webkit2gtk-4.1:
    bind: $SNAP/gnome-platform/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1
  /usr/lib/x86_64-linux-gnu/libproxy:
    bind: $SNAP/gnome-platform/usr/lib/x86_64-linux-gnu/libproxy
  /usr/share/xml/iso-codes:
    bind: $SNAP/gnome-platform/usr/share/xml/iso-codes
  /usr/lib/x86_64-linux-gnu/webkit2gtk-4.0:
    bind: $SNAP/gnome-platform/usr/lib/x86_64-linux-gnu/webkit2gtk-4.0
hooks:
  configure:
    command-chain:
      - snap/command-chain/hooks-configure-fonts
    plugs:
      - desktop
slots:
  mpris:
    interface: mpris
plugs:
  desktop:
    mount-host-font-cache: false
  gtk-3-themes:
    interface: content
    target: $SNAP/data-dir/themes
    default-provider: gtk-common-themes
  icon-themes:
    interface: content
    target: $SNAP/data-dir/icons
    default-provider: gtk-common-themes
  sound-themes:
    interface: content
    target: $SNAP/data-dir/sounds
    default-provider: gtk-common-themes
  gnome-42-2204:
    interface: content
    target: $SNAP/gnome-platform
    default-provider: gnome-42-2204
apps:
  brave-music:
    command: bin/brave-music-snap
    common-id: org.codemolabs.BraveMusic
    command-chain:
      - snap/command-chain/desktop-launch
    slots:
      - mpris
    plugs:
      - desktop
      - desktop-legacy
      - gsettings
      - opengl
      - wayland
      - x11
      - audio-playback
      - pulseaudio
      - network
      - network-bind
      - home
      - removable-media
      - screen-inhibit-control
EOF
sed -i "s/__VERSION__/${VERSION}/" "$STAGE_DIR/meta/snap.yaml"

# 1b. Install the GNOME extension command-chain shims. They forward to the
#     desktop-launch/font helpers shipped by the gnome-42-2204 content snap.
mkdir -p "$STAGE_DIR/snap/command-chain"
cp "$ROOT_DIR/snap/command-chain/desktop-launch" \
   "$ROOT_DIR/snap/command-chain/hooks-configure-fonts" \
   "$ROOT_DIR/snap/command-chain/run" \
   "$STAGE_DIR/snap/command-chain/"
chmod 755 "$STAGE_DIR/snap/command-chain/"*

# 1c. No-op configure hook. The gnome extension hook chain ends with
#     `exec "$@"`, which is this hook; snapcraft generates an empty one.
mkdir -p "$STAGE_DIR/meta/hooks"
cat << 'EOF' > "$STAGE_DIR/meta/hooks/configure"
#!/bin/sh
# Font cache is built by the gnome-42-2204 hook command-chain.
exit 0
EOF
chmod 755 "$STAGE_DIR/meta/hooks/configure"

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
chmod +x "$STAGE_DIR/opt/brave-music/backend/bin/yt-dlp" \
         "$STAGE_DIR/opt/brave-music/backend/bin/node" \
         "$STAGE_DIR/opt/brave-music/backend/bin/ffmpeg" \
         "$STAGE_DIR/opt/brave-music/backend/bin/ffprobe" 2>/dev/null || true

# 4. Create Snap Launcher Script (bin/brave-music-snap)
cat << 'EOF' > "$STAGE_DIR/bin/brave-music-snap"
#!/bin/bash
unset ELECTRON_RUN_AS_NODE
export ELECTRON_DISABLE_SECURITY_WARNINGS=true
APP_DIR="${SNAP:-}/opt/brave-music"
if [ ! -d "$APP_DIR" ]; then
  APP_DIR="/opt/brave-music"
fi
export PATH="$APP_DIR/backend/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export LD_LIBRARY_PATH="${SNAP:+$SNAP/gnome-platform/usr/lib/x86_64-linux-gnu:$SNAP/gnome-platform/lib/x86_64-linux-gnu:}$APP_DIR/backend/bin:$APP_DIR/backend/engine/musikcube:$APP_DIR/backend/engine/musikcube/lib:${LD_LIBRARY_PATH:-}"
cd "$APP_DIR"
FLAGS="--no-sandbox --no-zygote --disable-gpu-sandbox --disable-dev-shm-usage --class=brave-music --name=brave-music"
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

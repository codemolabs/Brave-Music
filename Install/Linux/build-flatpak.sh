#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"
VERSION=$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || echo "1.0.19-r")
APP_ID="org.codemolabs.BraveMusic"
FP_BUILD_DIR="$DIR/dist/flatpak-build"
FP_REPO_DIR="$DIR/dist/flatpak-repo"
OUTPUT_FLATPAK="$DIR/brave-music_${VERSION}_amd64.flatpak"

echo "=== Building Brave Music Flatpak (.flatpak) Bundle (v${VERSION}) ==="

rm -rf "$FP_BUILD_DIR" "$FP_REPO_DIR"
mkdir -p "$FP_BUILD_DIR/files/opt/brave-music"
mkdir -p "$FP_BUILD_DIR/files/bin"
mkdir -p "$FP_BUILD_DIR/files/share/applications"
mkdir -p "$FP_BUILD_DIR/files/share/metainfo"
mkdir -p "$FP_BUILD_DIR/files/share/icons/hicolor/scalable/apps"

# 1. Create Flatpak Metadata
cat << EOF > "$FP_BUILD_DIR/metadata"
[Application]
name=${APP_ID}
runtime=org.freedesktop.Platform/x86_64/25.08
sdk=org.freedesktop.Sdk/x86_64/25.08
command=brave-music
EOF

# 2. Copy Application Payload into /app/opt/brave-music
DEB_STAGE="$DIR/dist/brave-music_${VERSION}_amd64/opt/brave-music"
if [ -d "$DEB_STAGE" ] && [ -f "$DEB_STAGE/main.js" ]; then
  echo "Reusing staged application files from $DEB_STAGE..."
  cp -a "$DEB_STAGE/." "$FP_BUILD_DIR/files/opt/brave-music/"
else
  echo "Staging application files from workspace..."
  cp "$ROOT_DIR/package.json" "$FP_BUILD_DIR/files/opt/brave-music/"
  cp "$ROOT_DIR/main.js" "$FP_BUILD_DIR/files/opt/brave-music/"
  cp "$ROOT_DIR/preload.js" "$FP_BUILD_DIR/files/opt/brave-music/"
  cp -r "$ROOT_DIR/backend" "$FP_BUILD_DIR/files/opt/brave-music/"
  cp -r "$ROOT_DIR/src" "$FP_BUILD_DIR/files/opt/brave-music/"
  cp -r "$ROOT_DIR/node_modules" "$FP_BUILD_DIR/files/opt/brave-music/"

  mkdir -p "$FP_BUILD_DIR/files/opt/brave-music/WidevineCdm"
  if [ -d "/opt/google/chrome/WidevineCdm" ]; then
    cp -r /opt/google/chrome/WidevineCdm/* "$FP_BUILD_DIR/files/opt/brave-music/WidevineCdm/" 2>/dev/null || true
  fi
fi

chmod +x "$FP_BUILD_DIR/files/opt/brave-music/node_modules/electron/dist/electron" 2>/dev/null || true
chmod +x "$FP_BUILD_DIR/files/opt/brave-music/node_modules/.bin/electron" 2>/dev/null || true
chmod +x "$FP_BUILD_DIR/files/opt/brave-music/backend/engine/musikcube/musikcubed" 2>/dev/null || true

# 3. Install Wrapper Binary, Desktop Entry, AppStream Metainfo, and Official Icons
cp "$ROOT_DIR/flatpak/brave-music-wrapper.sh" "$FP_BUILD_DIR/files/bin/brave-music"
chmod +x "$FP_BUILD_DIR/files/bin/brave-music"

cp "$ROOT_DIR/flatpak/${APP_ID}.desktop" "$FP_BUILD_DIR/files/share/applications/${APP_ID}.desktop"
chmod 644 "$FP_BUILD_DIR/files/share/applications/${APP_ID}.desktop"

cp "$ROOT_DIR/flatpak/${APP_ID}.metainfo.xml" "$FP_BUILD_DIR/files/share/metainfo/${APP_ID}.metainfo.xml"
chmod 644 "$FP_BUILD_DIR/files/share/metainfo/${APP_ID}.metainfo.xml"

cp "$ROOT_DIR/src/assets/app-icon.svg" "$FP_BUILD_DIR/files/share/icons/hicolor/scalable/apps/${APP_ID}.svg"
chmod 644 "$FP_BUILD_DIR/files/share/icons/hicolor/scalable/apps/${APP_ID}.svg"

for SIZE in 16 24 32 48 64 128 256 512; do
  mkdir -p "$FP_BUILD_DIR/files/share/icons/hicolor/${SIZE}x${SIZE}/apps"
  python3 -c "from PIL import Image; Image.open('$ROOT_DIR/src/assets/app-icon.png').resize(($SIZE, $SIZE), Image.Resampling.LANCZOS).save('$FP_BUILD_DIR/files/share/icons/hicolor/${SIZE}x${SIZE}/apps/${APP_ID}.png')"
  chmod 644 "$FP_BUILD_DIR/files/share/icons/hicolor/${SIZE}x${SIZE}/apps/${APP_ID}.png"
done

# 4. Run flatpak build-finish with Sandbox Permissions
echo "Finalizing Flatpak permissions..."
flatpak build-finish "$FP_BUILD_DIR" \
  --share=ipc \
  --socket=x11 \
  --socket=wayland \
  --socket=pulseaudio \
  --share=network \
  --device=dri \
  --filesystem=xdg-music:rw \
  --filesystem=xdg-download:rw \
  --talk-name=org.freedesktop.Notifications \
  --talk-name=org.freedesktop.ScreenSaver \
  --own-name=org.mpris.MediaPlayer2.bravemusic \
  --own-name=org.mpris.MediaPlayer2.brave_music \
  --env=ELECTRON_DISABLE_SECURITY_WARNINGS=true \
  --env=TMPDIR=/var/tmp \
  --command=brave-music

# 5. Export to OSTree Repository and Bundle Single-File .flatpak
echo "Exporting Flatpak to OSTree repository..."
flatpak build-export "$FP_REPO_DIR" "$FP_BUILD_DIR" stable

echo "Creating single-file Flatpak bundle..."
rm -f "$OUTPUT_FLATPAK"
flatpak build-bundle "$FP_REPO_DIR" "$OUTPUT_FLATPAK" "${APP_ID}" stable --runtime-repo=https://flathub.org/repo/flathub.flatpakrepo

# Clean temporary Flatpak staging directories
rm -rf "$FP_BUILD_DIR" "$FP_REPO_DIR"

echo "=== Successfully built Flatpak Bundle: $OUTPUT_FLATPAK ==="
ls -lh "$OUTPUT_FLATPAK"

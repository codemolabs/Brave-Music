#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"
VERSION=$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || echo "1.0.18")
BUILD_DIR="$DIR/dist/brave-music_${VERSION}_amd64"
OUTPUT_DEB="$DIR/brave-music_${VERSION}_amd64.deb"

echo "=== Building Brave Music Debian (.deb) Package (v${VERSION}) ==="

# Clean previous build artifacts
rm -rf "$DIR/dist"
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$BUILD_DIR/opt/brave-music"
mkdir -p "$BUILD_DIR/usr/bin"
mkdir -p "$BUILD_DIR/usr/share/applications"
mkdir -p "$BUILD_DIR/usr/share/icons/hicolor/scalable/apps"

# 1. DEBIAN/control
cat << EOF > "$BUILD_DIR/DEBIAN/control"
Package: brave-music
Version: ${VERSION}
Section: sound
Priority: optional
Architecture: amd64
Maintainer: Brave Music Team <support@bravemusic.org>
Depends: nodejs, yt-dlp
Description: Brave Music OTT Platform
 Ad-free YouTube Music and Spotify streaming with built-in offline music engine.
 Features native tabbed navigation, Brave Shields ad-blocking, high-bitrate offline music downloading, and local runtime player.
EOF

# 2. Copy App Files into /opt/brave-music
cp "$ROOT_DIR/package.json" "$BUILD_DIR/opt/brave-music/"
cp "$ROOT_DIR/main.js" "$BUILD_DIR/opt/brave-music/"
cp "$ROOT_DIR/preload.js" "$BUILD_DIR/opt/brave-music/"
cp -r "$ROOT_DIR/backend" "$BUILD_DIR/opt/brave-music/"
cp -r "$ROOT_DIR/src" "$BUILD_DIR/opt/brave-music/"
cp -r "$ROOT_DIR/node_modules" "$BUILD_DIR/opt/brave-music/"

# Seed Widevine CDM into /opt/brave-music/WidevineCdm if available
mkdir -p "$BUILD_DIR/opt/brave-music/WidevineCdm"
if [ -d "/opt/google/chrome/WidevineCdm" ]; then
  cp -r /opt/google/chrome/WidevineCdm/* "$BUILD_DIR/opt/brave-music/WidevineCdm/" 2>/dev/null || true
fi

chmod +x "$BUILD_DIR/opt/brave-music/node_modules/electron/dist/electron" 2>/dev/null || true
chmod +x "$BUILD_DIR/opt/brave-music/node_modules/.bin/electron" 2>/dev/null || true
chmod +x "$BUILD_DIR/opt/brave-music/backend/engine/musikcube/musikcubed" 2>/dev/null || true

# 3. Create /opt/brave-music/run.sh
cat << 'EOF' > "$BUILD_DIR/opt/brave-music/run.sh"
#!/bin/bash
unset ELECTRON_RUN_AS_NODE
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export ELECTRON_DISABLE_SECURITY_WARNINGS=true
cd /opt/brave-music
FLAGS="--no-sandbox --no-zygote --disable-gpu-sandbox --class=brave-music --name=brave-music"
if [ -x "/opt/brave-music/node_modules/electron/dist/electron" ]; then
  exec /opt/brave-music/node_modules/electron/dist/electron /opt/brave-music $FLAGS "$@"
elif [ -x "/opt/brave-music/node_modules/.bin/electron" ]; then
  exec /opt/brave-music/node_modules/.bin/electron . $FLAGS "$@"
else
  exec npx --yes electron . $FLAGS "$@"
fi
EOF
chmod +x "$BUILD_DIR/opt/brave-music/run.sh"

# 4. Create /usr/bin/brave-music symlink script
cat << 'EOF' > "$BUILD_DIR/usr/bin/brave-music"
#!/bin/bash
exec /opt/brave-music/run.sh "$@"
EOF
chmod +x "$BUILD_DIR/usr/bin/brave-music"

# 5. Desktop Entry /usr/share/applications/brave-music.desktop
cat << 'EOF' > "$BUILD_DIR/usr/share/applications/brave-music.desktop"
[Desktop Entry]
Name=Brave Music
Comment=Ad-free Music OTT Platform with YouTube, Spotify & Offline Player
Exec=/usr/bin/brave-music %U
Icon=brave-music
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;
StartupWMClass=brave-music
StartupNotify=true
Keywords=Music;YouTube;Spotify;Download;Audio;Player;
EOF
chmod 644 "$BUILD_DIR/usr/share/applications/brave-music.desktop"

# 6. Copy App Icon to /usr/share/icons/hicolor/ and /usr/share/pixmaps/
mkdir -p "$BUILD_DIR/usr/share/pixmaps"
cp "$ROOT_DIR/src/assets/app-icon.png" "$BUILD_DIR/usr/share/pixmaps/brave-music.png"
chmod 644 "$BUILD_DIR/usr/share/pixmaps/brave-music.png"

cp "$ROOT_DIR/src/assets/app-icon.svg" "$BUILD_DIR/usr/share/icons/hicolor/scalable/apps/brave-music.svg"
chmod 644 "$BUILD_DIR/usr/share/icons/hicolor/scalable/apps/brave-music.svg"

for SIZE in 16 24 32 48 64 128 256 512; do
  mkdir -p "$BUILD_DIR/usr/share/icons/hicolor/${SIZE}x${SIZE}/apps"
  python3 -c "from PIL import Image; Image.open('$ROOT_DIR/src/assets/app-icon.png').resize(($SIZE, $SIZE), Image.Resampling.LANCZOS).save('$BUILD_DIR/usr/share/icons/hicolor/${SIZE}x${SIZE}/apps/brave-music.png')"
  chmod 644 "$BUILD_DIR/usr/share/icons/hicolor/${SIZE}x${SIZE}/apps/brave-music.png"
done

# 7. Package with dpkg-deb (using fast gzip compression to prevent high-memory OOM)
echo "Packaging with dpkg-deb..."
dpkg-deb -Zgzip -z1 --root-owner-group --build "$BUILD_DIR" "$OUTPUT_DEB"

echo "=== Successfully built Debian Package: $OUTPUT_DEB ==="
ls -lh "$OUTPUT_DEB"

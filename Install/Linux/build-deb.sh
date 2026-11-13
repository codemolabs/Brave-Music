#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"
VERSION=$(python3 -c "import json; print(json.load(open('$ROOT_DIR/package.json'))['version'])" 2>/dev/null || echo "1.0.19-r")
BUILD_DIR="$DIR/dist/brave-music_${VERSION}_amd64"
OUTPUT_DEB="$DIR/brave-music_${VERSION}_amd64.deb"

echo "=== Building Brave Music Debian (.deb) Package (Rust + WebKitGTK v${VERSION}) ==="

cargo build --release --manifest-path "$ROOT_DIR/tauri-preview/src-tauri/Cargo.toml"

# Clean previous build artifacts
rm -rf "$DIR/dist"
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$BUILD_DIR/opt/brave-music/backend"
mkdir -p "$BUILD_DIR/opt/brave-music/src"
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
Depends: libwebkit2gtk-4.1-0, libgtk-3-0, libsoup-3.0-0
Recommends: yt-dlp, ffmpeg, python3
Description: Brave Music OTT Platform
 Native Rust + WebKitGTK desktop platform for ad-free YouTube Music, Spotify
 playlist resolution, high-bitrate offline audio downloading, and local playback.
 Zero Electron runtime dependencies.
EOF

# 2. Copy Native App Binary & Bundled Audio Engine Tools into /opt/brave-music
cp "$ROOT_DIR/tauri-preview/src-tauri/target/release/brave-music-linux-preview" "$BUILD_DIR/opt/brave-music/brave-music-linux-preview"
chmod +x "$BUILD_DIR/opt/brave-music/brave-music-linux-preview"
cp -r "$ROOT_DIR/backend/bin" "$BUILD_DIR/opt/brave-music/backend/"
cp -r "$ROOT_DIR/src/assets" "$BUILD_DIR/opt/brave-music/src/"

chmod +x "$BUILD_DIR/opt/brave-music/backend/bin/yt-dlp" \
         "$BUILD_DIR/opt/brave-music/backend/bin/node" \
         "$BUILD_DIR/opt/brave-music/backend/bin/ffmpeg" \
         "$BUILD_DIR/opt/brave-music/backend/bin/ffprobe" 2>/dev/null || true

# 3. Create /opt/brave-music/run.sh
cat << 'EOF' > "$BUILD_DIR/opt/brave-music/run.sh"
#!/bin/bash
export PATH="/opt/brave-music/backend/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export LD_LIBRARY_PATH="/opt/brave-music/backend/bin:${LD_LIBRARY_PATH:-}"
export WEBKIT_FORCE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_COMPOSITING_MODE=0
exec /opt/brave-music/brave-music-linux-preview "$@"
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

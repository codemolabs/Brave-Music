#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"
VERSION=$(python3 -c "import json; print(json.load(open('$ROOT_DIR/package.json'))['version'])" 2>/dev/null || echo "1.0.19-r")
STAGE_DIR="$DIR/dist/snap-stage"
OUTPUT_SNAP="$DIR/brave-music_${VERSION}_amd64.snap"

echo "=== Building Brave Music Ubuntu Snap (.snap) Package (Rust + WebKitGTK v${VERSION}) ==="

cargo build --release --manifest-path "$ROOT_DIR/tauri-preview/src-tauri/Cargo.toml"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/meta/gui"
mkdir -p "$STAGE_DIR/bin"
mkdir -p "$STAGE_DIR/opt/brave-music/backend"
mkdir -p "$STAGE_DIR/opt/brave-music/src"

# 1. Generate meta/snap.yaml
# Mirrors the metadata produced by the `gnome` extension on core24 + gnome-46-2404:
# content plugs for the GNOME runtime + themes, layouts and desktop-launch.
cat << 'EOF' > "$STAGE_DIR/meta/snap.yaml"
name: brave-music
version: __VERSION__
summary: Ad-free YouTube Music, Spotify & Offline Music OTT Platform
description: |
  Brave Music is a high-performance, open-source Linux desktop Music OTT platform
  developed by Codemo Open Source Labs (COSL). It runs natively on Rust, Tauri,
  and WebKitGTK with built-in Brave Shields ad-blocking, yt-dlp/ffmpeg offline
  downloads, and zero Electron/Chromium runtime overhead.
license: GPL-3.0+
base: core24
grade: stable
confinement: strict
assumes:
  - snapd2.43
architectures:
  - amd64
environment:
  SNAP_DESKTOP_RUNTIME: $SNAP/gnome-platform
  GTK_USE_PORTAL: '1'
  GIO_USE_PROXY_RESOLVER: dummy
  GIO_USE_NETWORK_MONITOR: netlink
  NO_AT_BRIDGE: '1'
  WEBKIT_EXEC_PATH: $SNAP/gnome-platform/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1
layout:
  /usr/share/libdrm:
    bind: $SNAP/gpu-2404/libdrm
  /usr/share/drirc.d:
    symlink: $SNAP/gpu-2404/drirc.d
  /usr/share/X11/XErrorDB:
    symlink: $SNAP/gpu-2404/X11/XErrorDB
  /usr/lib/x86_64-linux-gnu/webkit2gtk-4.1:
    bind: $SNAP/gnome-platform/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1
  /usr/lib/x86_64-linux-gnu/libproxy:
    bind: $SNAP/gnome-platform/usr/lib/x86_64-linux-gnu/libproxy
  /usr/share/xml/iso-codes:
    bind: $SNAP/gnome-platform/usr/share/xml/iso-codes
  /var/tmp:
    bind: $SNAP_COMMON/var-tmp
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
  gpu-2404:
    interface: content
    target: $SNAP/gpu-2404
    default-provider: mesa-2404
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
  gnome-46-2404:
    interface: content
    target: $SNAP/gnome-platform
    default-provider: gnome-46-2404
apps:
  brave-music:
    command: bin/brave-music-snap
    common-id: org.codemolabs.BraveMusic
    command-chain:
      - snap/command-chain/gpu-2404-wrapper
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
      - network
      - network-bind
      - home
      - screen-inhibit-control
EOF
sed -i "s/__VERSION__/${VERSION}/" "$STAGE_DIR/meta/snap.yaml"

# 1b. Install the GNOME extension command-chain shims. They forward to the
#     gpu-2404 and desktop-launch/font helpers shipped by mesa-2404 and gnome-46-2404.
mkdir -p "$STAGE_DIR/snap/command-chain"
cp "$ROOT_DIR/snap/command-chain/gpu-2404-wrapper" \
   "$ROOT_DIR/snap/command-chain/desktop-launch" \
   "$ROOT_DIR/snap/command-chain/hooks-configure-fonts" \
   "$ROOT_DIR/snap/command-chain/run" \
   "$STAGE_DIR/snap/command-chain/"
chmod 755 "$STAGE_DIR/snap/command-chain/"*

# 1c. No-op configure hook. The gnome extension hook chain ends with
#     `exec "$@"`, which is this hook; snapcraft generates an empty one.
mkdir -p "$STAGE_DIR/meta/hooks"
cat << 'EOF' > "$STAGE_DIR/meta/hooks/configure"
#!/bin/sh
# Ensure /var/tmp bind target ($SNAP_COMMON/var-tmp) is world-writable with sticky
# bit so WebKitWebProcess/GStreamer gstdownloadbuffer can buffer HTTP/bridge media.
mkdir -p "$SNAP_COMMON/var-tmp"
chmod 1777 "$SNAP_COMMON/var-tmp"
# Font cache is built by the gnome-46-2404 hook command-chain.
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

# 3. Copy Native Binary & Backend Binaries into opt/brave-music (Zero Electron)
cp "$ROOT_DIR/tauri-preview/src-tauri/target/release/brave-music-linux-preview" "$STAGE_DIR/opt/brave-music/brave-music-linux-preview"
chmod +x "$STAGE_DIR/opt/brave-music/brave-music-linux-preview"
cp -r "$ROOT_DIR/backend/bin" "$STAGE_DIR/opt/brave-music/backend/"
cp -r "$ROOT_DIR/src/assets" "$STAGE_DIR/opt/brave-music/src/"

chmod +x "$STAGE_DIR/opt/brave-music/backend/bin/yt-dlp" \
         "$STAGE_DIR/opt/brave-music/backend/bin/node" \
         "$STAGE_DIR/opt/brave-music/backend/bin/qjs" \
         "$STAGE_DIR/opt/brave-music/backend/bin/ffmpeg" \
         "$STAGE_DIR/opt/brave-music/backend/bin/ffprobe" 2>/dev/null || true

# 4. Create Snap Launcher Script (bin/brave-music-snap)
# Stage Ubuntu 24.04 (noble / core24) GStreamer plugins missing from gnome-46-2404
# so YouTube Music (H.264/AAC/VP9/AV1 + fakevideosink) and bridge playback work out of the box.
stage_noble_gst_codecs() {
  local cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/brave-music-snap-gst-noble"
  local dst_lib="$STAGE_DIR/usr/lib/x86_64-linux-gnu"
  local dst_gst="$dst_lib/gstreamer-1.0"
  mkdir -p "$cache_dir/lib" "$cache_dir/gst" "$dst_gst"

  local req_gst=(
    libgstaom.so
    libgstdebugutilsbad.so
    libgstfaad.so
    libgsthls.so
    libgstopenh264.so
    libgstsubenc.so
    libgstvideoparsersbad.so
  )
  local need_fetch=0
  for p in "${req_gst[@]}"; do
    [ -f "$cache_dir/gst/$p" ] || { need_fetch=1; break; }
  done
  [ -e "$cache_dir/lib/libfaad.so.2" ] || need_fetch=1
  [ -e "$cache_dir/lib/libopenh264.so.7" ] || need_fetch=1

  if [ "$need_fetch" -eq 1 ]; then
    echo "Fetching Ubuntu 24.04 (noble) GStreamer codec plugins for Snap..."
    python3 - "$cache_dir" <<'PYEOF'
import gzip, os, shutil, subprocess, sys, tempfile, urllib.request

cache_dir = sys.argv[1]
pkgs_wanted = {"gstreamer1.0-plugins-bad", "libfaad2", "libopenh264-7"}
debs = {}
seed_map = {
    "gstreamer1.0-plugins-bad": "/tmp/gst_noble_test/bad.deb",
    "libfaad2": "/tmp/gst_noble_test/faad2.deb",
    "libopenh264-7": "/tmp/gst_noble_test/openh264.deb",
}
for pkg, path in seed_map.items():
    if os.path.exists(path):
        debs[pkg] = path

with tempfile.TemporaryDirectory() as tmp:
    missing = pkgs_wanted - set(debs.keys())
    if missing:
        found_urls = {}
        for suite in ("noble-updates", "noble"):
            for comp in ("universe", "main"):
                idx_url = f"http://archive.ubuntu.com/ubuntu/dists/{suite}/{comp}/binary-amd64/Packages.gz"
                try:
                    raw = urllib.request.urlopen(idx_url, timeout=30).read()
                    text = gzip.decompress(raw).decode("utf-8", errors="replace")
                except Exception:
                    continue
                cur_pkg = None
                for line in text.splitlines():
                    if line.startswith("Package: "):
                        cur_pkg = line[9:].strip()
                    elif line.startswith("Filename: ") and cur_pkg in missing and cur_pkg not in found_urls:
                        found_urls[cur_pkg] = "http://archive.ubuntu.com/ubuntu/" + line[10:].strip()
                    elif not line:
                        cur_pkg = None
                if missing.issubset(found_urls.keys()):
                    break
            if missing.issubset(found_urls.keys()):
                break
        for pkg in sorted(missing):
            if pkg not in found_urls:
                raise RuntimeError(f"Could not locate noble package: {pkg}")
            dest = os.path.join(tmp, f"{pkg}.deb")
            urllib.request.urlretrieve(found_urls[pkg], dest)
            debs[pkg] = dest

    ext = os.path.join(tmp, "ext")
    os.makedirs(ext, exist_ok=True)
    for deb in debs.values():
        subprocess.run(["dpkg-deb", "-x", deb, ext], check=True)

    lib_root = os.path.join(ext, "usr", "lib", "x86_64-linux-gnu")
    for name in os.listdir(lib_root):
        if name.startswith("libfaad.so.") or name.startswith("libopenh264.so."):
            src = os.path.join(lib_root, name)
            dst = os.path.join(cache_dir, "lib", name)
            if os.path.islink(src):
                if os.path.lexists(dst):
                    os.unlink(dst)
                os.symlink(os.readlink(src), dst)
            else:
                shutil.copy2(src, dst)

    gst_src = os.path.join(lib_root, "gstreamer-1.0")
    for p in (
        "libgstaom.so",
        "libgstdebugutilsbad.so",
        "libgstfaad.so",
        "libgsthls.so",
        "libgstopenh264.so",
        "libgstsubenc.so",
        "libgstvideoparsersbad.so",
    ):
        shutil.copy2(os.path.join(gst_src, p), os.path.join(cache_dir, "gst", p))
PYEOF
  fi

  cp -a "$cache_dir/lib/." "$dst_lib/"
  cp -a "$cache_dir/gst/." "$dst_gst/"
}
stage_noble_gst_codecs

cat << 'EOF' > "$STAGE_DIR/bin/brave-music-snap"
#!/bin/bash
APP_DIR="${SNAP:-}/opt/brave-music"
if [ ! -d "$APP_DIR" ]; then
  APP_DIR="/opt/brave-music"
fi
export PATH="$APP_DIR/backend/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export LD_LIBRARY_PATH="${SNAP:+$SNAP/usr/lib/x86_64-linux-gnu:$SNAP/gnome-platform/usr/lib/x86_64-linux-gnu:$SNAP/gnome-platform/lib/x86_64-linux-gnu:}$APP_DIR/backend/bin:${LD_LIBRARY_PATH:-}"
if [ -n "${SNAP:-}" ]; then
  GST_BUNDLED="$SNAP/usr/lib/x86_64-linux-gnu/gstreamer-1.0:$SNAP/gnome-platform/usr/lib/x86_64-linux-gnu/gstreamer-1.0"
  export GST_PLUGIN_PATH="$GST_BUNDLED${GST_PLUGIN_PATH:+:$GST_PLUGIN_PATH}"
  export GST_PLUGIN_SYSTEM_PATH="$GST_BUNDLED"
fi
export GIO_USE_PROXY_RESOLVER="${GIO_USE_PROXY_RESOLVER:-dummy}"
export GIO_USE_NETWORK_MONITOR="${GIO_USE_NETWORK_MONITOR:-netlink}"
export NO_AT_BRIDGE="${NO_AT_BRIDGE:-1}"
export WEBKIT_EXEC_PATH="${SNAP:+$SNAP/gnome-platform/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1}"
exec "$APP_DIR/brave-music-linux-preview" "$@"
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

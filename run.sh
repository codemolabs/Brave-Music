#!/bin/bash
# Brave Music Desktop Runner (Native Rust + WebKitGTK Stack)
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

export PATH="$DIR/backend/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export WEBKIT_FORCE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_COMPOSITING_MODE=0
export WEBKIT_USE_POLICY_CACHE=1

if [ "$1" = "--new-stack" ] || [ "$1" = "--preview" ] || [ "$1" = "--rust" ] || [ "$1" = "-n" ]; then
  shift
fi

PREVIEW_BIN="$DIR/tauri-preview/src-tauri/target/release/brave-music-linux-preview"
if [ ! -x "$PREVIEW_BIN" ] && command -v cargo >/dev/null 2>&1; then
  echo "=== Building Brave Music Native Binary ==="
  cargo build --release --manifest-path "$DIR/tauri-preview/src-tauri/Cargo.toml"
fi

if [ -x "$PREVIEW_BIN" ]; then
  echo "=== Launching Brave Music (Native Rust + WebKitGTK) ==="
  exec "$PREVIEW_BIN" "$@"
elif [ -x "/opt/brave-music/brave-music-linux-preview" ]; then
  exec "/opt/brave-music/brave-music-linux-preview" "$@"
elif [ -x "$HOME/.cargo/bin/brave-music-linux-preview" ]; then
  exec "$HOME/.cargo/bin/brave-music-linux-preview" "$@"
else
  echo "Error: brave-music-linux-preview binary not found. Run: cargo build --release --manifest-path tauri-preview/src-tauri/Cargo.toml" >&2
  exit 1
fi

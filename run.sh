#!/bin/bash
# Brave Music Desktop Runner
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

unset ELECTRON_RUN_AS_NODE
export NODE_ENV=production
export ELECTRON_DISABLE_SECURITY_WARNINGS=true

# Launch the new cross-platform native stack (Rust + Native Webview) if requested
if [ "$1" = "--new-stack" ] || [ "$1" = "--preview" ] || [ "$1" = "--rust" ] || [ "$1" = "-n" ]; then
  shift
  # Hardware-accelerated compositing and smooth scrolling configuration for WebKitGTK
  export WEBKIT_FORCE_COMPOSITING_MODE=1
  export WEBKIT_DISABLE_COMPOSITING_MODE=0
  export WEBKIT_USE_POLICY_CACHE=1
  PREVIEW_BIN="$DIR/tauri-preview/src-tauri/target/release/brave-music-linux-preview"
  if [ -x "$PREVIEW_BIN" ]; then
    echo "=== Launching Brave Music (New Cross-Platform Stack: Rust + Native Webview) ==="
    exec "$PREVIEW_BIN" "$@"
  elif [ -x "$HOME/.cargo/bin/brave-music-linux-preview" ]; then
    echo "=== Launching Brave Music (New Cross-Platform Stack: Rust + Native Webview) ==="
    exec "$HOME/.cargo/bin/brave-music-linux-preview" "$@"
  fi
fi

echo "=== Launching Brave Music Desktop ==="
# Hardened flags: --no-sandbox with --no-zygote and --disable-gpu-sandbox (removes conflicting --in-process-gpu to prevent grey screens)
FLAGS="--no-sandbox --no-zygote --disable-gpu-sandbox"

if [ -x "$DIR/node_modules/.bin/electron" ]; then
  exec "$DIR/node_modules/.bin/electron" . $FLAGS "$@"
elif [ -x "/opt/brave-music/node_modules/.bin/electron" ]; then
  exec "/opt/brave-music/node_modules/.bin/electron" . $FLAGS "$@"
else
  exec npx electron . $FLAGS "$@"
fi

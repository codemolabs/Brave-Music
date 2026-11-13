#!/bin/bash
unset ELECTRON_RUN_AS_NODE
export PATH="/app/bin:/usr/bin:/bin:$PATH"
export ELECTRON_DISABLE_SECURITY_WARNINGS=true
cd /app/opt/brave-music
FLAGS="--no-sandbox --no-zygote --disable-gpu-sandbox --class=brave-music --name=brave-music"
if [ -x "/app/opt/brave-music/node_modules/electron/dist/electron" ]; then
  exec zypak-wrapper /app/opt/brave-music/node_modules/electron/dist/electron /app/opt/brave-music $FLAGS "$@" 2>/dev/null || \
  exec /app/opt/brave-music/node_modules/electron/dist/electron /app/opt/brave-music $FLAGS "$@"
else
  exec /app/opt/brave-music/node_modules/.bin/electron . $FLAGS "$@"
fi

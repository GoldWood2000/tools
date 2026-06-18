#!/bin/bash

cd "$(dirname "$0")"
export TFFADD_WEB_PORT="${TFFADD_WEB_PORT:-8788}"

if command -v curl >/dev/null 2>&1; then
  if curl -fsS "http://127.0.0.1:${TFFADD_WEB_PORT}/api/fonts" >/dev/null 2>&1; then
    echo "字体合并控制台已在运行: http://127.0.0.1:${TFFADD_WEB_PORT}"
    exit 0
  fi
fi

python3 web_server.py "$@"

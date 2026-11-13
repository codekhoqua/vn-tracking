#!/bin/bash
set -eu
PID=$(cat logs/gunicorn.pid 2>/dev/null || true)
[ -n "$PID" ] && kill -HUP "$PID" && echo "nạp lại (HUP $PID)"

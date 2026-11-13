#!/bin/bash
set -eu
cd "$HOME/Applications/VNtracking"
# Socket.IO giữ 1 fd / kết nối; launchd mặc định chỉ cho 256 fd nên app dễ
# chết vì "Too many open files" (502 Bad Gateway). Nâng giới hạn mềm.
ulimit -n 8192 2>/dev/null || true
mkdir -p logs data
PIDFILE="$HOME/Applications/VNtracking/logs/gunicorn.pid"
if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE" 2>/dev/null || echo "")
  if [ -n "$OLD" ] && ! ps -p "$OLD" -o command= 2>/dev/null | grep -q "gunicorn"; then
    rm -f "$PIDFILE"
  fi
fi
exec "$HOME/Applications/VNtracking/.venv/bin/gunicorn" -c "$HOME/Applications/VNtracking/gunicorn.conf.py" wsgi:app

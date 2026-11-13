"""gunicorn cho vn-tracking — 1 worker eventlet (SocketIO + state trong RAM)."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

bind = f"127.0.0.1:{os.getenv('PORT', '8105')}"

workers = 1
threads = 1
worker_class = "eventlet"

timeout = 120
graceful_timeout = 30
keepalive = 65
max_requests = 0

pidfile = str(LOG_DIR / "gunicorn.pid")

accesslog = str(LOG_DIR / "access.log")
errorlog = str(LOG_DIR / "gunicorn.log")
access_log_format = '%(h)s "%(r)s" %(s)s %(M)sms %(b)sB'
loglevel = os.getenv("GUNICORN_LOGLEVEL", "info")
capture_output = True

"""Storage backend cho kho lưu trữ dài hạn của VN-Tracking.

Có 2 backend cùng chung một interface rất nhỏ:

* ``TursoStore``  - libSQL/Turso qua HTTP (endpoint ``/v2/pipeline``).
                    Là backend production: chỉ dùng HTTPS nên chạy được cả
                    trên Vercel (serverless) lẫn Cloud Run/Docker.
* ``SqliteStore`` - file SQLite bằng ``sqlite3`` chuẩn của Python.
                    Dùng khi dev local và khi chưa cấu hình Turso.

Cả hai cùng cung cấp:

    execute(sql, args=())   -> (columns, rows)
    batch(statements)       -> int          # số statement đã gửi

Không phụ thuộc package ngoài (chỉ dùng ``requests`` đã có sẵn trong
requirements.txt).
"""

import os
import sqlite3
import threading
import time

try:
    import requests
except Exception:  # pragma: no cover - requests luôn có trong requirements
    requests = None


class ArchiveStoreError(Exception):
    """Lỗi khi giao tiếp với backend lưu trữ."""


# =====================================================================
# Tiện ích chung
# =====================================================================
CHUNK_SIZE = 200  # số statement gửi trong 1 HTTP request (Turso)


def normalize_db_url(url):
    """Chuẩn hoá URL Turso/libSQL về dạng HTTPS cơ sở."""
    url = (url or "").strip()
    if not url:
        return ""
    for prefix in ("libsql://", "turso://", "wss://", "ws://"):
        if url.startswith(prefix):
            url = "https://" + url[len(prefix):]
            break
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    url = url.rstrip("/")
    for suffix in ("/v2/pipeline", "/v2", "/v3/pipeline"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
            break
    return url


def _encode_arg(value):
    """Chuyển 1 giá trị Python sang dạng arg của Hrana/HTTP v2."""
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": "1" if value else "0"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": repr(value)}
    if isinstance(value, (bytes, bytearray)):
        import base64
        return {"type": "blob", "base64": base64.b64encode(bytes(value)).decode("ascii")}
    return {"type": "text", "value": str(value)}


def _decode_cell(cell):
    """Giải mã 1 ô trong response của Hrana/HTTP v2."""
    if not isinstance(cell, dict):
        return cell
    ctype = cell.get("type")
    if ctype == "null":
        return None
    if ctype == "integer":
        try:
            return int(cell.get("value"))
        except (TypeError, ValueError):
            return None
    if ctype == "float":
        try:
            return float(cell.get("value"))
        except (TypeError, ValueError):
            return None
    if ctype == "blob":
        import base64
        raw = cell.get("base64") or ""
        try:
            return base64.b64decode(raw)
        except Exception:
            return raw
    return cell.get("value")


# =====================================================================
# Turso HTTP (libSQL over HTTP v2)
# =====================================================================
class TursoStore:
    """Backend Turso qua SQL over HTTP."""

    def __init__(self, url, token, timeout=30):
        base = normalize_db_url(url)
        if not base:
            raise ArchiveStoreError("TURSO_DATABASE_URL rỗng")
        if not token:
            raise ArchiveStoreError("TURSO_AUTH_TOKEN rỗng")
        self.endpoint = base + "/v2/pipeline"
        self.token = token
        self.timeout = timeout

    def _headers(self):
        return {
            "Authorization": "Bearer " + self.token,
            "Content-Type": "application/json",
        }

    def _send(self, requests_body):
        if requests is None:
            raise ArchiveStoreError("Thiếu package requests")
        payload = {"requests": list(requests_body) + [{"type": "close"}]}
        last_err = None
        for attempt in range(3):
            try:
                resp = requests.post(
                    self.endpoint,
                    headers=self._headers(),
                    json=payload,
                    timeout=self.timeout,
                )
                if resp.status_code >= 400:
                    raise ArchiveStoreError(
                        "Turso HTTP %s: %s" % (resp.status_code, resp.text[:400])
                    )
                data = resp.json()
                results = data.get("results") or []
                for item in results:
                    if item.get("type") != "ok":
                        raise ArchiveStoreError("Turso trả lỗi: %s" % (item,))
                return results
            except ArchiveStoreError:
                raise
            except Exception as exc:  # lỗi mạng -> thử lại
                last_err = exc
                time.sleep(0.4 * (attempt + 1))
        raise ArchiveStoreError("Không gọi được Turso: %s" % last_err)

    @staticmethod
    def _stmt(sql, args=()):
        stmt = {"sql": sql}
        if args:
            stmt["args"] = [_encode_arg(a) for a in args]
        return stmt

    def execute(self, sql, args=()):
        results = self._send([{"type": "execute", "stmt": self._stmt(sql, args)}])
        if not results:
            return [], []
        response = results[0].get("response") or {}
        result = response.get("result") or {}
        cols = [c.get("name") for c in (result.get("cols") or [])]
        rows = [
            tuple(_decode_cell(cell) for cell in row)
            for row in (result.get("rows") or [])
        ]
        return cols, rows

    def batch(self, statements):
        statements = [(s[0], s[1] if len(s) > 1 else ()) for s in statements]
        sent = 0
        for start in range(0, len(statements), CHUNK_SIZE):
            chunk = statements[start:start + CHUNK_SIZE]
            body = [
                {"type": "execute", "stmt": self._stmt(sql, args)}
                for sql, args in chunk
            ]
            self._send(body)
            sent += len(chunk)
        return sent


# =====================================================================
# SQLite local
# =====================================================================
class SqliteStore:
    """Backend SQLite file - dùng cho dev local hoặc fallback."""

    def __init__(self, path):
        if not path:
            raise ArchiveStoreError("Đường dẫn SQLite rỗng")
        self.path = path
        parent = os.path.dirname(os.path.abspath(path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        self._local = threading.local()

    def _conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self.path, timeout=30)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            self._local.conn = conn
        return conn

    def execute(self, sql, args=()):
        conn = self._conn()
        cur = conn.execute(sql, tuple(args or ()))
        if sql.lstrip()[:6].upper() in ("SELECT", "PRAGMA"):
            cols = [d[0] for d in (cur.description or [])]
            return cols, cur.fetchall()
        conn.commit()
        return [], []

    def batch(self, statements):
        conn = self._conn()
        count = 0
        try:
            conn.execute("BEGIN")
            for item in statements:
                sql = item[0]
                args = item[1] if len(item) > 1 else ()
                conn.execute(sql, tuple(args or ()))
                count += 1
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        return count


# =====================================================================
# Chọn backend theo biến môi trường
# =====================================================================
_STORE_LOCK = threading.Lock()
_STORE = None


def default_sqlite_path():
    base = os.path.dirname(os.path.abspath(__file__))
    # Vercel/serverless: filesystem gốc chỉ đọc, chỉ /tmp ghi được.
    if os.environ.get("VERCEL") or not os.access(base, os.W_OK):
        return os.path.join("/tmp", "vn_tracking_archive.db")
    return os.path.join(base, "data", "vn_tracking_archive.db")


def is_turso_configured():
    return bool(
        os.environ.get("TURSO_DATABASE_URL", "").strip()
        and os.environ.get("TURSO_AUTH_TOKEN", "").strip()
    )


def get_store(force_new=False):
    """Trả về store đang dùng (Turso nếu có cấu hình, ngược lại SQLite)."""
    global _STORE
    with _STORE_LOCK:
        if _STORE is not None and not force_new:
            return _STORE
        if is_turso_configured():
            _STORE = TursoStore(
                os.environ.get("TURSO_DATABASE_URL", ""),
                os.environ.get("TURSO_AUTH_TOKEN", ""),
            )
        else:
            _STORE = SqliteStore(
                os.environ.get("ARCHIVE_SQLITE_PATH") or default_sqlite_path()
            )
        return _STORE


def describe_store():
    """Mô tả ngắn backend đang dùng, để hiển thị trên UI/health."""
    if is_turso_configured():
        return {
            "backend": "turso",
            "target": normalize_db_url(os.environ.get("TURSO_DATABASE_URL", "")),
        }
    return {
        "backend": "sqlite",
        "target": os.environ.get("ARCHIVE_SQLITE_PATH") or default_sqlite_path(),
    }

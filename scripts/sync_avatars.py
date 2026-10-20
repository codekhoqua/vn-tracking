#!/usr/bin/env python3
r"""Đồng bộ avatar thành viên từ production về DB archive.

Vì sao cần script này:
- Avatar KHÔNG nằm trên Google Sheet (sheet chỉ lưu URL `/api/avatar/<user>`)
  và cũng KHÔNG được mirror lên Supabase như task/comment/checklist/link.
- Ảnh thật chỉ nằm trong bảng `user_avatars` của DB archive.
- Máy mới (DB trống) hoặc DB bị mất avatar -> `/api/avatar/...` trả 404
  -> dashboard hiện chữ cái thay vì ảnh.

Script ghi qua ``task_archive.save_user_avatar`` nên dùng đúng backend đang
cấu hình: **Turso** nếu có `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`, ngược lại
là SQLite (`data/vn_tracking_archive.db`).

Cách dùng:
    python scripts/sync_avatars.py                 # kéo avatar mới/đổi từ prod
    python scripts/sync_avatars.py --dry-run       # chỉ xem sẽ làm gì
    python scripts/sync_avatars.py --prod https://vntrackinglinkstory.homes
    python scripts/sync_avatars.py --db data/other.db   # chỉ định SQLite khác
"""

import argparse
import csv
import io
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
DEFAULT_PROD = "https://vntrackinglinkstory.homes"
DEFAULT_DB = os.path.join(ROOT, "data", "vn_tracking_archive.db")
UA = {"User-Agent": "vn-tracking-avatar-sync"}

# In ra tiếng Việt không lỗi khi chạy trực tiếp trên cmd/PowerShell
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def load_env_vars():
    """Nạp env_vars.yaml giống app.py (không ghi đè biến đã có)."""
    path = os.path.join(ROOT, "env_vars.yaml")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            if ":" not in line or line.strip().startswith("#"):
                continue
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def users_sheet_url():
    """Lấy USER_SHEET_URL từ app.py để không phải khai báo lại."""
    with open(os.path.join(ROOT, "app.py"), "r", encoding="utf-8") as fh:
        src = fh.read()
    m = re.search(r'USER_SHEET_URL\s*=\s*"([^"]+)"', src)
    return m.group(1) if m else ""


def fetch_rows(sheet_url):
    raw = urllib.request.urlopen(sheet_url, timeout=60).read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(raw)))


def main():
    parser = argparse.ArgumentParser(description="Đồng bộ avatar từ production về DB")
    parser.add_argument("--prod", default=DEFAULT_PROD, help="domain production")
    parser.add_argument("--db", default=None,
                        help="đường dẫn SQLite (chỉ dùng khi KHÔNG cấu hình Turso)")
    parser.add_argument("--dry-run", action="store_true", help="chỉ liệt kê, không ghi DB")
    args = parser.parse_args()

    load_env_vars()
    if args.db:
        os.environ["ARCHIVE_SQLITE_PATH"] = os.path.abspath(args.db)

    import archive_store
    import task_archive as ta

    target = archive_store.describe_store()
    print(f"Backend: {target['backend']}  ->  {target['target']}")

    sheet_url = users_sheet_url()
    if not sheet_url:
        print("Không tìm thấy USER_SHEET_URL trong app.py")
        return 1

    rows = fetch_rows(sheet_url)
    targets = []
    for row in rows:
        avatar = (row.get("Avatar") or "").strip()
        if avatar.startswith("/api/avatar/"):
            username = urllib.parse.unquote(avatar[len("/api/avatar/"):])
            targets.append((username, avatar))

    print(f"Sheet: {len(rows)} thành viên, {len(targets)} dùng avatar lưu trong DB")
    if not targets:
        return 0

    ta.ensure_schema()
    existing = [u for u, _ in targets if ta.get_user_avatar(u)]
    print(f"DB đang có {len(existing)} avatar: {', '.join(sorted(existing)) or '(trống)'}")
    print("-" * 62)

    changed = failed = 0
    for username, path in targets:
        try:
            req = urllib.request.Request(args.prod.rstrip("/") + path, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
                mime = (resp.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip()
            if args.dry_run:
                print(f"  [dry] {username:<24} {mime:<12} {len(data):>7} bytes")
                continue
            ta.save_user_avatar(username, data, mime=mime)
            changed += 1
            mark = "cập nhật" if username in existing else "mới"
            print(f"  OK   {username:<24} {mime:<12} {len(data):>7} bytes  ({mark})")
        except Exception as exc:
            failed += 1
            print(f"  FAIL {username:<24} {exc}")

    print("-" * 62)
    print(f"Xong: {changed} avatar đã lưu, {failed} lỗi.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

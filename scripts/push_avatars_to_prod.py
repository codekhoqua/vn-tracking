#!/usr/bin/env python3
r"""Đẩy avatar từ DB local lên production (không cần copy cả DB).

Tình huống dùng:
- Bạn vừa gom avatar vào DB ở máy local (``migrate_avatars_to_db.py``) và
  sheet đã trỏ ``/api/avatar/<user>``, nhưng production chưa có ảnh trong DB
  -> production sẽ trả 404 (hiện chữ cái).
- Script này đăng nhập production bằng tài khoản Manager (lấy mật khẩu từ
  sheet "Pass" hoặc truyền qua tham số), rồi upload những avatar còn thiếu
  qua API ``/api/users/avatar`` có sẵn.

Cách dùng:
    python scripts/push_avatars_to_prod.py --dry-run
    python scripts/push_avatars_to_prod.py
    python scripts/push_avatars_to_prod.py --user Manager --password 123
"""

import argparse
import csv
import hashlib
import http.cookiejar
import io
import os
import re
import sys
import urllib.parse
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
DEFAULT_PROD = "https://vntrackinglinkstory.homes"
UA = {"User-Agent": "vn-tracking-avatar-push"}

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def load_env_vars():
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
    with open(os.path.join(ROOT, "app.py"), "r", encoding="utf-8") as fh:
        src = fh.read()
    m = re.search(r'USER_SHEET_URL\s*=\s*"([^"]+)"', src)
    return m.group(1) if m else ""


def fetch_rows(sheet_url):
    raw = urllib.request.urlopen(sheet_url, timeout=60).read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(raw)))


def find_manager_password(rows, user):
    for row in rows:
        if (row.get("Username") or "").strip() == user:
            return (row.get("Password") or "").strip()
    return ""


def multipart(fields, file_field, filename, mime, data):
    boundary = "----vnavatar" + uuid.uuid4().hex
    out = io.BytesIO()
    for name, value in fields.items():
        out.write(f"--{boundary}\r\n".encode())
        out.write(
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        )
        out.write(str(value).encode("utf-8"))
        out.write(b"\r\n")
    out.write(f"--{boundary}\r\n".encode())
    out.write(
        (
            f'Content-Disposition: form-data; name="{file_field}"; '
            f'filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'
        ).encode()
    )
    out.write(data)
    out.write(b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


def main():
    parser = argparse.ArgumentParser(
        description="Đẩy avatar từ DB local lên production qua API")
    parser.add_argument("--prod", default=DEFAULT_PROD, help="domain production")
    parser.add_argument("--user", default="Manager",
                        help="tài khoản có quyền đổi avatar người khác")
    parser.add_argument("--password", default=None,
                        help="mật khẩu (mặc định lấy từ sheet Pass)")
    parser.add_argument("--dry-run", action="store_true", help="chỉ xem, không upload")
    args = parser.parse_args()

    load_env_vars()
    import archive_store
    import task_archive as ta

    target = archive_store.describe_store()
    print(f"Backend local: {target['backend']}  ->  {target['target']}")

    sheet_url = users_sheet_url()
    rows = fetch_rows(sheet_url) if sheet_url else []
    password = args.password or find_manager_password(rows, args.user)
    if not password:
        print(f"Không tìm thấy mật khẩu của {args.user} (truyền --password).")
        return 1

    prod = args.prod.rstrip("/")
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def post(url, data=None, headers=None):
        req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
        return opener.open(req, timeout=90)

    # Đăng nhập
    form = urllib.parse.urlencode(
        {"username": args.user, "password": password}).encode()
    try:
        resp = post(prod + "/login", form,
                    {"Content-Type": "application/x-www-form-urlencoded"})
        body = resp.read(2048).decode("utf-8", "replace")
    except Exception as exc:
        print(f"Đăng nhập thất bại: {exc}")
        return 1
    if "Mật khẩu không chính xác" in body or "Vui lòng chọn tài khoản" in body:
        print("Đăng nhập thất bại: sai tài khoản/mật khẩu.")
        return 1
    print(f"Đã đăng nhập production bằng {args.user}")
    print("-" * 68)

    pushed = same = failed = 0
    names = sorted(ta_rows(rows))
    for username in names:
        local = ta.get_user_avatar(username)
        if not local or not local.get("data"):
            continue
        data = local["data"]
        mime = local.get("mime") or "image/jpeg"

        try:
            req = urllib.request.Request(
                prod + "/api/avatar/" + urllib.parse.quote(username, safe=""),
                headers=UA,
            )
            with opener.open(req, timeout=60) as r:
                remote = r.read()
        except Exception:
            remote = b""

        if remote and hashlib.sha256(remote).hexdigest() == hashlib.sha256(data).hexdigest():
            same += 1
            print(f"  SKIP  {username:<24} đã giống production")
            continue

        if args.dry_run:
            print(f"  DRY   {username:<24} {mime:<11} {len(data):>7} bytes -> sẽ upload")
            pushed += 1
            continue

        ext = {"image/jpeg": "jpg", "image/png": "png",
               "image/webp": "webp", "image/gif": "gif"}.get(mime, "jpg")
        payload, ctype = multipart(
            {"username": username}, "file", f"avatar.{ext}", mime, data)
        try:
            with post(prod + "/api/users/avatar", payload,
                      {"Content-Type": ctype}) as resp:
                text = resp.read().decode("utf-8", "replace")
            if '"success": true' in text or '"success":true' in text:
                pushed += 1
                print(f"  OK    {username:<24} {mime:<11} {len(data):>7} bytes")
            else:
                failed += 1
                print(f"  FAIL  {username:<24} {text[:160]}")
        except Exception as exc:
            failed += 1
            print(f"  FAIL  {username:<24} {exc}")

    print("-" * 68)
    print(f"Xong: {pushed} đã đẩy, {same} giống sẵn, {failed} lỗi.")
    return 0 if failed == 0 else 1


def ta_rows(rows):
    """Danh sách username đang dùng avatar /api/avatar/... trong sheet."""
    for row in rows:
        avatar = (row.get("Avatar") or "").strip()
        if avatar.startswith("/api/avatar/"):
            yield urllib.parse.unquote(avatar[len("/api/avatar/"):])


if __name__ == "__main__":
    sys.exit(main())

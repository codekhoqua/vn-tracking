#!/usr/bin/env python3
r"""Đóng gói credentials.json + env_vars.yaml và đẩy lên Supabase Storage.

Đây chính là gói mà ``sync_master.bat`` tải về ở mỗi máy
(``app-config/config_bundle.zip``). Nhờ vậy máy mới chỉ cần chạy 1 file
``sync_master.bat`` là có code + config mới nhất (kể cả Turso).

Cách dùng:
    python scripts/upload_config_bundle.py --dry-run   # xem gói sẽ tạo
    python scripts/upload_config_bundle.py             # tạo + upload
    python scripts/upload_config_bundle.py --no-upload # chỉ tạo file local

Lưu ý bảo mật: bucket ``app-config`` đang public — ai có link đều tải được
gói này (trong đó có credentials.json + env_vars.yaml). Nếu cần bảo mật,
hãy chuyển bucket sang private và dùng khoá riêng cho sync.
"""

import argparse
import io
import os
import sys
import urllib.error
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
BUCKET = "app-config"
OBJECT = "config_bundle.zip"
LOCAL_OUT = os.path.join(ROOT, "backup_local", OBJECT)
FILES = ["credentials.json", "env_vars.yaml"]

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


def build_bundle():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in FILES:
            path = os.path.join(ROOT, name)
            if not os.path.exists(path):
                print(f"  ! thiếu {name}, bỏ qua")
                continue
            zf.write(path, arcname=name)
            print(f"  + {name:20} {os.path.getsize(path):>8} bytes")
    return buf.getvalue()


def upload(data):
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = (os.environ.get("SUPABASE_SECRET_KEY")
           or os.environ.get("SUPABASE_SERVICE_KEY", ""))
    if not url or not key:
        return False, "thiếu SUPABASE_URL / SUPABASE_SECRET_KEY"

    endpoint = f"{url}/storage/v1/object/{BUCKET}/{OBJECT}"
    req = urllib.request.Request(
        endpoint, data=data, method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": "application/zip",
            "x-upsert": "true",
            "Cache-Control": "no-cache",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8", "replace")
        return True, body
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:300]}"
    except Exception as exc:
        return False, str(exc)


def main():
    parser = argparse.ArgumentParser(
        description="Đóng gói + upload config bundle lên Supabase")
    parser.add_argument("--dry-run", action="store_true",
                        help="chỉ tạo gói, không upload")
    parser.add_argument("--no-upload", action="store_true",
                        help="tạo file local trong backup_local/, không upload")
    args = parser.parse_args()

    load_env_vars()
    print("Gói config:")
    data = build_bundle()
    print(f"  tổng: {len(data)} bytes")

    os.makedirs(os.path.dirname(LOCAL_OUT), exist_ok=True)
    with open(LOCAL_OUT, "wb") as fh:
        fh.write(data)
    print(f"  lưu local: {LOCAL_OUT}")

    if args.dry_run or args.no_upload:
        print("Không upload (dry-run/no-upload).")
        return 0

    ok, msg = upload(data)
    if not ok:
        print(f"UPLOAD LỖI: {msg}")
        return 1
    print(f"Đã upload {BUCKET}/{OBJECT}: {msg}")
    public = (os.environ.get("SUPABASE_URL", "").rstrip("/")
              + f"/storage/v1/object/public/{BUCKET}/{OBJECT}")
    print(f"URL công khai: {public}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
r"""Chuyển TOÀN BỘ avatar về DB archive (bỏ phụ thuộc link Google Drive).

Vì sao:
- Avatar đang lưu 2 kiểu: ảnh trong DB (``/api/avatar/<user>``) và link
  Google Drive ngoài. Link ngoài dễ hỏng/quyền truy cập/khiến nhiều máy
  hiển thị khác nhau.
- Script này tải mọi avatar link ngoài -> lưu vào bảng ``user_avatars``
  -> ghi lại cột Avatar trong sheet thành ``/api/avatar/<user>``.
- Với user đã dùng ``/api/avatar/<user>`` nhưng DB chưa có ảnh (máy mới),
  script tải ảnh từ production về DB.
- Chạy được với cả SQLite và Turso (theo ``env_vars.yaml``), nên sau khi
  bật Turso mọi máy dùng chung 1 DB avatar.

Cách dùng:
    python scripts/migrate_avatars_to_db.py --dry-run   # xem trước
    python scripts/migrate_avatars_to_db.py             # làm thật
    python scripts/migrate_avatars_to_db.py --no-sheet   # chỉ lưu DB

Lưu ý: cần ``credentials.json`` có quyền sửa sheet "Pass" để cập nhật cột G.
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
DEFAULT_PROD = "https://vntrackinglinkstory.homes"
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    )
}
MAX_AVATAR = 3 * 1024 * 1024  # task_archive.save_user_avatar giới hạn 3MB

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
    with open(os.path.join(ROOT, "app.py"), "r", encoding="utf-8") as fh:
        src = fh.read()
    m = re.search(r'USER_SHEET_URL\s*=\s*"([^"]+)"', src)
    return m.group(1) if m else ""


def fetch_sheet_rows(sheet_url):
    raw = urllib.request.urlopen(sheet_url, timeout=60).read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(raw)))


def drive_file_id(url):
    for pattern in (
        r"drive\.google\.com/file/d/([^/]+)",
        r"drive\.google\.com/open\?id=([^&]+)",
        r"drive\.google\.com/thumbnail\?id=([^&]+)",
        r"lh3\.googleusercontent\.com/d/([^/?]+)",
    ):
        m = re.search(pattern, url or "")
        if m:
            return m.group(1)
    return None


def sniff_mime(data):
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def fetch_image(url):
    """Tải 1 URL, trả (bytes, mime) nếu là ảnh hợp lệ."""
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read(MAX_AVATAR + 1)
            ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    except Exception as exc:
        return None, f"tải lỗi: {exc}"
    if not data:
        return None, "ảnh rỗng"
    if len(data) > MAX_AVATAR:
        return None, "ảnh > 3MB"
    mime = sniff_mime(data) or (ctype if ctype.startswith("image/") else "")
    if not mime:
        return None, f"không phải ảnh (Content-Type={ctype or '?'})"
    return (data, mime), ""


def fetch_drive_image(file_id):
    urls = [
        f"https://drive.google.com/thumbnail?id={file_id}&sz=w512",
        f"https://lh3.googleusercontent.com/d/{file_id}",
        f"https://drive.google.com/uc?export=view&id={file_id}",
    ]
    last_err = ""
    for url in urls:
        image, err = fetch_image(url)
        if image:
            return image, ""
        last_err = err
    return None, last_err


def get_gspread_client():
    """Tạo client Google Sheets giống app.py (service account)."""
    creds_path = os.path.join(ROOT, "credentials.json")
    if not os.path.exists(creds_path):
        return None, "không thấy credentials.json"
    try:
        with open(creds_path, "r", encoding="utf-8") as fh:
            info = json.load(fh)
    except Exception as exc:
        return None, f"đọc credentials.json lỗi: {exc}"

    if isinstance(info.get("private_key"), str):
        info["private_key"] = info["private_key"].replace("\\n", "\n")
        if "EKmHf/h)AgMBAAE" in info["private_key"]:
            info["private_key"] = info["private_key"].replace(
                "EKmHf/h)AgMBAAE", "EKmHf/gpAgMBAAE"
            )

    scope = [
        "https://spreadsheets.google.com/feeds",
        "https://www.googleapis.com/auth/drive",
    ]
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        creds = Credentials.from_service_account_info(info, scopes=scope)
        return gspread.authorize(creds), ""
    except Exception as exc:
        return None, f"không tạo được client Sheets: {exc}"


def update_sheet_avatar(client, sheet_url, username, new_url):
    """Ghi cột G (Avatar) của user trong sheet "Pass"."""
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", sheet_url or "")
    if not m:
        return False, "không tìm thấy ID sheet"
    gid_m = re.search(r"[#&?]gid=(\d+)", sheet_url)
    gid = int(gid_m.group(1)) if gid_m else None
    try:
        sh = client.open_by_key(m.group(1))
        ws = None
        if gid is not None:
            try:
                ws = sh.get_worksheet_by_id(gid)
            except Exception:
                ws = None
        ws = ws or sh.sheet1
        values = ws.get_all_values()
        row_idx = None
        for i, row in enumerate(values, start=1):
            if row and str(row[0]).strip() == username:
                row_idx = i
                break
        if row_idx is None:
            return False, "không thấy user trong sheet"
        ws.update(range_name=f"G{row_idx}", values=[[new_url]])
        return True, ""
    except Exception as exc:
        return False, str(exc)


def main():
    parser = argparse.ArgumentParser(
        description="Đưa toàn bộ avatar (kể cả link Drive) vào DB archive"
    )
    parser.add_argument("--prod", default=DEFAULT_PROD, help="domain production")
    parser.add_argument("--dry-run", action="store_true", help="chỉ xem, không ghi")
    parser.add_argument("--no-sheet", action="store_true",
                        help="không sửa cột Avatar trong sheet")
    args = parser.parse_args()

    load_env_vars()
    import archive_store
    import task_archive as ta

    target = archive_store.describe_store()
    print(f"Backend: {target['backend']}  ->  {target['target']}")

    sheet_url = users_sheet_url()
    if not sheet_url:
        print("Không tìm thấy USER_SHEET_URL trong app.py")
        return 1
    rows = fetch_sheet_rows(sheet_url)
    print(f"Sheet: {len(rows)} thành viên")
    print("-" * 70)

    ta.ensure_schema()

    client = None
    client_err = ""
    if not args.no_sheet and not args.dry_run:
        client, client_err = get_gspread_client()
        if not client:
            print(f"[!] Không cập nhật được sheet: {client_err}")
            print("    (avatar vẫn được lưu vào DB, chỉ cột G giữ nguyên)")

    saved = skipped = failed = sheet_updated = 0
    for row in rows:
        username = (row.get("Username") or "").strip()
        raw = (row.get("Avatar") or "").strip()
        if not username:
            continue
        if not raw:
            skipped += 1
            continue

        if raw.startswith("/api/avatar/"):
            # Đã trỏ DB: chỉ cần đảm bảo DB có ảnh
            name = urllib.parse.unquote(raw[len("/api/avatar/"):])
            if not args.dry_run and ta.get_user_avatar(name):
                print(f"  OK    {username:<24} đã có trong DB")
                skipped += 1
                continue
            image, err = fetch_image(args.prod.rstrip("/") + raw)
            source = "production"
            new_value = raw
        else:
            name = username
            file_id = drive_file_id(raw)
            if file_id:
                image, err = fetch_drive_image(file_id)
                source = f"Drive {file_id[:10]}..."
            else:
                image, err = fetch_image(raw)
                source = raw[:40]
            new_value = "/api/avatar/" + urllib.parse.quote(name, safe="")

        if not image:
            failed += 1
            print(f"  FAIL  {username:<24} {err}")
            continue

        data, mime = image
        if args.dry_run:
            print(f"  DRY   {username:<24} {mime:<11} {len(data):>7} bytes  <- {source}")
            saved += 1
            continue

        try:
            ta.save_user_avatar(name, data, mime=mime)
            saved += 1
            print(f"  OK    {username:<24} {mime:<11} {len(data):>7} bytes  <- {source}")
        except Exception as exc:
            failed += 1
            print(f"  FAIL  {username:<24} lưu DB lỗi: {exc}")
            continue

        if client and raw != new_value:
            ok, err = update_sheet_avatar(client, sheet_url, username, new_value)
            if ok:
                sheet_updated += 1
                print(f"        sheet G: {raw[:48]}... -> {new_value}")
            else:
                print(f"        [!] không cập nhật sheet: {err}")

    print("-" * 70)
    print(f"Xong: {saved} avatar lưu DB, {sheet_updated} dòng sheet cập nhật, "
          f"{skipped} bỏ qua, {failed} lỗi.")
    if not args.dry_run and not args.no_sheet:
        print("Restart app (hoặc chờ 5 phút cache) để dashboard đọc avatar mới.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

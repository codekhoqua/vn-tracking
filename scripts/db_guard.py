#!/usr/bin/env python3
r"""Bảo vệ DB archive (avatar, task, comment...) trước và sau khi sync code.

Vì sao cần:
- Avatar + toàn bộ dữ liệu archive nằm trong `data/vn_tracking_archive.db`
  (backend SQLite), KHÔNG nằm trên GitHub và KHÔNG nằm trong zip deploy.
- Nếu file DB này từng bị commit vào Git ở một nhánh/commit cũ thì
  `git pull` / `git reset --hard` có thể XOÁ nó khỏi working tree
  -> mất avatar, mất archive.
- Script này snapshot DB trước khi sync và tự phục hồi nếu DB bị mất.

Cách dùng:
    python scripts/db_guard.py backup      # snapshot DB vào backup_local/db_<ts>/
    python scripts/db_guard.py verify      # chỉ kiểm tra DB + avatar
    python scripts/db_guard.py verify --restore   # tự phục hồi nếu mất/rỗng
    python scripts/db_guard.py status      # xem nhanh DB + danh sách backup

Exit code của `verify`:
    0  DB ok, có avatar
    2  DB ok nhưng bảng user_avatars rỗng (cần chạy sync_avatars.py)
    3  DB từng mất/rỗng -> đã phục hồi từ backup
    1  lỗi / không phục hồi được
"""

import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(ROOT, "data", "vn_tracking_archive.db")
BACKUP_ROOT = os.path.join(ROOT, "backup_local")
KEEP_BACKUPS = 10
DB_SUFFIXES = ("", "-wal", "-shm")

# In ra tiếng Việt không lỗi trên cmd/PowerShell (cp1252/cp437...)
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


def resolve_db(explicit=None):
    if explicit:
        return os.path.abspath(explicit)
    return os.path.abspath(
        os.environ.get("ARCHIVE_SQLITE_PATH") or DEFAULT_DB
    )


def is_turso():
    return bool(
        os.environ.get("TURSO_DATABASE_URL", "").strip()
        and os.environ.get("TURSO_AUTH_TOKEN", "").strip()
    )


def quick_check(path):
    """Trả về (ok, thông điệp) sau khi chạy PRAGMA quick_check."""
    try:
        con = sqlite3.connect(path, timeout=30)
        try:
            row = con.execute("PRAGMA quick_check").fetchone()
        finally:
            con.close()
        ok = bool(row) and (row[0] or "").lower() == "ok"
        return ok, row[0] if row else "unknown"
    except Exception as exc:
        return False, str(exc)


def table_counts(path):
    """Đếm avatar và task; trả None nếu không đọc được DB."""
    try:
        con = sqlite3.connect(path, timeout=30)
        try:
            names = {
                r[0]
                for r in con.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            avatars = (
                con.execute("SELECT COUNT(*) FROM user_avatars").fetchone()[0]
                if "user_avatars" in names
                else 0
            )
            tasks = 0
            for table in ("task_rows", "tasks", "task_archive"):
                if table in names:
                    tasks = con.execute(
                        f"SELECT COUNT(*) FROM {table}"
                    ).fetchone()[0]
                    break
            return {"avatars": avatars, "tasks": tasks, "tables": len(names)}
        finally:
            con.close()
    except Exception:
        return None


def avatar_count(path):
    counts = table_counts(path)
    return counts["avatars"] if counts else -1


def list_backups():
    """Danh sách DB trong backup_local/db_*, mới nhất trước."""
    if not os.path.isdir(BACKUP_ROOT):
        return []
    found = []
    for name in sorted(os.listdir(BACKUP_ROOT), reverse=True):
        if not name.startswith("db_"):
            continue
        db = os.path.join(BACKUP_ROOT, name, os.path.basename(DEFAULT_DB))
        if os.path.exists(db) and os.path.getsize(db) > 0:
            found.append(db)
    return found


def latest_backup_with_avatars():
    for db in list_backups():
        if avatar_count(db) > 0:
            return db
    return None


def prune_backups():
    if not os.path.isdir(BACKUP_ROOT):
        return
    dirs = sorted(
        (d for d in os.listdir(BACKUP_ROOT) if d.startswith("db_")),
        reverse=True,
    )
    for old in dirs[KEEP_BACKUPS:]:
        shutil.rmtree(os.path.join(BACKUP_ROOT, old), ignore_errors=True)


def copy_db(src, dst):
    """Copy DB (kèm -wal/-shm nếu có) tới đường dẫn đích."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    for suffix in DB_SUFFIXES:
        target = dst + suffix
        if os.path.exists(target):
            os.remove(target)
    for suffix in DB_SUFFIXES:
        source = src + suffix
        if os.path.exists(source):
            shutil.copy2(source, dst + suffix)


def cmd_backup(args):
    db = resolve_db(args.db)
    if is_turso():
        print("[i] Đang cấu hình Turso -> dữ liệu (kể cả avatar) nằm trên cloud,")
        print("    file SQLite local chỉ là cache, không cần backup.")
    if not os.path.exists(db):
        print(f"[!] Không thấy DB archive: {db}")
        print("    (Bỏ qua backup - có thể đây là lần chạy đầu.)")
        return 0

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_dir = os.path.join(BACKUP_ROOT, f"db_{stamp}")
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, os.path.basename(db))

    try:
        src = sqlite3.connect(db, timeout=30)
        dst = sqlite3.connect(dest)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
    except Exception as exc:
        print(f"[!] Backup online lỗi ({exc}) -> copy file trực tiếp.")
        copy_db(db, dest)

    ok, msg = quick_check(dest)
    counts = table_counts(dest) or {"avatars": 0, "tasks": 0, "tables": 0}
    size_mb = os.path.getsize(dest) / 1048576
    if ok:
        print(
            f"[OK] Đã backup DB: backup_local\\{os.path.basename(dest_dir)} "
            f"({size_mb:.1f} MB, {counts['avatars']} avatar, {counts['tasks']} task)"
        )
    else:
        print(f"[!] Backup xong nhưng quick_check báo: {msg}")

    prune_backups()
    return 0


def merge_avatars(db, backup):
    """Chỉ chép bảng user_avatars từ backup sang DB đang chạy."""
    try:
        con = sqlite3.connect(db, timeout=30)
        try:
            con.execute("ATTACH DATABASE ? AS bak", (backup,))
            con.execute(
                "INSERT OR REPLACE INTO user_avatars "
                "(username, mime, data, updated_at) "
                "SELECT username, mime, data, updated_at FROM bak.user_avatars"
            )
            con.commit()
            total = con.execute("SELECT COUNT(*) FROM user_avatars").fetchone()[0]
        finally:
            con.execute("DETACH DATABASE bak")
            con.close()
        return total
    except Exception as exc:
        print(f"[!] Không chép được avatar từ backup: {exc}")
        return -1


def create_empty_db(db):
    """Tạo DB rỗng tối thiểu (bảng avatar) cho folder mới.

    App sẽ tự tạo các bảng còn lại khi khởi động (task_archive.ensure_schema).
    """
    os.makedirs(os.path.dirname(db), exist_ok=True)
    con = sqlite3.connect(db)
    try:
        con.execute(
            "CREATE TABLE IF NOT EXISTS user_avatars ("
            "username TEXT PRIMARY KEY, mime TEXT, data BLOB, updated_at TEXT)"
        )
        con.commit()
    finally:
        con.close()


def not_found_handler(args, db, empty=False):
    """DB mất hoặc rỗng: phục hồi full từ backup nếu được yêu cầu."""
    label = "rỗng" if empty else "bị mất"
    print(f"[!] DB archive {label}: {db}")
    if not args.restore:
        print("    Chạy lại với --restore để phục hồi từ backup.")
        return 1
    backup = next(
        (b for b in list_backups() if os.path.getsize(b) > 0),
        None,
    )
    if not backup:
        if not empty:
            # Folder mới: chưa có DB và cũng chưa có backup -> tạo DB trống,
            # trả mã 2 để script gọi sync_avatars.py kéo avatar từ production.
            create_empty_db(db)
            print("[i] Chua co backup - da tao DB trong.")
            print("    Buoc tiep theo se keo avatar tu production.")
            return 2
        print("[FAIL] Không có backup nào trong backup_local\\db_*")
        return 1
    copy_db(backup, db)
    counts = table_counts(db) or {"avatars": 0, "tasks": 0}
    print(
        f"[OK] Đã phục hồi DB từ {os.path.relpath(backup, ROOT)} "
        f"({counts['avatars']} avatar, {counts['tasks']} task)"
    )
    return 3


def cmd_verify(args):
    db = resolve_db(args.db)

    if is_turso():
        print("[i] Backend Turso: avatar nằm trên cloud, không phụ thuộc file local.")
        print("[OK] Không cần kiểm tra DB file.")
        return 0

    if not os.path.exists(db) or os.path.getsize(db) == 0:
        return not_found_handler(args, db)

    ok, msg = quick_check(db)
    if not ok:
        print(f"[!] DB archive hỏng (quick_check: {msg}): {db}")
        return not_found_handler(args, db, empty=True)

    counts = table_counts(db)
    if counts is None:
        print(f"[!] Không đọc được DB: {db}")
        return not_found_handler(args, db, empty=True)

    print(
        f"[i] DB archive: {counts['avatars']} avatar, "
        f"{counts['tasks']} task, {counts['tables']} bảng"
    )

    if counts["avatars"] > 0:
        print("[OK] Avatar còn nguyên trong DB.")
        return 0

    print("[!] Bảng user_avatars đang RỖNG -> dashboard sẽ hiện chữ cái thay vì ảnh.")
    if args.restore:
        backup = latest_backup_with_avatars()
        if backup:
            total = merge_avatars(db, backup)
            if total > 0:
                print(
                    f"[OK] Đã chép lại {total} avatar từ "
                    f"{os.path.relpath(backup, ROOT)}"
                )
                return 3
    print("    Cần chạy: python scripts/sync_avatars.py")
    return 2


def cmd_status(args):
    db = resolve_db(args.db)
    print(f"DB      : {db}")
    print(f"Tồn tại : {'có' if os.path.exists(db) else 'KHÔNG'}")
    if os.path.exists(db):
        size_mb = os.path.getsize(db) / 1048576
        print(f"Kích cỡ : {size_mb:.1f} MB")
        counts = table_counts(db)
        if counts:
            print(
                f"Dữ liệu : {counts['avatars']} avatar, {counts['tasks']} task, "
                f"{counts['tables']} bảng"
            )
        else:
            print("Dữ liệu : không đọc được")
    backups = list_backups()
    print(f"Backup  : {len(backups)} bản trong backup_local\\")
    for b in backups[:5]:
        print(
            f"          - {os.path.relpath(b, ROOT)} "
            f"({os.path.getsize(b) / 1048576:.1f} MB, {avatar_count(b)} avatar)"
        )
    return 0


def main():
    load_env_vars()
    parser = argparse.ArgumentParser(description="Bảo vệ DB archive VN-Tracking")
    parser.add_argument(
        "command", choices=("backup", "verify", "status"),
        help="backup / verify / status",
    )
    parser.add_argument("--db", default=None, help="đường dẫn DB (mặc định data/vn_tracking_archive.db)")
    parser.add_argument(
        "--restore", action="store_true",
        help="tự phục hồi DB/avatar từ backup nếu mất hoặc rỗng",
    )
    args = parser.parse_args()

    if args.command == "backup":
        return cmd_backup(args)
    if args.command == "verify":
        return cmd_verify(args)
    return cmd_status(args)


if __name__ == "__main__":
    sys.exit(main())

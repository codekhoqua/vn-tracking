#!/usr/bin/env python3
r"""Copy dữ liệu còn thiếu từ SQLite local sang Turso (an toàn, chỉ thêm).

Dùng khi:
- Vừa bật Turso bằng ``scripts/turso_setup.py`` nhưng vài bản ghi local
  không có trên Sheet/Supabase (ví dụ task đã xoá khỏi Sheet nhưng archive
  vẫn giữ) nên Turso thiếu.
- Muốn đối chiếu nhanh 2 bên mà không copy đè dữ liệu Turso.

Nguyên tắc: chỉ INSERT những dòng có khoá chính chưa tồn tại trên Turso,
không sửa/xoá dòng đang có. Chạy lại nhiều lần vô hại.

Cách dùng:
    python scripts/copy_local_to_turso.py --dry-run
    python scripts/copy_local_to_turso.py
"""

import argparse
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
DEFAULT_DB = os.path.join(ROOT, "data", "vn_tracking_archive.db")
# checklist_events không có khoá chính và hash được tính lại theo thời điểm
# đồng bộ, nên so sánh sẽ luôn lệch -> không copy để tránh nhân đôi sự kiện.
TABLES = ["tasks", "task_comments", "task_links", "checklist_state"]

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


def main():
    parser = argparse.ArgumentParser(
        description="Chỉ thêm dòng còn thiếu từ SQLite local sang Turso")
    parser.add_argument("--db", default=DEFAULT_DB, help="đường dẫn SQLite local")
    parser.add_argument("--dry-run", action="store_true", help="chỉ đếm, không ghi")
    parser.add_argument("--tables", default=",".join(TABLES),
                        help="danh sách bảng, cách nhau bằng dấu phẩy")
    args = parser.parse_args()

    load_env_vars()
    import archive_store

    desc = archive_store.describe_store()
    if desc["backend"] != "turso":
        print(f"Backend đang là {desc['backend']} ({desc['target']}).")
        print("Script này chỉ dùng khi đã cấu hình Turso.")
        return 1
    if not os.path.exists(args.db):
        print(f"Không thấy SQLite: {args.db}")
        return 1

    print(f"Turso : {desc['target']}")
    print(f"Local : {args.db}")
    print("-" * 68)

    store = archive_store.get_store()
    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    total = 0

    for table in [t.strip() for t in args.tables.split(",") if t.strip()]:
        try:
            cols, row_count = store.execute(f"SELECT COUNT(*) FROM {table}")
        except Exception as exc:
            print(f"{table:18} bỏ qua (Turso lỗi: {exc})")
            continue

        info = con.execute(f"PRAGMA table_info({table})").fetchall()
        if not info:
            print(f"{table:18} bỏ qua (local không có bảng)")
            continue
        columns = [r[1] for r in info]
        pk = [r[1] for r in sorted(info, key=lambda r: r[5]) if r[5]]

        local_rows = con.execute(f"SELECT * FROM {table}").fetchall()
        if pk:
            pk_idx = [columns.index(c) for c in pk]
            _, trows = store.execute(f"SELECT {', '.join(pk)} FROM {table}")
            existing = {tuple(r[i] for i in range(len(pk))) for r in trows}
            missing = [r for r in local_rows
                       if tuple(r[i] for i in pk_idx) not in existing]
        else:
            # Không có khoá chính: so khớp toàn bộ dòng, trừ dần để giữ đúng
            # số lần xuất hiện của các dòng trùng nhau.
            from collections import Counter

            _, trows = store.execute(f"SELECT * FROM {table}")
            pool = Counter(tuple(r) for r in trows)
            missing = []
            for row in local_rows:
                key = tuple(row)
                if pool[key] > 0:
                    pool[key] -= 1
                else:
                    missing.append(row)

        print(f"{table:18} turso={row_count[0][0]:>6}  local={len(local_rows):>6}  "
              f"thiếu={len(missing):>4}")
        if not missing or args.dry_run:
            continue

        placeholders = ", ".join("?" for _ in columns)
        sql = (f"INSERT OR IGNORE INTO {table} ({', '.join(columns)}) "
               f"VALUES ({placeholders})")
        statements = [(sql, tuple(row)) for row in missing]
        sent = store.batch(statements)
        total += sent
        print(f"{'':18} -> đã gửi {sent} dòng "
              f"(dòng trùng khoá/hash tự động bỏ qua)")

    con.close()
    print("-" * 68)
    if args.dry_run:
        print("Dry-run: chưa ghi gì.")
    else:
        print(f"Xong: thêm {total} dòng vào Turso.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

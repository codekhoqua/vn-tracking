"""Backfill / đồng bộ kho lưu trữ dài hạn từ Google Sheet + Supabase.

Chạy:
    python scripts/archive_sync.py                 # đồng bộ tất cả + in thống kê
    python scripts/archive_sync.py --sheets-only   # chỉ kéo task từ Google Sheet
    python scripts/archive_sync.py --state-only    # chỉ kéo comment/checklist/link
    python scripts/archive_sync.py --stats         # chỉ xem thống kê archive
    python scripts/archive_sync.py --titles 20     # liệt kê tác phẩm có trong archive

Không cần credentials Google: các tab sheet dùng để archive đang ở chế độ
"anyone with the link can view".
"""

import argparse
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)


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


def main():
    load_env_vars()

    import task_archive as ta
    from archive_store import describe_store

    parser = argparse.ArgumentParser(description="Đồng bộ archive VN-Tracking")
    parser.add_argument("--sheets-only", action="store_true")
    parser.add_argument("--state-only", action="store_true")
    parser.add_argument("--stats", action="store_true")
    parser.add_argument("--titles", type=int, default=0, metavar="N")
    parser.add_argument("--reset-schema", action="store_true",
                        help="chỉ tạo lại bảng/index (không xoá dữ liệu)")
    args = parser.parse_args()

    target = describe_store()
    print(f"Backend: {target['backend']}  ->  {target['target']}")
    print("-" * 62)

    started = time.time()
    ta.ensure_schema()

    if args.reset_schema:
        print("Đã tạo/kiểm tra schema xong.")

    do_sheets = not args.state_only
    do_state = not args.sheets_only

    if not args.stats and not args.titles:
        if do_sheets:
            print("== Kéo task từ Google Sheet ==")
            res = ta.sync_sheets(progress=print)
            print(f"   -> tổng {res['saved']} dòng task đã ghi")

        if do_state:
            print("== Kéo comment / checklist / link từ Supabase ==")
            res = ta.migrate_from_env(progress=print)
            if res.get("skipped"):
                print(f"   (bỏ qua: {res['skipped']})")

    print("-" * 62)
    print("== Thống kê archive ==")
    for key, value in ta.stats().items():
        print(f"   {key:<18} {value}")

    if args.titles:
        print("-" * 62)
        print(f"== {args.titles} tác phẩm gần nhất ==")
        for item in ta.list_titles(limit=args.titles):
            print(
                f"   {item['last_date'] or '-':<12} "
                f"{item['tac_pham'][:46]:<46} "
                f"tập={item['tap_count']:<3} dòng={item['row_count']}"
            )

    print("-" * 62)
    print(f"Xong sau {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()

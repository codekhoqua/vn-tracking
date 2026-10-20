#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""Sinh / cập nhật bảng phiên âm tên tác phẩm: data/title_readings.json

- Lấy danh sách tên tác phẩm từ DB archive local (SQLite) hoặc Google Sheet.
- Tên nào chưa có trong file thì chuyển tự động bằng pykakasi.
- Tên đã có trong file thì GIỮ NGUYÊN (để không đè phần sửa tay).
- Muốn sửa một tên: mở data/title_readings.json, sửa value tương ứng.

Cần pykakasi khi muốn chuyển tự động:
    pip install pykakasi

Cách dùng:
    python scripts/build_title_readings.py              # thêm tên còn thiếu
    python scripts/build_title_readings.py --refresh    # chuyển lại toàn bộ (đè cả phần sửa tay)
    python scripts/build_title_readings.py --from-sheet # lấy danh sách từ Google Sheet
"""

import argparse
import csv
import io
import json
import os
import sqlite3
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

OUT_PATH = os.path.join(ROOT, "data", "title_readings.json")
DB_PATH = os.path.join(ROOT, "data", "vn_tracking_archive.db")

# Phiên âm đã chốt tay - luôn thắng kết quả tự động.
MANUAL = {
    "いぶり暮らし": "Iburi gurashi",
    "AIの遺電子": "AI no Idenshi",
    "MUJIN -無尽-": "MUJIN -Mujin-",
}


def titles_from_db(db_path):
    if not os.path.exists(db_path):
        print(f"Không thấy DB: {db_path}")
        return []
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(
            "SELECT DISTINCT tac_pham FROM tasks WHERE tac_pham IS NOT NULL AND tac_pham <> ''"
        ).fetchall()
    finally:
        con.close()
    return [r[0] for r in rows]


def schedule_titles_from_sheet():
    """Lấy 'Tên tác phẩm' từ sheet lịch làm việc (nguồn của dashboard)."""
    import re
    with open(os.path.join(ROOT, "app.py"), "r", encoding="utf-8") as fh:
        m = re.search(r'^url\s*=\s*"(https://docs\.google\.com/spreadsheets[^"]+)"', fh.read(), re.M)
    if not m:
        print("Không tìm thấy URL sheet lịch làm việc trong app.py")
        return []
    csv_url = m.group(1).split("/edit")[0] + "/export?format=csv"
    raw = urllib.request.urlopen(csv_url, timeout=60).read().decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(raw)))
    header_idx = None
    for idx, row in enumerate(rows):
        if any("作品名" in cell or "Tên tác phẩm" in cell for cell in row):
            header_idx = idx
            col = next(i for i, cell in enumerate(row) if "作品名" in cell or "Tên tác phẩm" in cell)
            break
    if header_idx is None:
        return []
    titles = []
    for row in rows[header_idx + 1:]:
        if len(row) > col:
            name = row[col].strip()
            if name and name not in ("nan", "None", "-"):
                titles.append(name)
    return titles


def main():
    parser = argparse.ArgumentParser(description="Sinh bảng phiên âm tên tác phẩm")
    parser.add_argument("--db", default=DB_PATH, help="SQLite archive local")
    parser.add_argument("--out", default=OUT_PATH, help="file JSON đầu ra")
    parser.add_argument("--refresh", action="store_true",
                        help="chuyển lại toàn bộ, đè cả phần đã sửa tay")
    parser.add_argument("--from-sheet", action="store_true",
                        help="lấy danh sách tên từ sheet lịch làm việc thay vì DB")
    args = parser.parse_args()

    import title_readings

    titles = schedule_titles_from_sheet() if args.from_sheet else titles_from_db(args.db)
    titles = list(dict.fromkeys(t.strip() for t in titles if t and t.strip()))
    if not titles:
        print("Không có tên tác phẩm nào để xử lý.")
        return 1

    current = {}
    if os.path.exists(args.out) and not args.refresh:
        with open(args.out, "r", encoding="utf-8") as fh:
            current = json.load(fh) or {}

    if title_readings._get_kakasi() is None:
        print("! Chưa cài pykakasi -> chỉ thêm được các tên có trong MANUAL.")
        print("  Cài bằng: pip install pykakasi")

    out = dict(current)
    added = kept = auto_done = missing = 0
    for title in titles:
        if title in MANUAL:
            if out.get(title) != MANUAL[title]:
                out[title] = MANUAL[title]
                added += 1
            else:
                kept += 1
            continue
        if title in out and not args.refresh:
            kept += 1
            continue
        reading = title_readings.auto_reading(title)
        if not reading:
            missing += 1
            continue
        out[title] = reading
        auto_done += 1

    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(dict(sorted(out.items())), fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print(f"Tổng số tên: {len(titles)}")
    print(f"  giữ nguyên (đã có): {kept}")
    print(f"  thêm từ MANUAL   : {added}")
    print(f"  thêm tự động     : {auto_done}")
    print(f"  chưa chuyển được : {missing}")
    print(f"Đã ghi {len(out)} mục -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

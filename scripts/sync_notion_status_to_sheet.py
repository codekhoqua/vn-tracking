#!/usr/bin/env python3
"""Đồng bộ trạng thái checklist Sheet của app → sheet LS受注_all.

Hỗ trợ 3 ô:
- ``t2`` → cột O = notion済
- ``t4`` → cột P = TRUE (開始)
- ``t7`` → cột O = 納品済み

Mặc định chỉ **dry-run** (không ghi). Muốn ghi thật phải truyền ``--apply``
và chỉ ghi khi khớp đúng 1 dòng + cột K = VN + trạng thái hiện tại hợp lệ.

Ví dụ:
    python scripts/sync_notion_status_to_sheet.py
    python scripts/sync_notion_status_to_sheet.py --task "レタッチ - 6_シュルスの魔女" --box t2
    python scripts/sync_notion_status_to_sheet.py --task "レタッチ - 6_シュルスの魔女" --box t4
    python scripts/sync_notion_status_to_sheet.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

import gspread  # noqa: E402

import archive_store  # noqa: E402

SCHEDULE_SHEET_ID = "1dkCu_HUs12DTas--yZlDTB9M17DKnUGBvWJ6vdVuIGU"
SCHEDULE_TAB = "LS受注_all"
STATUS_COL = 14  # O (0-based) = ステータス
START_COL = 15  # P (0-based) = 開始 (TRUE/FALSE)
DELIVERY_COL = 19  # T (0-based) = 納品日 (Apps Script ghi NOW() khi O → 納品済み)
VN_COL = 10  # K (0-based) = VN
CHECKBOX_ID = "t2"  # O: notion済
SHEET_BOXES = ("t2", "t4", "t7")
TARGET_STATUS = "notion済"
DELIVERED_STATUS = "納品済み"
VN_VALUE = "VN"
EARLY_STATUSES = {"", "依頼済み"}
SCHEDULE_TZ = os.environ.get("SCHEDULE_TZ", "Asia/Tokyo")


def now_serial() -> float:
    """Giờ hiện tại theo timezone của sheet, dạng serial Google Sheets."""
    tz = ZoneInfo(SCHEDULE_TZ)
    epoch = datetime(1899, 12, 30, tzinfo=tz)
    return (datetime.now(tz) - epoch).total_seconds() / 86400.0


def load_env() -> dict:
    env = dict(os.environ)
    path = BASE_DIR / "env_vars.yaml"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if ":" in line and not line.strip().startswith("#"):
                key, value = line.split(":", 1)
                env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return env


def norm(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    return " ".join(text.replace("　", " ").split()).strip()


def norm_volume(value: object) -> str:
    text = norm(value)
    if text.endswith(".0"):
        text = text[:-2]
    return text


def split_project(volume_key: str) -> tuple[str, str]:
    key = norm(volume_key)
    if "_" in key:
        tap, project = key.split("_", 1)
        return norm_volume(tap), norm(project)
    return "", key


def load_store(env: dict):
    url = env.get("TURSO_DATABASE_URL", "").strip()
    token = env.get("TURSO_AUTH_TOKEN", "").strip()
    if not url or not token:
        raise SystemExit("Thiếu TURSO_DATABASE_URL / TURSO_AUTH_TOKEN")
    return archive_store.TursoStore(url, token)


def latest_tasks(store) -> dict[tuple[str, str], dict]:
    """(cong_viec, volume_key) → dòng task mới nhất có worker."""
    cols, rows = store.execute(
        "SELECT cong_viec, tac_pham, volume_key, tap, worker, last_seen_at "
        "FROM tasks ORDER BY id ASC"
    )
    out: dict[tuple[str, str], dict] = {}
    for row in rows:
        item = dict(zip(cols, row))
        key = (norm(item.get("cong_viec")), norm(item.get("volume_key")))
        worker = norm(item.get("worker"))
        if not worker:
            continue
        out[key] = item
    return out


def checked_sheet_boxes(store) -> list[dict]:
    cols, rows = store.execute(
        "SELECT tp_key, volume_key, box_id, checked FROM checklist_state "
        "WHERE box_id IN ('t2', 't4', 't7') AND checked = 1 "
        "ORDER BY updated_at DESC"
    )
    return [dict(zip(cols, row)) for row in rows]


def schedule_index(ws) -> dict[tuple[str, str, str], list[tuple[int, list[str]]]]:
    values = ws.get_all_values()
    index: dict[tuple[str, str, str], list[tuple[int, list[str]]]] = defaultdict(list)
    for row_number, row in enumerate(values[1:], start=2):
        def cell(col: int) -> str:
            return norm(row[col]) if len(row) > col else ""

        job = cell(1)
        project = cell(2)
        tap = norm_volume(cell(4))
        if not (job and project and tap):
            continue
        index[(job, project, tap)].append((row_number, row))
    return index


def worker_tokens(value: str) -> set[str]:
    return {norm(part) for part in str(value or "").split(",") if norm(part)}


def is_vn_row(row: list[str]) -> bool:
    """Cột K phải đúng là VN (dòng do VN làm) mới được đổi cột O."""
    if len(row) <= VN_COL:
        return False
    return norm(row[VN_COL]).upper() == VN_VALUE


def row_matches(row: list[str], job: str, project: str, tap: str, wanted: set[str]) -> bool:
    """Xác thực lại đúng dòng: 作業内容 + 作品名 + 巻数 + 作業者."""
    def cell(col: int) -> str:
        return norm(row[col]) if len(row) > col else ""

    if cell(1) != norm(job) or cell(2) != norm(project):
        return False
    if norm_volume(cell(4)) != norm_volume(tap):
        return False
    return bool(worker_tokens(cell(11)) & wanted)


def match_row(
    index, job: str, project: str, tap: str, worker: str
) -> tuple[list[tuple[int, list[str]]], str]:
    candidates = index.get((norm(job), norm(project), norm_volume(tap)), [])
    if not candidates:
        return [], "no_match"

    wanted = worker_tokens(worker)
    if not wanted:
        return [], "missing_worker"

    # Bắt buộc cột K = VN (dòng do VN làm) mới được đổi cột O.
    vn_candidates = [item for item in candidates if is_vn_row(item[1])]
    if not vn_candidates:
        return candidates, "not_vn"

    matched = []
    for row_number, row in vn_candidates:
        if row_matches(row, job, project, tap, wanted):
            matched.append((row_number, row))

    if not matched:
        return [], "no_worker_match"
    if len(matched) > 1:
        return matched, "ambiguous"

    row = matched[0][1]
    schedule_workers = worker_tokens(row[11] if len(row) > 11 else "")
    if len(schedule_workers) > 1 or len(wanted) > 1:
        return matched, "multi_worker"
    return matched, "ok"


def plan_for_task(
    store_tasks, index, tp_key: str, volume_key: str, cb_id: str = "t2", *, verbose: bool = True
) -> dict:
    job = norm(str(tp_key).split(" - ", 1)[0])
    tap, project = split_project(volume_key)
    task = store_tasks.get((job, norm(volume_key)))
    if not task:
        return {"action": "NO_TASK", "tp_key": tp_key, "cb_id": cb_id}
    worker = norm(task.get("worker"))
    if not worker:
        return {"action": "NO_WORKER", "tp_key": tp_key, "cb_id": cb_id}
    matches, reason = match_row(index, job, project, tap, worker)
    if reason != "ok":
        return {
            "action": reason.upper(),
            "tp_key": tp_key,
            "cb_id": cb_id,
            "worker": worker,
            "matches": [m[0] for m in matches],
        }

    row_number, row = matches[0]
    current_o = norm(row[STATUS_COL]) if len(row) > STATUS_COL else ""
    current_p = norm(row[START_COL]).upper() if len(row) > START_COL else ""

    if cb_id == "t4":
        column, current, target = "P", current_p, "TRUE"
        if current == "TRUE":
            action = "ALREADY"
        elif current in ("FALSE", ""):
            action = "SET"
        else:
            action = "SKIP_LATER"
    elif cb_id == "t7":
        column, current, target = "O", current_o, DELIVERED_STATUS
        if current == DELIVERED_STATUS:
            action = "ALREADY"
        elif current in EARLY_STATUSES or current == TARGET_STATUS:
            action = "SET"
        else:
            action = "SKIP_LATER"
    else:
        column, current, target = "O", current_o, TARGET_STATUS
        if current == TARGET_STATUS:
            action = "ALREADY"
        elif current in EARLY_STATUSES:
            action = "SET"
        else:
            action = "SKIP_LATER"

    return {
        "action": action,
        "tp_key": tp_key,
        "cb_id": cb_id,
        "worker": worker,
        "row": row_number,
        "job": job,
        "project": project,
        "volume": tap,
        "column": column,
        "current": current,
        "target": target if action == "SET" else "",
        "matches": [row_number],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", default="", help="tp_key cần mô phỏng, vd 'レタッチ - 6_シュルスの魔女'")
    parser.add_argument("--box", default="t2", choices=SHEET_BOXES, help="Checkbox Sheet cần mô phỏng (t2/t4/t7)")
    parser.add_argument("--apply", action="store_true", help="Ghi thật (mặc định dry-run)")
    args = parser.parse_args()

    env = load_env()
    store = load_store(env)
    tasks = latest_tasks(store)

    gc = gspread.service_account(filename=str(BASE_DIR / "credentials.json"))
    ws = gc.open_by_key(SCHEDULE_SHEET_ID).worksheet(SCHEDULE_TAB)
    index = schedule_index(ws)
    print(f"  Sheet: {SCHEDULE_TAB} | dòng dữ liệu: {sum(len(v) for v in index.values()):,}")

    plans = []
    if args.task:
        # Mô phỏng 1 task + 1 checkbox dù checklist chưa tick.
        _, rows = store.execute(
            "SELECT tp_key, volume_key FROM checklist_state WHERE tp_key = ? "
            "ORDER BY updated_at DESC LIMIT 1",
            (args.task,),
        )
        volume_key = rows[0][1] if rows else args.task.split(" - ", 1)[-1]
        plans.append(plan_for_task(tasks, index, args.task, volume_key, args.box))
    else:
        for item in checked_sheet_boxes(store):
            plans.append(
                plan_for_task(
                    tasks, index, item["tp_key"], item["volume_key"], item["box_id"]
                )
            )

    counts: dict[str, int] = defaultdict(int)
    for plan in plans:
        counts[plan["action"]] += 1

    print("  Kết quả dry-run:")
    for action in ("SET", "ALREADY", "SKIP_LATER", "AMBIGUOUS", "NOT_VN", "NO_MATCH", "NO_WORKER", "NO_TASK", "MULTI_WORKER", "NO_WORKER_MATCH"):
        if counts.get(action):
            print(f"    {action:16s}: {counts[action]}")

    print("  Chi tiết sẽ ghi:")
    for plan in plans:
        if plan["action"] != "SET":
            continue
        print(
            f"    row {plan['row']:4d} | {plan['job']} {plan['volume']}_{plan['project']} "
            f"| {plan['worker']} | {plan['cb_id']} {plan['column']}: "
            f"{plan['current']!r} → {plan['target']!r}"
        )

    if args.apply:
        to_write = [p for p in plans if p["action"] == "SET"]
        if not to_write:
            print("  Không có dòng nào cần ghi.")
            return 0
        updates = []
        for plan in to_write:
            updates.append({
                "range": f"{plan['column']}{plan['row']}",
                "values": [[plan["target"]]],
            })
            if plan["cb_id"] == "t7" and plan["target"] == DELIVERED_STATUS:
                # Bù cho Apps Script onEdit không chạy khi ghi qua API.
                updates.append({
                    "range": f"T{plan['row']}",
                    "values": [[round(now_serial(), 8)]],
                })
        ws.batch_update(updates, value_input_option="USER_ENTERED")
        print(f"  Đã ghi {len(updates)} ô.")
    else:
        print("  (dry-run — chưa ghi gì)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

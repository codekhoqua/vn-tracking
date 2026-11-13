"""Đồng bộ checklist Sheet của app → sheet LS受注_all.

Mapping:
- ``t2`` (O: notion済)  → cột O = notion済 / trống
- ``t4`` (P: 開始)      → cột P = TRUE / FALSE
- ``t7`` (O: 納品済み)  → cột O = 納品済み / quay lại notion済 (hoặc trống)

An toàn:
- mặc định ``SCHEDULE_STATUS_MODE=dry`` (chỉ log, không ghi)
- ``apply`` mới ghi; ``off`` tắt hẳn
- chỉ ghi khi khớp đúng 1 dòng theo 作業内容 + 作品名 + 巻数 + 作業者
  và cột K = VN
- dòng thiếu 作業内容 / 作品名 / 巻数 / 作業者 bị bỏ qua hoàn toàn
- không ghi đè trạng thái muộn hơn (納品済み, Orange対応済, ...)
"""
from __future__ import annotations

import os
import sys
import threading
import time
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import gspread  # noqa: E402
from gspread.utils import rowcol_to_a1  # noqa: E402

import archive_store  # noqa: E402

SCHEDULE_SHEET_ID = os.environ.get(
    "SCHEDULE_SHEET_ID", "1dkCu_HUs12DTas--yZlDTB9M17DKnUGBvWJ6vdVuIGU"
)
SCHEDULE_TAB = os.environ.get("SCHEDULE_TAB", "LS受注_all")
STATUS_COL = 14  # O (0-based) = ステータス
START_COL = 15  # P (0-based) = 開始 (TRUE/FALSE)
DELIVERY_COL = 19  # T (0-based) = 納品日 (Apps Script ghi NOW() khi O → 納品済み)
VN_COL = 10  # K (0-based) = VN
TARGET_STATUS = "notion済"
DELIVERED_STATUS = "納品済み"
VN_VALUE = "VN"
EARLY_STATUSES = {"", "依頼済み"}
INDEX_TTL = 120.0  # vị trí dòng: làm mới mỗi 2 phút (refresh nền)
STALE_TTL = 900.0  # vẫn dùng index cũ tối đa 15 phút trong khi refresh nền
ROW_TTL = 8.0  # giá trị O/P/T của 1 dòng: đọc mới sau 8 giây
SCHEDULE_TZ = os.environ.get("SCHEDULE_TZ", "Asia/Tokyo")

SHEET_CHECKBOX_IDS = ("t2", "t4", "t7")

_cache_lock = threading.Lock()
_cache: dict[str, object] = {"key": None, "at": 0.0, "index": None, "ws": None}
_row_cache: dict[int, tuple[float, list[str]]] = {}
_worker_cache: dict[str, tuple[float, dict | None]] = {}
WORKER_TTL = 120.0
_ws_lock = threading.Lock()
_refresh_lock = threading.Lock()
_refresh_running = False
_gc = None
_ws = None


def _mode() -> str:
    value = (os.environ.get("SCHEDULE_STATUS_MODE") or "dry").strip().lower()
    return value if value in ("dry", "apply", "off") else "dry"


def _norm(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    return " ".join(text.replace("　", " ").split()).strip()


def _norm_volume(value: object) -> str:
    text = _norm(value)
    return text[:-2] if text.endswith(".0") else text


def _split_tp_key(tp_key: str) -> tuple[str, str, str]:
    """'レタッチ - 6_シュルスの魔女' → ('レタッチ', '6', 'シュルスの魔女')."""
    job, _, rest = str(tp_key or "").partition(" - ")
    if not rest:
        return _norm(job), "", ""
    tap, _, project = rest.partition("_")
    return _norm(job), _norm_volume(tap), _norm(project if project else rest)


def _worker_set(value: object) -> set[str]:
    return {_norm(part) for part in str(value or "").split(",") if _norm(part)}


def _cell(row: list[str], col: int) -> str:
    return _norm(row[col]) if len(row) > col else ""


def _col_letter(col: int) -> str:
    """0-based column index → Excel letter (14 → 'O')."""
    n = col + 1
    letters = ""
    while n:
        n, rem = divmod(n - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def _now_serial() -> float:
    """Giờ hiện tại theo timezone của sheet, dạng serial Google Sheets."""
    tz = ZoneInfo(SCHEDULE_TZ)
    epoch = datetime(1899, 12, 30, tzinfo=tz)
    return (datetime.now(tz) - epoch).total_seconds() / 86400.0


def _is_vn_row(row: list[str]) -> bool:
    """Cột K phải đúng là VN (VN làm) mới được phép đổi dữ liệu."""
    return _cell(row, VN_COL).upper() == VN_VALUE


def _row_matches(
    row: list[str], job: str, project: str, tap: str, wanted: set[str]
) -> bool:
    """Xác thực lại đúng dòng: 作業内容 + 作品名 + 巻数 + 作業者."""
    if _cell(row, 1) != job or _cell(row, 2) != project:
        return False
    if _norm_volume(_cell(row, 4)) != tap:
        return False
    return bool(_worker_set(_cell(row, 11)) & wanted)


def _get_ws():
    """Mở worksheet 1 lần, tái sử dụng cho mọi lần đọc/ghi."""
    global _gc, _ws
    with _ws_lock:
        if _ws is not None:
            return _ws
        _gc = gspread.service_account(filename=str(BASE_DIR / "credentials.json"))
        _ws = _gc.open_by_key(SCHEDULE_SHEET_ID).worksheet(SCHEDULE_TAB)
        return _ws


def _read_index(ws):
    values = ws.get_all_values()
    index: dict[tuple[str, str, str], list[tuple[int, list[str]]]] = defaultdict(list)
    for row_number, row in enumerate(values[1:], start=2):
        job, project, tap = _cell(row, 1), _cell(row, 2), _norm_volume(_cell(row, 4))
        # Dòng thiếu bất kỳ cột bắt buộc nào → không đưa vào index.
        if job and project and tap:
            index[(job, project, tap)].append((row_number, row))
    return index


def _refresh_index(key, ws):
    """Đọc toàn bộ sheet 1 lần (lần đầu hoặc refresh nền)."""
    with _refresh_lock:
        with _cache_lock:
            if (
                _cache["key"] == key
                and _cache["index"] is not None
                and time.time() - float(_cache["at"]) < INDEX_TTL
            ):
                return _cache["index"], _cache["ws"]
        index = _read_index(ws)
        with _cache_lock:
            _cache.update(key=key, at=time.time(), index=index, ws=ws)
        return index, ws


def _refresh_index_async(key) -> None:
    """Refresh index ở nền để lần tick sau không phải chờ đọc 3.800 dòng."""
    global _refresh_running
    with _refresh_lock:
        if _refresh_running:
            return
        _refresh_running = True

    def worker():
        global _refresh_running
        try:
            _refresh_index(key, _get_ws())
        except Exception as exc:  # noqa: BLE001
            print("[schedule-sync] refresh index lỗi:", exc, flush=True)
        finally:
            with _refresh_lock:
                _refresh_running = False

    threading.Thread(target=worker, daemon=True).start()


def _get_sheet(force: bool = False):
    """Trả (index, ws). Index tươi 2 phút; hết hạn → trả bản cũ + refresh nền."""
    key = (SCHEDULE_SHEET_ID, SCHEDULE_TAB)
    now = time.time()
    stale = None
    with _cache_lock:
        if _cache["key"] == key and _cache["index"] is not None:
            age = now - float(_cache["at"])
            if age < INDEX_TTL and not force:
                return _cache["index"], _cache["ws"]
            if not force and age < STALE_TTL:
                stale = (_cache["index"], _cache["ws"])

    if force:
        return _refresh_index(key, _get_ws())
    if stale is not None:
        _refresh_index_async(key)
        return stale
    return _refresh_index(key, _get_ws())


def _index_is_fresh() -> bool:
    with _cache_lock:
        return (
            _cache["index"] is not None
            and time.time() - float(_cache["at"]) < INDEX_TTL
        )


def _fresh_rows(ws, row_numbers: list[int]) -> dict[int, list[str]]:
    """Đọc mới vài dòng cụ thể (A..T) thay vì cả sheet."""
    now = time.time()
    result: dict[int, list[str]] = {}
    missing: list[int] = []
    with _cache_lock:
        for row_number in row_numbers:
            item = _row_cache.get(row_number)
            if item and now - item[0] < ROW_TTL:
                result[row_number] = item[1]
            else:
                missing.append(row_number)
    if not missing:
        return result

    ranges = [f"A{rn}:T{rn}" for rn in missing]
    try:
        chunks = ws.batch_get(ranges, value_render_option="UNFORMATTED_VALUE")
    except Exception:
        chunks = [
            ws.get(rng, value_render_option="UNFORMATTED_VALUE") for rng in ranges
        ]

    stamp = time.time()
    for row_number, chunk in zip(missing, chunks):
        row = list(chunk[0]) if chunk else []
        if len(row) < 20:
            row += [""] * (20 - len(row))
        with _cache_lock:
            _row_cache[row_number] = (stamp, row)
        result[row_number] = row
    return result


def _remember_row(row_number: int, row: list[str], updates: dict[int, str]) -> None:
    """Cập nhật cache dòng sau khi app tự ghi, khỏi phải đọc lại cả sheet."""
    for col, value in updates.items():
        if len(row) <= col:
            row += [""] * (col + 1 - len(row))
        row[col] = value
    with _cache_lock:
        _row_cache[row_number] = (time.time(), row)


_warmup_started = False


def start_warmup(interval: float = 0.0) -> None:
    """Nạp sẵn index lúc khởi động (mặc định chỉ 1 lần)."""
    global _warmup_started
    if _warmup_started:
        return
    _warmup_started = True

    def _loop():
        try:
            _get_sheet(force=True)
        except Exception as exc:  # noqa: BLE001
            print("[schedule-sync] warmup index lỗi:", exc, flush=True)
        while interval > 0:
            time.sleep(max(30.0, interval))
            try:
                _get_sheet(force=True)
            except Exception as exc:  # noqa: BLE001
                print("[schedule-sync] refresh index lỗi:", exc, flush=True)

    threading.Thread(target=_loop, daemon=True, name="sheet-index-warmup").start()


def _task_worker(tp_key: str) -> dict | None:
    """Lấy worker mới nhất từ bảng tasks theo đúng công việc + volume."""
    now = time.time()
    with _cache_lock:
        cached = _worker_cache.get(tp_key)
        if cached and now - cached[0] < WORKER_TTL:
            return cached[1]

    # Bảng ``tasks`` lưu nguyên văn chuỗi đọc từ Sheet (vd '～' U+FF5E), còn
    # ``_norm`` đổi thành '~' (U+007E). Chỉ tra bằng bản đã chuẩn hoá sẽ trượt
    # -> NO_TASK với mọi tác phẩm có '～' / ký tự full-width. Vì vậy tra cả
    # bản gốc lẫn bản chuẩn hoá.
    job_raw, sep, volume_raw = str(tp_key or "").partition(" - ")
    job_raw, volume_raw = job_raw.strip(), volume_raw.strip()
    if not (sep and job_raw and volume_raw):
        return None
    jobs = list(dict.fromkeys((job_raw, _norm(job_raw))))
    volumes = [
        value
        for value in dict.fromkeys((volume_raw, _norm_volume(volume_raw)))
        if value
    ]
    store = archive_store.get_store()
    cols, rows = store.execute(
        "SELECT cong_viec, tac_pham, volume_key, tap, worker, last_seen_at "
        f"FROM tasks WHERE volume_key IN ({','.join('?' * len(volumes))}) "
        f"AND cong_viec IN ({','.join('?' * len(jobs))}) "
        "ORDER BY id DESC LIMIT 1",
        tuple(volumes) + tuple(jobs),
    )
    result = dict(zip(cols, rows[0])) if rows else None
    if result is not None:
        with _cache_lock:
            _worker_cache[tp_key] = (time.time(), result)
    return result


def _checklist_checked(tp_key: str, box_id: str) -> bool:
    try:
        store = archive_store.get_store()
        _cols, rows = store.execute(
            "SELECT checked FROM checklist_state WHERE tp_key = ? AND box_id = ? "
            "ORDER BY updated_at DESC LIMIT 1",
            (tp_key, box_id),
        )
        return bool(rows[0][0]) if rows else False
    except Exception:
        return False


def _find_row(tp_key: str):
    """(ctx, error). ctx = (row_number, row, worker, ws)."""
    task = _task_worker(tp_key)
    if not task:
        return None, {"action": "NO_TASK", "tp_key": tp_key}
    worker = _norm(task.get("worker"))
    if not worker:
        return None, {"action": "NO_WORKER", "tp_key": tp_key}

    job, tap, project = _split_tp_key(tp_key)
    wanted = _worker_set(worker)

    def match(index, ws):
        candidates = index.get((job, project, tap), [])
        if not candidates:
            return [], False, [], 0
        fresh = _fresh_rows(ws, [rn for rn, _old in candidates])
        matched = []
        vn_found = False
        key_ok = 0
        for row_number, _old in candidates:
            row = fresh.get(row_number) or []
            if (
                _cell(row, 1) == job
                and _cell(row, 2) == project
                and _norm_volume(_cell(row, 4)) == tap
            ):
                key_ok += 1
            if not _is_vn_row(row):
                continue
            vn_found = True
            if _row_matches(row, job, project, tap, wanted):
                matched.append((row_number, row))
        return matched, vn_found, candidates, key_ok

    index, ws = _get_sheet()
    matched, vn_found, candidates, key_ok = match(index, ws)
    if not matched and (not candidates or key_ok == 0) and not _index_is_fresh():
        # Index cũ do dòng mới chèn/xoá → đọc lại 1 lần.
        index, ws = _get_sheet(force=True)
        matched, vn_found, candidates, key_ok = match(index, ws)

    if not candidates:
        return None, {"action": "NO_MATCH", "tp_key": tp_key, "worker": worker}
    if not matched:
        if not vn_found:
            return None, {
                "action": "NOT_VN",
                "tp_key": tp_key,
                "worker": worker,
                "rows": [rn for rn, _old in candidates],
            }
        return None, {"action": "NO_WORKER_MATCH", "tp_key": tp_key, "worker": worker}
    if len(matched) > 1:
        return None, {
            "action": "AMBIGUOUS",
            "tp_key": tp_key,
            "worker": worker,
            "rows": [m[0] for m in matched],
        }

    row_number, row = matched[0]
    # Dòng sheet có thể có nhiều người làm (vd "Thang-タンコイ, Tan-タン").
    # Chỉ cần khớp đúng 1 dòng theo 作業内容 + 作品名 + 巻数 + 作業者 là đủ:
    # cột O/P là trạng thái của cả dòng nên vẫn ghi được bình thường.
    return (row_number, row, worker, ws), None


def _plan_transition(tp_key: str, cb_id: str, checked: bool, row: list[str]):
    """Trả (kết quả, cột, giá trị hiện tại, giá trị đích) hoặc (kết quả, None...)."""
    current_o = _cell(row, STATUS_COL)
    current_p = _cell(row, START_COL).upper()

    if cb_id == "t2":
        col, current = STATUS_COL, current_o
        if checked:
            if current == TARGET_STATUS:
                return {"action": "ALREADY"}, None, None, None
            if current not in EARLY_STATUSES:
                return {"action": "SKIP_LATER", "current": current}, None, None, None
            target = TARGET_STATUS
        else:
            # Bỏ tick: chỉ hạ notion済 về để trống.
            if current in EARLY_STATUSES:
                return {"action": "ALREADY"}, None, None, None
            if current != TARGET_STATUS:
                return {"action": "SKIP_LATER", "current": current}, None, None, None
            target = ""

    elif cb_id == "t4":
        col, current = START_COL, current_p
        if checked:
            if current == "TRUE":
                return {"action": "ALREADY"}, None, None, None
            if current not in ("FALSE", ""):
                return {"action": "SKIP_LATER", "current": current}, None, None, None
            target = "TRUE"
        else:
            if current in ("FALSE", ""):
                return {"action": "ALREADY"}, None, None, None
            if current != "TRUE":
                return {"action": "SKIP_LATER", "current": current}, None, None, None
            target = "FALSE"

    elif cb_id == "t7":
        col, current = STATUS_COL, current_o
        if checked:
            if current == DELIVERED_STATUS:
                return {"action": "ALREADY"}, None, None, None
            if current not in EARLY_STATUSES and current != TARGET_STATUS:
                return {"action": "SKIP_LATER", "current": current}, None, None, None
            target = DELIVERED_STATUS
        else:
            if current in EARLY_STATUSES or current == TARGET_STATUS:
                return {"action": "ALREADY"}, None, None, None
            if current != DELIVERED_STATUS:
                return {"action": "SKIP_LATER", "current": current}, None, None, None
            # Quay về bước 2 nếu t2 đang tick, ngược lại để trống.
            target = TARGET_STATUS if _checklist_checked(tp_key, "t2") else ""
    else:
        return None, None, None, None

    return None, col, current, target


def sync_checklist_status(
    tp_key: str, cb_id: str, checked: bool = True
) -> dict | None:
    """Gọi khi checkbox Sheet (t2/t4/t7) đổi trạng thái. Trả dict để log."""
    if cb_id not in SHEET_CHECKBOX_IDS:
        return None
    mode = _mode()
    if mode == "off":
        return None

    found, error = _find_row(tp_key)
    if error:
        return error
    row_number, row, worker, ws = found

    early_result, col, current, target = _plan_transition(
        tp_key, cb_id, checked, row
    )
    if early_result:
        early_result.update(tp_key=tp_key, row=row_number)
        if "current" not in early_result:
            early_result["current"] = (
                _cell(row, START_COL).upper() if cb_id == "t4" else _cell(row, STATUS_COL)
            )
        return early_result

    result = {
        "tp_key": tp_key,
        "cb_id": cb_id,
        "row": row_number,
        "worker": worker,
        "current": current,
        "target": target,
        "column": _col_letter(col),
    }
    if mode != "apply":
        result["action"] = "DRY_WOULD_SET"
        return result

    updates = [{"range": rowcol_to_a1(row_number, col + 1), "values": [[target]]}]
    cache_updates = {col: _norm(target)}
    # T (納品日): Apps Script onEdit ghi NOW() khi O đổi thành 納品済み.
    # Google Sheets KHÔNG chạy onEdit khi ghi qua API → app phải tự ghi.
    t_updated = False
    if cb_id == "t7":
        if target == DELIVERED_STATUS:
            serial = round(_now_serial(), 8)
            updates.append({
                "range": rowcol_to_a1(row_number, DELIVERY_COL + 1),
                "values": [[serial]],
            })
            cache_updates[DELIVERY_COL] = str(serial)
            t_updated = True
        elif _cell(row, DELIVERY_COL):
            updates.append({
                "range": rowcol_to_a1(row_number, DELIVERY_COL + 1),
                "values": [[""]],
            })
            cache_updates[DELIVERY_COL] = ""
            t_updated = True
    elif cb_id == "t2" and target != DELIVERED_STATUS and _cell(row, DELIVERY_COL):
        updates.append({
            "range": rowcol_to_a1(row_number, DELIVERY_COL + 1),
            "values": [[""]],
        })
        cache_updates[DELIVERY_COL] = ""
        t_updated = True

    ws.batch_update(updates, value_input_option="USER_ENTERED")
    # Cập nhật cache dòng vừa ghi thay vì xoá cả index (tránh đọc lại 3.800 dòng).
    _remember_row(row_number, row, cache_updates)
    result["action"] = "SET"
    result["t_updated"] = t_updated
    return result


def sync_t2_status(tp_key: str, checked: bool = True) -> dict | None:
    """Tương thích code cũ: chỉ đồng bộ t2 (O: notion済)."""
    return sync_checklist_status(tp_key, "t2", checked=checked)


def get_sheet_state(tp_key: str) -> dict:
    """Đọc trạng thái hiện tại của đúng dòng trên sheet (để hiển thị trong task)."""
    try:
        found, error = _find_row(tp_key)
        if error:
            return {"found": False, **error}
        row_number, row, worker, _ws = found
        return {
            "found": True,
            "tp_key": tp_key,
            "row": row_number,
            "worker": worker,
            "sheet_worker": _cell(row, 11),
            "k": _cell(row, VN_COL),
            "o": _cell(row, STATUS_COL),
            "p": _cell(row, START_COL).upper(),
        }
    except Exception as exc:  # noqa: BLE001
        return {"found": False, "action": "READ_ERROR", "error": str(exc)}

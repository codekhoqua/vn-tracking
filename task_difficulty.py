"""Độ khó task lưu trong DB (Turso/SQLite) cho công cụ Task Assignee.

Mục tiêu: leader mở Task Assignee là thấy ngay task nào **Dễ / Trung bình / Khó**
mà không phải đọc lại sheet 日報 (logtime) mỗi lần -> tránh tốn quota Apps Script.

Nguồn dữ liệu (đồng bộ định kỳ, không đọc lúc mở UI):

* Nhãn ``難易度`` trong sheet 日報: ``低`` = Dễ, ``中`` = Trung bình, ``高`` = Khó.
* Nếu task chưa có nhãn: ước lượng từ số trang + thời gian thực tế
  (phút/trang) theo từng loại công việc.

Bảng:
    task_difficulty  tổng hợp theo 3 phạm vi:
                       exact  = công việc + tác phẩm + tập + chương
                       title  = công việc + tác phẩm
                       job    = loại công việc (写植 / レタッチ / Prep ...)
    difficulty_sync  mốc đồng bộ gần nhất (để UI biết khi nào cần cập nhật)
"""

from __future__ import annotations

import json
import re
import threading
import unicodedata
from datetime import datetime, timezone
from statistics import mean, median

from archive_store import get_store
import task_archive

# =====================================================================
# Schema
# =====================================================================
SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS task_difficulty (
        task_key          TEXT PRIMARY KEY,
        run_id            TEXT NOT NULL,
        scope             TEXT NOT NULL,
        cong_viec         TEXT,
        tac_pham          TEXT,
        tap               TEXT,
        chuong            TEXT,
        level             TEXT NOT NULL,
        score             REAL,
        samples           INTEGER DEFAULT 0,
        avg_minutes       REAL,
        avg_pages         REAL,
        minutes_per_page  REAL,
        q33_minutes       REAL,
        q67_minutes       REAL,
        source            TEXT,
        breakdown         TEXT,
        updated_at        TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_taskdiff_scope ON task_difficulty (scope)",
    "CREATE INDEX IF NOT EXISTS idx_taskdiff_job   ON task_difficulty (cong_viec)",
    "CREATE INDEX IF NOT EXISTS idx_taskdiff_title ON task_difficulty (tac_pham)",
    """
    CREATE TABLE IF NOT EXISTS worker_skill (
        worker            TEXT NOT NULL,
        scope             TEXT NOT NULL,
        cong_viec         TEXT NOT NULL,
        tac_pham          TEXT NOT NULL DEFAULT '',
        samples           INTEGER DEFAULT 0,
        avg_minutes       REAL,
        difficulty_score  REAL,
        low_count         INTEGER DEFAULT 0,
        medium_count      INTEGER DEFAULT 0,
        high_count        INTEGER DEFAULT 0,
        last_date         TEXT,
        run_id            TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        PRIMARY KEY (worker, scope, cong_viec, tac_pham)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_workerskill_worker ON worker_skill (worker)",
    "CREATE INDEX IF NOT EXISTS idx_workerskill_scope  ON worker_skill (scope)",
    """
    CREATE TABLE IF NOT EXISTS difficulty_sync (
        id             INTEGER PRIMARY KEY,
        last_sync_at   TEXT,
        logtime_rows   INTEGER DEFAULT 0,
        tasks_written  INTEGER DEFAULT 0,
        status         TEXT,
        message        TEXT
    )
    """,
]

_schema_ready = False
_schema_lock = threading.Lock()

# Thứ tự cột dùng cho INSERT nhiều dòng một lần (nhanh hơn nhiều so với
# gửi từng câu lệnh lên Turso).
_COLS = [
    "task_key", "run_id", "scope", "cong_viec", "tac_pham", "tap", "chuong",
    "level", "score", "samples", "avg_minutes", "avg_pages", "minutes_per_page",
    "q33_minutes", "q67_minutes", "source", "breakdown", "updated_at",
]

_LEVEL_SCORE = {"低": 1.0, "中": 2.0, "高": 3.0}
_LEVEL_LABELS = {"easy": "Dễ", "medium": "Trung bình", "hard": "Khó", "unknown": "Chưa rõ"}
_BREAKDOWN_KEYS = {"低": "low", "中": "medium", "高": "high"}


def ensure_schema(store=None):
    """Tạo bảng/index nếu chưa có (idempotent)."""
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        store = store or get_store()
        for ddl in SCHEMA:
            store.execute(ddl)
        _schema_ready = True


# =====================================================================
# Chuẩn hoá
# =====================================================================
def _display(value) -> str:
    text = str(value or "").strip()
    if text.lower() in ("nan", "none", "null"):
        return ""
    return re.sub(r"\s+", " ", text).strip()


def _key_text(value) -> str:
    """Khoá so khớp: bỏ khoảng trắng, full-width -> half-width, lower-case."""
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.strip().lower()
    text = re.sub(r"\s+", "", text)
    return text.replace("～", "~").replace("−", "-")


def _key_num(value) -> str:
    text = _key_text(value)
    if re.fullmatch(r"\d+(?:\.0+)?", text):
        return str(int(float(text)))
    return text


def task_key(cong_viec, tac_pham, tap="", chuong="") -> str:
    return "exact|" + "|".join((
        _key_text(cong_viec), _key_text(tac_pham), _key_num(tap), _key_num(chuong),
    ))


def title_key(cong_viec, tac_pham) -> str:
    return "title|" + "|".join((_key_text(cong_viec), _key_text(tac_pham)))


def job_key(cong_viec) -> str:
    return "job|" + _key_text(cong_viec)


def _to_float(value):
    text = str(value or "").strip().replace(",", ".")
    if not text:
        return None
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    if number != number or number < 0:  # NaN / âm
        return None
    return number


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _percentile(values, p):
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * p
    low = int(pos)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)


def _level_from_score(score):
    if score is None:
        return None
    if score < 1.5:
        return "easy"
    if score > 2.5:
        return "hard"
    return "medium"


def _level_from_minutes(minutes, q33, q67):
    if minutes is None or q33 is None or q67 is None:
        return None
    if q33 == q67:
        return "medium"
    if minutes < q33:
        return "easy"
    if minutes > q67:
        return "hard"
    return "medium"


def level_label(level: str) -> str:
    return _LEVEL_LABELS.get(level or "", _LEVEL_LABELS["unknown"])


# =====================================================================
# Tổng hợp từ logtime
# =====================================================================
def _new_acc(scope, cong_viec="", tac_pham="", tap="", chuong=""):
    return {
        "scope": scope,
        "cong_viec": cong_viec,
        "tac_pham": tac_pham,
        "tap": tap,
        "chuong": chuong,
        "labels": [],
        "minutes": [],
        "pages": [],
        "mpp": [],
    }


def _acc_add(acc, score, minutes, pages):
    if score is not None:
        acc["labels"].append(score)
    if minutes is not None and minutes > 0:
        acc["minutes"].append(minutes)
    if pages is not None and pages > 0:
        acc["pages"].append(pages)
    if minutes is not None and minutes > 0 and pages is not None and pages > 0:
        acc["mpp"].append(minutes / pages)


def build_rows(raw_rows) -> list[dict]:
    """Nhận các dòng thô A:N của sheet 日報 -> list dict sẵn sàng ghi DB."""
    accs: dict[str, dict] = {}

    for raw in raw_rows or []:
        row = list(raw) + [""] * 14
        cong_viec = _display(row[2])
        tac_pham = _display(row[3])
        chuong = _display(row[4])
        tap = _display(row[5])
        pages = _to_float(row[8])
        hours = _to_float(row[9])
        difficulty = _display(row[11])
        score = _LEVEL_SCORE.get(difficulty)
        minutes = (hours * 60.0) if hours is not None else None

        if not tac_pham and not cong_viec:
            continue
        if score is None and minutes is None:
            continue

        targets = []
        if cong_viec:
            targets.append((job_key(cong_viec), _new_acc("job", cong_viec)))
        if cong_viec and tac_pham:
            targets.append((
                title_key(cong_viec, tac_pham),
                _new_acc("title", cong_viec, tac_pham),
            ))
            if tap or chuong:
                targets.append((
                    task_key(cong_viec, tac_pham, tap, chuong),
                    _new_acc("exact", cong_viec, tac_pham, tap, chuong),
                ))

        for key, acc in targets:
            bucket = accs.get(key)
            if bucket is None:
                accs[key] = acc
                bucket = acc
            _acc_add(bucket, score, minutes, pages)

    if not accs:
        return []

    # ---- Tổng thời gian thực tế của từng task (không phải từng dòng log) ----
    # Một task có thể được log nhiều lần (nhiều ngày / nhiều người). Cộng lại
    # mới ra độ lớn thật của task; lấy từng dòng log sẽ đánh giá sai.
    task_totals = {}
    for key, acc in accs.items():
        if acc["scope"] not in ("exact", "title"):
            continue
        total_minutes = sum(acc["minutes"]) if acc["minutes"] else None
        task_pages = max(acc["pages"]) if acc["pages"] else None
        task_totals[key] = (total_minutes, task_pages)

    # Gom total theo loại công việc. Ưu tiên task exact (đúng từng tập); job nào
    # không có exact (vd Prep / 読切) thì dùng title.
    job_exact = {}
    job_title = {}
    for key, acc in accs.items():
        if acc["scope"] not in ("exact", "title"):
            continue
        total_minutes, task_pages = task_totals.get(key, (None, None))
        if not total_minutes:
            continue
        bucket = job_exact if acc["scope"] == "exact" else job_title
        jk = _key_text(acc["cong_viec"])
        stat = bucket.setdefault(jk, {"minutes": [], "pages": [], "mpp": []})
        stat["minutes"].append(total_minutes)
        if task_pages:
            stat["pages"].append(task_pages)
            if total_minutes / task_pages > 0:
                stat["mpp"].append(total_minutes / task_pages)

    job_stats = {}
    for jk in set(job_exact) | set(job_title):
        stat = job_exact.get(jk)
        if not stat or len(stat["minutes"]) < 10:
            stat = job_title.get(jk) or stat
        if not stat:
            continue
        job_stats[jk] = {
            "q33": _percentile(stat["minutes"], 0.33),
            "q67": _percentile(stat["minutes"], 0.67),
            "median_minutes": median(stat["minutes"]),
            "median_pages": median(stat["pages"]) if stat["pages"] else None,
            "median_mpp": median(stat["mpp"]) if stat["mpp"] else None,
        }

    baselines = {
        jk: (stat["q33"], stat["q67"], stat["median_mpp"])
        for jk, stat in job_stats.items()
    }
    job_medians = [
        stat["median_minutes"] for stat in job_stats.values()
        if stat["median_minutes"] is not None
    ]
    job_med_q33 = _percentile(job_medians, 0.33)
    job_med_q67 = _percentile(job_medians, 0.67)

    rows = []
    for key, acc in accs.items():
        labels = acc["labels"]
        samples = len(labels)
        score = mean(labels) if labels else None
        level = _level_from_score(score)

        q33, q67, med_mpp = baselines.get(_key_text(acc["cong_viec"]), (None, None, None))
        avg_minutes = mean(acc["minutes"]) if acc["minutes"] else None
        avg_pages = mean(acc["pages"]) if acc["pages"] else None
        # Trung vị phút/trang ổn định hơn trung bình khi có vài dòng lẻ rất nhỏ.
        avg_mpp = median(acc["mpp"]) if acc["mpp"] else med_mpp

        if acc["scope"] == "job":
            stat = job_stats.get(_key_text(acc["cong_viec"]))
            if stat:
                q33, q67 = stat["q33"], stat["q67"]
                avg_minutes = stat["median_minutes"]
                avg_pages = stat["median_pages"]
                avg_mpp = stat["median_mpp"]

        source = "logtime" if labels else None

        if level is None:
            if acc["scope"] == "job":
                # Không có nhãn: so độ lớn trung bình giữa các loại việc.
                level = _level_from_minutes(avg_minutes, job_med_q33, job_med_q67)
                source = "baseline"
            else:
                total_minutes, task_pages = task_totals.get(key, (None, None))
                expected = total_minutes
                if expected is None and task_pages is not None and med_mpp is not None:
                    expected = task_pages * med_mpp
                if expected is None:
                    expected = avg_minutes
                level = _level_from_minutes(expected, q33, q67)
                source = "estimate"

        if level is None:
            continue

        breakdown = {"low": 0, "medium": 0, "high": 0}
        for label_score in labels:
            for jp, vi in _BREAKDOWN_KEYS.items():
                if _LEVEL_SCORE[jp] == label_score:
                    breakdown[vi] += 1
                    break

        rows.append({
            "task_key": key,
            "scope": acc["scope"],
            "cong_viec": acc["cong_viec"],
            "tac_pham": acc["tac_pham"],
            "tap": acc["tap"],
            "chuong": acc["chuong"],
            "level": level,
            "score": round(score, 4) if score is not None else None,
            "samples": samples,
            "avg_minutes": round(avg_minutes, 2) if avg_minutes is not None else None,
            "avg_pages": round(avg_pages, 2) if avg_pages is not None else None,
            "minutes_per_page": round(avg_mpp, 4) if avg_mpp is not None else None,
            "q33_minutes": round(q33, 2) if q33 is not None else None,
            "q67_minutes": round(q67, 2) if q67 is not None else None,
            "source": source,
            "breakdown": json.dumps(breakdown, ensure_ascii=False),
        })

    return rows


# =====================================================================
# Kinh nghiệm / kỹ năng của từng người (cho gợi ý phân công)
# =====================================================================
def build_worker_rows(raw_rows) -> list[dict]:
    """Tổng hợp kinh nghiệm logtime theo từng người.

    Trả về 2 loại dòng:
      scope='job'   -> người đó đã làm bao nhiêu lần loại việc (写植, レタッチ...)
      scope='title' -> người đó đã làm bao nhiêu lần tác phẩm cụ thể
    """
    accs: dict[tuple, dict] = {}

    for raw in raw_rows or []:
        row = list(raw) + [""] * 14
        worker = _display(row[7])
        cong_viec = _display(row[2])
        tac_pham = _display(row[3])
        if not worker or not cong_viec:
            continue

        hours = _to_float(row[9])
        minutes = (hours * 60.0) if hours is not None else None
        label = _display(row[11])
        score = _LEVEL_SCORE.get(label)
        date_raw = _display(row[0])
        try:
            parsed_date = task_archive.parse_sheet_date(date_raw)
            date_iso = parsed_date.isoformat() if parsed_date else date_raw
        except Exception:
            date_iso = date_raw

        targets = [("job", cong_viec, "")]
        if tac_pham:
            targets.append(("title", cong_viec, tac_pham))

        for scope, cv, tp in targets:
            key = (worker, scope, _key_text(cv), _key_text(tp))
            acc = accs.get(key)
            if acc is None:
                acc = {
                    "worker": worker,
                    "scope": scope,
                    "cong_viec": cv,
                    "tac_pham": tp,
                    "samples": 0,
                    "minutes": [],
                    "scores": [],
                    "low": 0,
                    "medium": 0,
                    "high": 0,
                    "last_date": "",
                }
                accs[key] = acc
            acc["samples"] += 1
            if minutes is not None and minutes > 0:
                acc["minutes"].append(minutes)
            if score is not None:
                acc["scores"].append(score)
                if score == 1.0:
                    acc["low"] += 1
                elif score == 2.0:
                    acc["medium"] += 1
                elif score == 3.0:
                    acc["high"] += 1
            if date_iso and date_iso > acc["last_date"]:
                acc["last_date"] = date_iso

    rows = []
    for acc in accs.values():
        rows.append({
            "worker": acc["worker"],
            "scope": acc["scope"],
            "cong_viec": acc["cong_viec"],
            "tac_pham": acc["tac_pham"],
            "samples": acc["samples"],
            "avg_minutes": round(mean(acc["minutes"]), 2) if acc["minutes"] else None,
            "difficulty_score": round(mean(acc["scores"]), 4) if acc["scores"] else None,
            "low_count": acc["low"],
            "medium_count": acc["medium"],
            "high_count": acc["high"],
            "last_date": acc["last_date"],
        })
    return rows


_WORKER_COLS = [
    "worker", "scope", "cong_viec", "tac_pham", "samples", "avg_minutes",
    "difficulty_score", "low_count", "medium_count", "high_count", "last_date",
    "run_id", "updated_at",
]


def save_worker_rows(rows: list[dict], store=None) -> int:
    """Ghi bảng worker_skill (upsert + xoá dòng cũ)."""
    store = store or get_store()
    ensure_schema(store)

    run_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    updated_at = _iso_now()
    cols_sql = ", ".join(_WORKER_COLS)
    one_row = "(" + ", ".join("?" for _ in _WORKER_COLS) + ")"
    updates_sql = ", ".join(
        f"{col}=excluded.{col}" for col in _WORKER_COLS
        if col not in ("worker", "scope", "cong_viec", "tac_pham")
    )

    written = 0
    for start in range(0, len(rows), 40):
        chunk = rows[start:start + 40]
        if not chunk:
            continue
        sql = (
            f"INSERT INTO worker_skill ({cols_sql}) VALUES "
            + ", ".join(one_row for _ in chunk)
            + " ON CONFLICT(worker, scope, cong_viec, tac_pham) DO UPDATE SET "
            + updates_sql
        )
        args = []
        for item in chunk:
            args.extend([
                item.get("worker"), item.get("scope"), item.get("cong_viec"),
                item.get("tac_pham") or "", int(item.get("samples") or 0),
                item.get("avg_minutes"), item.get("difficulty_score"),
                int(item.get("low_count") or 0), int(item.get("medium_count") or 0),
                int(item.get("high_count") or 0), item.get("last_date") or "",
                run_id, updated_at,
            ])
        store.execute(sql, args)
        written += len(chunk)

    store.execute("DELETE FROM worker_skill WHERE run_id <> ?", (run_id,))
    return written


def load_worker_skills(store=None) -> dict[str, dict]:
    """Đọc worker_skill -> dict theo worker, key job/title đã chuẩn hoá."""
    store = store or get_store()
    ensure_schema(store)
    cols, rows = store.execute(
        "SELECT worker, scope, cong_viec, tac_pham, samples, avg_minutes, "
        "difficulty_score, low_count, medium_count, high_count, last_date "
        "FROM worker_skill"
    )
    out = {}
    for values in rows:
        item = dict(zip(cols, values))
        worker = item.pop("worker")
        scope = item.pop("scope")
        cong_viec = item.pop("cong_viec")
        tac_pham = item.pop("tac_pham") or ""
        bucket = out.setdefault(worker, {
            "job": {}, "title": {}, "total_samples": 0, "total_minutes": 0.0,
        })
        if scope == "job":
            key = job_key(cong_viec)
        else:
            key = title_key(cong_viec, tac_pham)
        bucket[scope][key] = item
        samples = int(item.get("samples") or 0)
        bucket["total_samples"] += samples
        if item.get("avg_minutes") and samples:
            bucket["total_minutes"] += float(item["avg_minutes"]) * samples
    return out


def estimate_hours(task: dict, diff_map: dict | None = None) -> tuple[float, str]:
    """Ước lượng số giờ cho 1 task từ độ khó + số trang.

    Trả về ``(hours, source)``. source = exact/title/job/default.
    """
    diff_map = diff_map or {}
    pages = _to_float(task.get("page"))
    cv = task.get("cong_viec", "")
    tp = task.get("tac_pham", "")
    candidates = [
        (diff_map.get(task_key(cv, tp, task.get("tap", ""), task.get("chuong", ""))), "exact"),
        (diff_map.get(title_key(cv, tp)), "title"),
        (diff_map.get(job_key(cv)), "job"),
    ]
    for item, source in candidates:
        if not item:
            continue
        mpp = item.get("minutes_per_page")
        if pages and mpp and float(mpp) > 0:
            return round((pages * float(mpp)) / 60.0, 2), source
        if item.get("avg_minutes"):
            return round(float(item["avg_minutes"]) / 60.0, 2), source
    return 4.0, "default"


# =====================================================================
# Ghi / đọc DB
# =====================================================================
def _row_values(row: dict, run_id: str, updated_at: str):
    return [
        row.get("task_key"), run_id, row.get("scope"), row.get("cong_viec"),
        row.get("tac_pham"), row.get("tap"), row.get("chuong"), row.get("level"),
        row.get("score"), row.get("samples", 0), row.get("avg_minutes"),
        row.get("avg_pages"), row.get("minutes_per_page"), row.get("q33_minutes"),
        row.get("q67_minutes"), row.get("source"), row.get("breakdown"), updated_at,
    ]


def save_rows(rows: list[dict], logtime_rows: int = 0, store=None) -> int:
    """Ghi toàn bộ bảng độ khó. Dùng INSERT nhiều dòng để sync nhanh trên Turso."""
    store = store or get_store()
    ensure_schema(store)

    run_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    updated_at = _iso_now()

    # 40 dòng x 18 cột = 720 tham số/câu lệnh -> an toàn cho SQLite lẫn Turso.
    chunk_size = 40
    cols_sql = ", ".join(_COLS)
    one_row = "(" + ", ".join("?" for _ in _COLS) + ")"
    updates_sql = ", ".join(
        f"{col}=excluded.{col}" for col in _COLS if col not in ("task_key",)
    )

    written = 0
    for start in range(0, len(rows), chunk_size):
        chunk = rows[start:start + chunk_size]
        if not chunk:
            continue
        sql = (
            f"INSERT INTO task_difficulty ({cols_sql}) VALUES "
            + ", ".join(one_row for _ in chunk)
            + f" ON CONFLICT(task_key) DO UPDATE SET {updates_sql}"
        )
        args = []
        for item in chunk:
            args.extend(_row_values(item, run_id, updated_at))
        store.execute(sql, args)
        written += len(chunk)

    # Xoá các key không còn xuất hiện trong lần đồng bộ này.
    store.execute("DELETE FROM task_difficulty WHERE run_id <> ?", (run_id,))

    store.execute(
        """
        INSERT INTO difficulty_sync (id, last_sync_at, logtime_rows, tasks_written, status, message)
        VALUES (1, ?, ?, ?, 'ok', '')
        ON CONFLICT(id) DO UPDATE SET
            last_sync_at=excluded.last_sync_at,
            logtime_rows=excluded.logtime_rows,
            tasks_written=excluded.tasks_written,
            status=excluded.status,
            message=excluded.message
        """,
        (updated_at, int(logtime_rows or 0), written),
    )
    return written


def mark_sync_error(message: str, store=None):
    """Ghi trạng thái lỗi để UI hiển thị (không làm mất dữ liệu cũ)."""
    try:
        store = store or get_store()
        ensure_schema(store)
        store.execute(
            """
            INSERT INTO difficulty_sync (id, last_sync_at, status, message)
            VALUES (1, ?, 'error', ?)
            ON CONFLICT(id) DO UPDATE SET status='error', message=excluded.message
            """,
            (_iso_now(), str(message or "")[:1000]),
        )
    except Exception as exc:  # pragma: no cover - chỉ log
        print("task_difficulty: không ghi được trạng thái lỗi:", exc)


def load_map(store=None) -> dict[str, dict]:
    """Đọc toàn bộ bảng độ khó -> dict theo task_key."""
    store = store or get_store()
    ensure_schema(store)
    cols, rows = store.execute(
        "SELECT task_key, scope, cong_viec, tac_pham, tap, chuong, level, score, "
        "samples, avg_minutes, avg_pages, minutes_per_page, q33_minutes, q67_minutes, "
        "source, breakdown FROM task_difficulty"
    )
    out = {}
    for values in rows:
        item = dict(zip(cols, values))
        breakdown = item.get("breakdown")
        if isinstance(breakdown, str) and breakdown:
            try:
                item["breakdown"] = json.loads(breakdown)
            except (TypeError, ValueError):
                item["breakdown"] = {}
        else:
            item["breakdown"] = {}
        out[item["task_key"]] = item
    return out


def get_sync_meta(store=None) -> dict:
    store = store or get_store()
    ensure_schema(store)
    cols, rows = store.execute(
        "SELECT last_sync_at, logtime_rows, tasks_written, status, message "
        "FROM difficulty_sync WHERE id = 1"
    )
    if not rows:
        return {}
    return dict(zip(cols, rows[0]))


def clear(store=None):
    store = store or get_store()
    ensure_schema(store)
    store.execute("DELETE FROM task_difficulty")
    store.execute("DELETE FROM difficulty_sync")


# =====================================================================
# Tra cứu cho 1 task
# =====================================================================
def _result_from_db(item: dict, task: dict) -> dict:
    level = item.get("level") or "unknown"
    scope = item.get("scope")
    samples = int(item.get("samples") or 0)
    source = item.get("source") or "logtime"
    breakdown = item.get("breakdown") or {}

    if source == "logtime" and samples:
        detail = f"Dựa trên {samples} lần logtime"
        if any(breakdown.values()):
            detail += (
                f" (低 {breakdown.get('low', 0)} · "
                f"中 {breakdown.get('medium', 0)} · "
                f"高 {breakdown.get('high', 0)})"
            )
    elif source == "estimate":
        pages = _display(task.get("page"))
        mpp = item.get("minutes_per_page")
        if pages and mpp:
            detail = f"Ước lượng: {pages} trang × {float(mpp):.1f} phút/trang"
        else:
            detail = "Ước lượng từ thời gian logtime cùng loại việc"
    elif source == "baseline":
        detail = f"Theo loại việc {item.get('cong_viec') or ''}".strip()
    else:
        detail = "Chưa có dữ liệu logtime"

    return {
        "level": level,
        "label": level_label(level),
        "source": source,
        "scope": scope,
        "samples": samples,
        "score": item.get("score"),
        "breakdown": breakdown,
        "detail": detail,
    }


def resolve(task: dict, diff_map: dict | None = None) -> dict:
    """Trả về độ khó cho 1 task (dict có cong_viec/tac_pham/tap/chuong/page)."""
    diff_map = diff_map or {}
    cong_viec = task.get("cong_viec", "")
    tac_pham = task.get("tac_pham", "")
    tap = task.get("tap", "")
    chuong = task.get("chuong", "")

    exact = diff_map.get(task_key(cong_viec, tac_pham, tap, chuong))
    if exact and int(exact.get("samples") or 0) > 0:
        return _result_from_db(exact, task)

    title = diff_map.get(title_key(cong_viec, tac_pham))
    if title and int(title.get("samples") or 0) > 0:
        return _result_from_db(title, task)

    job = diff_map.get(job_key(cong_viec))
    if job:
        # Ưu tiên ước lượng theo số trang của chính task sắp phân công.
        pages = _to_float(task.get("page"))
        mpp = job.get("minutes_per_page")
        if pages and mpp:
            expected = pages * float(mpp)
            level = _level_from_minutes(
                expected, job.get("q33_minutes"), job.get("q67_minutes")
            )
            if level:
                item = dict(job)
                item["level"] = level
                item["source"] = "estimate"
                return _result_from_db(item, task)

        if int(job.get("samples") or 0) > 0:
            return _result_from_db(job, task)

        # Chưa có nhãn và cũng không có số trang: dùng thời gian trung bình.
        level = _level_from_minutes(
            job.get("avg_minutes"), job.get("q33_minutes"), job.get("q67_minutes")
        )
        if level:
            item = dict(job)
            item["level"] = level
            item["source"] = "estimate"
            return _result_from_db(item, task)

    return {
        "level": "unknown",
        "label": level_label("unknown"),
        "source": "none",
        "scope": None,
        "samples": 0,
        "score": None,
        "breakdown": {},
        "detail": "Chưa có dữ liệu logtime",
    }

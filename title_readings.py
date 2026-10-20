# -*- coding: utf-8 -*-
"""Phiên âm (romaji) cho tên tác phẩm tiếng Nhật.

Cách hoạt động:
1. `data/title_readings.json` là bảng phiên âm đã chốt (key = tên tác phẩm
   đúng như trên Google Sheet). File này được ưu tiên tuyệt đối, ai sửa tay
   trong đó thì kết quả đúng như ý.
2. Nếu tên chưa có trong file, thử chuyển tự động bằng `pykakasi` (tuỳ chọn).
   Không cài pykakasi thì chỉ những tên có trong file mới hiện phiên âm.

Sinh lại file:
    python scripts/build_title_readings.py
"""

import json
import os
import re
import threading
import unicodedata

ROOT = os.path.dirname(os.path.abspath(__file__))
READINGS_PATH = os.path.join(ROOT, "data", "title_readings.json")

_lock = threading.Lock()
_cache = {"mtime": None, "data": {}}
_auto_cache = {}
_kakasi = None
_kakasi_failed = False

# Khoảng trắng thừa trước các dấu này sẽ bị bỏ
_TIGHT_BEFORE = ",.;:!?、。，．：！？)]}）】」』"
_TIGHT_AFTER = "([{（【「『"


def normalize_key(text):
    """Chuẩn hoá khoá tra cứu (NFKC + gộp khoảng trắng)."""
    text = unicodedata.normalize("NFKC", str(text or "")).strip()
    return re.sub(r"\s+", " ", text)


def load_readings():
    """Đọc data/title_readings.json, cache theo mtime."""
    try:
        mtime = os.path.getmtime(READINGS_PATH)
    except OSError:
        return {}
    with _lock:
        if _cache["mtime"] == mtime:
            return _cache["data"]

    try:
        with open(READINGS_PATH, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except Exception as exc:  # pragma: no cover - file lỗi thì bỏ qua
        print("Không đọc được title_readings.json:", exc)
        return {}

    data = {}
    for key, value in (raw or {}).items():
        k = normalize_key(key)
        v = str(value or "").strip()
        if k and v:
            data[k] = v

    with _lock:
        _cache["mtime"] = mtime
        _cache["data"] = data
    return data


def clean_romaji(text):
    """Dọn chuỗi romaji thô của pykakasi cho dễ đọc."""
    s = str(text or "")
    s = s.replace("・", " ").replace("～", "~").replace("〜", "~")
    # Bỏ khoảng trắng quanh dấu câu
    s = re.sub(r"\s+([" + re.escape(_TIGHT_BEFORE) + r"])", r"\1", s)
    s = re.sub(r"([" + re.escape(_TIGHT_AFTER) + r"])\s+", r"\1", s)
    s = re.sub(r"\s*~\s*", "~", s)
    s = re.sub(r"\s*&\s*", " & ", s)
    s = re.sub(r"\s*×\s*", " × ", s)
    # "! !" -> "!!"
    s = re.sub(r"([!?])\s+(?=[!?])", r"\1", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Trợ từ hay bị phiên âm sai
    s = re.sub(r"(?i)(?<=\s)ha(?=\s|$)", "wa", s)
    s = re.sub(r"(?i)(?<=\s)wo(?=\s|$)", "o", s)
    s = re.sub(r"(?i)(?<=\s)he(?=\s|$)", "e", s)
    # Viết hoa chữ đầu (giữ nguyên các từ Latin in hoa sẵn)
    if s and s[0].isalpha():
        s = s[0].upper() + s[1:]
    return s


def _get_kakasi():
    global _kakasi, _kakasi_failed
    if _kakasi is not None or _kakasi_failed:
        return _kakasi
    try:
        import pykakasi
        _kakasi = pykakasi.kakasi()
    except Exception:
        _kakasi_failed = True
        _kakasi = None
    return _kakasi


def auto_reading(text):
    """Chuyển tự động Nhật -> romaji bằng pykakasi (rỗng nếu không có)."""
    key = normalize_key(text)
    if not key:
        return ""
    if key in _auto_cache:
        return _auto_cache[key]
    kakasi = _get_kakasi()
    if kakasi is None:
        _auto_cache[key] = ""
        return ""
    try:
        parts = [item.get("hepburn", "") for item in kakasi.convert(key)]
        result = clean_romaji("".join(parts) if _is_kana_only(key) else " ".join(parts))
    except Exception:
        result = ""
    _auto_cache[key] = result
    return result


def _is_kana_only(text):
    """Chuỗi chỉ gồm kana (không khoảng trắng) thì ghép liền cho gọn."""
    has_kana = False
    for ch in text:
        if ch.isspace():
            return False
        code = ord(ch)
        if 0x3040 <= code <= 0x30FF or ch in "ー・":
            has_kana = True
        elif ch.isascii() and (ch.isalnum() or ch in "-_"):
            continue
        elif unicodedata.category(ch).startswith("P"):
            continue
        else:
            return False
    return has_kana


def reading_for(tac_pham):
    """Phiên âm cho 1 tên tác phẩm (chuỗi rỗng nếu chưa có)."""
    key = normalize_key(tac_pham)
    if not key:
        return ""
    found = load_readings().get(key)
    if found:
        return found
    return auto_reading(key)


def reading_for_key(tp_key, tac_pham=None):
    """Phiên âm cho khoá task dạng "<công việc> - <tập>_<tên tác phẩm>"."""
    if tac_pham:
        return reading_for(tac_pham)
    key = normalize_key(tp_key)
    if not key:
        return ""
    rest = key.split(" - ", 1)[1] if " - " in key else key
    readings = load_readings()
    for candidate in (
        rest,
        re.sub(r"^[0-9]+(?:\.[0-9]+)?_", "", rest),
    ):
        found = readings.get(candidate)
        if found:
            return found
    title = re.sub(r"^[0-9]+(?:\.[0-9]+)?_", "", rest)
    return auto_reading(title)

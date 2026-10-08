import sys
import os

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import uuid
import zipfile
import io
import base64
import gspread
from flask import send_file
import shutil
from werkzeug.utils import secure_filename
from flask import send_from_directory
import time
import threading
from datetime import datetime, timezone, timedelta
import hashlib
import pandas as pd
import requests
import re
import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from markupsafe import Markup
from dateutil import parser as date_parser

from flask_socketio import SocketIO, emit, join_room, leave_room

# =====================================================================
# 1. CẤU HÌNH FLASK & SOCKETIO
# =====================================================================
# Tự động nạp biến môi trường từ env_vars.yaml nếu có
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'env_vars.yaml')
if os.path.exists(env_path):
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                if ':' in line and not line.strip().startswith('#'):
                    k, v = line.split(':', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v
    except Exception as e:
        print("Failed to load env_vars.yaml:", e)
app = Flask(__name__)

DRIVE_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "drive_data")
# Vercel (và các môi trường serverless) có filesystem chỉ đọc, chỉ /tmp ghi được.
if os.environ.get('VERCEL') or not os.access(os.path.dirname(DRIVE_ROOT), os.W_OK):
    DRIVE_ROOT = os.path.join('/tmp', 'drive_data')
try:
    os.makedirs(DRIVE_ROOT, exist_ok=True)
except OSError:
    # Filesystem chỉ đọc: bỏ qua để app vẫn import được, tính năng drive sẽ báo lỗi khi dùng.
    pass
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.secret_key = os.environ.get('SECRET_KEY', 'vn-tracking-secret-' + hashlib.md5(b'vn-tracking-2024').hexdigest())
# async_mode: local dùng 'threading' (Werkzeug dev server); trên Cloud Run/gunicorn
# đặt SOCKETIO_ASYNC_MODE=eventlet để WebSocket hoạt động chuẩn.
_SOCKETIO_ASYNC_MODE = os.environ.get('SOCKETIO_ASYNC_MODE', 'threading')
socketio = SocketIO(app, cors_allowed_origins="*", async_mode=_SOCKETIO_ASYNC_MODE, manage_session=False)

# ==================== PHIÊN BẢN VÀ BUILD AUTO-RELOAD ====================
SERVER_START_TIME = int(time.time())

def get_current_app_version():
    """Lấy phiên bản hiện tại từ templates/dashboard.html"""
    try:
        t_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates', 'dashboard.html')
        if os.path.exists(t_path):
            with open(t_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read(50000)
            m = re.search(r'class="version-tag"[^>]*><i>([^<]+)</i>', content)
            if m:
                return m.group(1).strip()
            m2 = re.search(r'v1\.\d+\.\d+', content)
            if m2:
                return m2.group(0).strip()
    except Exception:
        pass
    return "v1.7.3"

def get_current_build_id():
    cur_ver = get_current_app_version()
    return f"{cur_ver}_{SERVER_START_TIME}"

# 2. CƠ SỞ DỮ LIỆU TÀI KHOẢN VÀ LINK DỮ LIỆU
# =====================================================================
USER_SHEET_URL = "https://docs.google.com/spreadsheets/d/1VLlDF5XoXt0Rz0ACZ3EZRKcKWFnIRXptMPbQthimNE0/export?format=csv&gid=0"

CHANGE_PASS_API = "https://script.google.com/macros/s/AKfycbzf59j11q0IfvgjRkhvUx6EhnSdssGbvpp3PnKQGL4JUmJC2w2uidZi0BKygpriqMVB/exec"
LOGTIME_API_URL = "https://script.google.com/macros/s/AKfycbzZ--vv1xsR8u5pFKFqK7N_PCYwGnpl-yvyOVt15rXSoI99hJTwQV5WBXXMXiGMApljig/exec"

# ==================== CẤU HÌNH LOGTIME GSPREAD ====================
LOGTIME_SPREADSHEET_ID = '1dkCu_HUs12DTas--yZlDTB9M17DKnUGBvWJ6vdVuIGU'
LOGTIME_SHEET_NAME = '日報'
logtime_submit_lock = threading.Lock()
_logtime_ws_cache = {}  # (spreadsheet_id, tab) -> gspread Worksheet đã xác thực, tái sử dụng để lưu nhanh hơn
creds_path = 'credentials.json'
scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
last_sheet_error = ""

def load_credentials_dict():
    global last_sheet_error
    if os.path.exists(creds_path):
        try:
            with open(creds_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            last_sheet_error = f"Lỗi đọc credentials.json: {e}"
            print(last_sheet_error)

    raw_val = (
        os.environ.get('GOOGLE_CREDENTIALS_B64') or
        os.environ.get('GOOGLE_CREDENTIALS') or
        os.environ.get('GOOGLE_SHEETS_CREDENTIALS') or
        ''
    ).strip()

    if not raw_val:
        last_sheet_error = "Chưa cấu hình credentials.json hoặc biến môi trường GOOGLE_CREDENTIALS_B64 / GOOGLE_CREDENTIALS trên server."
        return None

    if (raw_val.startswith('"') and raw_val.endswith('"')) or (raw_val.startswith("'") and raw_val.endswith("'")):
        raw_val = raw_val[1:-1].strip()

    if raw_val.startswith('{'):
        try:
            return json.loads(raw_val)
        except Exception as e:
            last_sheet_error = f"Lỗi parse JSON credentials: {e}"
            print(last_sheet_error)
            return None

    try:
        s = raw_val.replace('-', '+').replace('_', '/')
        s = re.sub(r'[^A-Za-z0-9+/=]', '', s)
        s = s.rstrip('=')
        s += '=' * ((4 - len(s) % 4) % 4)
        decoded = base64.b64decode(s).decode('utf-8')
        return json.loads(decoded)
    except Exception as e:
        last_sheet_error = f"Lỗi giải mã Base64 GOOGLE_CREDENTIALS: {e}"
        print(last_sheet_error)
        return None

def get_gspread_client():
    global last_sheet_error
    creds_dict = load_credentials_dict()
    if not creds_dict:
        return None

    if 'private_key' in creds_dict and isinstance(creds_dict['private_key'], str):
        creds_dict['private_key'] = creds_dict['private_key'].replace('\\n', '\n')
        if 'EKmHf/h)AgMBAAE' in creds_dict['private_key']:
            creds_dict['private_key'] = creds_dict['private_key'].replace('EKmHf/h)AgMBAAE', 'EKmHf/gpAgMBAAE')

    creds = None
    try:
        from google.oauth2.service_account import Credentials
        creds = Credentials.from_service_account_info(creds_dict, scopes=scope)
    except Exception as e1:
        try:
            from oauth2client.service_account import ServiceAccountCredentials
            creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        except Exception as e2:
            last_sheet_error = f"Lỗi tạo Credentials: {e1} | {e2}"
            print(last_sheet_error)
            return None

    try:
        client = gspread.authorize(creds)
        last_sheet_error = ""
        return client
    except Exception as e:
        last_sheet_error = f"Lỗi kết nối Google Sheets: {e}"
        print(last_sheet_error)
        return None

def get_sheet():
    client = get_gspread_client()
    if not client:
        return None
    try:
        return client.open_by_key(LOGTIME_SPREADSHEET_ID)
    except Exception as e:
        print("Lỗi open_by_key LOGTIME_SPREADSHEET_ID:", e)
        return None
# ==================================================================

url = "https://docs.google.com/spreadsheets/d/1ec_v1hsKu0oCOwyrFNgxckpoaq3Q02J4NdIchqbYE3s/edit?gid=597870203#gid=597870203"
csv_url = url.split("/edit")[0] + "/export?format=csv" if "/edit" in url else url

url_after_week = "https://docs.google.com/spreadsheets/d/1ec_v1hsKu0oCOwyrFNgxckpoaq3Q02J4NdIchqbYE3s/edit?gid=597870203#gid=597870203"
csv_url_truoc = url_after_week.split("/edit")[0] + "/export?format=csv&" + url_after_week.split("#")[1] if "#gid" in url_after_week else url_after_week



COLS = ['Công việc', 'Tên tác phẩm', 'Chương', 'Tập', 'Số trang', 'NXB', 'Ngày bắt đầu', 'Deadline (Nộp)', 'VN', 'Người thực hiện', 'QC Nội bộ', 'Quản lý', 'Trạng thái', 'Bắt đầu', 'Start', 'End', 'Ghi chú']

VNTASK_URL = "https://docs.google.com/spreadsheets/d/1ec_v1hsKu0oCOwyrFNgxckpoaq3Q02J4NdIchqbYE3s/gviz/tq?tqx=out:csv&sheet=VN-task"

# =====================================================================
# 3. SIMPLE CACHE
# =====================================================================
_cache = {}

def cached(ttl=60):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = func.__name__ + str(args)
            now = time.time()
            if key in _cache and now - _cache[key]['time'] < ttl:
                return _cache[key]['data']
            result = func(*args, **kwargs)
            _cache[key] = {'data': result, 'time': now}
            return result
        return wrapper
    return decorator

# =====================================================================
# 3.1 BOT DỊCH THUẬT (TRANSLATION AI)
# =====================================================================
def is_japanese(text):
    # Matches Hiragana, Katakana, and common Kanji ranges
    return bool(re.search(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]', text))

def translate_text(text, target_lang):
    if not text or not text.strip():
        return ""
    # 1. Thử qua Google Translate client dict-chrome-ex (nhanh, chuẩn xác, không bị lỗi 429)
    url = "https://translate.googleapis.com/translate_a/single"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
    for client in ['dict-chrome-ex', 'gtx']:
        params = {
            "client": client,
            "sl": "auto",
            "tl": target_lang,
            "dt": "t",
            "q": text
        }
        try:
            res = requests.get(url, params=params, headers=headers, timeout=5)
            if res.status_code == 200:
                data = res.json()
                if data and len(data) > 0 and data[0]:
                    translated = "".join([x[0] for x in data[0] if x and len(x) > 0 and x[0]])
                    if translated.strip():
                        return translated.strip()
        except Exception:
            continue

    # 2. Fallback qua MyMemory Translation API nếu Google trục trặc
    try:
        source_lang = 'ja' if target_lang == 'vi' else 'vi'
        url_mm = "https://api.mymemory.translated.net/get"
        params_mm = {"q": text, "langpair": f"{source_lang}|{target_lang}"}
        res_mm = requests.get(url_mm, params=params_mm, headers=headers, timeout=5)
        if res_mm.status_code == 200:
            data_mm = res_mm.json()
            if 'responseData' in data_mm and 'translatedText' in data_mm['responseData']:
                trans = data_mm['responseData']['translatedText']
                if trans and not str(trans).startswith("MYMEMORY WARNING"):
                    return str(trans).strip()
    except Exception:
        pass

    return "Không thể kết nối dịch vụ dịch thuật lúc này. Vui lòng thử lại sau."

def clear_cache(func_name=None):
    global _cache
    if func_name:
        _cache = {k: v for k, v in _cache.items() if not k.startswith(func_name)}
    else:
        _cache = {}

# =====================================================================
# 4. HÀM TẢI DỮ LIỆU
# =====================================================================
def fix_drive_url(url):
    if not url or not isinstance(url, str): return url
    file_id = None
    match = re.search(r'drive\.google\.com/file/d/([^/]+)', url)
    if match:
        file_id = match.group(1)
    else:
        match_open = re.search(r'drive\.google\.com/open\?id=([^&]+)', url)
        if match_open:
            file_id = match_open.group(1)
    if not file_id:
        # Try thumbnail URL pattern
        match_thumb = re.search(r'drive\.google\.com/thumbnail\?id=([^&]+)', url)
        if match_thumb:
            file_id = match_thumb.group(1)
    if not file_id:
        # Try lh3.googleusercontent.com/d/{id}
        match_lh3 = re.search(r'lh3\.googleusercontent\.com/d/([^/?]+)', url)
        if match_lh3:
            file_id = match_lh3.group(1)
    if file_id:
        return f"/api/avatar-proxy?id={file_id}"
    return url

@cached(ttl=300)
def load_users_from_sheet(url):
    try:
        df_users = pd.read_csv(url).dropna(subset=['Username', 'Password'])
        users = {}
        for _, row in df_users.iterrows():
            username = str(row.iloc[0]).strip()
            password = str(row.iloc[1]).strip()
            role = str(row.iloc[2]).strip().lower() if len(row) > 2 else "user"
            fullname = str(row.iloc[3]).strip() if len(row) > 3 and not pd.isna(row.iloc[3]) and str(row.iloc[3]).strip() not in ['nan', 'NaN', ''] else ""
            gender = str(row.iloc[4]).strip() if len(row) > 4 and not pd.isna(row.iloc[4]) and str(row.iloc[4]).strip() not in ['nan', 'NaN', ''] else ""
            
            # Format birth year to remove .0
            birth_year_raw = row.iloc[5] if len(row) > 5 else None
            if pd.notna(birth_year_raw) and str(birth_year_raw).strip() not in ['nan', 'NaN', '']:
                try:
                    birth_year = str(int(float(birth_year_raw)))
                except ValueError:
                    birth_year = str(birth_year_raw).strip()
            else:
                birth_year = ""
                
            avatar_raw = str(row.iloc[6]).strip() if len(row) > 6 and not pd.isna(row.iloc[6]) and str(row.iloc[6]).strip() not in ['nan', 'NaN', ''] else ""
            avatar = fix_drive_url(avatar_raw)
            team = str(row.iloc[7]).strip() if len(row) > 7 and not pd.isna(row.iloc[7]) and str(row.iloc[7]).strip() not in ['nan', 'NaN', ''] else ""
            users[username] = {
                "password": password, 
                "role": role,
                "fullname": fullname,
                "gender": gender,
                "birth_year": birth_year,
                "avatar": avatar,
                "team": team
            }
            
        return users
    except Exception:
        return {}

_checklist_cache = None
_checklist_cache_time = 0
checklist_lock = threading.Lock()
checklist_version = 0


def get_supabase_checklists(force_refresh=False):
    global _checklist_cache, _checklist_cache_time
    now = time.time()
    if not force_refresh and _checklist_cache is not None and (now - _checklist_cache_time < 5):
        return _checklist_cache
    try:
        data = sb_download_bytes('_system/checklists.json')
        if data:
            _checklist_cache = json.loads(data.decode('utf-8'))
        else:
            if _checklist_cache is None:
                _checklist_cache = {}
        _checklist_cache_time = now
    except Exception as e:
        print("Error downloading checklists from Supabase:", e)
        if _checklist_cache is None:
            _checklist_cache = {}
    return _checklist_cache

def save_supabase_checklists(data):
    global _checklist_cache, _checklist_cache_time
    with checklist_lock:
        _checklist_cache = data
        _checklist_cache_time = time.time()
        try:
            json_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
            sb_upload('_system/checklists.json', json_bytes, content_type='application/json')
        except Exception as e:
            print("Error uploading checklists to Supabase:", e)

_task_comments_cache = None
_task_comments_cache_time = 0
task_comments_lock = threading.Lock()

def get_supabase_task_comments(force_refresh=False):
    global _task_comments_cache, _task_comments_cache_time
    now = time.time()
    if not force_refresh and _task_comments_cache is not None and (now - _task_comments_cache_time < 5):
        return _task_comments_cache
    try:
        data = sb_download_bytes('_system/task_comments.json')
        if data:
            _task_comments_cache = json.loads(data.decode('utf-8'))
        else:
            if _task_comments_cache is None:
                _task_comments_cache = {}
        _task_comments_cache_time = now
    except Exception as e:
        print("Error downloading task comments from Supabase:", e)
        if _task_comments_cache is None:
            _task_comments_cache = {}
    return _task_comments_cache

def save_supabase_task_comments(data):
    global _task_comments_cache, _task_comments_cache_time
    with task_comments_lock:
        _task_comments_cache = data
        _task_comments_cache_time = time.time()
        try:
            json_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
            sb_upload('_system/task_comments.json', json_bytes, content_type='application/json')
        except Exception as e:
            print("Error uploading task comments to Supabase:", e)

_task_links_cache = None
_task_links_cache_time = 0
task_links_lock = threading.Lock()

def get_supabase_task_links(force_refresh=False):
    global _task_links_cache, _task_links_cache_time
    now = time.time()
    if not force_refresh and _task_links_cache is not None and (now - _task_links_cache_time < 5):
        return _task_links_cache
    try:
        data = sb_download_bytes('_system/task_links.json')
        if data:
            _task_links_cache = json.loads(data.decode('utf-8'))
        else:
            if _task_links_cache is None:
                _task_links_cache = {}
        _task_links_cache_time = now
    except Exception as e:
        print("Error downloading task links from Supabase:", e)
        if _task_links_cache is None:
            _task_links_cache = {}
    return _task_links_cache

def save_supabase_task_links(data):
    global _task_links_cache, _task_links_cache_time
    with task_links_lock:
        _task_links_cache = data
        _task_links_cache_time = time.time()
        try:
            json_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
            sb_upload('_system/task_links.json', json_bytes, content_type='application/json')
        except Exception as e:
            print("Error uploading task links to Supabase:", e)

def load_checklist_data(api_url=None):
    data = get_supabase_checklists()
    rows = []
    for tp_key, cbs in data.items():
        for cb_id, status in cbs.items():
            if cb_id == '_rewarded':
                continue
            rows.append({
                'Tên Tác Phẩm': tp_key,
                'Checkbox ID': cb_id,
                'Trạng Thái': status,
                'Thời Gian': ''
            })
    if rows:
        return pd.DataFrame(rows)
    return pd.DataFrame(columns=['Tên Tác Phẩm', 'Checkbox ID', 'Trạng Thái', 'Thời Gian'])

@cached(ttl=180)
def load_sheet_data(url):
    try:
        df = pd.read_csv(url, usecols=list(range(1, 18)), header=None)
        df.columns = COLS
        if df.empty:
            raise Exception("DataFrame rỗng")
        return df
    except Exception as e:
        import traceback
        print("Lỗi load_sheet_data:", e)
        traceback.print_exc()
        raise e

@cached(ttl=120)
def load_vntask_details():
    combined = []
    seen = set()
    current_year = date.today().year

    def extract_tasks_from_df(df_target, default_tag=None):
        if df_target is None or df_target.empty:
            return []
            
        start_col = None
        for c in df_target.columns:
            if str(c).strip().lower() == 'start':
                start_col = c
                break
        if not start_col:
            for c in df_target.columns:
                if any(k in str(c) for k in ['開始日', 'Ngày bắt đầu']):
                    start_col = c
                    break
        if not start_col:
            for c in df_target.columns:
                if any(k in str(c).lower() for k in ['start', 'bắt đầu']):
                    start_col = c
                    break
                    
        end_col = None
        for c in df_target.columns:
            if str(c).strip().lower() == 'end':
                end_col = c
                break
        if not end_col:
            for c in df_target.columns:
                c_str = str(c).strip().lower()
                if 'kết thúc' in c_str or 'deadline' in c_str or 'hạn chót' in c_str:
                    end_col = c
                    break

        job_col = None
        for c in df_target.columns:
            if any(k in str(c) for k in ['作業内容', 'Công việc']):
                job_col = c
                break

        task_col = None
        for c in df_target.columns:
            if any(k in str(c) for k in ['作品名', 'Tên tác phẩm']):
                task_col = c
                break

        tap_col = None
        for c in df_target.columns:
            if any(k in str(c).lower() for k in ['tập', '巻']):
                tap_col = c
                break

        chuong_col = None
        for c in df_target.columns:
            if any(k in str(c).lower() for k in ['chương', '話']):
                chuong_col = c
                break

        worker_col = None
        for c in df_target.columns:
            if any(k in str(c) for k in ['作業者', 'Người thực hiện']):
                worker_col = c
                break

        if not start_col:
            return []

        res = []
        for _, row in df_target.iterrows():
            val = ""
            end_val = str(row[end_col]).strip() if end_col and pd.notna(row.get(end_col)) else ""
            if end_val and end_val not in ['nan', 'NaN', 'None', '', '::', '-', '->']:
                val = end_val
            else:
                start_val = str(row[start_col]).strip() if start_col and pd.notna(row.get(start_col)) else ""
                val = start_val
                
            if val in ['nan', 'NaN', 'None', '', '::', '-', '->']:
                continue

            raw_job = str(row[job_col]).strip() if job_col and pd.notna(row.get(job_col)) else "Khác"
            if '写植/ﾚﾀｯﾁ' in raw_job or '写植/レタッチ' in raw_job or 'Lettering/Retouch' in raw_job:
                job_type = "Lettering/Retouch"
            elif '写植' in raw_job or 'Lettering' in raw_job:
                job_type = "Lettering"
            elif 'レタッチ' in raw_job or 'ﾚﾀｯﾁ' in raw_job or 'Retouch' in raw_job:
                job_type = "Retouch"
            else:
                job_type = "Khác"

            task_name = str(row[task_col]).strip() if task_col and pd.notna(row.get(task_col)) else ""
            if not task_name or task_name in ['nan', 'NaN', 'None', 'Unknown Task', '作品名\nTên tác phẩm']:
                continue

            tap_val = str(row[tap_col]).strip() if tap_col and pd.notna(row.get(tap_col)) else ""
            if tap_val and tap_val not in ['nan', 'NaN', 'None', '']:
                task_name = f"{tap_val}_{task_name}"

            chuong_val = str(row[chuong_col]).strip() if chuong_col and pd.notna(row.get(chuong_col)) else ""
            if chuong_val and chuong_val not in ['nan', 'NaN', 'None', '']:
                task_name = f"{task_name} (Chương {chuong_val})"

            worker = str(row[worker_col]).strip() if worker_col and pd.notna(row.get(worker_col)) else ""
            if worker in ['nan', 'NaN', 'None', '作業者 \nNgười thực hiện']:
                worker = ""

            matches = re.findall(r'\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?', val)
            if not matches:
                continue
            clean_d = matches[-1]
            try:
                dt = date_parser.parse(clean_d, default=datetime(current_year, 1, 1))
                formatted_date = dt.strftime('%Y-%m-%d')
                item = {
                    "date": formatted_date,
                    "taskName": task_name,
                    "worker": worker,
                    "jobType": job_type
                }
                if default_tag:
                    item["weekTag"] = default_tag
                res.append(item)
            except Exception:
                pass
        return res

    def add_tasks(tasks):
        for t in tasks:
            key = (t['date'], t['taskName'], t['worker'], t['jobType'])
            if key not in seen:
                seen.add(key)
                combined.append(t)

    # 1. Nạp từ các tab tuần đang hiển thị trên Dashboard (TUẦN NÀY, TUẦN TRƯỚC, TUẦN SAU)
    try:
        df_raw = load_sheet_data(csv_url)
        df_truoc_raw = load_sheet_data(csv_url_truoc)

        def parse_date_obj(val):
            if not val or pd.isna(val) or str(val).strip() in ['nan', 'None', '', '::', '-', '->']:
                return None
            s = str(val).strip()
            matches = re.findall(r'\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?', s)
            if not matches:
                return None
            clean_d = matches[-1]
            try:
                return date_parser.parse(clean_d, default=datetime(current_year, 1, 1)).date()
            except Exception:
                return None

        combined_all = clean_df(pd.concat([df_raw, df_truoc_raw], ignore_index=True))
        combined_all = combined_all.drop_duplicates(
            subset=['Công việc', 'Tên tác phẩm', 'Chương', 'Tập', 'Người thực hiện'],
            keep='last'
        )

        def get_task_weeks(row):
            start_d = parse_date_obj(row.get('Start'))
            if not start_d: start_d = parse_date_obj(row.get('Ngày bắt đầu'))
            end_d = parse_date_obj(row.get('End'))
            if not end_d: end_d = parse_date_obj(row.get('Ngày kết thúc'))
            if not end_d: end_d = parse_date_obj(row.get('Hạn chót'))
            if not end_d: end_d = parse_date_obj(row.get('Deadline'))
            if not end_d: end_d = parse_date_obj(row.get('Deadline (Nộp)'))
            if start_d and not end_d:
                end_d = start_d
            elif end_d and not start_d:
                start_d = end_d
            if not start_d and not end_d:
                return None, None
            return start_d.isocalendar()[1], end_d.isocalendar()[1]

        sws, ews = [], []
        for _, r in combined_all.iterrows():
            sw, ew = get_task_weeks(r)
            sws.append(sw)
            ews.append(ew)
        combined_all['start_w'] = sws
        combined_all['end_w'] = ews

        current_w = date.today().isocalendar()[1]
        df_tuan_truoc = combined_all[combined_all['end_w'] == (current_w - 1)]
        df_tuan_nay = combined_all[combined_all['end_w'] == current_w]
        df_tuan_sau = combined_all[combined_all['end_w'] >= (current_w + 1)]

        add_tasks(extract_tasks_from_df(df_tuan_nay, 'nay'))
        add_tasks(extract_tasks_from_df(df_tuan_truoc, 'truoc'))
        add_tasks(extract_tasks_from_df(df_tuan_sau, 'sau'))
    except Exception as e:
        print("Error reading dashboard sheets for chart:", e)

    # 2. Thử nạp từ sheet VN-task nếu có dữ liệu hợp lệ
    try:
        df_vntask = pd.read_csv(VNTASK_URL)
        if not df_vntask.empty and len(df_vntask.dropna(subset=[df_vntask.columns[1]])) > 0:
            cutoff_date = date.today() - timedelta(days=date.today().weekday() + 7)
            cutoff_str = cutoff_date.strftime('%Y-%m-%d')
            h_tasks = extract_tasks_from_df(df_vntask)
            add_tasks([t for t in h_tasks if t['date'] < cutoff_str])
    except Exception:
        pass

    # 3. Nạp lịch sử các tháng từ Schedule management - ALL cho VN team
    try:
        import urllib.parse
        sheet_encoded = urllib.parse.quote('Schedule management - ALL')
        base_url = csv_url.split('/export')[0]
        all_url = f"{base_url}/gviz/tq?tqx=out:csv&sheet={sheet_encoded}"
        df_all = pd.read_csv(all_url)
        if not df_all.empty:
            vn_workers = ['Tan', 'Kim', 'Vinh', 'Thao', 'Hieu', 'Tho', 'Khuong', 'Anh', 'Thang']
            worker_pattern = '|'.join(vn_workers)
            worker_cols = [c for c in df_all.columns if '作業者' in c or 'Người thực hiện' in c]
            worker_col = worker_cols[0] if worker_cols else None
            
            is_vn = pd.Series(False, index=df_all.index)
            if 'VN' in df_all.columns:
                is_vn = is_vn | df_all['VN'].astype(str).str.contains('VN', case=False, na=False)
            if worker_col:
                is_vn = is_vn | df_all[worker_col].astype(str).str.contains(worker_pattern, case=False, na=False)
            
            df_all_vn = df_all[is_vn]
            cutoff_date = date.today() - timedelta(days=date.today().weekday() + 7)
            cutoff_str = cutoff_date.strftime('%Y-%m-%d')
            h_tasks = extract_tasks_from_df(df_all_vn)
            add_tasks([t for t in h_tasks if t['date'] < cutoff_str])
    except Exception as e:
        print("Error reading Schedule management - ALL for chart:", e)

    return combined

# =====================================================================
# 5. HÀM XỬ LÝ DỮ LIỆU
# =====================================================================
def get_clean_dates(vals_list):
    valid = []
    for v in vals_list:
        v_str = str(v).strip()
        if v_str in ['nan', 'NaN', 'None', ''] or v_str in [':', '->', '-', '=>']:
            continue
        if 'tuần' not in v_str.lower() and not any(kw in v_str.lower() for kw in ['deadline', 'deadlien', 'hạn chót']) and not v_str.isnumeric() and len(v_str) >= 5:
            valid.append(v_str)
    return valid

def clean_df(df):
    df = df.dropna(subset=['Công việc', 'Tên tác phẩm'])
    df = df[~df['Công việc'].astype(str).str.contains('Công việc|作業内容', na=False, case=False)]
    df = df[df['Công việc'].astype(str).str.strip() != '']
    return df[~df['Công việc'].astype(str).str.lower().isin(['nan', 'none'])]

_logtime_ws_build_locks = {}

def _logtime_targets():
    return [
        (LOGTIME_SPREADSHEET_ID, LOGTIME_SHEET_NAME),
    ]

def _get_logtime_ws(target=None):
    """Lấy worksheet đã xác thực từ cache; nếu chưa có thì kết nối."""
    if target is None:
        target = (LOGTIME_SPREADSHEET_ID, LOGTIME_SHEET_NAME)
    ws = _logtime_ws_cache.get(target)
    if ws is not None:
        return ws
    lock = _logtime_ws_build_locks.setdefault(target, threading.Lock())
    with lock:
        ws = _logtime_ws_cache.get(target)
        if ws is None:
            client = get_gspread_client()
            if not client:
                raise RuntimeError("Không lấy được gspread client: " + str(last_sheet_error))
            ws = client.open_by_key(target[0]).worksheet(target[1])
            _logtime_ws_cache[target] = ws
        return ws

def warmup_logtime_connections():
    """Chạy nền: mở sẵn kết nối tới sheet 日報 để lần bấm Lưu Logtime không phải chờ đăng nhập/mở file."""
    def _warm():
        try:
            _get_logtime_ws()
        except Exception as ex:
            print("Warmup logtime lỗi:", repr(ex))
    threading.Thread(target=_warm, daemon=True).start()

def save_logtime(data):
    ngay_log = str(data.get('ngay_log', '')).replace('-', '/')
    
    def parse_num(val):
        if val is None or str(val).strip() == '':
            return ''
        try:
            f = float(val)
            return int(f) if f.is_integer() else f
        except ValueError:
            return str(val)

    row_data = [
        ngay_log,                               # A: 日にち
        str(data.get('category', '')),          # B: カテゴリ
        str(data.get('cong_viec', '')),         # C: 作業内容
        str(data.get('tac_pham', '')),          # D: 作品名
        parse_num(data.get('chuong')),          # E: 話数
        parse_num(data.get('tap')),             # F: 巻数
        parse_num(data.get('so_trang_tong')),   # G: 総ページ数
        str(data.get('nguoi_thuc_hien', '')),   # H: 作業者
        parse_num(data.get('so_page')),         # I: 作業ページ数 (Số trang làm được)
        parse_num(data.get('so_gio')),          # J: 合計時間 (Giờ làm)
        '',                                     # K: VN
        str(data.get('difficulty', '')),        # L: 難易度
        '',                                     # M: VN依頼可能
        str(data.get('ghi_chu', ''))            # N: 備考
    ]
    
    MAIN_TARGET = (LOGTIME_SPREADSHEET_ID, LOGTIME_SHEET_NAME)

    def _write_row():
        ws = _get_logtime_ws(MAIN_TARGET)
        try:
            ws.append_row(row_data, value_input_option='USER_ENTERED', table_range='A:N')
        except Exception:
            col_a = ws.col_values(1)
            next_row = len(col_a) + 1
            for i, val in enumerate(col_a):
                if i > 0 and not str(val).strip():
                    next_row = i + 1
                    break
            if next_row > ws.row_count:
                ws.add_rows(1)
            ws.update(range_name=f'A{next_row}:N{next_row}', values=[row_data], value_input_option='USER_ENTERED')

    def _write_with_retry():
        try:
            _write_row()
        except Exception:
            _logtime_ws_cache.pop(MAIN_TARGET, None)  # cache có thể cũ/hết hạn -> thử lại 1 lần
            _write_row()

    with logtime_submit_lock:
        try:
            _write_with_retry()
            print(f"==> [Service Account gspread] Đã ghi logtime thành công vào sheet 日報 cho: {row_data[3]} ({row_data[7]})", flush=True)
            return True
        except Exception as ex:
            print("Lỗi khi lưu logtime vào sheet 日報:", repr(ex), flush=True)
            return False



# =====================================================================
# 6. NGÔN NGỮ
# =====================================================================
DICT_LANG = {
    'vi': {
        'welcome': "Welcome back !👋 ",
        'title': "QUẢN LÝ TIẾN ĐỘ TEAM VIỆT NAM", 'filter_title': 'Bộ lọc hiển thị',
        'cv_nay': "Công việc (Tuần Này):", 'nguoi_nay': "Người thực hiện (Tuần Này):",
        'cv_sau': "Công việc (Tuần sau):", 'nguoi_sau': "Người làm (Tuần sau):",
        'tab0': "THÔNG TIN TUẦN TRƯỚC", 'tab1': "THÔNG TIN TUẦN NÀY", 'tab2': "THÔNG TIN TUẦN SAU",
        'time': "Thời gian làm việc:", 'deadline': "Deadline chú ý:",
        'no_filter': "Không có tác phẩm nào khớp với bộ lọc hoặc không có task của bạn!", 'no_task': "Hiện chưa có task nào được phân công!",
        'metric_total': "Tổng số Task", 'metric_retouch': "Số task Retouch", 'metric_type': "Số task Lettering", 'metric_lettering_qc': "Số task Lettering QC", 'metric_lettering_retouch': "Số task Lettering/Retouch", 'metric_prep': "Số task Prep",
        'not_update': "Chưa cập nhật",
        'cols': ['Công việc', 'Tên tác phẩm', 'Chương', 'Tập', 'Số trang', 'NXB', 'Ngày bắt đầu', 'Deadline (Nộp)', 'VN', 'Người thực hiện', 'QC Nội bộ', 'Quản lý', 'Trạng thái', 'Bắt đầu', 'Ghi chú'],
        'logtime_title': "⏱️ KHU VỰC BÁO CÁO TIẾN ĐỘ (LOGTIME & CHECKLIST)",
        'logtime_empty': "Hiện không có task nào để logtime.",
        'f_date': "📅 Ngày làm việc:", 'f_cat': "📚 Loại truyện:", 'f_diff': "🔥 Độ khó:", 'f_worker': "👤 Người làm:",
        'f_hours': "⏱ Giờ làm hôm nay:", 'f_total_pages': "📄 Tổng số trang:", 'f_pages': "✅ Số page HT:", 'f_note': "📝 Ghi chú thêm:",
        'f_btn': "Lưu Logtime",
    },
    'ja': {
        'welcome': "おかえりなさいませ！👋",
        'title': "ベトナムチーム進捗管理", 'filter_title': '表示フィルター',
        'cv_nay': "作業内容 (今週):", 'nguoi_nay': "作業者 (今週):",
        'cv_sau': "作業内容 (来週):", 'nguoi_sau': "作業者 (来週):",
        'tab0': "先週の情報", 'tab1': "今週の情報", 'tab2': "来週の情報",
        'time': "勤務期間:", 'deadline': "ご注意の締め切り:",
        'no_filter': "フィルターに一致する作品はありません！", 'no_task': "タスクはまだ割り当てられていません！",
        'metric_total': "表示中のタスク総数", 'metric_retouch': "レタッチタスク数", 'metric_type': "写植タスク数", 'metric_lettering_qc': "修正写植タスク数", 'metric_lettering_retouch': "写植/ﾚﾀｯﾁタスク数", 'metric_prep': "Prepタスク数",
        'not_update': "未更新",
        'cols': ['作業内容', '作品名', '話数', '巻数', 'ページ', '出版社', '開始日', '提出日', 'VN', '作業者', '社内QC', '進行管理', 'ステータス', '開始', '備考'],
        'logtime_title': "⏱️ 進捗報告エリア (ログタイム＆チェックリスト)",
        'logtime_empty': "現在、報告するタスクはありません。",
        'f_date': "📅 作業日:", 'f_cat': "📚 カテゴリ:", 'f_diff': "🔥 難易度:", 'f_worker': "👤 作業者:",
        'f_hours': "⏱ 今日の作業時間:", 'f_total_pages': "📄 ページ数:", 'f_pages': "✅ 完了したページ数:", 'f_note': "📝 備考:",
        'f_btn': "保存する",
    }
}

CHECKLIST_TEXT = {
    'vi': {
        'phase1': 'CHUẨN BỊ', 'phase1_sub': 'Khởi tạo & nhận việc',
        'phase2': 'BẮT ĐẦU', 'phase2_sub': 'Báo Asana & cập nhật',
        'phase3': 'GIAO HÀNG', 'phase3_sub': 'Hoàn thành & bàn giao',
        'step1': 'BƯỚC 1: CHUẨN BỊ', 'step2': 'BƯỚC 2: BẮT ĐẦU', 'step3': 'BƯỚC 3: GIAO HÀNG',
        't1': 'Tạo Task DB_工程管理', 't2': 'N: notion済', 't3': 'Báo bắt đầu', 't4': 'O: 開始 (Bắt đầu)', 't5': 'Not Started → In Progress',
        't6': 'Báo hoàn thành', 't7': 'N: 納品済み', 't8': 'Trạng thái: Delivered', 't9': 'Tick comment & Tick checklist in Mikan',
        'copy_start': 'Sao chép', 'ask_task': 'Trễ chỉ thị? (Hỏi Task)', 'copy_ask': 'Sao chép',
        'copy_done': 'Sao chép', 'copied': 'Đã sao chép', 'copy_deliver': 'Sao chép',
        'tmpl_start': 'Mẫu tin nhắn Asana (Bắt đầu)',
        'tmpl_ask': 'Mẫu hỏi khi trễ chỉ thị (Tiếng Nhật)',
        'tmpl_done': 'Mẫu tin nhắn Asana (Hoàn thành)',
        'tmpl_deliver': 'Mẫu tin nhắn giao hàng (Tiếng Nhật)'
    },
    'ja': {
        'phase1': '準備フェーズ', 'phase1_sub': 'タスク作成・確認',
        'phase2': '着手フェーズ', 'phase2_sub': 'Asana報告・更新',
        'phase3': '納品フェーズ', 'phase3_sub': '完了報告・納品',
        'step1': 'STEP 1: 準備', 'step2': 'STEP 2: 着手', 'step3': 'STEP 3: 納品',
        't1': 'DB_工程管理に作成', 't2': 'N列：notion済', 't3': '着手報告 (Asana)', 't4': 'O列：開始', 't5': 'Not Started → In Progress',
        't6': '完了報告 (Asana)', 't7': 'N列：納品済み', 't8': 'ステータス：Delivered', 't9': 'Mikanでコメント＆チェックリストをTick',
        'copy_start': 'コピー', 'ask_task': '指示遅れ？(確認文)', 'copy_ask': 'コピー',
        'copy_done': 'コピー', 'copied': 'コピー完了', 'copy_deliver': 'コピー',
        'tmpl_start': 'Asana着手報告テンプレート',
        'tmpl_ask': '指示遅れ確認テンプレート',
        'tmpl_done': 'Asana完了報告テンプレート',
        'tmpl_deliver': '納品メッセージテンプレート'
    }
}

# =====================================================================
# 7. JINJA2 HELPER FUNCTIONS (Render checklist & logtime inline)
# =====================================================================
def render_checklist_html(tac_pham_key, index, lang, api_url, checked_ids=None, row_data=None, task_links_dict=None):
    l = CHECKLIST_TEXT.get(lang, CHECKLIST_TEXT['vi'])
    if checked_ids is None:
        checked_ids = set()
    else:
        checked_ids = set(str(x).strip().lower() for x in checked_ids)

    def ch(tid):
        return 'checked' if tid in checked_ids else ''

    is_combined = ('写植/ﾚﾀｯﾁ' in str(tac_pham_key) or '写植/レタッチ' in str(tac_pham_key) or 'Lettering/Retouch' in str(tac_pham_key) or 'lettering/retouch' in str(tac_pham_key).lower())
    
    is_coop = is_combined or bool(row_data and row_data.get('is_coop'))
    volume_key = (row_data and row_data.get('volume_key')) or (tac_pham_key.split(' - ')[1] if ' - ' in str(tac_pham_key) else str(tac_pham_key))
    partner_worker = (row_data and row_data.get('partner_worker')) or ''
    partner_cv = (row_data and row_data.get('partner_cv')) or ''

    # Task Resource Links (Mikan, Notion, Asana, Dropbox) - Keyed strictly by individual task role (tac_pham_key)
    t_links = {}
    if task_links_dict:
        t_links = task_links_dict.get(tac_pham_key) or {}

    mikan_url = t_links.get('mikan', '').strip()
    notion_url = t_links.get('notion', '').strip()
    asana_url = t_links.get('asana', '').strip()
    dropbox_url = t_links.get('dropbox', '').strip()

    def render_link_card(tool_key, name, icon_class, url):
        has_url = bool(url)
        is_http = has_url and url.lower().startswith(('http://', 'https://'))
        
        if not has_url:
            href_val = "javascript:void(0)"
            target_val = ''
            onclick_val = f"openEditTaskLinksModal('{tac_pham_key}', '{tool_key}'); return false;"
            badge_text = "+ Thêm link" if lang == 'vi' else "+ リンク追加"
            status_cls = "empty"
        elif is_http:
            href_val = url
            target_val = 'target="_blank" rel="noopener noreferrer"'
            onclick_val = ''
            badge_text = "Mở link ↗" if lang == 'vi' else "開く ↗"
            status_cls = "has-url"
        else:
            href_val = "javascript:void(0)"
            target_val = ''
            safe_url = url.replace('\\', '\\\\').replace("'", "\\'")
            onclick_val = f"navigator.clipboard.writeText('{safe_url}').then(()=>{{if(typeof showToast !== 'undefined') showToast('Đã copy đường dẫn!', 'success');}}); return false;"
            badge_text = "Copy text" if lang == 'vi' else "コピー"
            status_cls = "has-url"
            
        return f'''
        <a href="{href_val}" class="task-link-card {tool_key} {status_cls}" {target_val} onclick="{onclick_val}" data-tool="{tool_key}" data-url="{url}" title="{url if has_url else ('Chưa có link ' + name)}">
            <div class="task-link-icon"><i class="{icon_class}"></i></div>
            <div class="task-link-info">
                <span class="task-link-name">{name}</span>
                <span class="task-link-status">{badge_text}</span>
            </div>
            <span class="task-link-edit-btn" onclick="event.preventDefault(); event.stopPropagation(); openEditTaskLinksModal('{tac_pham_key}', '{tool_key}')" title="{ 'Sửa link' if lang == 'vi' else 'リンク編集' }"><i class="fas fa-pen"></i></span>
        </a>
        '''

    links_html = f'''
    <div class="task-links-box" id="task_links_{index}" data-tp-key="{tac_pham_key}">
        <div class="task-links-header">
            <span class="task-links-title"><i class="fas fa-link" style="color: var(--primary); margin-right: 6px;"></i>{ "Liên kết làm việc:" if lang == "vi" else "作業リンク:" }</span>
            <button type="button" class="btn-manage-links" onclick="openEditTaskLinksModal('{tac_pham_key}')" title="{ 'Cài đặt liên kết' if lang == "vi" else 'リンク設定' }">
                <i class="fas fa-cog"></i> { "Cài đặt link" if lang == "vi" else "設定" }
            </button>
        </div>
        <div class="task-links-grid">
            {render_link_card('mikan', 'MIKAN', 'fas fa-tasks', mikan_url)}
            {render_link_card('notion', 'NOTION', 'fas fa-book-open', notion_url)}
            {render_link_card('asana', 'ASANA', 'fas fa-circle-notch', asana_url)}
            {render_link_card('dropbox', 'DROPBOX', 'fab fa-dropbox', dropbox_url)}
        </div>
    </div>
    '''

    if partner_worker:
        partner_info_text = f"Đồng đội: <strong>{partner_worker}</strong> ({partner_cv})" if partner_cv else f"Đồng đội: <strong>{partner_worker}</strong>"
        badge_html = f'<span class="handover-partner-badge">{partner_info_text}</span>'
    elif is_coop:
        badge_html = '<span class="handover-partner-badge">Retouch ⇄ Lettering</span>'
    else:
        badge_html = f'<span class="handover-partner-badge" style="opacity: 0.85;">💬 { "Ghi chú & Thảo luận" if lang == "vi" else "メモ・連絡" }</span>'

    safe_volume_key = str(volume_key).replace('\\', '\\\\').replace("'", "\\'").replace('"', '&quot;')
    handover_html = f'''
    <div class="task-handover-box" id="handover_{index}" data-tp-key="{safe_volume_key}" style="margin-top: 0; height: 100%;">
        <div class="handover-header">
            <div class="handover-title-row">
                <span class="handover-title"><i class="far fa-comments" style="margin-right: 6px; color: #818cf8;"></i>{ "Comment:" if lang == "vi" else "コメント:" } <span class="handover-volume-name">{volume_key}</span></span>
                {badge_html}
            </div>
        </div>
        <div class="handover-body" id="handover_body_{index}">
            <div class="quick-handover-actions">
                <span class="quick-handover-label">{ "Mẫu nhanh:" if lang == "vi" else "定型文:" }</span>
                <button type="button" class="btn-quick-tag done-retouch" onclick="sendQuickHandover('{index}', '{safe_volume_key}', '{ "✓ Đã xong Retouch ➔ Chuyển giao Lettering" if lang == "vi" else "✓ レタッチ完了 ➔ 写植へ引き継ぎ" }', 'handover')">{ "✓ Xong Retouch ➔ Lettering" if lang == "vi" else "✓ レタッチ完了 ➔ 写植へ" }</button>
                <button type="button" class="btn-quick-tag in-progress" onclick="sendQuickHandover('{index}', '{safe_volume_key}', '{ "Đang xử lý khâu Retouch..." if lang == "vi" else "レタッチ作業中..." }', 'progress')">{ "Đang làm Retouch" if lang == "vi" else "レタッチ作業中" }</button>
                <button type="button" class="btn-quick-tag in-progress" onclick="sendQuickHandover('{index}', '{safe_volume_key}', '{ "Đang xử lý khâu Lettering..." if lang == "vi" else "写植作業中..." }', 'progress')">{ "Đang làm Lettering" if lang == "vi" else "写植作業中" }</button>
                <button type="button" class="btn-quick-tag in-progress" onclick="sendQuickHandover('{index}', '{safe_volume_key}', '{ "Đang làm dở trang..." if lang == "vi" else "作業中..." }', 'progress')">{ "Đang làm dở" if lang == "vi" else "作業中" }</button>
                <button type="button" class="btn-quick-tag note" onclick="sendQuickHandover('{index}', '{safe_volume_key}', '{ "Lưu ý font / style đặc biệt" if lang == "vi" else "フォント・スタイルの注意事項あり" }', 'warning')">{ "Lưu ý font/style" if lang == "vi" else "注意事項" }</button>
            </div>

            <div class="handover-comments-list" id="comments_list_{index}">
                <div class="handover-empty">{ "Chưa có ghi chú nào. Hãy để lại lời nhắn cho đồng đội!" if lang == "vi" else "メッセージはまだありません。" }</div>
            </div>

            <div class="handover-input-container">
                <div class="handover-count-bar" id="count_bar_{index}" style="display: none;">
                    <span class="count-badge"><i class="fas fa-layer-group"></i> <strong id="count_num_{index}">0</strong> PSD</span>
                    <span class="count-hint">{ "Auto chèn dấu phẩy khi gửi" if lang == "vi" else "送信時に自動でカンマ挿入" }</span>
                </div>
                <div class="handover-input-group">
                    <textarea id="handover_input_{index}" class="handover-input" rows="1" placeholder="{ "Nhập tin nhắn, ghi chú hoặc số trang PSD..." if lang == "vi" else "メッセージまたはPSDページ番号を入力..." }" oninput="handleCommentInput(this, '{index}')" onkeydown="handleCommentKeydown(event, '{index}', '{safe_volume_key}')"></textarea>
                    <button type="button" class="btn-handover-send" id="btn_send_comment_{index}" onclick="sendTaskComment('{index}', '{safe_volume_key}')">{ "Gửi" if lang == "vi" else "送信" }</button>
                </div>
            </div>
        </div>
    </div>
    '''

    tracker_html = f'''<div class="time-tracker-box" id="tracker_{index}" data-tp-key="{tac_pham_key}" style="margin-top: 0; height: 100%;">
        <div class="tracker-header">
            ⏱️ { "Theo dõi thời gian" if lang == "vi" else "タイムトラッカー" }
            <label style="float: right; font-size: 0.8rem; font-weight: normal; cursor: pointer; color: var(--text-2);">
                 <input type="checkbox" id="manual_time_cb_{index}" onchange="toggleManualTime('{index}')"> { "Nhập tay" if lang == "vi" else "手 động入力" }
            </label>
        </div>
        
        <div class="tracker-controls" id="auto_controls_{index}">
            <button class="btn-tracker start" id="btn_start_{index}" onclick="startTracker('{index}')">▶ { "Bắt đầu" if lang == "vi" else "開始" }</button>
            <button class="btn-tracker end" id="btn_end_{index}" onclick="endTracker('{index}')" disabled>⏹ { "Kết thúc" if lang == "vi" else "終了" }</button>
            <span class="tracker-time" id="time_display_{index}">00:00:00</span>
        </div>
        
        <div class="tracker-controls" id="manual_controls_{index}" style="display: none;">
            <input type="text" id="manual_start_{index}" class="tracker-note" style="width: 140px;" placeholder="{ "Chọn Giờ Bắt Đầu" if lang == "vi" else "開始時刻" }">
            <span style="color: var(--text-2);">→</span>
            <input type="text" id="manual_end_{index}" class="tracker-note" style="width: 140px;" placeholder="{ "Chọn Giờ Kết Thúc" if lang == "vi" else "終了時刻" }">
            <span style="color: var(--text-2);">{ "hoặc" if lang == "vi" else "または" }</span>
            <input type="number" id="manual_duration_{index}" class="tracker-note" style="width: 80px;" step="0.01" placeholder="{ "Giờ (h)" if lang == "vi" else "時間 (h)" }" oninput="calcManualTime('{index}', 'dur')">
        </div>

        <div class="tracker-inputs">
            <input type="text" id="tracker_note_{index}" placeholder="{ "Mô tả công việc..." if lang == "vi" else "備考..." }" class="tracker-note">
            <button class="btn-tracker save" id="btn_save_{index}" onclick="saveTracker('{index}', '{tac_pham_key}')">{ "Lưu Log" if lang == "vi" else "保存" }</button>
        </div>
    </div>'''

    return f'''
    {links_html}
    <div class="checklist-grid" data-tp-key="{tac_pham_key}">
        <!-- GIAI ĐOẠN 1: CHUẨN BỊ -->
        <div class="step-col" data-step="1">
            <div class="step-header">
                <div class="step-badge-wrap">
                    <span class="step-num">01</span>
                    <div class="step-meta">
                        <span class="step-title">{l.get('phase1', 'CHUẨN BỊ')}</span>
                        <span class="step-sub">{l.get('phase1_sub', 'Khởi tạo & nhận việc')}</span>
                    </div>
                </div>
                <span class="step-count" id="count_s1_{index}">0/2</span>
            </div>
            <div class="step-progress-bar"><div class="step-progress-fill" id="bar_s1_{index}"></div></div>

            <div class="step-items">
                <div class="task-row">
                    <span class="platform-badge notion">Notion</span>
                    <label class="check-label">
                        <input type="checkbox" data-checklist data-check-id="t1" {ch('t1')}>
                        <span class="checkmark"></span>
                        <span class="action-text">{l['t1']}</span>
                    </label>
                </div>
                <div class="task-row">
                    <span class="platform-badge sheet">Sheet</span>
                    <label class="check-label">
                        <input type="checkbox" data-checklist data-check-id="t2" {ch('t2')}>
                        <span class="checkmark"></span>
                        <span class="action-text">{l['t2']}</span>
                    </label>
                </div>
            </div>

            <div class="step-hint-box">
                <i class="far fa-lightbulb"></i>
                <span>{ "Kiểm tra kỹ thông tin tác phẩm & file raw trước khi bắt đầu." if lang == "vi" else "作業開始前に作品情報と元データをご確認ください。" }</span>
            </div>
        </div>

        <!-- GIAI ĐOẠN 2: BẮT ĐẦU -->
        <div class="step-col" data-step="2">
            <div class="step-header">
                <div class="step-badge-wrap">
                    <span class="step-num">02</span>
                    <div class="step-meta">
                        <span class="step-title">{l.get('phase2', 'BẮT ĐẦU')}</span>
                        <span class="step-sub">{l.get('phase2_sub', 'Báo Asana & cập nhật')}</span>
                    </div>
                </div>
                <span class="step-count" id="count_s2_{index}">0/3</span>
            </div>
            <div class="step-progress-bar"><div class="step-progress-fill" id="bar_s2_{index}"></div></div>

            <div class="step-items">
                <div class="task-row">
                    <span class="platform-badge asana">Asana</span>
                    <label class="check-label">
                        <input type="checkbox" data-checklist data-check-id="t3" {ch('t3')}>
                        <span class="checkmark"></span>
                        <span class="action-text">{l['t3']}</span>
                    </label>
                </div>

                <!-- Template Card Start -->
                <div class="msg-template-card">
                    <div class="msg-template-header">
                        <span class="msg-template-label"><i class="far fa-comment-dots"></i> {l.get('tmpl_start', 'Mẫu tin nhắn Asana')}</span>
                        <button type="button" class="btn-copy-action" onclick="copyText(this, 'msg_t3_{index}')" title="{l.get('copy_start', 'Sao chép')}">
                            <i class="far fa-clone"></i> <span>{l.get('copy_start', 'Copy')}</span>
                        </button>
                    </div>
                    <div class="msg-template-body" id="msg_t3_{index}">(PC) cc @Shiori Fujimura @Miho Osada @Erika Kawasaki&#10;===タスク着手===</div>
                </div>

                <!-- Collapsible Ask Task Accordion -->
                <div class="ask-task-accordion">
                    <div class="ask-task-trigger" onclick="toggleAskTask(this)">
                        <span><i class="far fa-question-circle"></i> {l['ask_task']}</span>
                        <i class="fas fa-chevron-down arrow-icon"></i>
                    </div>
                    <div class="ask-task-panel">
                        <div class="msg-template-card nested">
                            <div class="msg-template-header">
                                <span class="msg-template-label">{l.get('tmpl_ask', 'Mẫu hỏi trễ chỉ thị')}</span>
                                <button type="button" class="btn-copy-action" onclick="copyText(this, 'jp_t3_{index}')" title="{l.get('copy_ask', 'Sao chép')}">
                                    <i class="far fa-clone"></i> <span>{l.get('copy_ask', 'Copy')}</span>
                                </button>
                            </div>
                            <div class="msg-template-body" id="jp_t3_{index}">お疲れ様です。&#10;写植工程を担当しております○○です。&#10;本日が作業開始日となっておりますが、現時点でまだご指示をいただいておりません。&#10;お手数をおかけいたしますが、ご確認のほどよろしくお願いいたします。</div>
                        </div>
                    </div>
                </div>

                <div class="task-row">
                    <span class="platform-badge sheet">Sheet</span>
                    <label class="check-label">
                        <input type="checkbox" data-checklist data-check-id="t4" {ch('t4')}>
                        <span class="checkmark"></span>
                        <span class="action-text">{l['t4']}</span>
                    </label>
                </div>
                <div class="task-row">
                    <span class="platform-badge notion">Notion</span>
                    <label class="check-label">
                        <input type="checkbox" data-checklist data-check-id="t5" {ch('t5')}>
                        <span class="checkmark"></span>
                        <span class="action-text">{l['t5']}</span>
                    </label>
                </div>
            </div>
        </div>

        <!-- GIAI ĐOẠN 3: GIAO HÀNG -->
        <div class="step-col" data-step="3">
            <div class="step-header">
                <div class="step-badge-wrap">
                    <span class="step-num">03</span>
                    <div class="step-meta">
                        <span class="step-title">{l.get('phase3', 'GIAO HÀNG')}</span>
                        <span class="step-sub">{l.get('phase3_sub', 'Hoàn thành & bàn giao')}</span>
                    </div>
                </div>
                <span class="step-count" id="count_s3_{index}">0/4</span>
            </div>
            <div class="step-progress-bar"><div class="step-progress-fill" id="bar_s3_{index}"></div></div>

            <div class="step-items">
                <div class="task-row">
                    <span class="platform-badge asana">Asana</span>
                    <label class="check-label">
                        <input type="checkbox" data-checklist data-check-id="t6" {ch('t6')}>
                        <span class="checkmark"></span>
                        <span class="action-text">{l['t6']}</span>
                    </label>
                </div>

                <!-- Template Card Done -->
                <div class="msg-template-card">
                    <div class="msg-template-header">
                        <span class="msg-template-label"><i class="far fa-check-circle"></i> {l.get('tmpl_done', 'Mẫu báo hoàn thành')}</span>
                        <button type="button" class="btn-copy-action" onclick="copyText(this, 'msg_t6_{index}')" title="{l.get('copy_done', 'Sao chép')}">
                            <i class="far fa-clone"></i> <span>{l.get('copy_done', 'Copy')}</span>
                        </button>
                    </div>
                    <div class="msg-template-body" id="msg_t6_{index}">(PC) cc @Shiori Fujimura @Miho Osada @Erika Kawasaki&#10;===タスク完了===</div>
                </div>

                <div class="task-row">
                    <span class="platform-badge sheet">Sheet</span>
                    <label class="check-label">
                        <input type="checkbox" data-checklist data-check-id="t7" {ch('t7')}>
                        <span class="checkmark"></span>
                        <span class="action-text">{l['t7']}</span>
                    </label>
                </div>
                <div class="task-row">
                    <span class="platform-badge notion">Notion</span>
                    <label class="check-label">
                        <input type="checkbox" data-checklist data-check-id="t8" {ch('t8')}>
                        <span class="checkmark"></span>
                        <span class="action-text">{l['t8']}</span>
                    </label>
                </div>

                <!-- Template Card Deliver -->
                <div class="msg-template-card">
                    <div class="msg-template-header">
                        <span class="msg-template-label"><i class="far fa-paper-plane"></i> {l.get('tmpl_deliver', 'Mẫu báo giao hàng')}</span>
                        <button type="button" class="btn-copy-action" onclick="copyText(this, 'msg_t8_{index}')" title="{l.get('copy_deliver', 'Sao chép')}">
                            <i class="far fa-clone"></i> <span>{l.get('copy_deliver', 'Copy')}</span>
                        </button>
                    </div>
                    <div class="msg-template-body" id="msg_t8_{index}">納品いたしました。&#10;ご確認のほどよろしくお願いいたします。</div>
                </div>

                <div class="task-row">
                    <span class="platform-badge mikan">Mikan</span>
                    <label class="check-label">
                        <input type="checkbox" data-checklist data-check-id="t9" {ch('t9')}>
                        <span class="checkmark"></span>
                        <span class="action-text">{l['t9']}</span>
                    </label>
                </div>
            </div>
        </div>
    </div>
    <div style="display: grid; grid-template-columns: 3fr 2fr; gap: 16px; align-items: start; margin-top: 16px;">
        {handover_html}
        {tracker_html}
    </div>
    '''

def render_logtime_form_html(row, index, t, users, lang):
    worker = str(row.get('Người thực hiện', '')).strip()
    so_trang = row.get('Số trang', 0)
    so_trang = so_trang if pd.notna(so_trang) else 0
    cong_viec = str(row.get('Công việc', '')).strip()
    tac_pham = str(row.get('Tên tác phẩm', '')).strip()
    chuong = row.get('Chương', '')
    tap = row.get('Tập', '')
    today = date.today().isoformat()

    worker_options = ''.join(
        f'<option value="{u}" {"selected" if u == worker else ""}>{u}</option>'
        for u in users
    )

    return f'''
    <div class="logtime-form">
        <form id="logtime-{index}" onsubmit="return handleLogtime(event, 'logtime-{index}')" novalidate>
            <input type="hidden" name="cong_viec" value="{cong_viec}">
            <input type="hidden" name="tac_pham" value="{tac_pham}">
            <input type="hidden" name="chuong" value="{chuong if pd.notna(chuong) else ''}">
            <input type="hidden" name="tap" value="{tap if pd.notna(tap) else ''}">
            <div class="form-row cols-4">
                <div class="form-group">
                    <label>{t['f_cat']} <span style="color: #f43f5e; font-weight: bold; margin-left: 2px;">*</span></label>
                    <select name="category" required>
                        <option value="単行本" selected>単行本</option>
                        <option value="読切">読切</option>
                        <option value="連載">連載</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>{t['f_diff']} <span style="color: #f43f5e; font-weight: bold; margin-left: 2px;">*</span></label>
                    <select name="difficulty" required>
                        <option value="" selected disabled>--</option>
                        <option value="低">低</option>
                        <option value="中">中</option>
                        <option value="高">高</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>{t['f_worker']} <span style="color: #f43f5e; font-weight: bold; margin-left: 2px;">*</span></label>
                    <select name="nguoi_thuc_hien" required>
                        <option value="" disabled {"selected" if not worker else ""}>--</option>
                        {worker_options}
                    </select>
                </div>
                <div class="form-group">
                    <label>{t['f_date']} <span style="color: #f43f5e; font-weight: bold; margin-left: 2px;">*</span></label>
                    <input type="date" name="ngay_log" value="{today}" required>
                </div>
            </div>
            <div class="form-row cols-4" style="margin-top: 16px;">
                <div class="form-group">
                    <label>{t['f_pages']} <span style="color: #f43f5e; font-weight: bold; margin-left: 2px;">*</span></label>
                    <input type="number" name="so_page" min="0" step="1" required placeholder="Số page hoàn thành...">
                </div>
                <div class="form-group">
                    <label>{t['f_total_pages']} <span style="color: #f43f5e; font-weight: bold; margin-left: 2px;">*</span></label>
                    <input type="number" name="so_trang_tong" value="{so_trang if so_trang else ''}" min="0" step="1" required placeholder="Ví dụ: 200">
                </div>
                <div class="form-group">
                    <label>{t['f_hours']} <span style="color: #f43f5e; font-weight: bold; margin-left: 2px;">*</span></label>
                    <input type="number" name="so_gio" min="0.1" step="0.5" required placeholder="0.5, 1, 2...">
                </div>
                <div class="form-group">
                    <label>{t['f_note']}</label>
                    <input type="text" name="ghi_chu" placeholder="...">
                </div>
            </div>
            <div style="margin-top: 20px; text-align: right;">
                <button type="submit" class="btn btn-primary" style="min-width: 160px; padding: 12px 24px;">{t['f_btn']}</button>
            </div>
            <div class="logtime-progress" id="progress-{index}" style="display:none; margin-top: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.8rem; color: var(--text-3);">
                    <span class="progress-label">{ 'Đang lưu logtime bằng tài khoản: logtime-sa@logtime-app-3366.iam.gserviceaccount.com...' if lang == 'vi' else 'アカウント(logtime-sa@logtime-app-3366.iam.gserviceaccount.com)でLogtimeを保存中...' }</span>
                    <span class="progress-time"></span>
                </div>
                <div style="width: 100%; height: 6px; background: var(--border); border-radius: 100px; overflow: hidden;">
                    <div class="progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--primary), #818cf8); border-radius: 100px; transition: width 0.3s ease;"></div>
                </div>
            </div>
        </form>
    </div>
    '''

# Register template helpers
@app.context_processor
def utility_processor():
    def render_checklist(tp_key, idx, lang, api_url, checked_ids_dict=None, row_data=None, task_links_dict=None):
        ids = (checked_ids_dict or {}).get(tp_key, [])
        links_db = task_links_dict if task_links_dict is not None else get_supabase_task_links()
        return Markup(render_checklist_html(tp_key, idx, lang, api_url, ids, row_data=row_data, task_links_dict=links_db))
    def render_logtime_form(row, idx, t, users, lang):
        return Markup(render_logtime_form_html(row, idx, t, users, lang))
    return dict(
        render_checklist=render_checklist,
        render_logtime_form=render_logtime_form,
        app_version=get_current_app_version(),
        app_build_id=get_current_build_id()
    )

# =====================================================================
# 8. HÀM XỬ LÝ DỮ LIỆU DASHBOARD
# =====================================================================
def process_dashboard_data():
    """Load và xử lý toàn bộ dữ liệu cho dashboard."""
    lang = session.get('lang', 'vi')
    t = DICT_LANG[lang]
    user = session.get('user', '')
    role = session.get('role', 'member')

    try:
        df_raw = load_sheet_data(csv_url)
        df_truoc_raw = load_sheet_data(csv_url_truoc)
    except Exception:
        return None

    if df_raw.empty:
        return None

    # Tìm vị trí "Tuần làm việc"
    idx_tuan = df_raw[df_raw.apply(lambda row: row.astype(str).str.contains('Tuần làm việc', case=False, na=False).any(), axis=1)].index
    idx_tuan_truoc = df_truoc_raw[df_truoc_raw.apply(lambda row: row.astype(str).str.contains('Tuần làm việc', case=False, na=False).any(), axis=1)].index

    # Parse thông tin tuần
    def parse_week_info(df_source, idx_list):
        info = {"start": t['not_update'], "end": t['not_update'], "deadline": t['not_update']}
        if len(idx_list) > 0:
            start_idx = idx_list[0]
            for i in range(start_idx, min(start_idx + 5, len(df_source))):
                row_vals = df_source.iloc[i].dropna().astype(str).str.strip().tolist()
                dates = get_clean_dates(row_vals)
                if any('tuần' in str(v).lower() for v in row_vals) and len(dates) >= 2:
                    info['start'], info['end'] = dates[0], dates[1]
                if any(kw in str(v).lower() for v in row_vals for kw in ['deadline', 'deadlien', 'hạn chót']) and len(dates) >= 1:
                    info['deadline'] = dates[-1]
        return info

    info_nay = parse_week_info(df_raw, idx_tuan[:1])
    info_sau = parse_week_info(df_raw, idx_tuan[1:2])
    info_truoc = parse_week_info(df_truoc_raw, idx_tuan_truoc[:1])

    # Split data by week based on Start (or Ngày bắt đầu) column
    current_year = date.today().year
    def parse_task_date_obj(val):
        if not val or pd.isna(val) or str(val).strip() in ['nan', 'None', '', '::', '-', '->']:
            return None
        s = str(val).strip()
        if '-' in s:
            s = s.split('-')[-1].strip()
        s = re.sub(r'\([A-Za-z]+\)', '', s).strip()
        try:
            return date_parser.parse(s, default=datetime(current_year, 1, 1)).date()
        except Exception:
            return None

    def get_week_num_from_str(s):
        try:
            val = str(s).strip()
            if '-' in val:
                val = val.split('-')[-1].strip()
            clean_s = re.sub(r'\([A-Za-z]+\)', '', val).strip()
            dt = date_parser.parse(clean_s, default=datetime(current_year, 1, 1))
            return dt.isocalendar()[1]
        except Exception:
            return None

    target_week_nay = get_week_num_from_str(info_nay.get('start')) or date.today().isocalendar()[1]
    target_week_truoc = get_week_num_from_str(info_truoc.get('start')) or (target_week_nay - 1)
    target_week_sau = get_week_num_from_str(info_sau.get('start')) or (target_week_nay + 1)

    combined_all = clean_df(pd.concat([df_raw, df_truoc_raw], ignore_index=True))
    combined_all = combined_all.drop_duplicates(
        subset=['Công việc', 'Tên tác phẩm', 'Chương', 'Tập', 'Người thực hiện'],
        keep='last'
    )

    def get_task_weeks(row):
        start_d = parse_task_date_obj(row.get('Start'))
        if not start_d:
            start_d = parse_task_date_obj(row.get('Ngày bắt đầu'))
            
        end_d = parse_task_date_obj(row.get('End'))
        if not end_d: end_d = parse_task_date_obj(row.get('Ngày kết thúc'))
        if not end_d: end_d = parse_task_date_obj(row.get('Hạn chót'))
        if not end_d: end_d = parse_task_date_obj(row.get('Deadline'))
        if not end_d: end_d = parse_task_date_obj(row.get('Deadline (Nộp)'))
            
        if start_d and not end_d:
            end_d = start_d
        elif end_d and not start_d:
            start_d = end_d
            
        if not start_d and not end_d:
            return None, None
            
        return start_d.isocalendar()[1], end_d.isocalendar()[1]

    start_ws = []
    end_ws = []
    for _, r in combined_all.iterrows():
        sw, ew = get_task_weeks(r)
        start_ws.append(sw)
        end_ws.append(ew)
    combined_all['start_w'] = start_ws
    combined_all['end_w'] = end_ws

    def in_week(sw, ew, tw):
        if sw is None or ew is None or tw is None: return False
        return (sw <= tw <= ew) if sw <= ew else (tw >= sw or tw <= ew)

    def in_or_after_week(sw, ew, tw):
        if sw is None or ew is None or tw is None: return False
        return (ew >= tw) if sw <= ew else True

    df_tuan_truoc = combined_all[combined_all.apply(lambda r: in_week(r['start_w'], r['end_w'], target_week_truoc), axis=1)].copy()
    df_tuan_nay = combined_all[combined_all.apply(lambda r: in_week(r['start_w'], r['end_w'], target_week_nay), axis=1)].copy()
    df_tuan_sau = combined_all[combined_all.apply(lambda r: in_or_after_week(r['start_w'], r['end_w'], target_week_sau), axis=1)].copy()

    # Pre-calculate global volume partners across all raw data before member filtering
    global_vol_partners = defaultdict(list)
    for df_src in [df_raw, df_truoc_raw]:
        if not df_src.empty:
            for _, row_full in df_src.iterrows():
                tp = str(row_full.get('Tên tác phẩm', '')).strip()
                tap = str(row_full.get('Tập', '')).strip()
                cv = str(row_full.get('Công việc', '')).strip()
                w = str(row_full.get('Người thực hiện', '')).strip()
                vol_k = f"{tap}_{tp}" if tap and tap.lower() not in ['nan', 'none', ''] else tp
                if vol_k and w and w.lower() not in ['nan', 'none', '']:
                    global_vol_partners[vol_k].append({'worker': w, 'cv': cv, 'tp_key': f"{cv} - {vol_k}"})

    # Phân quyền: member chỉ thấy task của mình
    if role == "member":
        df_tuan_nay = df_tuan_nay[df_tuan_nay["Người thực hiện"].astype(str).str.contains(user, na=False, regex=False)]
        df_tuan_sau = df_tuan_sau[df_tuan_sau["Người thực hiện"].astype(str).str.contains(user, na=False, regex=False)]
        df_tuan_truoc = df_tuan_truoc[df_tuan_truoc["Người thực hiện"].astype(str).str.contains(user, na=False, regex=False)]

    # Checklist data for dashboard progress
    df_check = load_checklist_data()
    check_counts = {}
    checked_ids_dict = {}
    if not df_check.empty:
        df_check['Trạng Thái'] = df_check['Trạng Thái'].astype(str).str.upper().isin(['TRUE', '1', 'T'])
        df_check_latest = df_check.drop_duplicates(subset=['Tên Tác Phẩm', 'Checkbox ID'], keep='last')
        check_counts = df_check_latest[df_check_latest['Trạng Thái'] == True].groupby('Tên Tác Phẩm')['Checkbox ID'].nunique().to_dict()
        checked_ids_dict = df_check_latest[df_check_latest['Trạng Thái'] == True].groupby('Tên Tác Phẩm')['Checkbox ID'].apply(list).to_dict()

    def df_to_records(df_target):
        if df_target.empty:
            return []
        records = df_target.to_dict('records')
        for r in records:
            cv = str(r.get('Công việc', '')).strip()
            tp = str(r.get('Tên tác phẩm', '')).strip()
            tap = str(r.get('Tập', '')).strip()
            my_worker = str(r.get('Người thực hiện', '')).strip()
            
            if tap and tap.lower() not in ['nan', 'none', '']:
                old_tp_key = f"{tap}_{tp}"
                tp_key = f"{cv} - {tap}_{tp}"
                vol_key = f"{tap}_{tp}"
            else:
                old_tp_key = f"{tp}"
                tp_key = f"{cv} - {tp}"
                vol_key = f"{tp}"
                
            r['tp_key'] = tp_key
            r['tp_name'] = tp_key
            r['volume_key'] = vol_key
            


            # Detect Co-op / Partner tasks from global map
            partners = [p for p in global_vol_partners.get(vol_key, []) if p.get('worker') != my_worker or p.get('cv') != cv]
            if partners:
                p_workers = list(dict.fromkeys([p['worker'] for p in partners if p.get('worker')]))
                p_cvs = list(dict.fromkeys([p['cv'] for p in partners if p.get('cv')]))
                p_keys = [p['tp_key'] for p in partners]
                p_progresses = [int((check_counts.get(pk, 0) / 9) * 100) for pk in p_keys]
                
                r['is_coop'] = True
                r['partner_worker'] = ', '.join(p_workers)
                r['partner_cv'] = ', '.join(p_cvs)
                r['partner_key'] = p_keys[0] if p_keys else ''
                r['partner_progress'] = p_progresses[0] if p_progresses else 0
            elif '写植/ﾚﾀｯﾁ' in cv or '写植/レタッチ' in cv or 'Lettering/Retouch' in cv or ',' in my_worker:
                r['is_coop'] = True
                r['partner_worker'] = my_worker
                r['partner_cv'] = 'Retouch ⇄ Lettering'
                r['partner_key'] = r['tp_key']
                r['partner_progress'] = int((check_counts.get(r['tp_key'], 0) / 9) * 100)
            else:
                r['is_coop'] = False
                r['partner_worker'] = ''
                r['partner_cv'] = ''
                r['partner_key'] = ''
                r['partner_progress'] = 0

        return records

    def build_dashboard(df_target, target_w):
        data = []
        current_year = date.today().year
        def format_jp_date(d_str):
            if not d_str or str(d_str).strip() in ['nan', 'NaN', 'None', '']: return ''
            clean_d = re.sub(r'\([A-Za-z]+\)', '', str(d_str)).strip().replace('-', ' ')
            try:
                dt = date_parser.parse(clean_d, default=datetime(current_year, 1, 1))
                return dt.strftime('%m/%d/%Y')
            except:
                return str(d_str)
        records = df_to_records(df_target)
        comments_db = get_supabase_task_comments() or {}
        for row in records:
            tp_key = row['tp_key']
            tp_name = row['tp_name']
            vol_key = row.get('volume_key', tp_name)
            cmts = comments_db.get(tp_key) or comments_db.get(vol_key) or comments_db.get(tp_name) or []
            has_comments = bool(cmts and len(cmts) > 0)
            comments_count = len(cmts) if cmts else 0

            worker = str(row.get('Người thực hiện', '')).strip()
            qc_person = str(row.get('QC Nội bộ', '')).strip()
            checked = check_counts.get(tp_key, 0)
            checked_ids = ','.join(checked_ids_dict.get(tp_key, []))
            if checked == 0:
                status, status_class = "⏳ Chưa Bắt Đầu", "not-started"
            elif checked >= 9:
                status, status_class = "✅ Đã Giao Hàng", "delivered"
            else:
                status, status_class = "🔥 Đang Tiến Hành", "in-progress"
            progress = int((checked / 9) * 100)
            cv = str(row.get('Công việc', '')).strip()
            if '写植/ﾚﾀｯﾁ' in cv or '写植/レタッチ' in cv or 'Lettering/Retouch' in cv: job_type = 'Lettering/Retouch'
            elif '修正' in cv or 'Lettering QC' in cv: job_type = 'Lettering QC'
            elif '写植' in cv or 'Lettering' in cv: job_type = 'Lettering'
            elif 'レタッチ' in cv or 'ﾚﾀｯﾁ' in cv or 'Retouch' in cv: job_type = 'Retouch'
            else: job_type = 'Prep'
            
            start_date = format_jp_date(str(row.get('Start', row.get('Ngày bắt đầu', ''))).strip())
            end_date = format_jp_date(str(row.get('End', row.get('Deadline (Nộp)', row.get('Hạn chót', row.get('Deadline', ''))))).strip())
            
            end_w = row.get('end_w')
            start_w = row.get('start_w')
            is_future_deadline = (end_w != start_w) if pd.notna(end_w) and pd.notna(start_w) else False
            
            data.append({
                "key": tp_key,
                "name": tp_name,
                "worker": worker,
                "qc_person": qc_person,
                "progress": progress,
                "status": status,
                "status_class": status_class,
                "checked_ids": checked_ids,
                "job_type": job_type,
                "start_date": start_date,
                "end_date": end_date,
                "vn_date": format_jp_date(str(row.get('VN', '')).strip()),
                "is_coop": row.get('is_coop', False),
                "volume_key": vol_key,
                "partner_worker": row.get('partner_worker', ''),
                "partner_cv": row.get('partner_cv', ''),
                "partner_key": row.get('partner_key', ''),
                "partner_progress": row.get('partner_progress', 0),
                "has_comments": has_comments,
                "comments_count": comments_count,
                "is_future_deadline": is_future_deadline
            })
        return data

    def get_metrics(df_target, target_w):
        if df_target.empty:
            return {"total": 0, "retouch": 0, "lettering": 0, "lettering_qc": 0, "lettering_retouch": 0, "prep": 0}
            
        if 'end_w' in df_target.columns:
            df_filtered = df_target[df_target['end_w'] == target_w]
        else:
            df_filtered = df_target
            
        retouch_count = 0
        lettering_count = 0
        lettering_qc_count = 0
        lettering_retouch_count = 0
        for cv_val in df_filtered["Công việc"].astype(str):
            cv = cv_val.strip()
            if '写植/ﾚﾀｯﾁ' in cv or '写植/レタッチ' in cv or 'Lettering/Retouch' in cv:
                lettering_retouch_count += 1
            elif '修正' in cv or 'Lettering QC' in cv:
                lettering_qc_count += 1
            elif '写植' in cv or 'Lettering' in cv:
                lettering_count += 1
            elif 'レタッチ' in cv or 'ﾚﾀｯﾁ' in cv or 'Retouch' in cv:
                retouch_count += 1
        total_count = len(df_filtered)
        prep_count = total_count - (retouch_count + lettering_count + lettering_qc_count + lettering_retouch_count)
        return {
            "total": total_count,
            "retouch": retouch_count,
            "lettering": lettering_count,
            "lettering_qc": lettering_qc_count,
            "lettering_retouch": lettering_retouch_count,
            "prep": prep_count
        }

    def generate_ai_insights(dash_nay, dash_truoc, lang):
        insights = []
        is_vi = lang == 'vi'
        
        total_nay = len(dash_nay)
        total_truoc = len(dash_truoc)
        
        # 1. Khối lượng công việc
        if total_truoc > 0:
            diff = ((total_nay - total_truoc) / total_truoc) * 100
            if diff > 0:
                insights.append(f"📈 Khối lượng task tuần này tăng {diff:.0f}% so với tuần trước." if is_vi else f"📈 今週のタスク量は先週より{diff:.0f}%増加しました。")
            elif diff < 0:
                insights.append(f"📉 Khối lượng task tuần này giảm {-diff:.0f}% so với tuần trước." if is_vi else f"📉 今週のタスク量は先週より{-diff:.0f}%減少しました。")
                
        if total_nay == 0:
            return insights
            
        completed = sum(1 for t in dash_nay if t['status_class'] == 'delivered')
        not_started = sum(1 for t in dash_nay if t['status_class'] == 'not-started')
        
        # 2. Progress
        completion_rate = (completed / total_nay) * 100
        if completion_rate >= 80:
            insights.append(f"🔥 Tuyệt vời! Team đã hoàn thành {completion_rate:.0f}% công việc tuần này." if is_vi else f"🔥 素晴らしい！今週のタスクの{completion_rate:.0f}%が完了しました。")
        elif completion_rate > 0:
            insights.append(f"📊 Tiến độ hiện tại: {completion_rate:.0f}% task đã hoàn thành." if is_vi else f"📊 現在の進捗状況：タスクの{completion_rate:.0f}%が完了。")
            
        # 3. Cảnh báo bottleneck
        if not_started > 0:
            insights.append(f"⚠️ Chú ý: Còn {not_started} task chưa bắt đầu, hãy theo dõi sát sao." if is_vi else f"⚠️ 注意：まだ開始されていないタスクが{not_started}件あります。")
            
        # 4. Gánh team
        worker_counts = {}
        for t in dash_nay:
            workers = [w.strip() for w in t['worker'].split(',') if w.strip()]
            for w in workers:
                worker_counts[w] = worker_counts.get(w, 0) + 1
        if worker_counts:
            top_worker = max(worker_counts, key=worker_counts.get)
            top_tasks = worker_counts[top_worker]
            if top_tasks >= 3:
                insights.append(f"👨‍💻 {top_worker} đang phụ trách nhiều nhất với {top_tasks} task." if is_vi else f"👨‍💻 {top_worker}さんが最多の{top_tasks}タスクを担当しています。")
                
        # 4. Dự đoán thời tiết (Weather Prediction)
        try:
            loc = 'Ho+Chi+Minh' if is_vi else 'Gifu'
            now = time.time()
            if loc in weather_cache and now - weather_cache[loc]['time'] < 1800:
                w_data = weather_cache[loc]['data']
            else:
                w_data = requests.get(f'https://wttr.in/{loc}?format=j1', timeout=3).json()
                weather_cache[loc] = {'time': now, 'data': w_data}
            
            if 'weather' in w_data and len(w_data['weather']) > 0:
                today = w_data['weather'][0]
                will_rain = False
                for h in today.get('hourly', []):
                    if int(h.get('chanceofrain', 0)) >= 50 or 'rain' in h.get('weatherDesc', [{'value': ''}])[0]['value'].lower():
                        will_rain = True
                        break
                
                if will_rain:
                    insights.append("🌧️ Sắp tới có khả năng mưa, bạn ra ngoài nhớ mang theo ô nhé!" if is_vi else "🌧️ もうすぐ雨が降る可能性があります。外出時は傘をお忘れなく！")
                else:
                    insights.append("☀️ Thời tiết sắp tới khá đẹp, chúc bạn một ngày làm việc hiệu quả!" if is_vi else "☀️ 天気は良好です。今日も一日頑張りましょう！")
        except Exception as e:
            print(f"Weather prediction error: {e}")

        return insights

    USER_DB = load_users_from_sheet(USER_SHEET_URL)
    users = list(USER_DB.keys())
    
    dash_nay = build_dashboard(df_tuan_nay, target_week_nay)
    dash_truoc = build_dashboard(df_tuan_truoc, target_week_truoc)
    dash_sau = build_dashboard(df_tuan_sau, target_week_sau)
    ai_insights = generate_ai_insights(dash_nay, dash_truoc, lang)


    return {
        'user': user,
        'role': role,
        'lang': lang,
        't': t,
        'users': users,
        'user_profiles': USER_DB,
        'cols_keys': COLS,
        'checklist_api': '',
        'checked_ids_dict': checked_ids_dict,
        'filter_cv_nay': list(df_tuan_nay["Công việc"].dropna().unique()) if not df_tuan_nay.empty else [],
        'filter_cv_sau': list(df_tuan_sau["Công việc"].dropna().unique()) if not df_tuan_sau.empty else [],
        'ai_insights': ai_insights,
        'weeks': {
            'truoc': {
                'info': info_truoc,
                'tasks': df_to_records(df_tuan_truoc),
                'dashboard': dash_truoc,
                'metrics': get_metrics(df_tuan_truoc, target_week_truoc),
            },
            'nay': {
                'info': info_nay,
                'tasks': df_to_records(df_tuan_nay),
                'dashboard': dash_nay,
                'metrics': get_metrics(df_tuan_nay, target_week_nay),
            },
            'sau': {
                'info': info_sau,
                'tasks': df_to_records(df_tuan_sau),
                'dashboard': dash_sau,
                'metrics': get_metrics(df_tuan_sau, target_week_sau),
            }
        }
    }

# =====================================================================
# 9. ROUTES
# =====================================================================
weather_cache = {}

@app.route('/api/app_version', methods=['GET'])
def api_app_version():
    cur_ver = get_current_app_version()
    return jsonify({
        "status": "success",
        "version": cur_ver,
        "build_id": get_current_build_id(),
        "server_time": int(time.time())
    })

@app.route('/api/checklist_version', methods=['GET'])
def api_checklist_version():
    data = get_supabase_checklists()
    h = 0
    if data:
        h = len(data)
        for cbs in data.values():
            if isinstance(cbs, dict):
                h += sum(1 for k, v in cbs.items() if v is True and not k.startswith('_'))
    return jsonify({
        "v": f"{checklist_version}_{h}",
        "app_version": get_current_app_version(),
        "build_id": get_current_build_id()
    })

@app.route('/api/checklist_sync_get', methods=['GET'])
def api_checklist_sync_get():
    data = get_supabase_checklists(force_refresh=True)
    rows = []
    for tp_key, cbs in data.items():
        if isinstance(cbs, dict):
            for cb_id, status in cbs.items():
                if cb_id.startswith('_'):
                    continue
                rows.append({
                    'Tên Tác Phẩm': tp_key,
                    'Checkbox ID': cb_id,
                    'Trạng Thái': status,
                    'Thời Gian': ''
                })
    return jsonify(rows)

@app.route('/api/checklist_sync', methods=['POST'])
def api_checklist_sync():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    try:
        if request.is_json:
            req_data = request.get_json()
        else:
            req_data = json.loads(request.data)
        
        tp_key = req_data.get('tac_pham')
        cb_id = req_data.get('checkbox_id')
        status = req_data.get('status')
        
        if tp_key and cb_id:
            with checklist_lock:
                data = get_supabase_checklists(force_refresh=True)
                if tp_key not in data:
                    data[tp_key] = {}
                was_checked = data[tp_key].get(cb_id, False)
                data[tp_key][cb_id] = bool(status)
                
                # Check reward condition BEFORE uploading
                reward_granted = False
                if bool(status) and not was_checked:
                    checked_count = sum(1 for k, v in data[tp_key].items() if v and not k.startswith('_'))
                    if checked_count >= 9 and not data[tp_key].get('_rewarded', False):
                        data[tp_key]['_rewarded'] = True
                        reward_granted = True
                
                # Upload to Supabase and update cache
                json_data = json.dumps(data, ensure_ascii=False).encode('utf-8')
                sb_upload('_system/checklists.json', json_data, content_type='application/json')
                global _checklist_cache, _checklist_cache_time, checklist_version
                _checklist_cache = data
                _checklist_cache_time = time.time()
                checklist_version += 1
        
        pet_result = None
        if reward_granted:
            username = session.get('user', '')
            pet_result = pet_add_xp(username, 0, 'checklist')

        # Broadcast to other clients
        socketio.emit('checklist_updated', {
            'tp_key': tp_key,
            'cb_id': cb_id,
            'status': bool(status)
        })
        
        resp = {"status": "success"}
        if pet_result:
            resp['pet'] = pet_result
        return jsonify(resp)
    except Exception as e:
        print("Error saving checklist:", e)
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/task_comments', methods=['GET', 'POST'])
def api_task_comments():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    
    if request.method == 'GET':
        tp_key = request.args.get('tp_key', '').strip()
        comments_db = get_supabase_task_comments()
        if tp_key:
            return jsonify({"status": "success", "comments": comments_db.get(tp_key, [])})
        return jsonify({"status": "success", "comments_db": comments_db})
        
    if request.method == 'POST':
        data = request.get_json() or {}
        tp_key = data.get('tp_key', '').strip()
        message = data.get('message', '').strip()
        tag = data.get('tag', 'chat')
        user = session.get('user', '')
        
        if not tp_key or not message:
            return jsonify({"status": "error", "message": "Missing task or message"}), 400
            
        now = datetime.now()
        comment_item = {
            "id": f"{int(time.time()*1000)}",
            "user": user,
            "message": message,
            "tag": tag,
            "time": now.strftime('%H:%M %d/%m'),
            "timestamp": int(time.time())
        }
        
        comments_db = get_supabase_task_comments()
        if tp_key not in comments_db:
            comments_db[tp_key] = []
        comments_db[tp_key].append(comment_item)
        save_supabase_task_comments(comments_db)
        
        # Collect assignees for this task / volume to target notifications
        assignees = []
        try:
            df_raw = load_sheet_data(csv_url)
            df_truoc = load_sheet_data(csv_url_truoc)
            combined_df = pd.concat([df_raw, df_truoc], ignore_index=True)
            for _, r in combined_df.iterrows():
                tp = str(r.get('Tên tác phẩm', '')).strip()
                tap = str(r.get('Tập', '')).strip()
                vol = f"{tap}_{tp}" if tap and tap.lower() not in ['nan', 'none', ''] else tp
                if vol in tp_key or tp_key in vol or tp in tp_key or tp_key in tp:
                    w = str(r.get('Người thực hiện', '')).strip()
                    if w and w.lower() not in ['nan', 'none', '']:
                        for p in w.split(','):
                            p_clean = p.strip()
                            if p_clean and p_clean not in assignees:
                                assignees.append(p_clean)
        except Exception:
            pass

        # Broadcast via SocketIO
        socketio.emit('task_comment_new', {
            "tp_key": tp_key,
            "comment": comment_item,
            "assignees": assignees
        })
        
        return jsonify({"status": "success", "comment": comment_item})

@app.route('/api/task_comments/delete', methods=['POST'])
def api_task_comments_delete():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    
    data = request.get_json() or {}
    tp_key = data.get('tp_key', '').strip()
    comment_id = str(data.get('id', '')).strip()
    user = session.get('user', '')
    role = session.get('role', 'member')
    
    if not comment_id:
        return jsonify({"status": "error", "message": "Missing comment ID"}), 400
        
    comments_db = get_supabase_task_comments()
    found_key = None
    target_comment = None
    
    if tp_key and tp_key in comments_db:
        matches = [c for c in comments_db[tp_key] if str(c.get('id')) == comment_id]
        if matches:
            found_key = tp_key
            target_comment = matches[0]
            
    if not found_key:
        for k, clist in comments_db.items():
            matches = [c for c in clist if str(c.get('id')) == comment_id]
            if matches:
                found_key = k
                target_comment = matches[0]
                break
                
    if found_key and target_comment:
        comment_owner = target_comment.get('user', '')
        if user == comment_owner or role in ['admin', 'manager', 'leader']:
            comments_db[found_key] = [c for c in comments_db[found_key] if str(c.get('id')) != comment_id]
            save_supabase_task_comments(comments_db)
            
            socketio.emit('task_comment_deleted', {
                "tp_key": found_key,
                "id": comment_id
            })
        else:
            return jsonify({"status": "error", "message": "Permission denied"}), 403
            
    return jsonify({"status": "success"})

@app.route('/api/task_links', methods=['GET', 'POST'])
def api_task_links():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
        
    if request.method == 'GET':
        tp_key = request.args.get('tp_key', '').strip()
        links_db = get_supabase_task_links()
        if tp_key:
            return jsonify({"status": "success", "links": links_db.get(tp_key, {})})
        return jsonify({"status": "success", "links_db": links_db})
        
    if request.method == 'POST':
        data = request.get_json() or {}
        tp_key = data.get('tp_key', '').strip()
        raw_links = data.get('links', {})
        if not tp_key:
            return jsonify({"status": "error", "message": "Missing tp_key"}), 400
            
        def sanitize_url(u):
            if not u: return ""
            return str(u).strip()
            
        sanitized_links = {
            "mikan": sanitize_url(raw_links.get('mikan', '')),
            "notion": sanitize_url(raw_links.get('notion', '')),
            "asana": sanitize_url(raw_links.get('asana', '')),
            "dropbox": sanitize_url(raw_links.get('dropbox', ''))
        }
        
        links_db = get_supabase_task_links()
        links_db[tp_key] = sanitized_links
        save_supabase_task_links(links_db)
        
        # Broadcast via SocketIO
        socketio.emit('task_links_updated', {
            "tp_key": tp_key,
            "links": sanitized_links
        })
        
        return jsonify({"status": "success", "links": sanitized_links})

@app.route('/api/weather')
def api_weather():
    loc = request.args.get('loc', 'Ho+Chi+Minh')
    now = time.time()
    
    if loc in weather_cache and now - weather_cache[loc]['time'] < 1800:
        return jsonify(weather_cache[loc]['data'])
        
    try:
        lat, lon = (10.823, 106.6296) if loc == 'Ho+Chi+Minh' else (35.4233, 136.7607)
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FBangkok"
        r = requests.get(url, timeout=5)
        om_data = r.json()
        
        wmo_code = om_data['current']['weather_code']
        if wmo_code == 0: wwo = "113"
        elif wmo_code in [1, 2]: wwo = "116"
        elif wmo_code == 3: wwo = "122"
        elif wmo_code in [45, 48]: wwo = "143"
        elif wmo_code in [51, 53, 55, 56, 57]: wwo = "266"
        elif wmo_code in [61, 63, 65, 66, 67, 80, 81, 82]: wwo = "302"
        elif wmo_code in [95, 96, 99]: wwo = "386"
        else: wwo = "113"
        
        data = {
            "current_condition": [{"temp_C": str(int(om_data['current']['temperature_2m'])), 
                                   "FeelsLikeC": str(int(om_data['current']['apparent_temperature'])), 
                                   "weatherCode": wwo}],
            "weather": [{"maxtempC": str(int(om_data['daily']['temperature_2m_max'][0])), 
                         "mintempC": str(int(om_data['daily']['temperature_2m_min'][0]))}]
        }
        
        weather_cache[loc] = {'time': now, 'data': data}
        return jsonify(data)
    except Exception as e:
        print(f"Weather error for {loc}: {e}")
        # Return empty or fallback
        if loc in weather_cache:
            return jsonify(weather_cache[loc]['data'])
        # Fallback dummy data if Open-Meteo fails completely
        dummy_data = {
            "current_condition": [{"temp_C": "28", "FeelsLikeC": "30", "weatherCode": "113"}],
            "weather": [{"maxtempC": "32", "mintempC": "25"}]
        }
        return jsonify(dummy_data)

@app.route('/api/insights', methods=['POST'])
def api_insights():
    try:
        data = request.json or {}
        lang = data.get('lang', 'vi')
        summary = data.get('summary', {})
        
        is_vi = lang == 'vi'
        insights = []
        
        total_nay = int(summary.get('total_nay', 0))
        total_truoc = int(summary.get('total_truoc', 0))
        completed = int(summary.get('completed', 0))
        not_started = int(summary.get('not_started', 0))
        
        # 1. Weather Insight
        try:
            loc = 'Ho+Chi+Minh' if is_vi else 'Gifu'
            now = time.time()
            loc_insight = loc + '_insight'
            if loc_insight in weather_cache and now - weather_cache[loc_insight]['time'] < 1800:
                om_data = weather_cache[loc_insight]['data']
            else:
                lat, lon = (10.823, 106.6296) if loc == 'Ho+Chi+Minh' else (35.4233, 136.7607)
                url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=weather_code&timezone=Asia%2FBangkok"
                om_data = requests.get(url, timeout=3).json()
                weather_cache[loc_insight] = {'time': now, 'data': om_data, 'open_meteo': True}
            
            if 'daily' in om_data and 'weather_code' in om_data['daily']:
                today_code = om_data['daily']['weather_code'][0]
                if today_code >= 51:
                    insights.append("🌧️ Sắp tới có khả năng mưa, bạn ra ngoài nhớ mang theo ô nhé!" if is_vi else "🌧️ もうすぐ雨が降る可能性があります。外出時は傘をお忘れなく！")
                else:
                    insights.append("☀️ Thời tiết khá đẹp, chúc bạn một ngày làm việc tràn đầy năng lượng!" if is_vi else "☀️ 天気は良好です。今日も一日頑張りましょう！")
        except Exception as e:
            print(f"Weather prediction error in insights API: {e}")
            
        # 2. Basic Statistical Insights
        if total_truoc > 0:
            diff = ((total_nay - total_truoc) / total_truoc) * 100
            if diff > 0:
                insights.append(f"📈 Khối lượng task tăng {diff:.0f}% so với tuần trước." if is_vi else f"📈 今週のタスク量は先週より{diff:.0f}%増加。")
            elif diff < 0:
                insights.append(f"📉 Khối lượng task giảm {-diff:.0f}% so với tuần trước." if is_vi else f"📉 今週のタスク量は先週より{-diff:.0f}%減少。")
            else:
                insights.append(f"⚖️ Khối lượng task ổn định so với tuần trước." if is_vi else f"⚖️ 今週のタスク量は先週と同じです。")
        else:
            insights.append(f"🚀 Một tuần mới đầy năng lượng! Hãy lập kế hoạch thật tốt nhé." if is_vi else f"🚀 新しい一週間の始まりです！計画をしっかり立てましょう。")
        
        if total_nay > 0:
            completion_rate = (completed / total_nay) * 100
            if completion_rate >= 100:
                insights.append(f"🏆 Xuất sắc! Toàn bộ công việc tuần này đã được hoàn thành 100%." if is_vi else f"🏆 素晴らしい！全てのタスクが完了しました。")
            elif completion_rate >= 80:
                insights.append(f"🔥 Tuyệt vời! Đã hoàn thành {completion_rate:.0f}% công việc." if is_vi else f"🔥 素晴らしい！タスクの{completion_rate:.0f}%が完了しました。")
            elif completion_rate > 0:
                insights.append(f"📊 Tiến độ: {completion_rate:.0f}% task đã hoàn thành." if is_vi else f"📊 現在の進捗：タスクの{completion_rate:.0f}%が完了。")
            else:
                insights.append(f"🎯 Hãy bắt tay vào hoàn thành task đầu tiên của tuần này nhé!" if is_vi else f"🎯 今週の最初のタスクを完了させましょう！")
                
            in_progress = total_nay - completed - not_started
            if in_progress > 0:
                insights.append(f"⏳ Đang xử lý {in_progress} task, cố lên nào team!" if is_vi else f"⏳ 現在{in_progress}件のタスクが進行中です。頑張って！")
                
            if not_started > 0:
                insights.append(f"⚠️ Chú ý: Còn {not_started} task chưa bắt đầu." if is_vi else f"⚠️ 注意：まだ開始されていないタスクが{not_started}件。")
            else:
                if completed < total_nay:
                    insights.append(f"✨ Tuyệt vời! Tất cả các task đều đã được bắt đầu triển khai." if is_vi else f"✨ 素晴らしい！全てのタスクが開始されました。")

        # 3. LLM Insights via Groq
        groq_api_key = os.environ.get('GROQ_API_KEY', '')
        if groq_api_key:
            prompt = f"Bạn là một trợ lý AI thông minh phân tích tiến độ công việc của team dựa trên dữ liệu sau:\n"
            prompt += f"Ngôn ngữ: {'Tiếng Việt' if is_vi else '日本語'}\n"
            prompt += f"Tổng số task tuần này: {total_nay}\n"
            prompt += f"Tổng số task tuần trước: {total_truoc}\n"
            prompt += f"Số task đã hoàn thành tuần này: {completed}\n"
            prompt += f"Số task chưa bắt đầu: {not_started}\n"
            prompt += f"Hãy viết NGẮN GỌN (tối đa 2 câu) nhận xét về tiến độ và khích lệ team. Trả lời duy nhất nội dung nhận xét, bắt đầu bằng emoji phù hợp (như 🚀, 🔥, 📉, ⚠️)."
            
            try:
                res = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"},
                    json={
                        "model": "llama-3.1-8b-instant",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.7,
                        "max_tokens": 100
                    },
                    timeout=5
                )
                if res.status_code == 200:
                    ai_text = res.json()["choices"][0]["message"]["content"].strip()
                    if ai_text:
                        insights.append(ai_text)
            except Exception as e:
                print(f"Groq API error in insights: {e}")
                
        return jsonify({"status": "success", "insights": insights})
    except Exception as e:
        print("API Insights error:", e)
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/chart_data')
def api_chart_data():
    return jsonify(load_vntask_details())

@app.route('/')
def index():
    if session.get('logged_in'):
        return redirect('/dashboard')
    users = list(load_users_from_sheet(USER_SHEET_URL).keys())
    lang = session.get('lang', 'vi')
    return render_template('login.html', users=users, error=None, lang=lang)

@app.route('/login', methods=['POST'])
def login():
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    USER_DB = load_users_from_sheet(USER_SHEET_URL)
    users = list(USER_DB.keys())
    lang = session.get('lang', 'vi')

    if not username:
        return render_template('login.html', users=users, error="Vui lòng chọn tài khoản!", lang=lang)

    if username in USER_DB and USER_DB[username]["password"] == password:
        session['logged_in'] = True
        session['user'] = username
        session['role'] = USER_DB[username]["role"]
        if 'lang' not in session:
            session['lang'] = 'vi'
        return redirect('/dashboard')
    else:
        return render_template('login.html', users=users, error="Mật khẩu không chính xác!", lang=lang)

@app.route('/api/roles', methods=['POST'])
def update_roles():
    user = session.get('user')
    role = session.get('role')
    if not user or (user != 'Manager' and role not in ['admin', 'manager', 'leader']):
        return jsonify({"success": False, "message": "Unauthorized"}), 403
    
    data = request.json
    username = data.get("username")
    new_role = data.get("role")
    
    if not username or not new_role:
        return jsonify({"success": False, "message": "Missing parameters"}), 400
        
    try:
        res = requests.post(CHANGE_PASS_API, json={
            "action": "update_role",
            "username": username,
            "new_role": new_role
        }, timeout=15)
        res_data = res.json()
        
        if res_data.get("status") == "success":
            global USER_DB
            USER_DB = load_users_from_sheet(USER_SHEET_URL)
            if username in USER_DB:
                USER_DB[username]["role"] = new_role
            return jsonify({"success": True})
        else:
            return jsonify({"success": False, "message": res_data.get("message", "Lỗi từ Google Apps Script")}), 500
    except Exception as e:
        return jsonify({"success": False, "message": "Lỗi kết nối API"}), 500

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')

@app.route('/psd-tool')
def psd_tool():
    if not session.get('logged_in'):
        return redirect('/')
    lang = session.get('lang', 'vi')
    return render_template('psd_tool.html', lang=lang)


@app.route('/drive')
def lsa_drive():
    if not session.get('logged_in'):
        return redirect('/')
        
    data = process_dashboard_data()
    if data is None:
        return "Lỗi tải dữ liệu. Vui lòng kiểm tra lại link Google Sheets.", 500
    is_modal = request.args.get('modal') == '1'
    return render_template('drive.html', is_modal=is_modal, **data)

# =====================================================================
# DRIVE APIs
# =====================================================================
# Supabase Storage: dùng khi có cấu hình env (vd trên Vercel). Nếu không có
# thì Drive chạy trên filesystem local như cũ (thuận tiện cho dev).
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
# Hỗ trợ cả tên biến mới (SUPABASE_SECRET_KEY / sb_secret_...) lẫn cũ (service_role JWT).
SUPABASE_SERVICE_KEY = (
    os.environ.get('SUPABASE_SECRET_KEY')
    or os.environ.get('SUPABASE_SERVICE_KEY', '')
)
SUPABASE_BUCKET = os.environ.get('SUPABASE_BUCKET', 'drive')
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)

# File placeholder để "giả lập" thư mục rỗng trên object storage.
SB_KEEP = '.keep'


def _sb_headers(extra=None):
    h = {
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'apikey': SUPABASE_SERVICE_KEY,
    }
    if extra:
        h.update(extra)
    return h


def _sb_clean(path):
    """Chuẩn hóa path, chặn traversal. Trả về path tương đối trong bucket."""
    parts = [p for p in str(path or '').replace('\\', '/').split('/') if p and p != '.']
    if any(p == '..' for p in parts):
        return None
    return '/'.join(parts)


_sb_bucket_ready = False


def sb_ensure_bucket():
    """Tạo bucket private nếu chưa tồn tại. Chỉ chạy 1 lần mỗi tiến trình."""
    global _sb_bucket_ready
    if _sb_bucket_ready:
        return
    try:
        r = requests.post(
            f'{SUPABASE_URL}/storage/v1/bucket',
            headers=_sb_headers({'Content-Type': 'application/json'}),
            json={'id': SUPABASE_BUCKET, 'name': SUPABASE_BUCKET, 'public': False},
            timeout=30,
        )
        # 200 = tạo mới, 400/409 = đã tồn tại -> đều coi là sẵn sàng.
        _sb_bucket_ready = True
    except Exception:
        # Không chặn request nếu bước này lỗi; thao tác sau sẽ báo lỗi cụ thể.
        pass


def sb_list(prefix):
    """Liệt kê 1 cấp dưới prefix. Trả về list dict giống os: name/is_dir/size/modified/path."""
    sb_ensure_bucket()
    body = {
        'prefix': f'{prefix}/' if prefix else '',
        'limit': 1000,
        'offset': 0,
        'sortBy': {'column': 'name', 'order': 'asc'},
    }
    r = requests.post(
        f'{SUPABASE_URL}/storage/v1/object/list/{SUPABASE_BUCKET}',
        headers=_sb_headers({'Content-Type': 'application/json'}),
        json=body, timeout=30,
    )
    r.raise_for_status()
    items = []
    for obj in r.json():
        name = obj.get('name')
        if not name or name == SB_KEEP:
            continue
        # Folder: entry không có metadata/id (Supabase trả id=None cho "thư mục" ảo).
        is_dir = obj.get('id') is None
        meta = obj.get('metadata') or {}
        full = f'{prefix}/{name}'.strip('/') if prefix else name
        items.append({
            'name': name,
            'is_dir': is_dir,
            'size': meta.get('size', 0) if not is_dir else 0,
            'modified': obj.get('updated_at') or obj.get('created_at') or '',
            'path': full,
        })
    return items


def sb_upload(path, data, content_type='application/octet-stream'):
    sb_ensure_bucket()
    r = requests.post(
        f'{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{path}',
        headers=_sb_headers({'Content-Type': content_type, 'x-upsert': 'true'}),
        data=data, timeout=120,
    )
    r.raise_for_status()


def sb_list_recursive(prefix):
    """Trả về tất cả file (không phải folder) dưới prefix, đệ quy."""
    files = []
    for it in sb_list(prefix):
        if it['is_dir']:
            files.extend(sb_list_recursive(it['path']))
        else:
            files.append(it['path'])
    # gồm cả .keep để xóa sạch folder
    body = {'prefix': f'{prefix}/' if prefix else '', 'limit': 1000, 'offset': 0}
    r = requests.post(
        f'{SUPABASE_URL}/storage/v1/object/list/{SUPABASE_BUCKET}',
        headers=_sb_headers({'Content-Type': 'application/json'}),
        json=body, timeout=30,
    )
    if r.ok:
        for obj in r.json():
            if obj.get('name') == SB_KEEP:
                files.append(f'{prefix}/{SB_KEEP}'.strip('/'))
    return files


def sb_delete(paths):
    """Xóa danh sách object theo đường dẫn đầy đủ."""
    if not paths:
        return
    r = requests.delete(
        f'{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}',
        headers=_sb_headers({'Content-Type': 'application/json'}),
        json={'prefixes': paths}, timeout=60,
    )
    r.raise_for_status()


def sb_download_bytes(path):
    r = requests.get(
        f'{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{path}',
        headers=_sb_headers(), timeout=120,
    )
    r.raise_for_status()
    return r.content


def sb_sign_url(path, expires=120):
    r = requests.post(
        f'{SUPABASE_URL}/storage/v1/object/sign/{SUPABASE_BUCKET}/{path}',
        headers=_sb_headers({'Content-Type': 'application/json'}),
        json={'expiresIn': expires}, timeout=30,
    )
    r.raise_for_status()
    return SUPABASE_URL + '/storage/v1' + r.json()['signedURL']


@app.route('/api/drive/list', methods=['GET'])
def drive_list():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    req_path = request.args.get('path', '')

    if USE_SUPABASE:
        clean = _sb_clean(req_path)
        if clean is None:
            return jsonify({'error': 'Invalid path'}), 400
        try:
            items = sb_list(clean)
            return jsonify({'success': True, 'items': items, 'current_path': clean})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    target_dir = os.path.join(DRIVE_ROOT, req_path.strip('/'))

    if not os.path.abspath(target_dir).startswith(os.path.abspath(DRIVE_ROOT)):
        return jsonify({'error': 'Invalid path'}), 400

    if not os.path.exists(target_dir):
        return jsonify({'error': 'Path not found'}), 404

    items = []
    try:
        for filename in os.listdir(target_dir):
            filepath = os.path.join(target_dir, filename)
            is_dir = os.path.isdir(filepath)
            stats = os.stat(filepath)
            items.append({
                'name': filename,
                'is_dir': is_dir,
                'size': stats.st_size if not is_dir else 0,
                'modified': stats.st_mtime,
                'path': f"{req_path.strip('/')}/{filename}".strip('/')
            })
        return jsonify({'success': True, 'items': items, 'current_path': req_path.strip('/')})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/drive/upload', methods=['POST'])
def drive_upload():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401
        
    req_path = request.form.get('path', '')

    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    files = request.files.getlist('file')

    if USE_SUPABASE:
        clean = _sb_clean(req_path)
        if clean is None:
            return jsonify({'error': 'Invalid path'}), 400
        uploaded_files = []
        try:
            for file in files:
                if file.filename == '':
                    continue
                # Giữ tên file gốc (kể cả unicode), chỉ bỏ ký tự tách đường dẫn.
                filename = os.path.basename(file.filename.replace('\\', '/'))
                if not filename:
                    continue
                obj_path = f'{clean}/{filename}'.strip('/')
                sb_upload(obj_path, file.read(), file.mimetype or 'application/octet-stream')
                uploaded_files.append(filename)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        if uploaded_files:
            socketio.emit('drive_updated', {'path': clean})
        return jsonify({'success': True, 'uploaded': uploaded_files})

    target_dir = os.path.join(DRIVE_ROOT, req_path.strip('/'))

    if not os.path.abspath(target_dir).startswith(os.path.abspath(DRIVE_ROOT)):
        return jsonify({'error': 'Invalid path'}), 400

    os.makedirs(target_dir, exist_ok=True)
    socketio.emit('drive_updated', {'path': req_path.strip('/')})

    uploaded_files = []

    for file in files:
        if file.filename == '':
            continue
        filename = secure_filename(file.filename)
        # If secure_filename returns empty (e.g. for pure unicode filenames), fallback to original
        if not filename:
            filename = file.filename
        file_path = os.path.join(target_dir, filename)
        file.save(file_path)
        uploaded_files.append(filename)
    if uploaded_files:
        socketio.emit('drive_updated', {'path': req_path.strip('/')})

    return jsonify({'success': True, 'uploaded': uploaded_files})

@app.route('/api/drive/create_folder', methods=['POST'])
def drive_create_folder():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json or {}
    req_path = data.get('path', '')
    folder_name = data.get('folder_name', '').strip()
    
    if not folder_name:
        return jsonify({'error': 'Folder name required'}), 400

    if USE_SUPABASE:
        base = _sb_clean(req_path)
        # tên folder không được chứa dấu tách đường dẫn
        safe_name = folder_name.replace('/', '').replace('\\', '')
        if base is None or not safe_name or safe_name in ('.', '..'):
            return jsonify({'error': 'Invalid path'}), 400
        folder = f'{base}/{safe_name}'.strip('/')
        try:
            # Tạo folder ảo bằng file placeholder .keep
            sb_upload(f'{folder}/{SB_KEEP}', b'', 'text/plain')
            socketio.emit('drive_updated', {'path': base})
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    target_dir = os.path.join(DRIVE_ROOT, req_path.strip('/'), secure_filename(folder_name) or folder_name)

    if not os.path.abspath(target_dir).startswith(os.path.abspath(DRIVE_ROOT)):
        return jsonify({'error': 'Invalid path'}), 400

    try:
        os.makedirs(target_dir, exist_ok=True)
        socketio.emit('drive_updated', {'path': req_path.strip('/')})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/drive/delete', methods=['POST'])
def drive_delete():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json or {}
    req_path = data.get('path', '')
    
    if not req_path:
        return jsonify({'error': 'Path required'}), 400

    if USE_SUPABASE:
        clean = _sb_clean(req_path)
        if not clean:
            return jsonify({'error': 'Invalid path'}), 400
        try:
            # Là folder nếu có object bên dưới prefix; luôn thử xóa cả chính path (file).
            to_delete = sb_list_recursive(clean)
            to_delete.append(clean)
            sb_delete(list(set(to_delete)))
            socketio.emit('drive_updated', {'path': clean.rsplit('/', 1)[0] if '/' in clean else ''})
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    target = os.path.join(DRIVE_ROOT, req_path.strip('/'))

    if not os.path.abspath(target).startswith(os.path.abspath(DRIVE_ROOT)) or os.path.abspath(target) == os.path.abspath(DRIVE_ROOT):
        return jsonify({'error': 'Invalid path'}), 400

    try:
        if os.path.isdir(target):
            shutil.rmtree(target)
        elif os.path.exists(target):
            os.remove(target)
        else:
            return jsonify({'error': 'File not found'}), 404
        socketio.emit('drive_updated', {'path': os.path.dirname(req_path.strip('/'))})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/drive/download')
def drive_download():
    if not session.get('logged_in'):
        return redirect('/')
        
    req_path = request.args.get('path', '')
    if not req_path:
        return "Path required", 400

    if USE_SUPABASE:
        clean = _sb_clean(req_path)
        if not clean:
            return "Invalid path", 400
        try:
            # Redirect tới signed URL (hết hạn sau 2 phút) để trình duyệt tải trực tiếp.
            return redirect(sb_sign_url(clean, expires=120))
        except Exception:
            return "File not found", 404

    target = os.path.join(DRIVE_ROOT, req_path.strip('/'))

    if not os.path.abspath(target).startswith(os.path.abspath(DRIVE_ROOT)):
        return "Invalid path", 400

    if not os.path.isfile(target):
        return "File not found", 404

    directory = os.path.dirname(target)
    filename = os.path.basename(target)
    return send_from_directory(directory, filename, as_attachment=True)

@app.route('/api/drive/delete_multiple', methods=['POST'])
def drive_delete_multiple():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json or {}
    paths = data.get('paths', [])
    
    if not paths or not isinstance(paths, list):
        return jsonify({'error': 'No paths provided'}), 400

    errors = []
    success_count = 0

    if USE_SUPABASE:
        all_objs = []
        for req_path in paths:
            clean = _sb_clean(req_path)
            if not clean:
                errors.append(f"Invalid path: {req_path}")
                continue
            try:
                objs = sb_list_recursive(clean)
                objs.append(clean)
                all_objs.extend(objs)
                success_count += 1
            except Exception as e:
                errors.append(f"Failed to delete {req_path}: {str(e)}")
        try:
            if all_objs:
                sb_delete(list(set(all_objs)))
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        if success_count > 0:
            socketio.emit('drive_updated', {})
        if errors and success_count == 0:
            return jsonify({'error': 'Tất cả file/thư mục đều không thể xóa', 'details': errors}), 500
        elif errors:
            return jsonify({'success': True, 'warning': f'Đã xóa {success_count} mục, lỗi {len(errors)} mục.', 'details': errors})
        return jsonify({'success': True})

    for req_path in paths:
        target = os.path.join(DRIVE_ROOT, req_path.strip('/'))
        if not os.path.abspath(target).startswith(os.path.abspath(DRIVE_ROOT)) or os.path.abspath(target) == os.path.abspath(DRIVE_ROOT):
            errors.append(f"Invalid path: {req_path}")
            continue

        try:
            if os.path.isdir(target):
                shutil.rmtree(target)
            elif os.path.exists(target):
                os.remove(target)
            success_count += 1
        except Exception as e:
            errors.append(f"Failed to delete {req_path}: {str(e)}")

    if success_count > 0:
        socketio.emit('drive_updated', {})
        
    if errors and success_count == 0:
        return jsonify({'error': 'Tất cả file/thư mục đều không thể xóa', 'details': errors}), 500
    elif errors:
        return jsonify({'success': True, 'warning': f'Đã xóa {success_count} mục, lỗi {len(errors)} mục.', 'details': errors})
    return jsonify({'success': True})

@app.route('/api/drive/download_multiple', methods=['POST'])
def drive_download_multiple():
    if not session.get('logged_in'):
        return "Unauthorized", 401
        
    data = request.json or {}
    paths = data.get('paths', [])
    
    if not paths or not isinstance(paths, list):
        return "No paths provided", 400

    memory_file = io.BytesIO()

    if USE_SUPABASE:
        try:
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for req_path in paths:
                    clean = _sb_clean(req_path)
                    if not clean:
                        continue
                    files = sb_list_recursive(clean)
                    if files:
                        # Là folder: giữ cấu trúc tương đối so với thư mục cha.
                        parent = clean.rsplit('/', 1)[0] if '/' in clean else ''
                        for obj in files:
                            if os.path.basename(obj) == SB_KEEP:
                                continue
                            arcname = obj[len(parent):].lstrip('/') if parent else obj
                            zf.writestr(arcname, sb_download_bytes(obj))
                    else:
                        # Là file đơn.
                        zf.writestr(os.path.basename(clean), sb_download_bytes(clean))
        except Exception as e:
            return f"Lỗi tải: {str(e)}", 500
        memory_file.seek(0)
        zip_name = "LSA_Drive_Download.zip"
        if len(paths) == 1:
            single = _sb_clean(paths[0])
            if single and sb_list_recursive(single):
                zip_name = f"{os.path.basename(single)}.zip"
        return send_file(memory_file, download_name=zip_name, as_attachment=True, mimetype='application/zip')

    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for req_path in paths:
            target = os.path.join(DRIVE_ROOT, req_path.strip('/'))
            if not os.path.abspath(target).startswith(os.path.abspath(DRIVE_ROOT)):
                continue

            if os.path.isfile(target):
                zf.write(target, os.path.basename(target))
            elif os.path.isdir(target):
                for root, dirs, files in os.walk(target):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, os.path.dirname(target))
                        zf.write(file_path, arcname)

    memory_file.seek(0)

    # Download name
    zip_name = "LSA_Drive_Download.zip"
    if len(paths) == 1:
        req_path = paths[0].strip('/')
        target = os.path.join(DRIVE_ROOT, req_path)
        if os.path.isdir(target):
            zip_name = f"{os.path.basename(target)}.zip"

    return send_file(memory_file, download_name=zip_name, as_attachment=True, mimetype='application/zip')



@app.route('/dashboard')
def dashboard():
    if not session.get('logged_in'):
        return redirect('/')

    data = process_dashboard_data()
    if data is None:
        return "Lỗi tải dữ liệu. Vui lòng kiểm tra lại link Google Sheets.", 500

    return render_template('dashboard.html', **data)

@app.route('/debug-who-am-i')
def debug_who_am_i():
    import os, re, platform, subprocess
    t_path = os.path.abspath(os.path.join(app.template_folder, 'dashboard.html'))
    try:
        with open(t_path, 'r', encoding='utf-8') as f:
            content = f.read()
        ver_match = re.findall(r'v1\.\d+\.\d+', content)
    except Exception as e:
        ver_match = [str(e)]
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    cf_path = os.path.join(base_dir, 'cloudflared')
    log_path = os.path.join(base_dir, 'cloudflared.log')
    
    cf_info = {
        'exists': os.path.exists(cf_path),
        'size': os.path.getsize(cf_path) if os.path.exists(cf_path) else 0,
        'mode': oct(os.stat(cf_path).st_mode) if os.path.exists(cf_path) else None,
    }
    
    if os.path.exists(cf_path):
        try:
            os.chmod(cf_path, 0o755)
            r = subprocess.run([cf_path, '--version'], capture_output=True, text=True, timeout=5)
            cf_info['version_out'] = (r.stdout or r.stderr or '').strip()
            cf_info['version_rc'] = r.returncode
        except Exception as ex:
            cf_info['version_err'] = str(ex)
            
    log_content = ''
    if os.path.exists(log_path):
        try:
            with open(log_path, 'r', encoding='utf-8', errors='ignore') as lf:
                log_content = lf.read()[-3000:]
        except Exception as ex:
            log_content = str(ex)
            
    return jsonify({
        'pid': os.getpid(),
        'platform': platform.platform(),
        'arch': platform.machine(),
        'cwd': os.getcwd(),
        'dir_files': [f for f in os.listdir(base_dir) if not f.startswith('.')],
        'file': os.path.abspath(__file__),
        'template_path': t_path,
        'versions_in_file': ver_match[:5],
        'cf_info': cf_info,
        'cf_log': log_content
    })


# =====================================================================
# 10. API ENDPOINTS
# =====================================================================
@app.route('/api/logtime/warmup', methods=['POST'])
def api_logtime_warmup():
    if not session.get('logged_in'):
        return jsonify({"status": "error"}), 401
    warmup_logtime_connections()
    return jsonify({"status": "ok"})

@app.route('/api/logtime', methods=['POST'])
def api_logtime():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "Không có dữ liệu gửi lên"}), 400

    # Bắt buộc điền đủ tất cả các trường, ngoại lệ chỉ ghi chú được bỏ trống
    required_map = {
        'category': 'Loại truyện',
        'difficulty': 'Độ khó',
        'nguoi_thuc_hien': 'Người làm',
        'ngay_log': 'Ngày làm việc',
        'so_gio': 'Giờ làm hôm nay',
        'so_trang_tong': 'Tổng số trang',
        'so_page': 'Số page hoàn thành'
    }
    for field_key, field_name in required_map.items():
        val = data.get(field_key)
        if val is None or str(val).strip() == '':
            return jsonify({"status": "error", "message": f"Vui lòng nhập/chọn {field_name}, không được để trống!"}), 400

    try:
        if float(data.get('so_gio', 0)) <= 0:
            return jsonify({"status": "error", "message": "Giờ làm hôm nay phải lớn hơn 0!"}), 400
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "Giờ làm hôm nay không hợp lệ!"}), 400

    if save_logtime(data):
        # Pet reward: chạy ngầm trên background thread để response gửi về client ngay lập tức
        username = session.get('user', '')
        if username:
            threading.Thread(target=pet_add_xp, args=(username, 0, 'logtime'), daemon=True).start()
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "Lỗi khi lưu logtime"}), 500

@app.route('/api/log_member_time', methods=['POST'])
def api_log_member_time():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    
    data = request.get_json()
    username = session.get('user', '')
    payload = {
        "action": "log_member_time",
        "username": username,
        "task_name": data.get('task_name', ''),
        "duration": data.get('duration', '0'),
        "start_time": data.get('start_time', ''),
        "end_time": data.get('end_time', ''),
        "start_date": data.get('start_date', ''),
        "end_date": data.get('end_date', ''),
        "note": data.get('note', '')
    }
    
    try:
        res = requests.post(LOGTIME_API_URL, json=payload)
        if res.status_code == 200 and res.json().get('status') == 'success':
            return jsonify({"status": "success"})
        return jsonify({"status": "error", "message": "Apps Script error"})
    except Exception as e:
        print("Log member time error:", e)
        return jsonify({"status": "error", "message": "Server error"}), 500

@app.route('/api/change-password', methods=['POST'])
def api_change_password():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    
    data = request.get_json()
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')
    username = session.get('user', '')

    USER_DB = load_users_from_sheet(USER_SHEET_URL)
    if username not in USER_DB or USER_DB[username]["password"] != old_password:
        return jsonify({"status": "error", "message": "Mật khẩu cũ không chính xác!"})

    if new_password == old_password:
        return jsonify({"status": "error", "message": "Mật khẩu mới phải khác mật khẩu cũ!"})

    try:
        res = requests.post(CHANGE_PASS_API, json={
            "username": username,
            "old_password": old_password,
            "new_password": new_password
        })
        if res.json().get("status") == "success":
            clear_cache('load_users_from_sheet')
            return jsonify({"status": "success"})
        else:
            return jsonify({"status": "error", "message": "Lỗi cập nhật!"})
    except Exception:
        return jsonify({"status": "error", "message": "Lỗi kết nối!"})

# =====================================================================
# CALENDAR ROUTES
# =====================================================================
@app.route('/calendar')
def calendar_view():
    if not session.get('logged_in'):
        return redirect('/')
    embed_url = os.environ.get('GOOGLE_CALENDAR_EMBED_URL', '').strip()
    
    # Đọc thủ công từ .env.local nếu chạy local không dùng dotenv
    if not embed_url and os.path.exists('.env.local'):
        try:
            with open('.env.local', 'r', encoding='utf-8') as f:
                for line in f:
                    if line.startswith('GOOGLE_CALENDAR_EMBED_URL='):
                        embed_url = line.split('=', 1)[1].strip()
                        break
        except Exception:
            pass

    if embed_url:
        import re
        if 'src=' in embed_url:
            match = re.search(r'src=["\']([^"\']+)["\']', embed_url)
            if match:
                embed_url = match.group(1)
        # Sửa lỗi url có chứa ký tự như &amp; thay vì &
        embed_url = embed_url.replace('&amp;', '&')
        return redirect(embed_url)
    return "<h3 style='color: #cbd5e1; font-family: sans-serif; text-align: center; margin-top: 50px;'>Vui lòng dán mã nhúng vào biến GOOGLE_CALENDAR_EMBED_URL trong file .env.local</h3>", 200

@app.route('/api/export_notion_csv')
def export_notion_csv():
    import csv, io
    from flask import make_response
    if not session.get('logged_in'):
        return redirect('/')
    w = request.args.get('w', 'nay')
    data = process_dashboard_data()
    if not data or 'weeks' not in data or w not in data['weeks']:
        return "No data", 404
        
    dashboard_data = data['weeks'][w]['dashboard']
    
    si = io.StringIO()
    si.write('\ufeff')
    writer = csv.writer(si)
    writer.writerow(['Name', '作品名', 'ステータス', 'Start Date', 'End Date', '作業者', '納品日'])
    
    for row in dashboard_data:
        title = row.get('job_type', '')
        project_name = row.get('name', '')
        status_class = row.get('status_class', '')
        if status_class == 'delivered':
            status = 'Done'
        elif status_class == 'in-progress':
            status = 'In Progress'
        else:
            status = 'Not Started'
            
        start_date = row.get('start_date', '')
        end_date = row.get('end_date', '')
        worker = row.get('worker', '')
        deadline = row.get('end_date', '') 
        
        writer.writerow([title, project_name, status, start_date, end_date, worker, deadline])
        
    output = make_response(si.getvalue())
    output.headers["Content-Disposition"] = f"attachment; filename=notion_export_{w}.csv"
    output.headers["Content-type"] = "text/csv"
    return output

@app.route('/api/export_single_notion_csv')
def export_single_notion_csv():
    import csv, io
    from flask import make_response
    if not session.get('logged_in'):
        return redirect('/')
    tp_key = request.args.get('tp_key', '')
    if not tp_key:
        return "No task specified", 400
        
    data = process_dashboard_data()
    if not data:
        return "No data", 404
        
    target_row = None
    for w in ['truoc', 'nay', 'sau']:
        for row in data['weeks'][w]['dashboard']:
            if str(row.get('key')) == str(tp_key):
                target_row = row
                break
        if target_row:
            break
            
    if not target_row:
        return "Task not found", 404
        
    si = io.StringIO()
    si.write('\ufeff')
    writer = csv.writer(si)
    writer.writerow(['Name', '作品名', 'ステータス', 'Start Date', 'End Date', '作業者', '納品日'])
    
    title = target_row.get('job_type', '')
    project_name = target_row.get('name', '')
    status_class = target_row.get('status_class', '')
    if status_class == 'delivered':
        status = 'Done'
    elif status_class == 'in-progress':
        status = 'In Progress'
    else:
        status = 'Not Started'
        
    start_date = target_row.get('start_date', '')
    end_date = target_row.get('end_date', '')
    worker = target_row.get('worker', '')
    deadline = target_row.get('end_date', '') 
    
    writer.writerow([title, project_name, status, start_date, end_date, worker, deadline])
    
    output = make_response(si.getvalue())
    output.headers["Content-Disposition"] = f"attachment; filename=notion_export_{tp_key}.csv"
    output.headers["Content-type"] = "text/csv"
    return output


@app.route('/api/data')
def api_data():
    if not session.get('logged_in'):
        return jsonify({"status": "error"}), 401
    clear_cache('load_sheet_data')
    clear_cache('load_checklist_data')
    return jsonify({"status": "ok"})

@app.route('/api/avatar-proxy')
def api_avatar_proxy():
    """Proxy Google Drive images to avoid CORS/redirect issues."""
    from flask import Response
    file_id = request.args.get('id', '').strip()
    if not file_id or not re.match(r'^[a-zA-Z0-9_-]+$', file_id):
        return Response('Invalid ID', status=400)
    
    # Try multiple Google Drive URL patterns
    urls_to_try = [
        f"https://drive.google.com/thumbnail?id={file_id}&sz=w400",
        f"https://lh3.googleusercontent.com/d/{file_id}",
        f"https://drive.google.com/uc?export=view&id={file_id}",
    ]
    
    for img_url in urls_to_try:
        try:
            resp = requests.get(img_url, timeout=10, allow_redirects=True, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            content_type = resp.headers.get('Content-Type', '')
            if resp.status_code == 200 and content_type.startswith('image'):
                return Response(
                    resp.content,
                    content_type=content_type,
                    headers={
                        'Cache-Control': 'public, max-age=86400',
                        'Access-Control-Allow-Origin': '*'
                    }
                )
        except Exception:
            continue
    
# =====================================================================
# 10b. VIRTUAL PET SYSTEM
# =====================================================================
PET_ACCESSORIES = [
    {'id': 'sunglasses', 'name': 'Kính râm 🕶️', 'emoji': '🕶️'},
    {'id': 'magic_hat', 'name': 'Nón ảo thuật 🎩', 'emoji': '🎩'},
    {'id': 'bow', 'name': 'Nơ đỏ 🎀', 'emoji': '🎀'},
    {'id': 'crown', 'name': 'Vương miện 👑', 'emoji': '👑'},
    {'id': 'halo', 'name': 'Thiên thần 👼', 'emoji': '👼'},
    {'id': 'gold_chain', 'name': 'Dây chuyền vàng 🏅', 'emoji': '🏅'}
]

def _get_random_accessory(pet):
    import random
    owned = pet.get('accessories', [])
    available = [a for a in PET_ACCESSORIES if a['id'] not in owned]
    if not available:
        return None
    return random.choice(available)['id']

PET_TYPES = {
    'shiba':          {'name_vi': 'Chó Cưng',               'name_ja': '子犬',        'emoji': '🐕', 'sound': 'Gâu gâu! Woof! 🐾',   'food_name': 'Xương thịt 🍖', 'desc': 'Trung thành, hoạt bát, luôn hăng hái nhắc bạn nộp task'},
    'neko':           {'name_vi': 'Mèo Kitty',              'name_ja': '子猫',        'emoji': '🐱', 'sound': 'Nya~ Meow! 🐾',       'food_name': 'Cá tươi 🐟',   'desc': 'Dễ thương, quấn quýt, thích được xoa đầu và cưng nựng'},
    'fox':            {'name_vi': 'Hổ Vằn',                 'name_ja': 'トラ',        'emoji': '🐯', 'sound': 'Grrr~ Gầm! 🐾',       'food_name': 'Thịt bò 🥩',   'desc': 'Dũng mãnh, bảo vệ bạn hoàn thành mọi deadline'},
    'bunny':          {'name_vi': 'Cánh Cụt',               'name_ja': 'ペンギン',    'emoji': '🐧', 'sound': 'Pingu pingu~ ❄️',     'food_name': 'Cá nhỏ 🐟',   'desc': 'Lon ton, ngộ nghĩnh, dáng đi lắc lư cực kỳ giải trí'},
    'panda':          {'name_vi': 'Ngựa Con',               'name_ja': '子馬',        'emoji': '🐴', 'sound': 'Hí hí~ Nhong! 🌾',    'food_name': 'Cà rốt 🥕',   'desc': 'Năng động, chạy nhảy siêu nhanh giúp tiến độ luôn thần tốc'},
    'dragon':         {'name_vi': 'Hươu Sao',               'name_ja': 'シカ',        'emoji': '🦌', 'sound': 'Ngơ ngác ngác~ 🌿',   'food_name': 'Lộc non 🍀',   'desc': 'Thanh thoát, hiền lành, mang lại may mắn và bình an'},
    'chicken':        {'name_vi': 'Gà Con',                 'name_ja': 'ヒヨコ',      'emoji': '🐥', 'sound': 'Chíp chíp! 🌾',       'food_name': 'Thóc vàng 🌾', 'desc': 'Nhí nhảnh, siêng năng dậy sớm gáy nhắc việc'},
    'husky':          {'name_vi': 'Chó Husky',              'name_ja': 'ハスキー',    'emoji': '🐺', 'sound': 'Húuu~ Woof! ❄️',     'food_name': 'Thịt nướng 🍖', 'desc': 'Ngáo ngơ, hài hước, năng lượng tràn trề tiếp thêm động lực'},
    'alpaca':         {'name_vi': 'Lạc Đà Alpaca',          'name_ja': 'アルパカ',    'emoji': '🦙', 'sound': 'Hummm~ 🌸',           'food_name': 'Cỏ non 🌿',    'desc': 'Bông xù đáng yêu, điềm tĩnh xả stress cực tốt'},
    'duck':           {'name_vi': 'Vịt Vàng',               'name_ja': 'アヒル',      'emoji': '🦆', 'sound': 'Cạp cạp! Quack! 🌊',   'food_name': 'Bánh mì 🍞',   'desc': 'Vui tươi, dáng đi lạch bạch ngộ nghĩnh xua tan mệt mỏi'},
    'redfox':         {'name_vi': 'Cáo Đỏ',                 'name_ja': 'キツネ',      'emoji': '🦊', 'sound': 'Yip yip! 🍁',          'food_name': 'Quả mọng 🫐',  'desc': 'Nhanh nhẹn, thông minh, tinh ranh giúp bạn xử lý task thần tốc'},
    'cat':            {'name_vi': 'Mèo Mun',                'name_ja': '黒猫',        'emoji': '🐈', 'sound': 'Meo meo~ Nya! 🐾',      'food_name': 'Cá nướng 🐟',  'desc': 'Linh hoạt, uyển chuyển, thích nhảy nhót và xoa đầu'},
    'deer_forest':    {'name_vi': 'Hươu Rừng',              'name_ja': '森のシカ',    'emoji': '🦌', 'sound': 'Ngơ ngác~ 🌲',         'food_name': 'Cỏ tươi 🌿',   'desc': 'Dáng vẻ oai phong, bước đi uyển chuyển giữa rừng xanh'},
    'horse_stallion': {'name_vi': 'Chiến Mã',               'name_ja': '駿馬',        'emoji': '🐎', 'sound': 'Hí hí~ Phi nhanh! ⚔️', 'food_name': 'Táo đỏ 🍎',   'desc': 'Dũng mãnh, phi nước đại bứt phá mọi chỉ tiêu công việc'},
    'shiba_inu':      {'name_vi': 'Shiba Inu',              'name_ja': '柴犬',        'emoji': '🐕', 'sound': 'Gâu gâu! Wan! 🐾',     'food_name': 'Thịt nướng 🍖', 'desc': 'Chó Shiba chuẩn Nhật Bản, thông minh và trung thành'},
}

# Aliases for multi-key compatibility
PET_TYPES['dog'] = PET_TYPES['shiba']
PET_TYPES['kitty'] = PET_TYPES['neko']
PET_TYPES['tiger'] = PET_TYPES['fox']
PET_TYPES['penguin'] = PET_TYPES['bunny']
PET_TYPES['pinguin'] = PET_TYPES['bunny']
PET_TYPES['horse'] = PET_TYPES['panda']
PET_TYPES['deer'] = PET_TYPES['dragon']
PET_TYPES['duckling'] = PET_TYPES['duck']

# XP thresholds per level range
def _pet_xp_for_level(level):
    """XP cần để lên level tiếp theo."""
    if level < 5:    return 30
    if level < 15:   return 60
    if level < 30:   return 100
    return 150

def _pet_stage(level):
    """Trả về stage dựa trên level."""
    if level < 5:    return 'baby'
    if level < 15:   return 'teen'
    if level < 30:   return 'adult'
    return 'legendary'

def _pet_mood(last_activity_str):
    """Tính mood dựa trên thời gian activity gần nhất."""
    if not last_activity_str:
        return 'sad'
    try:
        last = datetime.fromisoformat(last_activity_str)
        now = datetime.now()
        
        # Cuối tuần (T7, CN) pet sẽ auto ngủ
        if now.weekday() >= 5:
            return 'sleep'
            
        hours_diff = (now - last).total_seconds() / 3600

        # Vừa mới có tương tác (feed, click) < 6 phút (0.1 giờ) -> Vẫn thức/happy dù là ban đêm
        if hours_diff < 0.1:
            return 'happy'

        # Ngoài giờ làm (22h-7h)
        if now.hour >= 22 or now.hour < 7:
            return 'sleep'
        if hours_diff < 2:
            return 'happy'
        if hours_diff < 24:
            return 'normal'
        return 'sad'
    except Exception:
        return 'normal'


def safe_sb_filename(u):
    import base64
    return base64.urlsafe_b64encode(u.encode('utf-8')).decode('utf-8')

def _pet_read(username):
    """Đọc pet data từ Supabase hoặc Local."""
    if not username:
        return None
    if USE_SUPABASE:
        try:
            # Dùng base64 để tránh lỗi encoding filename trên Supabase Storage
            sb_user = safe_sb_filename(username)
            data = sb_download_bytes(f'_system/pets/{sb_user}.json')
            if data:
                d = json.loads(data.decode('utf-8'))
                if 'pets' in d and len(d['pets']) > 0:
                    return d['pets'][d.get('active_pet', 0)] # migration fallback
                return d
        except Exception:
            pass
        # Fallback to check plain username in Supabase in case they had old data
        try:
            data = sb_download_bytes(f'_system/pets/{username}.json')
            if data:
                d = json.loads(data.decode('utf-8'))
                if 'pets' in d and len(d['pets']) > 0:
                    return d['pets'][d.get('active_pet', 0)]
                return d
        except Exception:
            pass
        return None
    else:
        # Fallback local
        try:
            path = os.path.join(DRIVE_ROOT, '_system', 'pets', f'{username}.json')
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    d = json.load(f)
                    if 'pets' in d and len(d['pets']) > 0:
                        return d['pets'][d.get('active_pet', 0)]
                    return d
        except Exception:
            pass
        return None


def _pet_write(username, pet_data):
    """Ghi pet data lên Supabase hoặc Local."""
    if not username:
        return False
    if USE_SUPABASE:
        try:
            json_data = json.dumps(pet_data, ensure_ascii=False).encode('utf-8')
            sb_user = safe_sb_filename(username)
            sb_upload(f'_system/pets/{sb_user}.json', json_data, content_type='application/json')
            return True
        except Exception as e:
            print(f"Pet write error for {username}: {e}")
            return False
    else:
        # Fallback local
        try:
            path = os.path.join(DRIVE_ROOT, '_system', 'pets', f'{username}.json')
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(pet_data, f, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"Local pet write error for {username}: {e}")
def _pet_delete(username):
    """Xóa hoàn toàn pet data của user khỏi Supabase và Local."""
    if not username:
        return
    if USE_SUPABASE:
        try:
            sb_user = safe_sb_filename(username)
            sb_delete([f'_system/pets/{sb_user}.json', f'_system/pets/{username}.json'])
        except Exception as e:
            print(f"Pet delete error on Supabase for {username}: {e}")
    try:
        path = os.path.join(DRIVE_ROOT, '_system', 'pets', f'{username}.json')
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Local pet delete error for {username}: {e}")


def pet_add_xp(username, amount, reason=''):
    """Thêm XP cho pet. Trả về dict {leveled_up, new_level, pet_data} hoặc None."""
    pet = _pet_read(username)
    if not pet:
        return None

    old_level = pet.get('level', 1)
    pet['xp'] = pet.get('xp', 0) + amount
    pet['last_activity'] = datetime.now().isoformat()

    # Food token: 1 food per checklist or logtime
    if reason in ('checklist', 'logtime'):
        pet['food'] = pet.get('food', 0) + 1

    # Level up check
    leveled_up = False
    while True:
        xp_needed = _pet_xp_for_level(pet.get('level', 1))
        if pet['xp'] >= xp_needed:
            pet['xp'] -= xp_needed
            pet['level'] = pet.get('level', 1) + 1
            leveled_up = True
            
            # Rớt phụ kiện
            new_acc = _get_random_accessory(pet)
            if new_acc:
                accs = pet.get('accessories', [])
                if new_acc not in accs:
                    accs.append(new_acc)
                pet['accessories'] = accs
        else:
            break

    pet['stage'] = _pet_stage(pet.get('level', 1))
    _pet_write(username, pet)

    return {
        'leveled_up': leveled_up,
        'old_level': old_level,
        'new_level': pet.get('level', 1),
        'xp_gained': amount,
        'reason': reason,
        'pet_data': pet
    }


@app.route('/api/pet/leaderboard', methods=['GET'])
def api_pet_leaderboard():
    """Lấy danh sách pet của tất cả người dùng để xếp hạng."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    leaderboard = []
    # Lấy danh sách tất cả người dùng từ USER_DB
    USER_DB = load_users_from_sheet(USER_SHEET_URL)
    users = list(USER_DB.keys())
    for username in users:
        pet = _pet_read(username)
        if pet:
            # Tính mood và stage động
            mood = _pet_mood(pet.get('last_activity'))
            stage = _pet_stage(pet.get('level', 1))
            
            leaderboard.append({
                'username': username,
                'name': pet.get('name', 'Pet'),
                'type': pet.get('type', 'neko'),
                'level': pet.get('level', 1),
                'xp': pet.get('xp', 0),
                'mood': mood,
                'stage': stage,
                'food': pet.get('food', 0)
            })

    # Sắp xếp theo level giảm dần, sau đó theo xp giảm dần
    leaderboard.sort(key=lambda x: (x['level'], x['xp']), reverse=True)
    return jsonify({'success': True, 'leaderboard': leaderboard})

@app.route('/api/pet/reset', methods=['POST'])
def api_pet_reset():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401
    username = session.get('user', '')
    _pet_delete(username)
    return jsonify({'success': True})

@app.route('/api/pet', methods=['GET'])
def api_pet_get():
    """Lấy thông tin pet hiện tại."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    pet = _pet_read(username)

    if not pet:
        return jsonify({'has_pet': False, 'pet_types': PET_TYPES})

    # Tính mood động
    pet['mood'] = _pet_mood(pet.get('last_activity'))
    pet['stage'] = _pet_stage(pet.get('level', 1))
    pet['xp_needed'] = _pet_xp_for_level(pet.get('level', 1))

    needs_write = False

    # Daily food check (1 cục mỗi ngày)
    today_str = date.today().isoformat()
    if pet.get('last_daily_food_date') != today_str:
        pet['food'] = pet.get('food', 0) + 1
        pet['last_daily_food_date'] = today_str
        needs_write = True

    # 4-hour passive food check (1 cục mỗi 4 tiếng)
    now = datetime.now()
    if 'last_4h_food_time' not in pet:
        # Khởi tạo mốc thời gian nếu chưa có (không buff rückwirkend)
        pet['last_4h_food_time'] = now.isoformat()
        needs_write = True
    else:
        try:
            last_4h = datetime.fromisoformat(pet['last_4h_food_time'])
            hours_diff = (now - last_4h).total_seconds() / 3600
            if hours_diff >= 4:
                food_gained = int(hours_diff // 4)
                pet['food'] = pet.get('food', 0) + food_gained
                pet['last_4h_food_time'] = (last_4h + timedelta(hours=4 * food_gained)).isoformat()
                needs_write = True
        except Exception:
            pet['last_4h_food_time'] = now.isoformat()
            needs_write = True

    # Login streak check (Bỏ qua T7, CN)
    today = date.today()
    if today.weekday() < 5:  # Chỉ tính vào Thứ 2 -> Thứ 6
        if pet.get('last_login_date') != today_str:
            # Nếu hnay là Thứ 2, thì yesterday hợp lệ để nối chuỗi là Thứ 6 (-3 ngày)
            if today.weekday() == 0:
                yesterday = (today - timedelta(days=3)).isoformat()
            else:
                yesterday = (today - timedelta(days=1)).isoformat()
                
            if pet.get('last_login_date') == yesterday:
                pet['login_streak'] = pet.get('login_streak', 0) + 1
            else:
                pet['login_streak'] = 1
            pet['last_login_date'] = today_str

            # Streak XP bonus
            streak_xp = min(pet['login_streak'] * 3, 15)  # cap 15 XP
            pet['xp'] = pet.get('xp', 0) + streak_xp
            pet['last_activity'] = datetime.now().isoformat()

            # Level up check after streak
            while True:
                xp_needed = _pet_xp_for_level(pet.get('level', 1))
                if pet['xp'] >= xp_needed:
                    pet['xp'] -= xp_needed
                    pet['level'] = pet.get('level', 1) + 1
                    
                    new_acc = _get_random_accessory(pet)
                    if new_acc:
                        accs = pet.get('accessories', [])
                        if new_acc not in accs:
                            accs.append(new_acc)
                        pet['accessories'] = accs
                else:
                    break
            pet['stage'] = _pet_stage(pet.get('level', 1))
            pet['xp_needed'] = _pet_xp_for_level(pet.get('level', 1))
            needs_write = True
            
    if needs_write:
        _pet_write(username, pet)

    return jsonify({'has_pet': True, 'pet_types': PET_TYPES, **pet})


@app.route('/api/pet/adopt', methods=['POST'])
def api_pet_adopt():
    """Nhận nuôi hoặc ĐỔI pet (Reset)."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    
    data = request.get_json(silent=True) or {}
    pet_type = data.get('type', '').strip()
    pet_name = data.get('name', '').strip()

    if pet_type not in PET_TYPES:
        return jsonify({'error': 'Invalid pet type'}), 400
    if not pet_name or len(pet_name) > 20:
        return jsonify({'error': 'Invalid name (1-20 chars)'}), 400

    pet_data = {
        'type': pet_type,
        'name': pet_name,
        'xp': 0,
        'level': 1,
        'stage': 'baby',
        'mood': 'happy',
        'food': 3,  # Start with some food
        'last_activity': datetime.now().isoformat(),
        'last_4h_food_time': datetime.now().isoformat(),
        'login_streak': 1,
        'last_login_date': date.today().isoformat(),
        'last_daily_food_date': date.today().isoformat(),
        'created_at': datetime.now().isoformat(),
        'accessories': []
    }

    if _pet_write(username, pet_data):
        return jsonify({'success': True, 'pet': pet_data})
    return jsonify({'error': 'Failed to save'}), 500


@app.route('/api/pet/switch', methods=['POST'])
def api_pet_switch():
    """Chuyển đổi loài thú cưng (giữ nguyên level, xp, food, streak)."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    pet = _pet_read(username)
    if not pet:
        return jsonify({'error': 'No pet'}), 404

    data = request.get_json(silent=True) or {}
    new_type = data.get('type', '').strip()
    if new_type not in PET_TYPES:
        return jsonify({'error': 'Invalid pet type'}), 400

    pet['type'] = new_type
    new_name = data.get('name', '').strip()
    if new_name and len(new_name) <= 20:
        pet['name'] = new_name
    pet['last_activity'] = datetime.now().isoformat()

    if _pet_write(username, pet):
        return jsonify({'success': True, 'pet': pet})
    return jsonify({'error': 'Failed to save'}), 500


@app.route('/api/pet/brief', methods=['GET'])
def api_pet_brief():
    """Lấy thông báo Now Brief từ Groq AI cho Pet theo đúng loài thú cưng."""
    GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
    username = session.get('user', 'Bạn')
    pet = _pet_read(username) or {}
    pet_type = pet.get('type', 'shiba')
    pet_name = pet.get('name', 'Bé cưng')
    pet_info = PET_TYPES.get(pet_type, PET_TYPES.get('shiba', {}))
    species_sound = pet_info.get('sound', 'Woof!')
    species_name = pet_info.get('name_vi', 'Thú cưng')

    # Fallback message chuẩn loài
    fallback_msg = f"{species_sound} Xin chào {username}! Chúc bạn một ngày làm việc tràn đầy năng lượng và thật nhiều may mắn nha! ✨"

    global radio_state
    radio_playing = radio_state.get('is_playing') and radio_state.get('dj_username')
    radio_dj = radio_state.get('dj_username', '')

    context_str = f"User: {username}\nPet Name: {pet_name}\nPet Species: {species_name} ({pet_type})\nSignature Sound: {species_sound}\n"
    if radio_playing:
        context_str += f"Music room: {radio_dj} is DJing right now.\n"
    else:
        context_str += "Music room: silent.\n"

    loc = 'Ho+Chi+Minh'
    w_data = "Unknown"
    if loc in weather_cache:
        w_data = f"Temp: {weather_cache[loc]['data'].get('temp', '?')}C, Code: {weather_cache[loc]['data'].get('wmo', '?')}"
    context_str += f"Weather: {w_data}\n"

    if not GROQ_API_KEY:
        action_data = None
        if not radio_playing:
            action_data = {
                "type": "play_music",
                "payload": "KxGrk4n9Duo",
                "title": "Hãy trao cho anh"
            }
        return jsonify({
            "message": fallback_msg,
            "action": action_data
        })

    prompt = f"""
You are {pet_name}, a cute virtual {species_name} ({pet_type}).
Your signature sound/catchphrase is: "{species_sound}".
The user {username} just clicked or interacted with you.

Context:
{context_str}

Task: Generate a short (1-2 sentences), friendly, heartwarming, and super cute message in Vietnamese.
CRITICAL RULE: YOU MUST MATCH THE ANIMAL SPECIES!
- If Shiba/Dog: Energetic, loyal, eager ("Gâu gâu! Woof!"). NEVER say meow/nya!
- If Neko/Cat: Sweet, playful, slightly regal ("Nya~ Meow meow!").
- If Bunny/Rabbit: Gentle, cute ("Pyon pyon~").
- If Fox/Kitsune: Clever, mischievous ("Kon kon~").
- If Panda: Chill, relaxed, calm, cute ("Panda roll~").
- If Dragon: Enthusiastic, fiery yet adorable ("Grrr~ Phì phì!").

Mention hydration (uống nước), taking breaks, deadline cheer, or music if appropriate.
If music room is silent, you may recommend a fun song with a valid 11-char YouTube ID (e.g. "KxGrk4n9Duo").
Return ONLY valid JSON:
{{
    "message": "câu thoại siêu cute ở đây",
    "action": {{
        "type": "play_music",
        "payload": "YOUTUBE_ID",
        "title": "Song Title"
    }}
}}
If no music recommendation is needed or music room is already active, set "action": null.
"""
    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "response_format": {"type": "json_object"}
            },
            timeout=8
        )
        if r.status_code == 200:
            content = r.json()['choices'][0]['message']['content'].strip()
            return jsonify(json.loads(content))
    except Exception as e:
        print("Groq API error:", e)

    return jsonify({
        "message": fallback_msg
    })



@app.route('/api/pet/feed', methods=['POST'])
def api_pet_feed():
    """Cho pet ăn — trừ 1 food token, +10 XP bonus."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    pet = _pet_read(username)
    if not pet:
        return jsonify({'error': 'No pet'}), 404

    if pet.get('food', 0) <= 0:
        return jsonify({'error': 'No food left', 'food': 0}), 400

    pet['food'] = pet.get('food', 0) - 1
    pet['last_activity'] = datetime.now().isoformat()
    pet['xp'] = pet.get('xp', 0) + 10

    # Level up
    leveled_up = False
    while True:
        xp_needed = _pet_xp_for_level(pet.get('level', 1))
        if pet['xp'] >= xp_needed:
            pet['xp'] -= xp_needed
            pet['level'] = pet.get('level', 1) + 1
            leveled_up = True
            new_acc = _get_random_accessory(pet)
            if new_acc:
                accs = pet.get('accessories', [])
                if new_acc not in accs:
                    accs.append(new_acc)
                pet['accessories'] = accs
        else:
            break

@app.route('/api/pet/feed_all', methods=['POST'])
def api_pet_feed_all():
    """Cho pet ăn hết tất cả thức ăn hiện có."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    pet = _pet_read(username)
    if not pet:
        return jsonify({'error': 'No pet'}), 404

    food_amount = pet.get('food', 0)
    if food_amount <= 0:
        return jsonify({'error': 'No food left', 'food': 0}), 400

    pet['food'] = 0
    pet['last_activity'] = datetime.now().isoformat()
    pet['xp'] = pet.get('xp', 0) + (10 * food_amount)

    # Level up
    leveled_up = False
    while True:
        xp_needed = _pet_xp_for_level(pet.get('level', 1))
        if pet['xp'] >= xp_needed:
            pet['xp'] -= xp_needed
            pet['level'] = pet.get('level', 1) + 1
            leveled_up = True
            
            new_acc = _get_random_accessory(pet)
            if new_acc:
                accs = pet.get('accessories', [])
                if new_acc not in accs:
                    accs.append(new_acc)
                pet['accessories'] = accs
        else:
            break

    pet['stage'] = _pet_stage(pet.get('level', 1))
    _pet_write(username, pet)
    
    return jsonify({
        'success': True,
        'food': pet['food'],
        'xp': pet['xp'],
        'level': pet['level'],
        'leveled_up': leveled_up,
        'pet_data': pet
    })

    pet['stage'] = _pet_stage(pet.get('level', 1))
    pet['mood'] = 'happy'
    _pet_write(username, pet)

    return jsonify({'success': True, 'leveled_up': leveled_up, 'pet': pet})


@app.route('/api/pet/rename', methods=['POST'])
def api_pet_rename():
    """Đổi tên pet."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    pet = _pet_read(username)
    if not pet:
        return jsonify({'error': 'No pet'}), 404

    data = request.get_json(silent=True) or {}
    new_name = data.get('name', '').strip()
    if not new_name or len(new_name) > 20:
        return jsonify({'error': 'Invalid name (1-20 chars)'}), 400

    pet['name'] = new_name
    _pet_write(username, pet)
    return jsonify({'success': True, 'name': new_name})

@app.route('/api/pet/cheat_food', methods=['POST'])
def api_pet_cheat_food():
    """API ẩn để test buff 999 food."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    pet = _pet_read(username)
    if not pet:
        return jsonify({'error': 'No pet'}), 404
        
    pet['food'] = 999
    _pet_write(username, pet)
    return jsonify({'success': True, 'food': 999})


# =====================================================================
# 10c. RADIO REST API (Serverless-compatible — dùng trên Vercel)
# =====================================================================
# Trên Vercel, Socket.IO không hoạt động vì serverless không giữ persistent
# connection. Các endpoint REST này cho phép client polling để đồng bộ DJ state.
# State được lưu dưới dạng file JSON trên Supabase Storage.

RADIO_STATE_FILE = '_system/radio_state.json'
# Mỗi listener/user online là MỘT file riêng trong folder (tránh race khi
# nhiều người ghi chung 1 file -> trước đây bị "kẹt ở 3 người").
RADIO_LISTENERS_DIR = '_system/radio_listeners'
ONLINE_USERS_DIR = '_system/online_users'
PRESENCE_TTL = 45  # giây: quá hạn không heartbeat coi như offline

_DEFAULT_RADIO_STATE = {
    'is_playing': False,
    'youtube_id': '4xDzrIxC4Dk',
    'current_time': 0,
    'last_update': 0,
    'dj_username': None,
    'allow_requests': True,
    'is_automix_enabled': False,
    'queue': []
}


def _radio_read_state():
    """Đọc radio state từ Supabase Storage. Trả về default nếu chưa có."""
    if not USE_SUPABASE:
        return radio_state.copy()
    try:
        data = sb_download_bytes(RADIO_STATE_FILE)
        state = json.loads(data)
        # Auto-release DJ nếu không sync > 30s (DJ đã tắt tab/mất kết nối)
        if state.get('dj_username') and state.get('last_update'):
            if time.time() - state['last_update'] > 30:
                state['dj_username'] = None
                state['is_playing'] = False
                _radio_write_state(state)
        return state
    except Exception:
        return _DEFAULT_RADIO_STATE.copy()


def _radio_write_state(state):
    """Ghi radio state vào Supabase Storage."""
    if not USE_SUPABASE:
        return
    try:
        state['last_update'] = time.time()
        sb_upload(RADIO_STATE_FILE, json.dumps(state).encode('utf-8'), 'application/json')
    except Exception:
        pass


def _presence_key(username):
    """Tên file an toàn cho 1 user (dùng cho cả listeners và online users)."""
    h = hashlib.md5(username.encode('utf-8')).hexdigest()[:16]
    return f'{h}.json'


def _presence_read_dir(dir_path):
    """Đọc tất cả presence file trong 1 folder, lọc bỏ entry hết hạn.

    Mỗi user = 1 file nên nhiều người join/heartbeat song song không ghi đè
    lên nhau. Entry quá hạn (>PRESENCE_TTL) được coi là offline (lười xóa)."""
    if not USE_SUPABASE:
        return []
    now = time.time()
    result = []
    seen = set()
    try:
        for it in sb_list(dir_path):
            if it.get('is_dir'):
                continue
            try:
                data = sb_download_bytes(it['path'])
                entry = json.loads(data)
            except Exception:
                continue
            if now - entry.get('last_seen', 0) >= PRESENCE_TTL:
                # Hết hạn -> dọn file (best effort), bỏ qua
                try:
                    sb_delete([it['path']])
                except Exception:
                    pass
                continue
            uname = entry.get('username')
            if uname in seen:
                continue
            seen.add(uname)
            result.append(entry)
    except Exception:
        return []
    return result


def _presence_write(dir_path, username, profile):
    """Ghi/refresh presence cho 1 user vào file riêng của user đó."""
    if not USE_SUPABASE or not username:
        return
    try:
        entry = dict(profile or {})
        entry['username'] = username
        entry['last_seen'] = time.time()
        sb_upload(f'{dir_path}/{_presence_key(username)}',
                  json.dumps(entry).encode('utf-8'), 'application/json')
    except Exception:
        pass


def _presence_remove(dir_path, username):
    """Xóa presence file của 1 user."""
    if not USE_SUPABASE or not username:
        return
    try:
        sb_delete([f'{dir_path}/{_presence_key(username)}'])
    except Exception:
        pass


def _presence_clear(dir_path):
    """Xóa toàn bộ presence trong folder (dùng khi đổi/ tắt DJ)."""
    if not USE_SUPABASE:
        return
    try:
        paths = [it['path'] for it in sb_list(dir_path) if not it.get('is_dir')]
        if paths:
            sb_delete(paths)
    except Exception:
        pass


def _radio_read_listeners():
    """Đọc danh sách listeners (mỗi user 1 file)."""
    return _presence_read_dir(RADIO_LISTENERS_DIR)


def _radio_write_listeners(listeners):
    """Kept for compatibility: reset toàn bộ listeners.

    Chỉ dùng để CLEAR (list rỗng) khi đổi/tắt DJ; các nhánh khác giờ
    ghi trực tiếp từng user qua _presence_write."""
    if not listeners:
        _presence_clear(RADIO_LISTENERS_DIR)


@app.route('/api/radio/state', methods=['GET'])
def api_radio_state():
    """Trả về trạng thái DJ hiện tại."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    state = _radio_read_state()
    # Tính current_time dựa trên thời gian đã trôi qua
    if state.get('is_playing') and state.get('last_update'):
        elapsed = time.time() - state['last_update']
        state['current_time'] = state.get('current_time', 0) + elapsed

    username = session.get('user', '')
    state['you_are_dj'] = (username == state.get('dj_username'))
    state['listeners'] = _radio_read_listeners()
    return jsonify(state)


@app.route('/api/radio/sync', methods=['POST'])
def api_radio_sync():
    """DJ cập nhật trạng thái phát nhạc."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    state = _radio_read_state()

    if state.get('dj_username') != username:
        return jsonify({'error': 'Not the DJ'}), 403

    data = request.get_json(silent=True) or {}
    state['is_playing'] = data.get('is_playing', state.get('is_playing', False))
    state['youtube_id'] = data.get('youtube_id', state.get('youtube_id'))
    state['current_time'] = data.get('current_time', 0)
    if 'next_title' in data:
        state['next_title'] = data['next_title']
    if 'video_active' in data:
        state['video_active'] = data['video_active']
    if 'is_crossfading' in data:
        state['is_crossfading'] = data['is_crossfading']
    if 'is_automix_enabled' in data:
        state['is_automix_enabled'] = data['is_automix_enabled']
    _radio_write_state(state)
    return jsonify({'success': True})


@app.route('/api/radio/claim', methods=['POST'])
def api_radio_claim():
    """Claim vai trò DJ."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    state = _radio_read_state()

    current_dj = state.get('dj_username')
    if current_dj and current_dj != username:
        # Kiểm tra DJ hiện tại còn active không (đã sync gần đây?)
        if state.get('last_update') and time.time() - state['last_update'] < 30:
            return jsonify({'success': False, 'dj_name': current_dj})

    # Claim DJ
    state['dj_username'] = username
    state['is_playing'] = False
    state['current_time'] = 0
    _radio_write_state(state)
    # Xóa listeners cũ khi có DJ mới
    _radio_write_listeners([])
    return jsonify({'success': True})


@app.route('/api/radio/release', methods=['POST'])
def api_radio_release():
    """Release vai trò DJ."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    state = _radio_read_state()

    if state.get('dj_username') == username:
        state['dj_username'] = None
        state['is_playing'] = False
        state['youtube_id'] = '4xDzrIxC4Dk'
        state['current_time'] = 0
        state['allow_requests'] = True
        state['is_automix_enabled'] = False
        state['queue'] = []
        _radio_write_state(state)
        _radio_write_listeners([])

    return jsonify({'success': True})


@app.route('/api/youtube_title')
def api_youtube_title():
    video_id = request.args.get('id')
    if not video_id:
        return jsonify({'error': 'No ID'}), 400
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        import requests
        r = requests.get(url, timeout=5)
        if r.status_code == 200:
            data = r.json()
            return jsonify({'title': data.get('title')})
        return jsonify({'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/music_dna')
def api_music_dna():
    vid = request.args.get('vid')
    query = request.args.get('q')
    if not vid and not query:
        return jsonify({'error': 'No query'}), 400
    try:
        import urllib.request, urllib.parse, re, json
        
        results = []
        if vid:
            url = f'https://www.youtube.com/watch?v={vid}'
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            html = urllib.request.urlopen(req, timeout=5).read().decode('utf-8')
            match = re.search(r'ytInitialData = ({.*?});</script>', html)
            if match:
                data = json.loads(match.group(1))
                def find_compact(d):
                    res = []
                    if isinstance(d, dict):
                        if 'compactVideoRenderer' in d:
                            res.append(d['compactVideoRenderer'])
                        for k, v in d.items():
                            res.extend(find_compact(v))
                    elif isinstance(d, list):
                        for item in d:
                            res.extend(find_compact(item))
                    return res
                
                compacts = find_compact(data)
                
                # Extract up to 20 unique items
                pool = []
                seen_ids = set()
                seen_titles = set()
                for cvid in compacts[:50]:
                    cvid_id = cvid.get('videoId')
                    if cvid_id and cvid_id != vid and cvid_id not in seen_ids:
                        if 'title' in cvid and 'simpleText' in cvid['title']:
                            title = cvid['title']['simpleText']
                        elif 'title' in cvid and 'runs' in cvid['title']:
                            title = cvid['title']['runs'][0]['text']
                        else:
                            title = 'Unknown'
                            
                        title_lower = title.lower()
                        if 'official' in title_lower or title_lower in seen_titles:
                            continue
                            
                        seen_ids.add(cvid_id)
                        seen_titles.add(title_lower)
                        pool.append({'id': cvid_id, 'title': title})
                        if len(pool) >= 20: break
                
                import random
                results = random.sample(pool, min(5, len(pool)))
            
            if results:
                return jsonify({'results': results})
                
        # Fallback to search if vid fails or is not provided
        if query:
            q = urllib.parse.quote(query)
            url = f'https://www.youtube.com/results?search_query={q}'
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            html = urllib.request.urlopen(req, timeout=5).read().decode('utf-8')
            match = re.search(r'ytInitialData = ({.*?});</script>', html)
            if match:
                data = json.loads(match.group(1))
                contents = data['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents'][0]['itemSectionRenderer']['contents']
                pool = []
                seen_ids = set()
                seen_titles = set()
                for item in contents:
                    if 'videoRenderer' in item:
                        vr = item['videoRenderer']
                        vr_id = vr['videoId']
                        if vr_id not in seen_ids:
                            title = vr['title']['runs'][0]['text']
                            title_lower = title.lower()
                            if 'official' in title_lower or title_lower in seen_titles:
                                continue
                                
                            seen_ids.add(vr_id)
                            seen_titles.add(title_lower)
                            pool.append({'id': vr_id, 'title': title})
                        if len(pool) >= 20: break
                import random
                results = random.sample(pool, min(5, len(pool)))
                return jsonify({'results': results})
                
        return jsonify({'error': 'No match'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/radio/join', methods=['POST'])
def api_radio_join():
    """Listener tham gia radio (heartbeat)."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    try:
        USER_DB = load_users_from_sheet(USER_SHEET_URL)
        avatar = USER_DB.get(username, {}).get("avatar", "")
        fullname = USER_DB.get(username, {}).get("fullname", username)
    except Exception:
        avatar = ""
        fullname = username

    # Mỗi user ghi vào file riêng -> không đè lên người khác (fix "kẹt 3 người")
    _presence_write(RADIO_LISTENERS_DIR, username, {
        'username': username,
        'fullname': fullname,
        'avatar': avatar,
    })
    return jsonify({'success': True})


@app.route('/api/radio/leave', methods=['POST'])
def api_radio_leave():
    """Listener rời radio."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    _presence_remove(RADIO_LISTENERS_DIR, username)
    return jsonify({'success': True})


@app.route('/api/presence/ping', methods=['POST'])
def api_presence_ping():
    """Heartbeat cho biết user đang online (dùng khi chạy trên Vercel, không
    có Socket.IO). Mỗi user ghi file riêng -> hiển thị đủ mọi người, không
    còn phụ thuộc RAM của 1 instance."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    username = session.get('user', '')
    try:
        USER_DB = load_users_from_sheet(USER_SHEET_URL)
        avatar = USER_DB.get(username, {}).get("avatar", "")
        fullname = USER_DB.get(username, {}).get("fullname", username)
    except Exception:
        avatar = ""
        fullname = username

    _presence_write(ONLINE_USERS_DIR, username, {
        'username': username,
        'fullname': fullname,
        'avatar': avatar,
    })
    return jsonify({'success': True})


@app.route('/api/presence/list', methods=['GET'])
def api_presence_list():
    """Danh sách user đang online (unique theo username)."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    users = _presence_read_dir(ONLINE_USERS_DIR)
    users.sort(key=lambda u: u.get('fullname', ''))
    return jsonify({'users': users})


@app.route('/api/presence/leave', methods=['POST'])
def api_presence_leave():
    """Rời khỏi danh sách online (đóng tab)."""
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401

    _presence_remove(ONLINE_USERS_DIR, session.get('user', ''))
    return jsonify({'success': True})


# =====================================================================
# =====================================================================
# 11. SOCKETIO EVENTS
# =====================================================================
online_users = {}
radio_listeners = set()

radio_state = {
    'is_playing': False,
    'youtube_id': '4xDzrIxC4Dk', # Lofi Girl Synthwave
    'current_time': 0,
    'last_update': time.time(),
    'dj_username': None,
    'dj_sid': None,
    'allow_requests': True,
    'is_crossfading': False,
    'is_automix_enabled': False
}

radio_queue = []

def get_unique_online_users():
    unique_users = {}
    for sid, u in online_users.items():
        unique_users[u['username']] = u
    return list(unique_users.values())

def get_radio_listener_profiles():
    listeners = []
    seen = set()
    
    # Add DJ to the top of the listener list
    dj_sid = radio_state.get('dj_sid')
    dj_username = radio_state.get('dj_username')
    dj_added = False
    
    # Try by SID first
    if dj_sid and dj_sid in online_users:
        u = online_users[dj_sid]
        seen.add(u['username'])
        listeners.append(u)
        dj_added = True
    
    # Fallback: find DJ by username in online_users (handles socket reconnect)
    if not dj_added and dj_username:
        for sid, u in online_users.items():
            if u['username'] == dj_username:
                seen.add(u['username'])
                listeners.append(u)
                radio_state['dj_sid'] = sid  # Update SID to new one
                dj_added = True
                break
    
    # Last resort: use stored DJ profile (survives brief disconnects)
    if not dj_added and dj_username and radio_state.get('dj_profile'):
        seen.add(dj_username)
        listeners.append(radio_state['dj_profile'])

    # Add listeners from polling
    polling_listeners = _presence_read_dir(RADIO_LISTENERS_DIR)
    for u in polling_listeners:
        if u['username'] not in seen:
            seen.add(u['username'])
            listeners.append(u)
            
    # Add listeners from socketio
    for sid in list(radio_listeners):
        if sid in online_users:
            u = online_users[sid]
            if u['username'] not in seen:
                seen.add(u['username'])
                listeners.append(u)
        else:
            radio_listeners.discard(sid)
    return listeners

@socketio.on('connect')
def handle_connect():
    emit('app_version_info', {
        'version': get_current_app_version(),
        'build_id': get_current_build_id()
    })
    username = session.get('user')
    if username:
        try:
            USER_DB = load_users_from_sheet(USER_SHEET_URL)
            avatar = USER_DB.get(username, {}).get("avatar", "")
            fullname = USER_DB.get(username, {}).get("fullname", username)
        except Exception:
            avatar = ""
            fullname = username
            
        online_users[request.sid] = {
            'username': username,
            'fullname': fullname,
            'avatar': avatar
        }
        emit('online_users_update', get_unique_online_users(), broadcast=True)
        emit('radio_listeners_update', get_radio_listener_profiles())

@socketio.on('join_radio')
def handle_join_radio():
    radio_listeners.add(request.sid)
    emit('radio_listeners_update', get_radio_listener_profiles(), broadcast=True)

@socketio.on('leave_radio')
def handle_leave_radio():
    radio_listeners.discard(request.sid)
    emit('radio_listeners_update', get_radio_listener_profiles(), broadcast=True)

@socketio.on('request_online_users')
def handle_request_online_users():
    emit('online_users_update', get_unique_online_users())

@socketio.on('request_radio_state')
def handle_request_radio_state():
    state = radio_state.copy()
    state['queue'] = radio_queue
    if state['is_playing']:
        state['current_time'] += (time.time() - state['last_update'])
        
    username = session.get('user', 'Guest')
    if username != 'Guest' and state.get('dj_username') == username:
        radio_state['dj_sid'] = request.sid
        state['you_are_dj'] = True
    else:
        state['you_are_dj'] = False
        
    emit('radio_sync', state)

@socketio.on('radio_sync')
def handle_radio_sync(data):
    if radio_state.get('dj_sid') != request.sid:
        return
        
    radio_state['is_playing'] = data.get('is_playing', False)
    radio_state['youtube_id'] = data.get('youtube_id', radio_state['youtube_id'])
    radio_state['current_time'] = data.get('current_time', 0)
    if 'next_title' in data:
        radio_state['next_title'] = data['next_title']
    if 'video_active' in data:
        radio_state['video_active'] = data['video_active']
    radio_state['is_crossfading'] = data.get('is_crossfading', False)
    if 'is_automix_enabled' in data:
        radio_state['is_automix_enabled'] = data['is_automix_enabled']
    radio_state['last_update'] = time.time()
    state = radio_state.copy()
    state['queue'] = radio_queue
    emit('radio_sync', state, broadcast=True, include_self=False)

@socketio.on('claim_dj')
def handle_claim_dj():
    global radio_state
    if radio_state.get('dj_sid') is None or radio_state.get('dj_sid') not in online_users:
        # Bắt đầu phiên DJ mới với danh sách người nghe trống, chỉ còn host
        radio_listeners.clear()
        radio_state['dj_sid'] = request.sid
        radio_state['dj_username'] = session.get('user', 'Guest')
        # Store DJ profile for fallback during socket reconnects
        if request.sid in online_users:
            radio_state['dj_profile'] = online_users[request.sid].copy()
        state = radio_state.copy()
        state['queue'] = radio_queue
        emit('radio_sync', state, broadcast=True)
        emit('radio_listeners_update', get_radio_listener_profiles(), broadcast=True)
        return {'success': True}
    else:
        return {'success': False, 'dj_name': radio_state['dj_username']}

@socketio.on('release_dj')
def handle_release_dj():
    global radio_state
    if radio_state.get('dj_sid') == request.sid:
        radio_state['dj_sid'] = None
        radio_state['dj_username'] = None
        radio_state['dj_profile'] = None
        radio_state['is_playing'] = False
        radio_state['youtube_id'] = '4xDzrIxC4Dk'
        radio_state['current_time'] = 0
        radio_state['allow_requests'] = True
        radio_state['is_automix_enabled'] = False
        radio_state['is_crossfading'] = False
        radio_queue.clear()
        # Tắt DJ: xóa toàn bộ người nghe, mở lại sẽ không còn ai join
        radio_listeners.clear()
        state = radio_state.copy()
        state['queue'] = radio_queue
        emit('radio_sync', state, broadcast=True)
        emit('radio_listeners_update', get_radio_listener_profiles(), broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    global radio_state
    # Do not reset DJ state on disconnect so it survives page reloads

    if request.sid in radio_listeners:
        radio_listeners.discard(request.sid)
        emit('radio_listeners_update', get_radio_listener_profiles(), broadcast=True)

    if request.sid in online_users:
        del online_users[request.sid]
        emit('online_users_update', get_unique_online_users(), broadcast=True)

@socketio.on('toggle_allow_requests')
def handle_toggle_allow_requests(data):
    if radio_state.get('dj_sid') == request.sid:
        radio_state['allow_requests'] = data.get('allow_requests', True)
        emit('radio_sync', radio_state, broadcast=True)

@socketio.on('toggle_automix')
def handle_toggle_automix(data):
    if radio_state.get('dj_sid') == request.sid:
        radio_state['is_automix_enabled'] = data.get('is_automix_enabled', False)
        emit('radio_sync', radio_state, broadcast=True)

@socketio.on('queue_add')
def handle_queue_add(data):
    if not radio_state.get('allow_requests') and radio_state.get('dj_sid') != request.sid:
        return
    import uuid
    username = session.get('user', 'Guest')
    avatar = ""
    if username != 'Guest':
        try:
            USER_DB = load_users_from_sheet(USER_SHEET_URL)
            avatar = USER_DB.get(username, {}).get("avatar", "")
        except:
            pass

    item = {
        'queue_id': str(uuid.uuid4()),
        'youtube_id': data.get('youtube_id'),
        'title': data.get('title'),
        'added_by': username,
        'avatar': avatar
    }
    radio_queue.append(item)
    emit('radio_queue_update', radio_queue, broadcast=True)

@socketio.on('queue_remove')
def handle_queue_remove(data):
    if radio_state.get('dj_sid') == request.sid:
        queue_id = data.get('queue_id')
        global radio_queue
        radio_queue = [item for item in radio_queue if item['queue_id'] != queue_id]
        emit('radio_queue_update', radio_queue, broadcast=True)

@socketio.on('queue_reorder')
def handle_queue_reorder(data):
    if radio_state.get('dj_sid') == request.sid:
        global radio_queue
        radio_queue = data.get('queue', radio_queue)
        emit('radio_queue_update', radio_queue, broadcast=True)

@socketio.on('queue_pop')
def handle_queue_pop():
    if radio_state.get('dj_sid') == request.sid:
        if radio_queue:
            item = radio_queue.pop(0)
            emit('radio_queue_update', radio_queue, broadcast=True)
            return item
        return None

@socketio.on('sync_checkbox')
def on_sync_checkbox(data):
    task_id = data.get('task_id')
    checkbox_id = data.get('checkbox_id')
    status = data.get('status')
    if task_id and checkbox_id:
        emit('checkbox_updated', {
            'task_id': task_id,
            'checkbox_id': checkbox_id,
            'status': status
        }, to=task_id, include_self=False)

@socketio.on('sync_drag_drop')
def on_sync_drag_drop(data):
    task_id = data.get('task_id')
    target_status = data.get('target_status')
    if task_id and target_status:
        emit('task_moved', {
            'task_id': task_id,
            'target_status': target_status
        }, broadcast=True, include_self=False)

chat_history = []

@socketio.on('request_chat_history')
def handle_request_chat_history():
    emit('chat_history', chat_history)

@socketio.on('chat_message')
def handle_chat_message(data):
    username = session.get('user', 'Guest')
    msg = data.get('msg', '').strip()
    file_name = data.get('file_name')
    file_type = data.get('file_type')
    file_data = data.get('file_data')
    
    if msg or file_data:
        fullname = username
        avatar = ""
        try:
            # Try to get avatar from pet data first
            if USE_SUPABASE:
                pet_data = read_pet_data(username)
                if pet_data and 'sprite' in pet_data:
                    avatar = f"/static/img/pet/{pet_data['sprite']}.gif"
        except:
            pass
            
        if not avatar:
            try:
                USER_DB = load_users_from_sheet(USER_SHEET_URL)
                fullname = USER_DB.get(username, {}).get("fullname", username)
                avatar = USER_DB.get(username, {}).get("avatar", f"https://ui-avatars.com/api/?name={fullname}&background=random")
            except:
                avatar = f"https://ui-avatars.com/api/?name={username}&background=random"

        message_obj = {
            'id': str(uuid.uuid4()),
            'username': username,
            'fullname': fullname,
            'avatar': avatar,
            'msg': msg,
            'file_name': file_name,
            'file_type': file_type,
            'file_data': file_data,
            'time': datetime.now(timezone(timedelta(hours=7))).strftime("%H:%M"),
            'read_by': []
        }
        
        chat_history.append(message_obj)
        if len(chat_history) > 100:
            chat_history.pop(0)

        emit('chat_message', message_obj, broadcast=True)
        
        # --- Xử lý Bot Dịch Thuật ---
        bot_match = re.match(r'^@bot\b[:\s\-\–]*(.*)', msg.strip(), re.IGNORECASE)
        if bot_match:
            text_to_translate = bot_match.group(1).strip()
            if text_to_translate:
                # Tự động nhận diện nếu có tiếng Nhật -> Dịch sang Tiếng Việt. Nếu không -> Dịch sang Tiếng Nhật
                target_lang = 'vi' if is_japanese(text_to_translate) else 'ja'
                translated_text = translate_text(text_to_translate, target_lang)
                
                lang_name = "Tiếng Việt" if target_lang == 'vi' else "Tiếng Nhật"
                lang_flag = "🇻🇳" if target_lang == 'vi' else "🇯🇵"
                
                # Bot trả lời vào chat
                bot_msg = {
                    'id': str(uuid.uuid4()),
                    'username': 'bot',
                    'fullname': '🤖 Bot Dịch Thuật',
                    'avatar': 'https://api.dicebear.com/7.x/bottts/svg?seed=TranslateBot',
                    'msg': f"**{lang_flag} [Dịch sang {lang_name}]:**\n{translated_text}",
                    'time': datetime.now(timezone(timedelta(hours=7))).strftime("%H:%M"),
                    'read_by': []
                }
                chat_history.append(bot_msg)
                if len(chat_history) > 100:
                    chat_history.pop(0)
                emit('chat_message', bot_msg, broadcast=True)

@socketio.on('chat_typing')
def handle_chat_typing():
    username = session.get('user')
    if username:
        try:
            USER_DB = load_users_from_sheet(USER_SHEET_URL)
            fullname = USER_DB.get(username, {}).get("fullname", username)
        except:
            fullname = username
        emit('chat_typing', {'username': username, 'fullname': fullname}, broadcast=True, include_self=False)

@socketio.on('chat_stop_typing')
def handle_chat_stop_typing():
    username = session.get('user')
    if username:
        emit('chat_stop_typing', {'username': username}, broadcast=True, include_self=False)

@socketio.on('chat_mark_read')
def handle_chat_mark_read():
    username = session.get('user')
    if not username:
        return
        
    avatar = ""
    try:
        if USE_SUPABASE:
            pet_data = read_pet_data(username)
            if pet_data and 'sprite' in pet_data:
                avatar = f"/static/img/pet/{pet_data['sprite']}.gif"
    except:
        pass
    if not avatar:
        try:
            USER_DB = load_users_from_sheet(USER_SHEET_URL)
            fullname = USER_DB.get(username, {}).get("fullname", username)
            avatar = USER_DB.get(username, {}).get("avatar", f"https://ui-avatars.com/api/?name={fullname}&background=random")
        except:
            avatar = f"https://ui-avatars.com/api/?name={username}&background=random"

    updated_msg_ids = []
    # Mark unread messages as read
    for msg in reversed(chat_history):
        # Prevent self-reads from cluttering
        if msg.get('username') == username:
            continue
            
        has_read = any(u.get('username') == username for u in msg.get('read_by', []))
        if not has_read:
            msg.setdefault('read_by', []).append({'username': username, 'avatar': avatar})
            updated_msg_ids.append(msg.get('id'))
        else:
            # We can optionally break here if we assume consecutive reading
            pass
            
    if updated_msg_ids:
        emit('chat_read_update', {
            'message_ids': updated_msg_ids,
            'user': {'username': username, 'avatar': avatar}
        }, broadcast=True)

@socketio.on('cursor_move')
def handle_cursor_move(data):
    # data contains x, y, and window sizing.
    # Broadcast to everyone else
    emit('cursor_move', {
        'sid': request.sid,
        'username': session.get('user', 'Guest'),
        'x': data.get('x', 0),
        'y': data.get('y', 0)
    }, broadcast=True, include_self=False)

# =====================================================================
# 12. CHẠY ỨNG DỤNG & PRELOAD
# =====================================================================
def preload_data():
    try:
        load_checklist_data()
        load_sheet_data(csv_url)
        load_sheet_data(csv_url_truoc)
    except Exception as e:
        print("Preload error:", e)


@app.route('/api/prepare_psd', methods=['POST'])
def prepare_psd():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json or {}
    base_path = data.get('path', '').strip()
    tap_str = data.get('tap', '').strip()
    role = data.get('role', 'retouch')
    
    if not base_path or not tap_str:
        return jsonify({'error': 'Vui lòng cung cấp đường dẫn và số tập.'}), 400
        
    # We allow any valid absolute path on the machine for this utility
    if not (os.path.isabs(base_path) or base_path.startswith('/')):
        return jsonify({'error': 'Vui lòng cung cấp đường dẫn tuyệt đối hợp lệ (VD: C:\\Users\\...).'}), 400
        
    try:
        # Xóa tập cũ nếu tồn tại
        tap_dir = os.path.join(base_path, f"{tap_str}巻")
        if os.path.exists(tap_dir):
            import shutil
            shutil.rmtree(tap_dir, ignore_errors=True)

        if role == 'retouch':
            folder_psd = os.path.join(base_path, f"{tap_str}巻", "PSD_Retouch_Backups")
        else:
            folder_psd = os.path.join(base_path, f"{tap_str}巻", "PSD_Lettering_Backups")
            
        os.makedirs(folder_psd, exist_ok=True)
        
        return jsonify({'success': True, 'message': 'Tạo cấu trúc thư mục thành công!'})
    except Exception as e:
        return jsonify({'error': f'Không thể tạo thư mục: {str(e)}'}), 500




_cf_started = False

def start_cloudflared():
    global _cf_started
    if _cf_started:
        return
    _cf_started = True
    
    if os.name != 'posix':
        return
        
    token = os.environ.get('CF_TUNNEL_TOKEN', 'eyJhIjoiODZjNGI3OWMxMGJlZTIwYzhlZDVkMDI2ZjIxYzAxN2IiLCJ0IjoiYWU0MWJjYmUtZTcwMi00YmZiLWJlNDYtMTMwMmQyNTY4ZGYwIiwicyI6IlpUSXlPV014TXpjdE0yUmpNQzAwWm1KbExXSTVOVFF0TnpCbVl6VXpZV05pTWpFNSJ9')
    if not token:
        return
        
    import subprocess, platform
    base_dir = os.path.dirname(os.path.abspath(__file__))
    cf_path = os.path.join(base_dir, 'cloudflared')
    log_path = os.path.join(base_dir, 'cloudflared.log')

    m = platform.machine().lower()
    is_arm = 'arm' in m or 'aarch64' in m
    dl_url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" if is_arm else "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"

    # Check if existing binary works or is wrong architecture
    need_download = False
    if not os.path.exists(cf_path) or os.path.getsize(cf_path) < 1000000:
        need_download = True
    else:
        try:
            os.chmod(cf_path, 0o755)
            r = subprocess.run([cf_path, '--version'], capture_output=True, timeout=5)
            if r.returncode != 0:
                need_download = True
        except Exception as e:
            print("[Cloudflare Tunnel] Execution test failed, will re-download:", e, flush=True)
            need_download = True

    if need_download:
        print(f"[Cloudflare Tunnel] Downloading binary for {m} from {dl_url}...", flush=True)
        try:
            import urllib.request
            urllib.request.urlretrieve(dl_url, cf_path)
            os.chmod(cf_path, 0o755)
            print("[Cloudflare Tunnel] Downloaded and chmod 0755 completed.", flush=True)
        except Exception as e:
            print("[Cloudflare Tunnel] Download failed:", e, flush=True)

    if os.path.exists(cf_path):
        try:
            os.chmod(cf_path, 0o755)
        except Exception as e:
            print("[Cloudflare Tunnel] chmod error:", e, flush=True)

        def _runner():
            time.sleep(2)
            while True:
                try:
                    print("[Cloudflare Tunnel] Starting tunnel with http2 protocol...", flush=True)
                    with open(log_path, 'a', encoding='utf-8') as lf:
                        lf.write(f"\n--- Starting cloudflared at {datetime.now().isoformat()} ---\n")
                        lf.flush()
                        proc = subprocess.Popen(
                            [cf_path, 'tunnel', '--protocol', 'http2', 'run', '--token', token],
                            stdout=lf,
                            stderr=subprocess.STDOUT
                        )
                    proc.wait()
                    print(f"[Cloudflare Tunnel] Process exited with code {proc.returncode}. Restarting in 3s...", flush=True)
                    time.sleep(3)
                except Exception as ex:
                    print("[Cloudflare Tunnel] Exception:", ex, flush=True)
                    time.sleep(5)

        threading.Thread(target=_runner, daemon=True, name="CloudflaredRunner").start()
    else:
        print(f"[Cloudflare Tunnel] Binary not found at {cf_path}", flush=True)


if os.name == 'posix':
    start_cloudflared()

if __name__ == '__main__':
    threading.Thread(target=preload_data, daemon=True).start()
    start_cloudflared()
    port = int(os.environ.get('PORT', os.environ.get('SERVER_PORT', 5000)))
    is_local = os.name == 'nt' or os.environ.get('DEBUG_RELOAD') == '1'
    socketio.run(app, debug=is_local, use_reloader=is_local, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
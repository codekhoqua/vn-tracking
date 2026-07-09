import os
import zipfile
import io
from flask import send_file
import shutil
from werkzeug.utils import secure_filename
from flask import send_from_directory
import time
import threading
import hashlib
import pandas as pd
import requests
import re
import json
from collections import defaultdict
from datetime import date, datetime
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from markupsafe import Markup
from dateutil import parser as date_parser

from flask_socketio import SocketIO, emit, join_room, leave_room

# =====================================================================
# 1. CẤU HÌNH FLASK & SOCKETIO
# =====================================================================
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
# =====================================================================
# 2. CƠ SỞ DỮ LIỆU TÀI KHOẢN VÀ LINK DỮ LIỆU
# =====================================================================
USER_SHEET_URL = "https://docs.google.com/spreadsheets/d/1VLlDF5XoXt0Rz0ACZ3EZRKcKWFnIRXptMPbQthimNE0/export?format=csv&gid=0"

CHANGE_PASS_API = "https://script.google.com/macros/s/AKfycbzf59j11q0IfvgjRkhvUx6EhnSdssGbvpp3PnKQGL4JUmJC2w2uidZi0BKygpriqMVB/exec"
LOGTIME_API_URL = "https://script.google.com/macros/s/AKfycbwRgcwRvxBZPOMEyfKbWCDXpLsY1H5edxQtxF4xihgaVIJn-eiqbuDB_2yCU9XYR_MwAQ/exec"

url = "https://docs.google.com/spreadsheets/d/1ec_v1hsKu0oCOwyrFNgxckpoaq3Q02J4NdIchqbYE3s/edit?gid=597870203#gid=597870203"
csv_url = url.split("/edit")[0] + "/export?format=csv" if "/edit" in url else url

url_after_week = "https://docs.google.com/spreadsheets/d/1ec_v1hsKu0oCOwyrFNgxckpoaq3Q02J4NdIchqbYE3s/edit?gid=597870203#gid=597870203"
csv_url_truoc = url_after_week.split("/edit")[0] + "/export?format=csv&" + url_after_week.split("#")[1] if "#gid" in url_after_week else url_after_week



COLS = ['Công việc', 'Tên tác phẩm', 'Chương', 'Tập', 'Số trang', 'NXB', 'Ngày bắt đầu', 'Deadline (Nộp)', 'VN', 'Người thực hiện', 'QC Nội bộ', 'Quản lý', 'Trạng thái', 'Bắt đầu', 'Ghi chú']

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
    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": "auto",
        "tl": target_lang,
        "dt": "t",
        "q": text
    }
    try:
        res = requests.get(url, params=params, timeout=5)
        data = res.json()
        return "".join([x[0] for x in data[0]])
    except Exception as e:
        return f"[Lỗi hệ thống dịch thuật: {str(e)}]"

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
checklist_lock = threading.Lock()
checklist_version = 0


def get_supabase_checklists():
    global _checklist_cache
    if _checklist_cache is not None:
        return _checklist_cache
    try:
        data = sb_download_bytes('_system/checklists.json')
        if data:
            _checklist_cache = json.loads(data.decode('utf-8'))
        else:
            _checklist_cache = {}
    except Exception:
        _checklist_cache = {}
    return _checklist_cache

def load_checklist_data(api_url=None):
    data = get_supabase_checklists()
    rows = []
    for tp_key, cbs in data.items():
        for cb_id, status in cbs.items():
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
        df = pd.read_csv(url, usecols=list(range(1, 16)), header=None)
        df.columns = COLS
        if df.empty:
            raise Exception("DataFrame rỗng")
        return df
    except Exception as e:
        import traceback
        print("Lỗi load_sheet_data:", e)
        traceback.print_exc()
        raise e

@cached(ttl=300)
def load_vntask_details():
    try:
        df = pd.read_csv(VNTASK_URL)
        start_date_col = None
        for col in df.columns:
            if '開始日' in col:
                start_date_col = col
                break
                
        if not start_date_col:
            if len(df.columns) > 7:
                start_date_col = df.columns[7]
            else:
                return []
            
        job_col = df.columns[1] if len(df.columns) > 1 else None
        task_col = df.columns[2] if len(df.columns) > 2 else None
        worker_col = df.columns[10] if len(df.columns) > 10 else (df.columns[9] if len(df.columns) > 9 else None)

        details = []
        current_year = date.today().year

        for idx, row in df.iterrows():
            val = str(row[start_date_col]).strip()
            if val in ['nan', 'NaN', 'None', '']:
                continue
            
            raw_job = str(row[job_col]).strip() if job_col and pd.notna(row[job_col]) else "Khác"
            job_type = "Retouch" if "レタッチ" in raw_job else ("Lettering" if "写植" in raw_job else raw_job)
            if job_type in ['nan', 'NaN', 'None', '']: job_type = "Khác"
            
            task_name = str(row[task_col]) if task_col and pd.notna(row[task_col]) else "Unknown Task"
            worker = str(row[worker_col]) if worker_col and pd.notna(row[worker_col]) else ""
            
            # remove day of week like (Wed)
            clean_d = re.sub(r'\([A-Za-z]+\)', '', val).strip()
            # replace hyphens with space
            clean_d = clean_d.replace('-', ' ')
            try:
                dt = date_parser.parse(clean_d, default=datetime(current_year, 1, 1))
                formatted_date = dt.strftime('%Y-%m-%d')
                details.append({
                    "date": formatted_date,
                    "taskName": task_name,
                    "worker": worker,
                    "jobType": job_type
                })
            except Exception:
                pass
                
        return details
    except Exception as e:
        print("Error load_vntask_details:", e)
        return []

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

def save_logtime(data):
    payload = {
        "ngay_log": str(data.get('ngay_log', '')),
        "category": data.get('category', ''),
        "cong_viec": data.get('cong_viec', ''),
        "tac_pham": data.get('tac_pham', ''),
        "chuong": str(data.get('chuong', '')),
        "tap": str(data.get('tap', '')),
        "so_trang_tong": str(data.get('so_trang_tong', '')),
        "nguoi_thuc_hien": str(data.get('nguoi_thuc_hien', '')),
        "so_gio": data.get('so_gio', 0),
        "so_page": data.get('so_page', 0),
        "difficulty": data.get('difficulty', ''),
        "ghi_chu": data.get('ghi_chu', '')
    }
    try:
        res = requests.post(LOGTIME_API_URL, json=payload)
        return res.status_code == 200
    except Exception:
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
        'metric_total': "Tổng số Task", 'metric_retouch': "Số task Retouch", 'metric_type': "Số task Lettering",
        'not_update': "Chưa cập nhật",
        'cols': ['Công việc', 'Tên tác phẩm', 'Chương', 'Tập', 'Số trang', 'NXB', 'Ngày bắt đầu', 'Deadline (Nộp)', 'VN', 'Người thực hiện', 'QC Nội bộ', 'Quản lý', 'Trạng thái', 'Bắt đầu', 'Ghi chú'],
        'logtime_title': "⏱️ KHU VỰC BÁO CÁO TIẾN ĐỘ (LOGTIME & CHECKLIST)",
        'logtime_empty': "Hiện không có task nào để logtime.",
        'f_date': "📅 Ngày làm việc:", 'f_cat': "📚 Loại truyện:", 'f_diff': "🔥 Độ khó:", 'f_worker': "👤 Người làm:",
        'f_hours': "⏳ Giờ làm hôm nay:", 'f_pages': "📄 Số page HT (Tổng: {total}):", 'f_note': "📝 Ghi chú thêm:",
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
        'metric_total': "表示中のタスク総数", 'metric_retouch': "レタッチタスク数", 'metric_type': "写植タスク数",
        'not_update': "未更新",
        'cols': ['作業内容', '作品名', '話数', '巻数', 'ページ', '出版社', '開始日', '提出日', 'VN', '作業者', '社内QC', '進行管理', 'ステータス', '開始', '備考'],
        'logtime_title': "⏱️ 進捗報告エリア (ログタイム＆チェックリスト)",
        'logtime_empty': "現在、報告するタスクはありません。",
        'f_date': "📅 作業日:", 'f_cat': "📚 カテゴリ:", 'f_diff': "🔥 難易度:", 'f_worker': "👤 作業者:",
        'f_hours': "⏳ 今日の作業時間:", 'f_pages': "📄 完了ページ数 (計: {total}):", 'f_note': "📝 備考:",
        'f_btn': "保存する",
    }
}

CHECKLIST_TEXT = {
    'vi': {
        'step1': 'STEP 1: CHUẨN BỊ', 'step2': 'STEP 2: BẮT ĐẦU', 'step3': 'STEP 3: GIAO HÀNG',
        't1': 'Tạo Task DB_工程管理', 't2': 'N: notion済', 't3': 'Báo bắt đầu', 't4': 'O: 開始 (Bắt đầu)', 't5': 'Not Started → In Progress',
        't6': 'Báo hoàn thành', 't7': 'N: 納品済み', 't8': 'Trạng thái: Delivered', 't9': 'Tick comment & Tick checklist in Mikan',
        'copy_start': '📋 Copy Báo Bắt Đầu', 'ask_task': 'Trễ chỉ thị? (Hỏi Task)', 'copy_ask': '📋 Copy Hỏi Task',
        'copy_done': '📋 Copy Báo Hoàn Thành', 'copied': '✅ Đã Copy', 'copy_deliver': '📋 Copy Báo Giao Hàng'
    },
    'ja': {
        'step1': 'STEP 1: 準備', 'step2': 'STEP 2: 着手', 'step3': 'STEP 3: 納品',
        't1': 'DB_工程管理に作成', 't2': 'N列：notion済', 't3': '着手報告 (Asana)', 't4': 'O列：開始', 't5': 'Not Started → In Progress',
        't6': '完了報告 (Asana)', 't7': 'N列：納品済み', 't8': 'ステータス：Delivered', 't9': 'Mikanでコメント＆チェックリストをTick',
        'copy_start': '📋 着手報告コピー', 'ask_task': '指示遅れ？', 'copy_ask': '📋 確認文コピー',
        'copy_done': '📋 完了報告コピー', 'copied': '✅ コピー完了', 'copy_deliver': '📋 納品メッセージコピー'
    }
}

# =====================================================================
# 7. JINJA2 HELPER FUNCTIONS (Render checklist & logtime inline)
# =====================================================================
def render_checklist_html(tac_pham_key, index, lang, api_url, checked_ids=None):
    l = CHECKLIST_TEXT.get(lang, CHECKLIST_TEXT['vi'])
    if checked_ids is None:
        checked_ids = set()
    else:
        checked_ids = set(str(x).strip().lower() for x in checked_ids)

    def ch(tid):
        return 'checked' if tid in checked_ids else ''

    return f'''
    <div class="checklist-grid" data-tp-key="{tac_pham_key}">
        <div class="step-col">
            <div class="step-header">{l['step1']}</div>
            <div class="task-row"><span class="platform-badge notion">Notion</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t1" {ch('t1')}><span class="checkmark"></span><span class="action-text">{l['t1']}</span></label></div>
            <div class="task-row"><span class="platform-badge sheet">Sheet</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t2" {ch('t2')}><span class="checkmark"></span><span class="action-text">{l['t2']}</span></label></div>
        </div>
        <div class="step-col">
            <div class="step-header">{l['step2']}</div>
            <div class="task-row"><span class="platform-badge asana">Asana</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t3" {ch('t3')}><span class="checkmark"></span><span class="action-text">{l['t3']}</span></label></div>
            <div class="snippet-box" id="msg_t3_{index}">(PC) cc @Shiori Fujimura @Miho Osada @Erika Kawasaki\n===タスク着手===</div>
            <button class="btn-copy" onclick="copyText(this, 'msg_t3_{index}')">{l['copy_start']}</button>
            <div class="ask-task-toggle" onclick="toggleAskTask(this)">▸ {l['ask_task']}</div>
            <div class="ask-task-content">
                <div class="snippet-box" id="jp_t3_{index}">お疲れ様です。\n写植工程を担当しております○○です。\n本日が作業開始日となっておりますが、現時点でまだご指示をいただいておりません。\nお手数をおかけいたしますが、ご確認のほどよろしくお願いいたします。</div>
                <button class="btn-copy" onclick="copyText(this, 'jp_t3_{index}')">{l['copy_ask']}</button>
            </div>
            <div class="task-row"><span class="platform-badge sheet">Sheet</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t4" {ch('t4')}><span class="checkmark"></span><span class="action-text">{l['t4']}</span></label></div>
            <div class="task-row"><span class="platform-badge notion">Notion</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t5" {ch('t5')}><span class="checkmark"></span><span class="action-text">{l['t5']}</span></label></div>
        </div>
        <div class="step-col">
            <div class="step-header">{l['step3']}</div>
            <div class="task-row"><span class="platform-badge asana">Asana</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t6" {ch('t6')}><span class="checkmark"></span><span class="action-text">{l['t6']}</span></label></div>
            <div class="snippet-box" id="msg_t6_{index}">(PC) cc @Shiori Fujimura @Miho Osada @Erika Kawasaki\n===タスク完了===</div>
            <button class="btn-copy" onclick="copyText(this, 'msg_t6_{index}')">{l['copy_done']}</button>
            <div class="task-row"><span class="platform-badge sheet">Sheet</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t7" {ch('t7')}><span class="checkmark"></span><span class="action-text">{l['t7']}</span></label></div>
            <div class="task-row"><span class="platform-badge notion">Notion</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t8" {ch('t8')}><span class="checkmark"></span><span class="action-text">{l['t8']}</span></label></div>
            <div class="snippet-box" id="msg_t8_{index}">納品いたしました。\nご確認のほどよろしくお願いいたします。</div>
            <button class="btn-copy" onclick="copyText(this, 'msg_t8_{index}')">{l['copy_deliver']}</button>
            <div class="task-row"><span class="platform-badge mikan">Mikan</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t9" {ch('t9')}><span class="checkmark"></span><span class="action-text">{l['t9']}</span></label></div>
        </div>
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
        <form id="logtime-{index}" onsubmit="return handleLogtime(event, 'logtime-{index}')">
            <input type="hidden" name="cong_viec" value="{cong_viec}">
            <input type="hidden" name="tac_pham" value="{tac_pham}">
            <input type="hidden" name="chuong" value="{chuong if pd.notna(chuong) else ''}">
            <input type="hidden" name="tap" value="{tap if pd.notna(tap) else ''}">
            <input type="hidden" name="so_trang_tong" value="{so_trang}">
            <div class="form-row cols-4">
                <div class="form-group">
                    <label>{t['f_cat']}</label>
                    <select name="category"><option value="単行本">単行本</option><option value="読切">読切</option><option value="連載">連載</option></select>
                </div>
                <div class="form-group">
                    <label>{t['f_diff']}</label>
                    <select name="difficulty"><option value="">--</option><option value="低">低</option><option value="中">中</option><option value="高">高</option></select>
                </div>
                <div class="form-group">
                    <label>{t['f_worker']}</label>
                    <select name="nguoi_thuc_hien">{worker_options}</select>
                </div>
                <div class="form-group">
                    <label>{t['f_date']}</label>
                    <input type="date" name="ngay_log" value="{today}">
                </div>
            </div>
            <div class="form-row cols-3">
                <div class="form-group">
                    <label>{t['f_hours']}</label>
                    <input type="number" name="so_gio" min="0" step="0.5">
                </div>
                <div class="form-group">
                    <label>{t['f_pages'].format(total=so_trang)}</label>
                    <input type="number" name="so_page" min="0" step="1">
                </div>
                <div class="form-group">
                    <label>{t['f_note']}</label>
                    <input type="text" name="ghi_chu" placeholder="...">
                </div>
            </div>
            <button type="submit" class="btn btn-primary">{t['f_btn']}</button>
        </form>
    </div>
    '''

# Register template helpers
@app.context_processor
def utility_processor():
    def render_checklist(tp_key, idx, lang, api_url, checked_ids_dict=None):
        ids = (checked_ids_dict or {}).get(tp_key, [])
        return Markup(render_checklist_html(tp_key, idx, lang, api_url, ids))
    def render_logtime_form(row, idx, t, users, lang):
        return Markup(render_logtime_form_html(row, idx, t, users, lang))
    return dict(render_checklist=render_checklist, render_logtime_form=render_logtime_form)

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

    # Split data by week
    if len(idx_tuan) > 1:
        df_tuan_nay = clean_df(df_raw.iloc[idx_tuan[0]:idx_tuan[1]].copy())
    elif len(idx_tuan) > 0:
        df_tuan_nay = clean_df(df_raw.iloc[idx_tuan[0]:].copy())
    else:
        df_tuan_nay = df_raw.copy()

    df_tuan_sau = clean_df(df_raw.iloc[idx_tuan[1]:].copy()) if len(idx_tuan) > 1 else pd.DataFrame(columns=df_raw.columns)
    df_tuan_truoc = clean_df(df_truoc_raw.iloc[idx_tuan_truoc[0]:].copy()) if len(idx_tuan_truoc) > 0 else clean_df(df_truoc_raw)

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
            
            if tap and tap.lower() not in ['nan', 'none', '']:
                old_tp_key = f"{tap}_{tp}"
                tp_key = f"{cv} - {tap}_{tp}"
            else:
                old_tp_key = f"{tp}"
                tp_key = f"{cv} - {tp}"
                
            r['tp_key'] = tp_key
            r['tp_name'] = tp_key
            
            # Merge old checklist data into the new tp_key for backward compatibility
            if old_tp_key in checked_ids_dict:
                existing = set(checked_ids_dict.get(tp_key, []))
                merged = list(existing.union(checked_ids_dict[old_tp_key]))
                checked_ids_dict[tp_key] = merged
                check_counts[tp_key] = len(merged)

        return records

    def build_dashboard(df_target):
        data = []
        records = df_to_records(df_target)
        for row in records:
            tp_key = row['tp_key']
            tp_name = row['tp_name']
            worker = str(row.get('Người thực hiện', '')).strip()
            checked = check_counts.get(tp_key, 0)
            checked_ids = ','.join(checked_ids_dict.get(tp_key, []))
            if checked == 0:
                status, status_class = "⏳ Chưa Bắt Đầu", "not-started"
            elif checked >= 9:
                status, status_class = "✅ Đã Giao Hàng", "delivered"
            else:
                status, status_class = "🔥 Đang Tiến Hành", "in-progress"
            progress = int((checked / 9) * 100)
            data.append({"key": tp_key, "name": tp_name, "worker": worker, "progress": progress, "status": status, "status_class": status_class, "checked_ids": checked_ids})
        return data

    def get_metrics(df_target):
        return {
            "total": len(df_target),
            "retouch": len(df_target[df_target["Công việc"].astype(str).str.contains("Retouch|レタッチ", case=False, na=False)]) if not df_target.empty else 0,
            "lettering": len(df_target[df_target["Công việc"].astype(str).str.contains("Lettering|写植", case=False, na=False)]) if not df_target.empty else 0
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
    
    dash_nay = build_dashboard(df_tuan_nay)
    dash_truoc = build_dashboard(df_tuan_truoc)
    dash_sau = build_dashboard(df_tuan_sau)
    ai_insights = generate_ai_insights(dash_nay, dash_truoc, lang)

    # Garbage Collect Checklists
    active_keys = set()
    for row in dash_nay + dash_truoc + dash_sau:
        active_keys.add(row['key'])

    try:
        with checklist_lock:
            chk_data = get_supabase_checklists()
            if chk_data:
                keys_to_delete = [k for k in chk_data.keys() if k not in active_keys]
                if keys_to_delete:
                    for k in keys_to_delete:
                        del chk_data[k]
                    json_data = json.dumps(chk_data, ensure_ascii=False).encode('utf-8')
                    sb_upload('_system/checklists.json', json_data, content_type='application/json')
    except Exception as e:
        print("Cleanup checklist error:", e)

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
                'metrics': get_metrics(df_tuan_truoc),
            },
            'nay': {
                'info': info_nay,
                'tasks': df_to_records(df_tuan_nay),
                'dashboard': dash_nay,
                'metrics': get_metrics(df_tuan_nay),
            },
            'sau': {
                'info': info_sau,
                'tasks': df_to_records(df_tuan_sau),
                'dashboard': dash_sau,
                'metrics': get_metrics(df_tuan_sau),
            }
        }
    }

# =====================================================================
# 9. ROUTES
# =====================================================================
weather_cache = {}

@app.route('/api/checklist_version', methods=['GET'])
def api_checklist_version():
    return jsonify({"v": checklist_version})

@app.route('/api/checklist_sync_get', methods=['GET'])
def api_checklist_sync_get():
    data = get_supabase_checklists()
    rows = []
    for tp_key, cbs in data.items():
        for cb_id, status in cbs.items():
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
                data = get_supabase_checklists()
                if tp_key not in data:
                    data[tp_key] = {}
                data[tp_key][cb_id] = bool(status)
                
                # Upload to Supabase
                json_data = json.dumps(data, ensure_ascii=False).encode('utf-8')
                sb_upload('_system/checklists.json', json_data, content_type='application/json')
                global checklist_version
                checklist_version += 1
        
        # Broadcast to other clients
        socketio.emit('checklist_updated', {
            'tp_key': tp_key,
            'cb_id': cb_id,
            'status': bool(status)
        }, broadcast=True, include_self=False)
        
        return jsonify({"status": "success"})
    except Exception as e:
        print("Error saving checklist:", e)
        return jsonify({"status": "error", "message": str(e)}), 500

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

@app.route('/api/chart_data')
def api_chart_data():
    if not session.get('logged_in'):
        return jsonify([])
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

@app.route('/set-lang')
def set_lang():
    lang = request.args.get('lang', 'vi')
    if lang in ('vi', 'ja'):
        session['lang'] = lang
    next_url = request.args.get('next', '/dashboard')
    return redirect(next_url)

# =====================================================================
# 10. API ENDPOINTS
# =====================================================================
@app.route('/api/logtime', methods=['POST'])
def api_logtime():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    
    data = request.get_json()
    if save_logtime(data):
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "Lỗi khi lưu logtime"}), 500

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
# 10b. RADIO REST API (Serverless-compatible — dùng trên Vercel)
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
    'allow_requests': False,
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
        state['allow_requests'] = False
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
    'allow_requests': False
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
    if dj_sid and dj_sid in online_users:
        u = online_users[dj_sid]
        seen.add(u['username'])
        listeners.append(u)

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
        radio_state['is_playing'] = False
        radio_state['youtube_id'] = '4xDzrIxC4Dk'
        radio_state['current_time'] = 0
        radio_state['allow_requests'] = False
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
        radio_state['allow_requests'] = data.get('allow_requests', False)
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

@socketio.on('chat_message')
def handle_chat_message(data):
    username = session.get('user', 'Guest')
    msg = data.get('msg', '').strip()
    if msg:
        fullname = username
        avatar = ""
        try:
            USER_DB = load_users_from_sheet(USER_SHEET_URL)
            fullname = USER_DB.get(username, {}).get("fullname", username)
            avatar = USER_DB.get(username, {}).get("avatar", "")
        except:
            pass
        
        emit('chat_message', {
            'username': username,
            'fullname': fullname,
            'avatar': avatar,
            'msg': msg,
            'time': pd.Timestamp.now().strftime("%H:%M")
        }, broadcast=True)
        
        # --- Xử lý Bot Dịch Thuật ---
        if msg.lower().startswith('@bot '):
            text_to_translate = msg[5:].strip()
            if text_to_translate:
                # Tự động nhận diện nếu có tiếng Nhật -> Dịch sang Tiếng Việt. Nếu không -> Dịch sang Tiếng Nhật
                target_lang = 'vi' if is_japanese(text_to_translate) else 'ja'
                translated_text = translate_text(text_to_translate, target_lang)
                
                lang_name = "Tiếng Việt" if target_lang == 'vi' else "Tiếng Nhật"
                
                # Bot trả lời vào chat
                emit('chat_message', {
                    'username': 'bot',
                    'fullname': '🤖 Bot Dịch Thuật',
                    'avatar': 'https://api.dicebear.com/7.x/bottts/svg?seed=TranslateBot',
                    'msg': f"**[Dịch sang {lang_name}]:**\n{translated_text}",
                    'time': pd.Timestamp.now().strftime("%H:%M")
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
    
    if not base_path or not tap_str:
        return jsonify({'error': 'Vui lòng cung cấp đường dẫn và số tập.'}), 400
        
    # We allow any valid absolute path on the machine for this utility
    if not (os.path.isabs(base_path) or base_path.startswith('/')):
        return jsonify({'error': 'Vui lòng cung cấp đường dẫn tuyệt đối hợp lệ (VD: C:\\Users\\...).'}), 400
        
    try:
        # Create {tap}巻/01_レタッチ/01_★編集用PSD
        folder_psd = os.path.join(base_path, f"{tap_str}巻", "01_レタッチ", "01_★編集用PSD")
        # Create {tap}巻/01_レタッチ/02_写植・レタッチ時Mikan用jpg
        folder_jpg = os.path.join(base_path, f"{tap_str}巻", "01_レタッチ", "02_写植・レタッチ時Mikan用jpg")
        
        os.makedirs(folder_psd, exist_ok=True)
        os.makedirs(folder_jpg, exist_ok=True)
        
        return jsonify({'success': True, 'message': 'Tạo cấu trúc thư mục thành công!'})
    except Exception as e:
        return jsonify({'error': f'Không thể tạo thư mục: {str(e)}'}), 500


@app.route('/api/compare_psd', methods=['POST'])
def compare_psd():
    if not session.get('logged_in'):
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json or {}
    base_path = data.get('path', '').strip()
    tap_str = data.get('tap', '').strip()
    source_path = data.get('source_path', '').strip()
    
    if not base_path or not tap_str or not source_path:
        return jsonify({'error': 'Vui lòng cung cấp đầy đủ đường dẫn gốc, số tập và đường dẫn chứa PSD tải về.'}), 400
        
    if not (os.path.isabs(base_path) or base_path.startswith('/')):
        return jsonify({'error': 'Đường dẫn gốc không hợp lệ.'}), 400
        
    if not (os.path.isabs(source_path) or source_path.startswith('/')):
        return jsonify({'error': 'Đường dẫn chứa PSD tải về không hợp lệ.'}), 400
        
    if not os.path.exists(source_path):
        return jsonify({'error': 'Thư mục chứa PSD tải về không tồn tại!'}), 400
        
    try:
        import shutil
        import glob
        
        # Target folder: [path]/[tap]巻/01_レタッチ/01_★編集用PSD
        folder_psd = os.path.join(base_path, f"{tap_str}巻", "01_レタッチ", "01_★編集用PSD")
        
        if not os.path.exists(folder_psd):
            return jsonify({'error': f'Thư mục đích không tồn tại: {folder_psd}. Vui lòng Tạo thư mục trước!'}), 400
            
        # Find all .psd files in source_path
        psd_files = glob.glob(os.path.join(source_path, '*.psd'))
        if not psd_files:
            return jsonify({'error': 'Không tìm thấy file .psd nào trong thư mục tải về!'}), 400
            
        # Move all .psd files to folder_psd
        moved_count = 0
        for psd_file in psd_files:
            dest_file = os.path.join(folder_psd, os.path.basename(psd_file))
            # Move and overwrite if exists
            if os.path.exists(dest_file):
                os.remove(dest_file)
            shutil.move(psd_file, dest_file)
            moved_count += 1
            
        # Duplicate 01_★編集用PSD to 99_Backup
        folder_backup = os.path.join(base_path, f"{tap_str}巻", "01_レタッチ", "99_Backup")
        
        if os.path.exists(folder_backup):
            # If backup already exists, we might want to remove it or merge. Let's just remove old backup to replace with new one.
            shutil.rmtree(folder_backup)
            
        shutil.copytree(folder_psd, folder_backup)
        
        return jsonify({'success': True, 'message': f'Đã chuyển {moved_count} file PSD và tạo thư mục 99_Backup thành công!'})
    except Exception as e:
        return jsonify({'error': f'Có lỗi xảy ra: {str(e)}'}), 500

if __name__ == '__main__':
    threading.Thread(target=preload_data, daemon=True).start()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
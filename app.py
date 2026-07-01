import os
import time
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

# =====================================================================
# 1. CẤU HÌNH FLASK
# =====================================================================
app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'vn-tracking-secret-' + hashlib.md5(b'vn-tracking-2024').hexdigest())

# =====================================================================
# 2. CƠ SỞ DỮ LIỆU TÀI KHOẢN VÀ LINK DỮ LIỆU
# =====================================================================
USER_SHEET_URL = "https://docs.google.com/spreadsheets/d/1VLlDF5XoXt0Rz0ACZ3EZRKcKWFnIRXptMPbQthimNE0/export?format=csv&gid=0"
CHECKLIST_API_URL = "https://script.google.com/macros/s/AKfycbyguXQno1gohakWqgfTwd0uP-b9BNkkExBcXIe23O267Jr2cXBX2JDSuS0_EVu_uv-7/exec"
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

@cached(ttl=180)
def load_checklist_data(api_url):
    try:
        if api_url == "" or "DÁN_LINK" in api_url:
            return pd.DataFrame()
        res = requests.get(api_url, timeout=10)
        data = res.json()
        if isinstance(data, list) and len(data) > 0:
            return pd.DataFrame(data)
        return pd.DataFrame(columns=['Tên Tác Phẩm', 'Checkbox ID', 'Trạng Thái', 'Thời Gian'])
    except Exception:
        return pd.DataFrame(columns=['Tên Tác Phẩm', 'Checkbox ID', 'Trạng Thái', 'Thời Gian'])

@cached(ttl=180)
def load_sheet_data(url):
    try:
        df = pd.read_csv(url, usecols=list(range(1, 16)), header=None)
        df.columns = COLS
        return df
    except Exception:
        return pd.DataFrame(columns=COLS)

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
        if 'tuần' not in v_str.lower() and 'deadline' not in v_str.lower() and not v_str.isnumeric() and len(v_str) >= 5:
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
        't6': 'Báo hoàn thành', 't7': 'N: 納品済み', 't8': 'Trạng thái: Delivered', 't9': 'Chú ý comment',
        'copy_start': '📋 Copy Báo Bắt Đầu', 'ask_task': 'Trễ chỉ thị? (Hỏi Task)', 'copy_ask': '📋 Copy Hỏi Task',
        'copy_done': '📋 Copy Báo Hoàn Thành', 'copied': '✅ Đã Copy', 'copy_deliver': '📋 Copy Báo Giao Hàng'
    },
    'ja': {
        'step1': 'STEP 1: 準備', 'step2': 'STEP 2: 着手', 'step3': 'STEP 3: 納品',
        't1': 'DB_工程管理に作成', 't2': 'N列：notion済', 't3': '着手報告 (Asana)', 't4': 'O列：開始', 't5': 'Not Started → In Progress',
        't6': '完了報告 (Asana)', 't7': 'N列：納品済み', 't8': 'ステータス：Delivered', 't9': 'コメント注意',
        'copy_start': '📋 着手報告コピー', 'ask_task': '指示遅れ？', 'copy_ask': '📋 確認文コピー',
        'copy_done': '📋 完了報告コピー', 'copied': '✅ コピー完了', 'copy_deliver': '📋 納品メッセージコピー'
    }
}

# =====================================================================
# 7. JINJA2 HELPER FUNCTIONS (Render checklist & logtime inline)
# =====================================================================
def render_checklist_html(tac_pham_key, index, lang, api_url):
    l = CHECKLIST_TEXT.get(lang, CHECKLIST_TEXT['vi'])
    return f'''
    <div class="checklist-grid" data-tp-key="{tac_pham_key}">
        <div class="step-col">
            <div class="step-header">{l['step1']}</div>
            <div class="task-row"><span class="platform-badge notion">Notion</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t1"><span class="checkmark"></span><span class="action-text">{l['t1']}</span></label></div>
            <div class="task-row"><span class="platform-badge sheet">Sheet</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t2"><span class="checkmark"></span><span class="action-text">{l['t2']}</span></label></div>
        </div>
        <div class="step-col">
            <div class="step-header">{l['step2']}</div>
            <div class="task-row"><span class="platform-badge asana">Asana</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t3"><span class="checkmark"></span><span class="action-text">{l['t3']}</span></label></div>
            <div class="snippet-box" id="msg_t3_{index}">(PC) cc @Shiori Fujimura @Miho Osada @Erika Kawasaki\n===タスク着手===</div>
            <button class="btn-copy" onclick="copyText(this, 'msg_t3_{index}')">{l['copy_start']}</button>
            <div class="ask-task-toggle" onclick="toggleAskTask(this)">▸ {l['ask_task']}</div>
            <div class="ask-task-content">
                <div class="snippet-box" id="jp_t3_{index}">お疲れ様です。\n写植工程を担当しております○○です。\n本日が作業開始日となっておりますが、現時点でまだご指示をいただいておりません。\nお手数をおかけいたしますが、ご確認のほどよろしくお願いいたします。</div>
                <button class="btn-copy" onclick="copyText(this, 'jp_t3_{index}')">{l['copy_ask']}</button>
            </div>
            <div class="task-row"><span class="platform-badge sheet">Sheet</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t4"><span class="checkmark"></span><span class="action-text">{l['t4']}</span></label></div>
            <div class="task-row"><span class="platform-badge notion">Notion</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t5"><span class="checkmark"></span><span class="action-text">{l['t5']}</span></label></div>
        </div>
        <div class="step-col">
            <div class="step-header">{l['step3']}</div>
            <div class="task-row"><span class="platform-badge asana">Asana</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t6"><span class="checkmark"></span><span class="action-text">{l['t6']}</span></label></div>
            <div class="snippet-box" id="msg_t6_{index}">(PC) cc @Shiori Fujimura @Miho Osada @Erika Kawasaki\n===タスク完了===</div>
            <button class="btn-copy" onclick="copyText(this, 'msg_t6_{index}')">{l['copy_done']}</button>
            <div class="task-row"><span class="platform-badge sheet">Sheet</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t7"><span class="checkmark"></span><span class="action-text">{l['t7']}</span></label></div>
            <div class="task-row"><span class="platform-badge notion">Notion</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t8"><span class="checkmark"></span><span class="action-text">{l['t8']}</span></label></div>
            <div class="snippet-box" id="msg_t8_{index}">納品いたしました。\nご確認のほどよろしくお願いいたします。</div>
            <button class="btn-copy" onclick="copyText(this, 'msg_t8_{index}')">{l['copy_deliver']}</button>
            <div class="task-row"><span class="platform-badge mikan">Mikan</span><label class="check-label"><input type="checkbox" data-checklist data-check-id="t9"><span class="checkmark"></span><span class="action-text">{l['t9']}</span></label></div>
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
                    <input type="number" name="so_gio" value="0" min="0" step="0.5">
                </div>
                <div class="form-group">
                    <label>{t['f_pages'].format(total=so_trang)}</label>
                    <input type="number" name="so_page" value="0" min="0" step="1">
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
    def render_checklist(tp_key, idx, lang, api_url):
        return Markup(render_checklist_html(tp_key, idx, lang, api_url))
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

    df_raw = load_sheet_data(csv_url)
    df_truoc_raw = load_sheet_data(csv_url_truoc)

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
                if any('deadline' in str(v).lower() for v in row_vals) and len(dates) >= 1:
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
    df_check = load_checklist_data(CHECKLIST_API_URL)
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
                tp_key = f"{cv} - {tap}_{tp}"
            else:
                tp_key = f"{cv} - {tp}"
                
            r['tp_key'] = tp_key
            r['tp_name'] = tp_key
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

    USER_DB = load_users_from_sheet(USER_SHEET_URL)
    users = list(USER_DB.keys())

    return {
        'user': user,
        'role': role,
        'lang': lang,
        't': t,
        'users': users,
        'user_profiles': USER_DB,
        'cols_keys': COLS,
        'checklist_api': CHECKLIST_API_URL,
        'vntask_details': load_vntask_details(),
        'filter_cv_nay': list(df_tuan_nay["Công việc"].dropna().unique()) if not df_tuan_nay.empty else [],
        'filter_cv_sau': list(df_tuan_sau["Công việc"].dropna().unique()) if not df_tuan_sau.empty else [],
        'weeks': {
            'truoc': {
                'info': info_truoc,
                'tasks': df_to_records(df_tuan_truoc),
                'dashboard': build_dashboard(df_tuan_truoc),
                'metrics': get_metrics(df_tuan_truoc),
            },
            'nay': {
                'info': info_nay,
                'tasks': df_to_records(df_tuan_nay),
                'dashboard': build_dashboard(df_tuan_nay),
                'metrics': get_metrics(df_tuan_nay),
            },
            'sau': {
                'info': info_sau,
                'tasks': df_to_records(df_tuan_sau),
                'dashboard': build_dashboard(df_tuan_sau),
                'metrics': get_metrics(df_tuan_sau),
            }
        }
    }

# =====================================================================
# 9. ROUTES
# =====================================================================
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
# 11. CHẠY ỨNG DỤNG
# =====================================================================
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
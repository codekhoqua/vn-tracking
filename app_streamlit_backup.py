import streamlit as st
import pandas as pd
import requests
from datetime import date
import time
import streamlit.components.v1 as components

# =====================================================================
# 1. CẤU HÌNH TRANG & MÃ CSS GỘP CHUNG (CHỐNG LIGHT MODE VÀ FIX LỖI MÀU)
# =====================================================================
st.set_page_config(page_title="VN-Tracking Dashboard", layout="wide", initial_sidebar_state="expanded")

def render_dark_theme_css():
    colors = {
        "primary": "#3b82f6", "primary_dark": "#2563eb", "primary_light": "#1e293b",
        "accent": "#fb923c", "success": "#22c55e", "danger": "#f87171", "warning": "#fbbf24",
        "surface": "#1e293b", "surface_soft": "#0f172a", "border": "#334155",
        "text_main": "#f1f5f9", "text_muted": "#94a3b8",
        "app_bg_1": "#0b1220", "app_bg_2": "#0f172a",
        "shadow_sm": "0 1px 3px rgba(0,0,0,0.35)", "shadow_md": "0 6px 20px rgba(0,0,0,0.45)",
        "shadow_lg": "0 12px 36px rgba(0,0,0,0.55)",
        "input_bg": "#0f172a"
    }

    st.markdown(f"""
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        :root {{
            --primary: {colors['primary']}; --primary-dark: {colors['primary_dark']}; --primary-light: {colors['primary_light']};
            --accent: {colors['accent']}; --success: {colors['success']}; --danger: {colors['danger']}; --warning: {colors['warning']};
            --surface: {colors['surface']}; --surface-soft: {colors['surface_soft']}; --border: {colors['border']};
            --text-main: {colors['text_main']}; --text-muted: {colors['text_muted']}; --input-bg: {colors['input_bg']};
            --radius-md: 12px; --radius-sm: 8px;
            --shadow-sm: {colors['shadow_sm']}; --shadow-md: {colors['shadow_md']};
        }}

        /* ÉP MÀU NỀN & CHỮ CHỐNG LIGHT MODE */
        html, body, [class*="css"], .stApp, div[data-testid="stAppViewContainer"], .main {{ 
            font-family: 'Inter', 'Segoe UI', sans-serif !important; 
            color: var(--text-main) !important; 
            background-color: var(--app_bg_1) !important;
        }}

       /* ẨN CÁC THÀNH PHẦN MẶC ĐỊNH (Đã hiển thị lại các nút) */
        /* [data-testid="stStatusWidget"], .stDeployButton, [data-testid="stMainMenu"] {{display: none !important;}} */
        header[data-testid="stHeader"] {{background-color: transparent !important;}}
        /* footer {{visibility: hidden;}} */

        .stApp, [data-testid="stAppViewContainer"] {{
            background: linear-gradient(180deg, {colors['app_bg_1']} 0%, {colors['app_bg_2']} 100%) !important;
        }}
        .stMainBlockContainer {{ min-height: 100vh; padding-top: 1.5rem; padding-bottom: 4rem; max-width: 1400px; }}

        /* TIÊU ĐỀ & LABEL */
        h1, h2, h3, h4, h5, h6, p, label {{ color: var(--text-main) !important; }}
        h1 {{ font-weight: 800 !important; letter-spacing: -0.02em; font-size: 1.9rem !important; }}
        h2, h3, h4, h5, h6 {{ font-weight: 700 !important; letter-spacing: -0.01em; }}
        label p, .stSelectbox label p, .stTextInput label p, .stDateInput label p, .stNumberInput label p {{
            color: var(--text-main) !important; font-weight: 600 !important;
        }}

        /* TABS */
        div[data-testid="stTabs"] {{ min-height: 800px; }}
        div[data-testid="stTabs"] > div:first-child {{
            background: var(--surface) !important;
            padding: 6px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); border: 1px solid var(--border);
        }}
        button[data-baseweb="tab"] {{
            font-size: 15px !important; font-weight: 600 !important; border-radius: var(--radius-sm) !important;
            color: var(--text-muted) !important; transition: all 0.2s ease; background-color: transparent;
        }}
        button[data-baseweb="tab"]:hover, button[data-baseweb="tab"][aria-selected="true"] {{ color: var(--primary) !important; background: var(--primary-light) !important; }}
        div[data-baseweb="tab-highlight"] {{ background-color: var(--primary) !important; height: 3px !important; border-radius: 3px; }}
        div[data-baseweb="tab-border"] {{ display: none !important; }}

        /* EXPANDER */
        details[data-testid="stExpander"], div[data-testid="stVerticalBlockBorderWrapper"] {{
            border-radius: var(--radius-md) !important; border: 1px solid var(--border) !important;
            box-shadow: var(--shadow-sm); margin-bottom: 12px; background: var(--surface) !important; overflow: hidden;
        }}
        details[data-testid="stExpander"] summary {{ font-weight: 600 !important; background: var(--surface-soft) !important; padding: 0.8rem 1rem !important; color: var(--text-main) !important; }}
        details[data-testid="stExpander"] summary:hover {{ background: var(--border) !important; }}

        /* NÚT BẤM */
        .stButton button, .stFormSubmitButton button {{
            border-radius: var(--radius-sm) !important; font-weight: 600 !important;
            border: 1px solid var(--border) !important; background-color: var(--surface) !important;
            color: var(--text-main) !important; transition: all 0.18s ease !important; box-shadow: var(--shadow-sm);
        }}
        .stButton button:hover, .stFormSubmitButton button:hover {{ transform: translateY(-1px); box-shadow: var(--shadow-md); border-color: var(--primary) !important; }}
        .stFormSubmitButton button[kind="primaryFormSubmit"], .stButton button[kind="primary"] {{ background: linear-gradient(135deg, var(--primary), var(--primary-dark)) !important; border: none !important; color: white !important; }}

        /* INPUT / SELECT / POPOVER */
        div[data-baseweb="base-input"], div[data-baseweb="select"] > div, div[data-baseweb="input"] {{
            background-color: var(--input-bg) !important; border: 1px solid var(--border) !important; border-radius: var(--radius-sm) !important; color: var(--text-main) !important;
        }}
        .stTextInput input, .stNumberInput input, .stDateInput input, .stTextArea textarea, div[data-baseweb="select"] span {{ background-color: transparent !important; color: var(--text-main) !important; -webkit-text-fill-color: var(--text-main) !important; border: none !important; }}
        div[data-baseweb="base-input"] svg, div[data-baseweb="input"] svg, div[data-baseweb="select"] svg {{ fill: var(--text-muted) !important; color: var(--text-muted) !important; }}
        div[data-baseweb="popover"], div[data-baseweb="popover"] > div, ul[data-baseweb="menu"] {{ background-color: var(--surface) !important; border: 1px solid var(--border) !important; color: var(--text-main) !important; }}
        ul[data-baseweb="menu"] li {{ color: var(--text-main) !important; background-color: transparent !important; }}
        ul[data-baseweb="menu"] li:hover, ul[data-baseweb="menu"] li[aria-selected="true"], ul[data-baseweb="menu"] li[aria-highlighted="true"] {{ background-color: var(--primary-light) !important; color: var(--primary) !important; }}
        div[data-baseweb="calendar"] {{ background-color: var(--surface) !important; color: var(--text-main) !important; }}
        div[data-baseweb="calendar"] * {{ color: var(--text-main) !important; }}

        /* DATAFRAME */
        div[data-testid="stDataFrame"] {{ border-radius: var(--radius-md) !important; overflow: hidden; box-shadow: var(--shadow-sm); border: 1px solid var(--border) !important; background-color: var(--surface) !important; }}
        [data-testid="stDataFrame"] div, [data-testid="stDataFrame"] span, [data-testid="stDataFrame"] table {{ color: var(--text-main) !important; background-color: transparent !important; }}
        [data-testid="stDataFrame"] th, [data-testid="stDataFrame"] td {{ background-color: var(--surface) !important; color: var(--text-main) !important; border-color: var(--border) !important; }}
        [data-testid="stDataFrame"] th {{ background-color: var(--surface-soft) !important; font-weight: bold !important; }}

       /* ============ KHÔI PHỤC MÀU XANH CHO METRIC ============ */
        div[data-testid="stMetric"] {{
            background: var(--surface-soft) !important; border: 1px solid var(--border) !important;
            border-radius: var(--radius-md) !important; padding: 0.8rem 1rem !important; text-align: center;
        }}
        div[data-testid="stMetricLabel"], div[data-testid="stMetricLabel"] * {{ 
            color: var(--text-muted) !important; 
            font-weight: 500 !important; 
        }}
        div[data-testid="stMetricValue"], div[data-testid="stMetricValue"] * {{ 
            color: var(--primary) !important; 
            font-weight: 800 !important; 
        }}
        /* SIDEBAR & HEADER */
        section[data-testid="stSidebar"] {{ background: var(--surface) !important; border-right: 1px solid var(--border) !important; }}
        ::-webkit-scrollbar {{ width: 8px; height: 8px; }}
        ::-webkit-scrollbar-track {{ background: var(--app_bg_1); }}
        ::-webkit-scrollbar-thumb {{ background: var(--border); border-radius: 10px; }}
        ::-webkit-scrollbar-thumb:hover {{ background: var(--text-muted); }}
    </style>
    """, unsafe_allow_html=True)

render_dark_theme_css()

# =====================================================================
# 2. CƠ SỞ DỮ LIỆU TÀI KHOẢN VÀ LINK DỮ LIỆU
# =====================================================================
USER_SHEET_URL = "https://docs.google.com/spreadsheets/d/1VLlDF5XoXt0Rz0ACZ3EZRKcKWFnIRXptMPbQthimNE0/export?format=csv&gid=0"
CHECKLIST_API_URL = "https://script.google.com/macros/s/AKfycbyguXQno1gohakWqgfTwd0uP-b9BNkkExBcXIe23O267Jr2cXBX2JDSuS0_EVu_uv-7/exec"
CHANGE_PASS_API = "https://script.google.com/macros/s/AKfycbxLWNSqylAHWvkY4JKNvCTpDQMiL2Vgl8_EYEhBI7Ob7OTcIVRXXiJmBQzDa4oNMAVK/exec"

@st.cache_data(ttl=60, show_spinner=False)
def load_users_from_sheet(url):
    try:
        df_users = pd.read_csv(url).dropna(subset=['Username', 'Password'])
        return {str(row.iloc[0]).strip(): {"password": str(row.iloc[1]).strip(), "role": str(row.iloc[2]).strip().lower()} for _, row in df_users.iterrows()}
    except Exception as e:
        return {}

@st.cache_data(ttl=300, show_spinner=False) 
def load_checklist_data(api_url):
    try:
        if api_url == "" or "DÁN_LINK" in api_url: return pd.DataFrame()
        res = requests.get(api_url, timeout=10)
        data = res.json()
        if isinstance(data, list) and len(data) > 0: return pd.DataFrame(data)
        return pd.DataFrame(columns=['Tên Tác Phẩm', 'Checkbox ID', 'Trạng Thái', 'Thời Gian'])
    except Exception as e:
        return pd.DataFrame(columns=['Tên Tác Phẩm', 'Checkbox ID', 'Trạng Thái', 'Thời Gian'])

@st.cache_data(ttl=60, show_spinner=False)
def load_sheet_data(url):
    cols = ['Công việc', 'Tên tác phẩm', 'Chương', 'Tập', 'Số trang', 'NXB', 'Ngày bắt đầu', 'Deadline (Nộp)', 'VN', 'Người thực hiện', 'QC Nội bộ', 'Quản lý', 'Trạng thái', 'Bắt đầu', 'Ghi chú']
    try:
        df = pd.read_csv(url, usecols=list(range(1, 16)), header=None)
        df.columns = cols
        return df
    except:
        return pd.DataFrame(columns=cols)

USER_DB = load_users_from_sheet(USER_SHEET_URL)

if 'lang' not in st.session_state: st.session_state.lang = 'vi'
if 'df_nay_old' not in st.session_state: st.session_state.df_nay_old = None
if 'df_truoc_old' not in st.session_state: st.session_state.df_truoc_old = None 
if 'df_sau_old' not in st.session_state: st.session_state.df_sau_old = None
if 'logged_in' not in st.session_state: st.session_state.logged_in = False
if 'current_user' not in st.session_state: st.session_state.current_user = None
if 'user_role' not in st.session_state: st.session_state.user_role = None
if 'success_logs' not in st.session_state: st.session_state.success_logs = {}
if 'last_log_time' not in st.session_state: st.session_state.last_log_time = {}

# =====================================================================
# 3. HỆ THỐNG ĐĂNG NHẬP
# =====================================================================
if not st.session_state.logged_in:
    st.markdown("""
        <div class="login-hero">
            <h2 style="text-align: center; margin-bottom: 20px;">🔐 Đăng nhập VN-Tracking Dashboard</h2>
        </div>
    """, unsafe_allow_html=True)
    col_login1, col_login2, col_login3 = st.columns([1, 1, 1])
    with col_login2:
        with st.form("login_form"):
            username = st.selectbox("Tài khoản (Người thực hiện)", options=[""] + list(USER_DB.keys()))
            password = st.text_input("Mật khẩu", type="password")
            submit_login = st.form_submit_button("Đăng nhập", use_container_width=True, type="primary")
            
            if submit_login:
                if username == "":
                    st.warning("Vui lòng chọn tài khoản!")
                elif username in USER_DB and USER_DB[username]["password"] == password:
                    st.session_state.logged_in = True
                    st.session_state.current_user = username
                    st.session_state.user_role = USER_DB[username]["role"]
                    st.session_state.just_logged_in = True 
                    st.success("Đăng nhập thành công! Đang tải dữ liệu...")
                    time.sleep(0.5)
                    st.rerun()
                else:
                    st.error("Mật khẩu không chính xác!")
    st.stop()

# =====================================================================
# 4. GIAO DIỆN HEADER & ĐỔI PASS
# =====================================================================
st.markdown(f"""
    <div style="display:flex; justify-content:space-between; align-items:center; background: linear-gradient(135deg, var(--surface-soft), var(--surface)); border: 1px solid var(--border); padding: 10px 18px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); margin-bottom: 1rem;">
        <span style="font-size: 14.5px;">👤 Đang đăng nhập: <b style="color: var(--text-main);">{st.session_state.current_user}</b> 
        <span style="background: rgba(59, 130, 246, 0.15); color: var(--primary); padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; border: 1px solid rgba(59, 130, 246, 0.3); margin-left: 10px;">{st.session_state.user_role.upper()}</span></span>
    </div>
""", unsafe_allow_html=True)

if st.sidebar.button("🚪 Đăng xuất", use_container_width=True, type="primary"):
    st.session_state.logged_in = False
    st.session_state.current_user = None
    st.session_state.user_role = None
    st.session_state.success_logs = {}
    st.session_state.last_log_time = {}
    if 'just_logged_in' in st.session_state: del st.session_state['just_logged_in']
    st.rerun()

with st.sidebar:
    st.markdown("### 🔑 Đổi mật khẩu")
    with st.form("change_pass_form", clear_on_submit=True):
        old_pass = st.text_input("Mật khẩu cũ", type="password")
        new_pass = st.text_input("Mật khẩu mới", type="password")
        confirm_pass = st.text_input("Xác nhận mật khẩu mới", type="password")
        submit_pass = st.form_submit_button("Lưu thay đổi", use_container_width=True)

        if submit_pass:
            if not old_pass or not new_pass or not confirm_pass: st.error("Vui lòng điền đầy đủ thông tin!")
            elif new_pass != confirm_pass: st.error("Mật khẩu xác nhận không khớp!")
            elif old_pass != USER_DB[st.session_state.current_user]["password"]: st.error("Mật khẩu cũ không chính xác!")
            elif new_pass == old_pass: st.warning("Mật khẩu mới phải khác mật khẩu cũ!")
            else:
                with st.spinner("Đang cập nhật..."):
                    try:
                        res = requests.post(CHANGE_PASS_API, json={"username": st.session_state.current_user, "old_password": old_pass, "new_password": new_pass})
                        if res.json().get("status") == "success":
                            st.success("Đổi mật khẩu thành công!")
                            load_users_from_sheet.clear()
                            USER_DB[st.session_state.current_user]["password"] = new_pass
                        else: st.error("Lỗi cập nhật mật khẩu!")
                    except: st.error("Lỗi kết nối!")

col_title, col_lang = st.columns([8, 2])
with col_lang:
    st.write("") 
    chon_ngon_ngu = st.selectbox("🌐 Ngôn ngữ / 言語", ["Tiếng Việt", "日本語"], index=0 if st.session_state.lang == 'vi' else 1, label_visibility="collapsed")
    st.session_state.lang = 'vi' if chon_ngon_ngu == "Tiếng Việt" else 'ja'

dict_lang = {
    'vi': {
        'title': "📊 Quản lý tiến độ Team Việt Nam", 'filter_title': "### Bộ lọc hiển thị",
        'cv_nay': "Công việc (Tuần Này):", 'nguoi_nay': "Người thực hiện (Tuần Này):",
        'cv_sau': "Công việc (Tuần Sau):", 'nguoi_sau': "Người thực hiện (Tuần Sau):",
        'tab0': "⏪ THÔNG TIN TUẦN TRƯỚC", 'tab1': "📌 THÔNG TIN TUẦN NÀY", 'tab2': "⏭️ THÔNG TIN TUẦN SAU",
        'time': "🗓️ Thời gian làm việc:", 'deadline': "🚨 DEADLINE CHÚ Ý:",
        'no_filter': "Không có tác phẩm nào khớp với bộ lọc hoặc không có task của bạn!", 'no_task': "Hiện chưa có task nào được phân công!",
        'metric_total': "Tổng số Task", 'metric_retouch': "Số task Retouch", 'metric_type': "Số task Lettering",
        'not_update': "Chưa cập nhật",
        'cols': ['Công việc', 'Tên tác phẩm', 'Chương', 'Tập', 'Số trang', 'NXB', 'Ngày bắt đầu', 'Deadline (Nộp)', 'VN', 'Người thực hiện', 'QC Nội bộ', 'Quản lý', 'Trạng thái', 'Bắt đầu', 'Ghi chú'],
        'logtime_title': "⏱️ KHU VỰC BÁO CÁO TIẾN ĐỘ (LOGTIME & CHECKLIST)",
        'logtime_empty': "Hiện không có task nào để logtime.",
        'f_date': "📅 Ngày làm việc:", 'f_cat': "📚 Loại truyện:", 'f_diff': "🔥 Độ khó:", 'f_worker': "👤 Người làm:",
        'f_hours': "⏳ Giờ làm hôm nay:", 'f_pages': "📄 Số page HT (Tổng: {total}):", 'f_note': "📝 Ghi chú thêm:",
        'f_btn': "Lưu Logtime", 'f_warn': "⚠️ Vui lòng nhập số giờ hoặc số trang!", 'f_sync': "⏳ Đang lưu...",
        'f_succ': "✅ Đã lưu: {worker} - {hours}h - {pages}tr.", 'f_err': "❌ Có lỗi xảy ra."
    },
    'ja': {
        'title': "📊 ベトナムチーム進捗管理", 'filter_title': "### 🔍 表示フィルター",
        'cv_nay': "作業内容 (今週):", 'nguoi_nay': "作業者 (今週):",
        'cv_sau': "作業内容 (来週):", 'nguoi_sau': "作業者 (来週):",
        'tab0': "⏪ 先週の情報", 'tab1': "📌 今週の情報", 'tab2': "⏭️ 来週の情報",
        'time': "🗓️ 勤務期間:", 'deadline': "🚨 ご注意の締め切り:",
        'no_filter': "フィルターに一致する作品はありません！", 'no_task': "タスクはまだ割り当てられていません！",
        'metric_total': "表示中のタスク総数", 'metric_retouch': "レタッチタスク数", 'metric_type': "写植タスク数",
        'not_update': "未更新",
        'cols': ['作業内容', '作品名', '話数', '巻数', 'ページ', '出版社', '開始日', '提出日', 'VN', '作業者', '社内QC', '進行管理', 'ステータス', '開始', '備考'],
        'logtime_title': "⏱️ 進捗報告エリア (ログタイム＆チェックリスト)",
        'logtime_empty': "現在、報告するタスクはありません。",
        'f_date': "📅 作業日:", 'f_cat': "📚 カテゴリ:", 'f_diff': "🔥 難易度:", 'f_worker': "👤 作業者:",
        'f_hours': "⏳ 今日の作業時間:", 'f_pages': "📄 完了ページ数 (計: {total}):", 'f_note': "📝 備考:",
        'f_btn': "保存する", 'f_warn': "⚠️ 時間またはページ数を入力してください！", 'f_sync': "⏳ 送信中...",
        'f_succ': "✅ 保存完了: {worker} - {hours}h - {pages}p.", 'f_err': "❌ エラーが発生しました。"
    }
}
t = dict_lang[st.session_state.lang]

with col_title: st.title(t['title'])

# =====================================================================
# 5. CÁC HÀM XỬ LÝ DỮ LIỆU CỐT LÕI
# =====================================================================
url = "https://docs.google.com/spreadsheets/d/1ec_v1hsKu0oCOwyrFNgxckpoaq3Q02J4NdIchqbYE3s/edit?gid=597870203#gid=597870203"
csv_url = url.split("/edit")[0] + "/export?format=csv" if "/edit" in url else url

url_after_week = "https://docs.google.com/spreadsheets/d/1ec_v1hsKu0oCOwyrFNgxckpoaq3Q02J4NdIchqbYE3s/edit?gid=597870203#gid=597870203"
csv_url_truoc = url_after_week.split("/edit")[0] + "/export?format=csv&" + url_after_week.split("#")[1] if "#gid" in url_after_week else url_after_week

def get_clean_dates(vals_list):
    valid = []
    for v in vals_list:
        v_str = str(v).strip()
        if v_str in ['nan', 'NaN', 'None', ''] or v_str in [':', '->', '-', '=>']: continue
        if 'tuần' not in v_str.lower() and 'deadline' not in v_str.lower() and not v_str.isnumeric() and len(v_str) >= 5: valid.append(v_str)
    return valid

def clean_df(df):
    df = df.dropna(subset=['Công việc', 'Tên tác phẩm'])
    df = df[~df['Công việc'].astype(str).str.contains('Công việc|作業内容', na=False, case=False)]
    df = df[df['Công việc'].astype(str).str.strip() != '']
    return df[~df['Công việc'].astype(str).str.lower().isin(['nan', 'none'])]

def highlight_changes(df_new, df_old):
    if df_old is None or df_new.shape != df_old.shape: return pd.DataFrame('', index=df_new.index, columns=df_new.columns)
    mask = df_new.astype(str).values != df_old.astype(str).values
    return pd.DataFrame([['background-color: rgba(255, 75, 75, 0.2); color: #ff4b4b; font-weight: bold;' if is_changed else '' for is_changed in row] for row in mask], index=df_new.index, columns=df_new.columns)

def save_logtime(ngay_log, category, cong_viec, tac_pham, chuong, tap, so_trang_tong, nguoi_thuc_hien, so_gio, so_page, difficulty, ghi_chu):
    api_url = "https://script.google.com/macros/s/AKfycbwRgcwRvxBZPOMEyfKbWCDXpLsY1H5edxQtxF4xihgaVIJn-eiqbuDB_2yCU9XYR_MwAQ/exec" 
    payload = { "ngay_log": str(ngay_log), "category": category, "cong_viec": cong_viec, "tac_pham": tac_pham, "chuong": str(chuong) if pd.notna(chuong) else "", "tap": str(tap) if pd.notna(tap) else "", "so_trang_tong": str(so_trang_tong) if pd.notna(so_trang_tong) else "", "nguoi_thuc_hien": str(nguoi_thuc_hien) if pd.notna(nguoi_thuc_hien) else "", "so_gio": so_gio, "so_page": so_page, "difficulty": difficulty, "ghi_chu": ghi_chu }
    try: return requests.post(api_url, json=payload).status_code == 200
    except: return False

def get_checklist_html(tac_pham_key, index, lang, api_url):
    txt = {
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
    l = txt[lang]
    
    return f"""
    <!DOCTYPE html>
    <html lang="{lang}">
    <head>
        <style>
            :root {{ --primary: #2563eb; --bg: transparent; --text: #f1f5f9; }}
            * {{ box-sizing: border-box; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }}
            body {{ background: var(--bg); color: var(--text); padding: 5px; margin: 0; overflow: hidden; }}
            .grid-container {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; width: 100%; align-items: stretch; }}
            .step-col {{ background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 14px; height: 100%; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0,0,0,0.35); }}
            .step-header {{ font-size: 12px; font-weight: 800; color: #16a34a; margin-bottom: 12px; border-bottom: 2px solid #334155; padding-bottom: 6px; text-transform: uppercase; }}
            .task-row {{ display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; padding: 4px 0; }}
            .badge {{ font-size: 9px; padding: 3px 6px; border-radius: 4px; color: #fff; font-weight: bold; width: 52px; text-align: center; flex-shrink: 0; }}
            .notion {{ background: #000; }} .sheet {{ background: #107c41; }} .asana {{ background: #fc636b; }} .mikan {{ background: #f97316; }}
            .check-wrapper {{ position: relative; cursor: pointer; flex-grow: 1; display: flex; align-items: center; min-height: 20px; }}
            .check-wrapper input {{ display: none; }}
            .action-text {{ font-size: 11.5px; margin-left: 24px; font-weight: 600; color: #f1f5f9; }}
            .checkmark {{ position: absolute; top: 1px; left: 0; width: 16px; height: 16px; background: #0f172a; border-radius: 4px; border: 1.5px solid #475569; }}
            .check-wrapper input:checked ~ .checkmark {{ background: #22c55e; border-color: #22c55e; }}
            .check-wrapper input:checked ~ .checkmark:after {{ content: ""; position: absolute; left: 5px; top: 1px; width: 3px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }}
            .check-wrapper input:checked ~ .action-text {{ text-decoration: line-through; color: #94a3b8; font-weight: 400; opacity: 0.8; }}
            .snippet-box {{ background: #0f172a; border: 1px dashed #475569; padding: 6px 8px; border-radius: 6px; font-family: monospace; font-size: 9.5px; color: #cbd5e1; white-space: pre-line; margin-bottom: 6px; margin-left: 62px; }}
            .btn-copy {{ display: inline-flex; align-items: center; background: #0f172a; border: 1px solid #475569; padding: 4px 8px; border-radius: 6px; font-size: 9.5px; cursor: pointer; color: #60a5fa; font-weight: 600; margin-left: 62px; margin-bottom: 10px; }}
            summary {{ font-size: 10.5px; font-weight: 600; color: #d97706; cursor: pointer; margin-left: 62px; margin-bottom: 6px; }}
        </style>
    </head>
    <body>
        <div class="grid-container">
            <div class="step-col">
                <div class="step-header">{l['step1']}</div>
                <div class="task-row"><span class="badge notion">Notion</span><label class="check-wrapper"><input type="checkbox" id="t1_{index}"><span class="checkmark"></span><div class="action-text">{l['t1']}</div></label></div>
                <div class="task-row"><span class="badge sheet">Sheet</span><label class="check-wrapper"><input type="checkbox" id="t2_{index}"><span class="checkmark"></span><div class="action-text">{l['t2']}</div></label></div>
            </div>
            
            <div class="step-col">
                <div class="step-header">{l['step2']}</div>
                <div class="task-row"><span class="badge asana">Asana</span><label class="check-wrapper"><input type="checkbox" id="t3_{index}"><span class="checkmark"></span><div class="action-text">{l['t3']}</div></label></div>
                <div class="snippet-box" id="msg_t3_{index}">(PC) cc @Shiori Fujimura @Miho Osada @Erika Kawasaki\n===タスク着手===</div>
                <button class="btn-copy" onclick="copyText(this, 'msg_t3_{index}')">{l['copy_start']}</button>
                <details><summary>{l['ask_task']}</summary><div class="snippet-box" id="jp_t3_{index}">お疲れ様です。\n写植工程を担当しております○○です。\n本日が作業開始日となっておりますが、現時点でまだご指示をいただいておりません。\nお手数をおかけいたしますが、ご確認のほどよろしくお願いいたします。</div><button class="btn-copy" onclick="copyText(this, 'jp_t3_{index}')">{l['copy_ask']}</button></details>
                <div class="task-row"><span class="badge sheet">Sheet</span><label class="check-wrapper"><input type="checkbox" id="t4_{index}"><span class="checkmark"></span><div class="action-text">{l['t4']}</div></label></div>
                <div class="task-row"><span class="badge notion">Notion</span><label class="check-wrapper"><input type="checkbox" id="t5_{index}"><span class="checkmark"></span><div class="action-text">{l['t5']}</div></label></div>
            </div>

            <div class="step-col">
                <div class="step-header">{l['step3']}</div>
                <div class="task-row"><span class="badge asana">Asana</span><label class="check-wrapper"><input type="checkbox" id="t6_{index}"><span class="checkmark"></span><div class="action-text">{l['t6']}</div></label></div>
                <div class="snippet-box" id="msg_t6_{index}">(PC) cc @Shiori Fujimura @Miho Osada @Erika Kawasaki\n===タスク完了===</div>
                <button class="btn-copy" onclick="copyText(this, 'msg_t6_{index}')">{l['copy_done']}</button>
                <div class="task-row"><span class="badge sheet">Sheet</span><label class="check-wrapper"><input type="checkbox" id="t7_{index}"><span class="checkmark"></span><div class="action-text">{l['t7']}</div></label></div>
                <div class="task-row"><span class="badge notion">Notion</span><label class="check-wrapper"><input type="checkbox" id="t8_{index}"><span class="checkmark"></span><div class="action-text">{l['t8']}</div></label></div>
                <div class="snippet-box" id="msg_t8_{index}">納品いたしました。\nご確認のほどよろしくお願いいたします。</div>
                <button class="btn-copy" onclick="copyText(this, 'msg_t8_{index}')">{l['copy_deliver']}</button>
                <div class="task-row"><span class="badge mikan">Mikan</span><label class="check-wrapper"><input type="checkbox" id="t9_{index}"><span class="checkmark"></span><div class="action-text">{l['t9']}</div></label></div>
            </div>
        </div>
        
        <script>
            function copyText(btn, id) {{
                const text = document.getElementById(id).textContent;
                navigator.clipboard.writeText(text).then(() => {{
                    const oldText = btn.innerText;
                    btn.innerText = "{l['copied']}";
                    setTimeout(() => {{ btn.innerText = oldText; }}, 2000);
                }});
            }}
            
            const tpKey = "{tac_pham_key}";
            const API_URL = "{api_url}";
            const checks = document.querySelectorAll('input[type="checkbox"]');
            
            checks.forEach(cb => {{
                const rawId = cb.id.split('_')[0]; 
                const storageKey = tpKey + "_" + rawId;
                if (localStorage.getItem(storageKey) === 'true') cb.checked = true;
                
                cb.addEventListener('change', async (e) => {{
                    const isChecked = e.target.checked;
                    localStorage.setItem(storageKey, isChecked);
                    if(API_URL.startsWith("http")) {{
                        fetch(API_URL, {{ method: "POST", mode: "no-cors", headers: {{ "Content-Type": "text/plain;charset=utf-8" }}, body: JSON.stringify({{ tac_pham: tpKey, checkbox_id: rawId, status: isChecked }}) }});
                    }}
                }});
            }});
            
            if(API_URL.startsWith("http")) {{
                fetch(API_URL + "?tac_pham=" + encodeURIComponent(tpKey))
                .then(res => res.json())
                .then(data => {{
                    checks.forEach(cb => {{
                        const rawId = cb.id.split('_')[0];
                        if(data[rawId] !== undefined) {{
                            cb.checked = (data[rawId] === true || data[rawId] === "true");
                            localStorage.setItem(tpKey + "_" + rawId, cb.checked);
                        }}
                    }});
                }});
            }}
        </script>
    </body>
    </html>
    """

# =====================================================================
# HÀM RENDER UI DASHBOARD (SỬ DỤNG LẠI CHO NHIỀU TAB)
# =====================================================================
def render_dashboard_ui(dashboard_data):
    if not dashboard_data: return
    status_style = {
        "⏳ Chưa Bắt Đầu": ("var(--text-muted)", "rgba(148,163,184,0.15)"),
        "🔥 Đang Tiến Hành": ("var(--warning)", "rgba(245,158,11,0.15)"),
        "✅ Đã Giao Hàng": ("var(--success)", "rgba(34,197,94,0.15)"),
    }
    card_cols = st.columns(3)
    for i, row_d in enumerate(dashboard_data):
        color, bg = status_style.get(row_d["Trạng Thái"], ("var(--text-muted)", "rgba(148,163,184,0.15)"))
        with card_cols[i % 3]:
            st.markdown(f"""
                <div style="
                    background: var(--surface); border: 1px solid var(--border);
                    border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 14px;
                    box-shadow: var(--shadow-sm);">
                    <div style="font-weight:700; font-size:13.5px; color: var(--text-main);
                                margin-bottom:4px; line-height:1.3; min-height:36px;">
                        {row_d['Tên Tác Phẩm']}
                    </div>
                    <div style="font-size:12px; color: var(--text-muted); margin-bottom:10px;">
                        👤 {row_d['Người Thực Hiện']}
                    </div>
                    <div style="background: var(--surface-soft); border-radius: 999px; height: 8px; overflow:hidden; margin-bottom:8px;">
                        <div style="width:{row_d['Tiến Độ (%)']}%; height:100%; background: linear-gradient(90deg, var(--primary), var(--accent)); border-radius:999px;"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:999px; color:{color}; background:{bg};">
                            {row_d['Trạng Thái']}
                        </span>
                        <span style="font-size:12px; font-weight:700; color: var(--text-main);">{row_d['Tiến Độ (%)']}%</span>
                    </div>
                </div>
            """, unsafe_allow_html=True)

# =====================================================================
# 6. RENDER DỮ LIỆU CHÍNH & TABS
# =====================================================================
@st.fragment(run_every="60s")
def render_realtime_dashboard():
    df_raw = load_sheet_data(csv_url)
    df_truoc_raw = load_sheet_data(csv_url_truoc)

    if df_raw.empty:
        st.error("Lỗi tải dữ liệu chính. Vui lòng kiểm tra lại link Google Sheets.")
        return
        
    idx_tuan = df_raw[df_raw.apply(lambda row: row.astype(str).str.contains('Tuần làm việc', case=False, na=False).any(), axis=1)].index
    idx_tuan_truoc = df_truoc_raw[df_truoc_raw.apply(lambda row: row.astype(str).str.contains('Tuần làm việc', case=False, na=False).any(), axis=1)].index

    thong_tin_tuan_nay = {"start": t['not_update'], "end": t['not_update'], "deadline": t['not_update']}
    thong_tin_tuan_sau = {"start": t['not_update'], "end": t['not_update'], "deadline": t['not_update']}
    thong_tin_tuan_truoc = {"start": t['not_update'], "end": t['not_update'], "deadline": t['not_update']}

    for idx_list, info_dict in [(idx_tuan[:1], thong_tin_tuan_nay), (idx_tuan[1:2], thong_tin_tuan_sau)]:
        if len(idx_list) > 0:
            start_idx = idx_list[0]
            for i in range(start_idx, min(start_idx + 5, len(df_raw))):
                row_vals = df_raw.iloc[i].dropna().astype(str).str.strip().tolist()
                dates = get_clean_dates(row_vals)
                if any('tuần' in str(v).lower() for v in row_vals) and len(dates) >= 2: info_dict['start'], info_dict['end'] = dates[0], dates[1]
                if any('deadline' in str(v).lower() for v in row_vals) and len(dates) >= 1: info_dict['deadline'] = dates[-1]

    if len(idx_tuan_truoc) > 0:
        start_idx = idx_tuan_truoc[0]
        for i in range(start_idx, min(start_idx + 5, len(df_truoc_raw))):
            row_vals = df_truoc_raw.iloc[i].dropna().astype(str).str.strip().tolist()
            dates = get_clean_dates(row_vals)
            if any('tuần' in str(v).lower() for v in row_vals) and len(dates) >= 2: thong_tin_tuan_truoc['start'], thong_tin_tuan_truoc['end'] = dates[0], dates[1]
            if any('deadline' in str(v).lower() for v in row_vals) and len(dates) >= 1: thong_tin_tuan_truoc['deadline'] = dates[-1]

    df_tuan_nay = clean_df(df_raw.iloc[idx_tuan[0]:idx_tuan[1]].copy()) if len(idx_tuan) > 1 else clean_df(df_raw.iloc[idx_tuan[0]:].copy()) if len(idx_tuan) > 0 else df_raw.copy()
    df_tuan_sau = clean_df(df_raw.iloc[idx_tuan[1]:].copy()) if len(idx_tuan) > 1 else pd.DataFrame(columns=df_raw.columns)
    df_tuan_truoc = clean_df(df_truoc_raw.iloc[idx_tuan_truoc[0]:].copy()) if len(idx_tuan_truoc) > 0 else clean_df(df_truoc_raw)

    if st.session_state.user_role == "member":
        df_tuan_nay = df_tuan_nay[df_tuan_nay["Người thực hiện"].astype(str).str.contains(st.session_state.current_user, na=False, regex=False)]
        df_tuan_sau = df_tuan_sau[df_tuan_sau["Người thực hiện"].astype(str).str.contains(st.session_state.current_user, na=False, regex=False)]
        df_tuan_truoc = df_tuan_truoc[df_tuan_truoc["Người thực hiện"].astype(str).str.contains(st.session_state.current_user, na=False, regex=False)]

    st.write(t['filter_title'])
    col_f1, col_f2 = st.columns(2)
    with col_f1:
        cv_nay = st.multiselect(t['cv_nay'], options=df_tuan_nay["Công việc"].dropna().unique())
        nguoi_nay = st.multiselect(t['nguoi_nay'], options=list(USER_DB.keys())) if st.session_state.user_role == "leader" else []
    with col_f2:
        cv_sau = st.multiselect(t['cv_sau'], options=df_tuan_sau["Công việc"].dropna().unique())
        nguoi_sau = st.multiselect(t['nguoi_sau'], options=list(USER_DB.keys())) if st.session_state.user_role == "leader" else []

    df_nay_f = df_tuan_nay[df_tuan_nay["Công việc"].isin(cv_nay)] if cv_nay else df_tuan_nay
    if nguoi_nay: df_nay_f = df_nay_f[df_nay_f["Người thực hiện"].astype(str).str.contains('|'.join(nguoi_nay), na=False, regex=True)]
    
    df_sau_f = df_tuan_sau[df_tuan_sau["Công việc"].isin(cv_sau)] if cv_sau else df_tuan_sau
    if nguoi_sau: df_sau_f = df_sau_f[df_sau_f["Người thực hiện"].astype(str).str.contains('|'.join(nguoi_sau), na=False, regex=True)]

    # ================= LOAD DỮ LIỆU CHECKLIST 1 LẦN DÙNG CHUNG =================
    df_check = load_checklist_data(CHECKLIST_API_URL)
    check_counts_dict = {}
    if not df_check.empty:
        df_check['Trạng Thái'] = df_check['Trạng Thái'].astype(str).str.upper().isin(['TRUE', '1', 'T'])
        df_check_latest = df_check.drop_duplicates(subset=['Tên Tác Phẩm', 'Checkbox ID'], keep='last')
        check_counts_dict = df_check_latest[df_check_latest['Trạng Thái'] == True].groupby('Tên Tác Phẩm')['Checkbox ID'].nunique().to_dict()

    def build_dashboard_data(df_target):
        d_data = []
        for _, row in df_target.iterrows():
            tp_name = str(row['Công việc']).strip() + " - " + str(row['Tên tác phẩm']).strip()
            worker = str(row['Người thực hiện']).strip()
            checked_count = check_counts_dict.get(tp_name, 0)
            if checked_count == 0: status = "⏳ Chưa Bắt Đầu"
            elif checked_count >= 9: status = "✅ Đã Giao Hàng"
            else: status = "🔥 Đang Tiến Hành"
            progress = int((checked_count / 9) * 100)
            d_data.append({"Tên Tác Phẩm": tp_name, "Người Thực Hiện": worker, "Tiến Độ (%)": progress, "Trạng Thái": status})
        return d_data

    # ================= HÀM RENDER LOGTIME CHUNG =================
    def render_logtime_section(df_target, tab_prefix):
        st.markdown("---")
        st.subheader(t['logtime_title'])
        if df_target.empty: st.info(t['logtime_empty'])
        else:
            for index, row in df_target.iterrows():
                tp_name = str(row['Công việc']).strip() + " - " + str(row['Tên tác phẩm']).strip()
                worker_name = str(row['Người thực hiện']).strip()
                
                with st.expander(f"📝 {tp_name}  |  👤 {worker_name}"):
                    components.html(get_checklist_html(tp_name, index, st.session_state.lang, CHECKLIST_API_URL), height=380, scrolling=False) 
                    
                    # Dùng tab_prefix để tránh trùng lặp ID (form_log_truoc_1 vs form_log_nay_1)
                    with st.form(key=f"form_log_{tab_prefix}_{index}"):
                        c_cat, c_diff, c_worker, c_date = st.columns([1.5, 1.5, 2, 1.5])
                        with c_cat: loai_truyen = st.selectbox(t['f_cat'], ["単行本", "読切", "連載"], index=0, key=f"cat_{tab_prefix}_{index}")
                        with c_diff: do_kho = st.selectbox(t['f_diff'], ["", "低", "中", "高"], index=0, key=f"diff_{tab_prefix}_{index}")
                        with c_worker:
                            workers = list(USER_DB.keys())
                            if pd.notna(worker_name) and worker_name and worker_name not in workers: workers.append(worker_name)
                            nguoi_lam_final = st.selectbox(t['f_worker'], workers, index=workers.index(worker_name) if worker_name in workers else 0, key=f"sel_worker_{tab_prefix}_{index}")
                        with c_date: ngay_log = st.date_input(t['f_date'], value=date.today(), key=f"date_{tab_prefix}_{index}")

                        col1, col2, col3 = st.columns([2, 2, 4])
                        with col1: so_gio = st.number_input(t['f_hours'], min_value=0.0, step=0.5, key=f"gio_{tab_prefix}_{index}")
                        with col2: so_page = st.number_input(t['f_pages'].format(total=row['Số trang'] if pd.notna(row['Số trang']) else 0), min_value=0, step=1, key=f"page_{tab_prefix}_{index}")
                        with col3: ghi_chu_log = st.text_input(t['f_note'], key=f"note_{tab_prefix}_{index}")
                        
                        sub_c, msg_c = st.columns([2, 8])
                        with sub_c: submit_btn = st.form_submit_button(t['f_btn'], type="primary")
                            
                        # Quản lý log time success messages
                        log_state_key = f"{tab_prefix}_{index}"
                        if submit_btn:
                            with msg_c:
                                current_time = time.time()
                                last_time = st.session_state.last_log_time.get(log_state_key, 0)
                                time_diff = current_time - last_time
                                
                                if time_diff < 300: 
                                    rem_m, rem_s = divmod(int(300 - time_diff), 60)
                                    st.warning(f"⏳ Bạn thao tác quá nhanh! Vui lòng chờ {rem_m} phút {rem_s} giây nữa để lưu lại task này.")
                                elif so_gio == 0 and so_page == 0: 
                                    st.warning(t['f_warn'])
                                else:
                                    with st.spinner(t['f_sync']):
                                        if save_logtime(ngay_log, loai_truyen, row['Công việc'], row['Tên tác phẩm'], row['Chương'], row['Tập'], row['Số trang'], nguoi_lam_final, so_gio, so_page, do_kho, ghi_chu_log): 
                                            st.session_state.last_log_time[log_state_key] = time.time() 
                                            msg = t['f_succ'].format(worker=nguoi_lam_final, hours=so_gio, pages=so_page)
                                            st.session_state.success_logs[log_state_key] = msg
                                            st.success(msg)
                                            st.balloons()
                                        else: st.error(t['f_err'])
                        elif log_state_key in st.session_state.success_logs:
                            with msg_c: st.success(st.session_state.success_logs[log_state_key])


    # ================= CẤU TRÚC TAB =================
    tab_names = [t['tab0'], t['tab1'], t['tab2']] 
    tabs = st.tabs(tab_names)
    tab_truoc, tab_nay, tab_sau = tabs[0], tabs[1], tabs[2]

    if st.session_state.get('just_logged_in', False):
        components.html("""<script>setTimeout(function() { const tabs = window.parent.document.querySelectorAll('button[data-baseweb="tab"]'); if(tabs.length >= 2) tabs[1].click(); }, 100);</script>""", height=0, width=0)
        st.session_state.just_logged_in = False

    # === TAB 1: TUẦN TRƯỚC ===
    with tab_truoc:
        st.info(f"**{t['time']}** {thong_tin_tuan_truoc['start']} ➡️ {thong_tin_tuan_truoc['end']} &nbsp;&nbsp;|&nbsp;&nbsp; **{t['deadline']}** {thong_tin_tuan_truoc['deadline']}")
        if df_tuan_truoc.empty: st.warning(t['no_task'])
        else:
            # 1. DASHBOARD TIẾN ĐỘ TUẦN TRƯỚC
            dash_data_truoc = build_dashboard_data(df_tuan_truoc)
            if dash_data_truoc:
                c_h1, c_h2 = st.columns([8, 2])
                with c_h1: st.subheader("⏪ Bảng Theo Dõi Tiến Độ Checklist (Tuần Trước)")
                with c_h2: 
                    if st.button("🔄 Làm mới Dashboard", key="refresh_truoc", use_container_width=True):
                        load_checklist_data.clear()
                        st.rerun()
                render_dashboard_ui(dash_data_truoc)
                st.markdown("---")

            # 2. THỐNG KÊ METRIC
            with st.container(border=True):
                c7, c8, c9 = st.columns(3)
                c7.metric(t['metric_total'], len(df_tuan_truoc))
                c8.metric(t['metric_retouch'], len(df_tuan_truoc[df_tuan_truoc["Công việc"] == "レタッチ"]))
                c9.metric(t['metric_type'], len(df_tuan_truoc[df_tuan_truoc["Công việc"] == "写植"]))
            
            st.markdown("<br>", unsafe_allow_html=True)

            # 3. THÔNG TIN TASK (DATAFRAME)
            df_display_truoc = df_tuan_truoc.copy()
            df_display_truoc.columns = t['cols']
            st.dataframe(df_display_truoc.style.apply(lambda _: highlight_changes(df_display_truoc, st.session_state.df_truoc_old), axis=None), use_container_width=True, hide_index=True)
            st.session_state.df_truoc_old = df_display_truoc.copy()

        # HIỂN THỊ LOGTIME/CHECKLIST CHO TUẦN TRƯỚC
        render_logtime_section(df_tuan_truoc, "truoc")

    # === TAB 2: TUẦN NÀY ===
    with tab_nay:
        st.info(f"**{t['time']}** {thong_tin_tuan_nay['start']} ➡️ {thong_tin_tuan_nay['end']} &nbsp;&nbsp;|&nbsp;&nbsp; **{t['deadline']}** {thong_tin_tuan_nay['deadline']}")
        if df_nay_f.empty: st.warning(t['no_filter'])
        else:
            # 1. DASHBOARD TIẾN ĐỘ TUẦN NÀY
            dash_data_nay = build_dashboard_data(df_nay_f)
            if dash_data_nay:
                c_h1, c_h2 = st.columns([8, 2])
                with c_h1: st.subheader("📌 Bảng Theo Dõi Tiến Độ Checklist (Tuần Này)")
                with c_h2: 
                    if st.button("🔄 Làm mới Dashboard", key="refresh_nay", use_container_width=True):
                        load_checklist_data.clear()
                        st.rerun()
                render_dashboard_ui(dash_data_nay)
                st.markdown("---")

            # 2. THỐNG KÊ METRIC
            with st.container(border=True):
                c1, c2, c3 = st.columns(3)
                c1.metric(t['metric_total'], len(df_nay_f))
                c2.metric(t['metric_retouch'], len(df_nay_f[df_nay_f["Công việc"] == "レタッチ"]))
                c3.metric(t['metric_type'], len(df_nay_f[df_nay_f["Công việc"] == "写植"]))

            st.markdown("<br>", unsafe_allow_html=True)

            # 3. THÔNG TIN TASK (DATAFRAME)
            df_display = df_nay_f.copy()
            df_display.columns = t['cols']
            st.dataframe(df_display.style.apply(lambda _: highlight_changes(df_display, st.session_state.df_nay_old), axis=None), use_container_width=True, hide_index=True)
            st.session_state.df_nay_old = df_display.copy()
            
        # HIỂN THỊ LOGTIME/CHECKLIST CHO TUẦN NÀY
        render_logtime_section(df_nay_f, "nay")

    # === TAB 3: TUẦN SAU ===
    with tab_sau:
        st.info(f"**{t['time']}** {thong_tin_tuan_sau['start']} ➡️ {thong_tin_tuan_sau['end']} &nbsp;&nbsp;|&nbsp;&nbsp; **{t['deadline']}** {thong_tin_tuan_sau['deadline']}")
        if df_sau_f.empty: st.warning(t['no_task'])
        else:
            # 1. THỐNG KÊ METRIC
            with st.container(border=True):
                c4, c5, c6 = st.columns(3)
                c4.metric(t['metric_total'], len(df_sau_f))
                c5.metric(t['metric_retouch'], len(df_sau_f[df_sau_f["Công việc"] == "レタッチ"]))
                c6.metric(t['metric_type'], len(df_sau_f[df_sau_f["Công việc"] == "写植"]))
            
            st.markdown("<br>", unsafe_allow_html=True)

            # 2. THÔNG TIN TASK (DATAFRAME)
            df_display = df_sau_f.copy()
            df_display.columns = t['cols']
            st.dataframe(df_display.style.apply(lambda _: highlight_changes(df_display, st.session_state.df_sau_old), axis=None), use_container_width=True, hide_index=True)
            st.session_state.df_sau_old = df_display.copy()

# GỌI HÀM RENDER
render_realtime_dashboard()
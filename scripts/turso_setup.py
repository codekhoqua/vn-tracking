"""Tạo DB Turso + token rồi cấu hình VN-Tracking — chạy được trên Windows.

Turso CLI không có bản Windows, nên script này dùng Turso **Platform API**
(HTTPS) để làm tất cả:

    1. kiểm tra API token
    2. tìm organization (hoặc tạo group nếu chưa có)
    3. tạo database `vn-tracking-archive` (bỏ qua nếu đã tồn tại)
    4. sinh auth token không hết hạn cho database
    5. ghi TURSO_DATABASE_URL / TURSO_AUTH_TOKEN vào env_vars.yaml
    6. tạo schema + backfill toàn bộ dữ liệu cũ

Cách dùng
---------
B1. Vào https://app.turso.tech  ->  Account  ->  API Tokens  ->  Create token
    (token dạng JWT, rất dài, bắt đầu bằng ``eyJ...``)
B2. Chạy:

        set TURSO_API_TOKEN=dán_token_vào_đây
        python scripts/turso_setup.py

    hoặc truyền trực tiếp:

        python scripts/turso_setup.py --token "eyJ..."

Tùy chọn:
    --org SLUG       chỉ định organization (mặc định: tự lấy cái đầu tiên)
    --name NAME      tên database (mặc định: vn-tracking-archive)
    --group NAME     tên group (mặc định: tự dùng group có sẵn hoặc tạo `default`)
    --location LOC   vị trí group mới (mặc định: aws-ap-southeast-1)
    --no-backfill    chỉ cấu hình, không kéo dữ liệu
    --dry-run        chỉ in ra sẽ làm gì, không tạo gì cả
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
ENV_PATH = os.path.join(ROOT, "env_vars.yaml")

API = "https://api.turso.tech/v1"
DEFAULT_DB = "vn-tracking-archive"
DEFAULT_GROUP = "default"
DEFAULT_LOCATION = "aws-ap-southeast-1"


# ---------------------------------------------------------------------
# Gọi Platform API
# ---------------------------------------------------------------------
class ApiError(Exception):
    pass


def api(path, method="GET", token=None, body=None, verbose=False):
    headers = {"Accept": "application/json", "User-Agent": "vn-tracking-setup"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(API + path, data=data, method=method, headers=headers)
    if verbose:
        print(f"    {method} {path}" + (f"  body={json.dumps(body)}" if body else ""))
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"raw": raw}
        raise ApiError(f"HTTP {exc.code} {method} {path}: {payload}") from None
    except Exception as exc:
        raise ApiError(f"{type(exc).__name__} {method} {path}: {exc}") from None


def pick(obj, *names, default=None):
    """Turso trả lúc camelCase lúc snake_case -> thử lần lượt."""
    for name in names:
        if isinstance(obj, dict) and name in obj and obj[name] not in (None, ""):
            return obj[name]
    return default


# ---------------------------------------------------------------------
# Các bước
# ---------------------------------------------------------------------
def list_orgs(token):
    _, data = api("/organizations", token=token)
    orgs = data.get("organizations") or data.get("orgs") or []
    return orgs


def list_groups(token, org):
    try:
        _, data = api(f"/organizations/{org}/groups", token=token)
    except ApiError:
        return []
    return data.get("groups") or []


def create_group(token, org, name, location):
    _, data = api(
        f"/organizations/{org}/groups", method="POST", token=token,
        body={"name": name, "location": location},
    )
    return data.get("group") or data


def find_database(token, org, name):
    try:
        _, data = api(f"/organizations/{org}/databases/{name}", token=token)
    except ApiError as exc:
        if "HTTP 404" in str(exc):
            return None
        raise
    return data.get("database") or data


def create_database(token, org, name, group):
    body = {"name": name}
    if group:
        body["group"] = group
    try:
        _, data = api(f"/organizations/{org}/databases", method="POST",
                      token=token, body=body)
    except ApiError as exc:
        # API cũ không nhận `group`
        if group and "group" in str(exc).lower():
            print("    (API không nhận group, thử lại không kèm group)")
            _, data = api(f"/organizations/{org}/databases", method="POST",
                          token=token, body={"name": name})
        else:
            raise
    return data.get("database") or data


def create_db_token(token, org, name):
    path = f"/organizations/{org}/databases/{name}/auth/tokens?expiration=never"
    _, data = api(path, method="POST", token=token)
    return pick(data, "jwt", "token", default=None) or (data if isinstance(data, str) else None)


# ---------------------------------------------------------------------
# Ghi env_vars.yaml (giữ nguyên phần còn lại của file)
# ---------------------------------------------------------------------
def write_env(updates):
    lines = []
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as fh:
            lines = fh.read().splitlines()

    def fmt(value):
        return '"' + str(value).replace('"', '\\"') + '"'

    written = set()
    out = []
    for line in lines:
        m = re.match(r"^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*):(.*)$", line)
        if m and m.group(2) in updates:
            key = m.group(2)
            out.append(f"{m.group(1)}{key}: {fmt(updates[key])}")
            written.add(key)
        else:
            out.append(line)

    missing = [k for k in updates if k not in written]
    if missing:
        if out and out[-1].strip():
            out.append("")
        out.append("# ===== Kho lưu trữ dài hạn (do scripts/turso_setup.py ghi) =====")
        for key in missing:
            out.append(f"{key}: {fmt(updates[key])}")

    with open(ENV_PATH, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(out).rstrip() + "\n")


# ---------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Tạo DB Turso + cấu hình VN-Tracking")
    parser.add_argument("--token", default=os.environ.get("TURSO_API_TOKEN", ""))
    parser.add_argument("--org", default="")
    parser.add_argument("--name", default=DEFAULT_DB)
    parser.add_argument("--group", default="")
    parser.add_argument("--location", default=DEFAULT_LOCATION)
    parser.add_argument("--no-backfill", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    token = (args.token or "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token:
        print("!" * 68)
        print("THIẾU API TOKEN")
        print("!" * 68)
        print("1. Mở https://app.turso.tech  ->  Account  ->  API Tokens  ->  Create")
        print("2. Chạy lại:")
        print("     set TURSO_API_TOKEN=<token>")
        print("     python scripts/turso_setup.py")
        print("   hoặc:")
        print('     python scripts/turso_setup.py --token "<token>"')
        return 1

    print("=" * 68)
    print("TURSO SETUP  —  https://api.turso.tech/v1")
    print("=" * 68)

    # B1. Xác thực + organization
    print("\n[1/6] Kiểm tra API token & organization")
    orgs = list_orgs(token)
    if not orgs:
        print("    Không có organization nào cho token này.")
        return 1
    for o in orgs:
        print(f"    - {pick(o,'slug','Slug')}  ({pick(o,'name','Name')}, type={pick(o,'type','Type')})")
    org = args.org or pick(orgs[0], "slug", "Slug")
    print(f"    -> dùng organization: {org}")

    # B2. Group
    print("\n[2/6] Kiểm tra group")
    groups = list_groups(token, org)
    if groups:
        for g in groups:
            print(f"    - {pick(g,'name','Name')} @ {pick(g,'location','Location')}")
    group = args.group or (pick(groups[0], "name", "Name") if groups else DEFAULT_GROUP)
    print(f"    -> dùng group: {group}")
    if not groups:
        print(f"    chưa có group nào; sẽ tạo `{group}` tại {args.location}")
        if not args.dry_run:
            create_group(token, org, group, args.location)
            print("    đã tạo group")

    # B3. Database
    print(f"\n[3/6] Database `{args.name}`")
    db = find_database(token, org, args.name)
    if db:
        print("    đã tồn tại, dùng lại")
    else:
        print("    chưa có, đang tạo...")
        if args.dry_run:
            print("    (dry-run: bỏ qua)")
        else:
            db = create_database(token, org, args.name, group)
            print("    đã tạo")

    hostname = pick(db or {}, "Hostname", "hostname")
    if not hostname and not args.dry_run:
        # đôi khi response tạo DB không kèm hostname -> hỏi lại
        db = find_database(token, org, args.name)
        hostname = pick(db or {}, "Hostname", "hostname")
    if not hostname:
        print("    ! Không lấy được hostname.")
        if db:
            print("    response:", json.dumps(db, ensure_ascii=False)[:400])
        return 1
    db_url = "libsql://" + hostname
    print(f"    hostname : {hostname}")
    print(f"    url      : {db_url}")

    # B4. Token cho database
    print("\n[4/6] Sinh auth token cho database")
    if args.dry_run:
        print("    (dry-run: bỏ qua)")
        db_token = "<dry-run>"
    else:
        db_token = create_db_token(token, org, args.name)
        if not db_token:
            print("    ! Không sinh được token.")
            return 1
        print(f"    token: {db_token[:18]}...{db_token[-6:]}  ({len(db_token)} ký tự)")

    # B5. Ghi env_vars.yaml
    print(f"\n[5/6] Ghi vào {os.path.basename(ENV_PATH)}")
    if args.dry_run:
        print("    (dry-run: bỏ qua)")
    else:
        write_env({"TURSO_DATABASE_URL": db_url, "TURSO_AUTH_TOKEN": db_token})
        print("    đã ghi TURSO_DATABASE_URL, TURSO_AUTH_TOKEN")

    # B6. Schema + backfill
    print("\n[6/6] Tạo schema + kéo dữ liệu cũ")
    if args.no_backfill or args.dry_run:
        print("    (bỏ qua)")
    else:
        os.environ["TURSO_DATABASE_URL"] = db_url
        os.environ["TURSO_AUTH_TOKEN"] = db_token
        import archive_store
        import task_archive as ta

        print("    backend:", archive_store.describe_store()["backend"],
              "->", archive_store.describe_store()["target"])
        ta.ensure_schema()
        print("    schema OK")
        print("    đang kéo task từ Google Sheet...")
        res = ta.sync_sheets(progress=lambda m: print("      " + str(m)))
        print(f"    task đã ghi: {res.get('saved')}")
        print("    đang kéo comment/checklist/link từ Supabase...")
        ta.migrate_from_env(progress=lambda m: print("      " + str(m)))
        print("\n    == Thống kê ==")
        for k, v in ta.stats().items():
            print(f"      {k:<18} {v}")

    print("\n" + "=" * 68)
    print("XONG.")
    print("=" * 68)
    print("Còn 1 bước: RESTART app để nạp env mới")
    print("  - Local Windows : tắt cửa sổ VN-Tracking rồi chạy start_local.bat")
    print("  - Cloud Run/Vercel: thêm 2 biến TURSO_DATABASE_URL, TURSO_AUTH_TOKEN")
    print("    vào Environment Variables rồi redeploy.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as exc:
        print("\nLỖI API:", exc)
        sys.exit(2)

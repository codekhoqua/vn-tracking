#!/usr/bin/env python3
r"""Đóng gói zip FULL để upload lên Cloudcode (Pterodactyl panel).

Quy ước duy nhất:
- Chỉ tạo MỘT bản full: kèm env_vars.yaml, credentials.json và data/*.json.
- KHÔNG kèm DB archive (data/vn_tracking_archive.db*) để không đè dữ liệu trên server.
- Entry trong zip dùng dấu `/` (POSIX). Nếu dùng `\` của Windows, panel Linux
  sẽ không tạo thư mục templates/static -> TemplateNotFound / 404.
- Nội dung phẳng ở gốc zip (không bọc thư mục project).
- Kèm binary `cloudflared` nếu có; nếu thiếu, app tự tải trên Linux.
- Không kèm backup_local/, logs/, .opencode/ (rác dev).

Cách dùng:
    python scripts/build_cloudcode_zip.py
    python scripts/build_cloudcode_zip.py -o D:\\path\\vn-tracking-cloudcode.zip
"""

import argparse
import hashlib
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCLUDE_DIRS = {
    '.git', '__pycache__', 'drive_data', '.venv', 'venv', '.vercel',
    'leave_attachments', '_thumbs', 'node_modules',
    'backup_local', 'logs', '.opencode',
}
EXCLUDE_FILES = {'.DS_Store', 'Thumbs.db'}
EXCLUDE_SUFFIXES = ('.pyc', '.pyo', '.log', '.zip', '.msi', '.bak')
# DB archive (task/comment/checklist/link/avatar) KHÔNG đóng vào zip:
# - upload zip sẽ đè mất dữ liệu thật đang chạy trên server
# - kèm .db-wal/.db-shm khi app đang chạy dễ gây DB không nhất quán
# Bảng user_avatars tự được tạo khi app khởi động (ensure_schema).
EXCLUDE_DB_NAMES = (
    'vn_tracking_archive.db',
    'vn_tracking_archive.db-wal',
    'vn_tracking_archive.db-shm',
)


def app_version():
    path = os.path.join(ROOT, 'templates', 'dashboard.html')
    try:
        with open(path, encoding='utf-8', errors='ignore') as f:
            content = f.read()
        m = re.search(r'class="version-tag"[^>]*>\s*<i>\s*([^<]+?)\s*</i>', content)
        if m:
            return m.group(1).strip()
    except OSError:
        pass
    return 'dev'


def should_skip(rel_path):
    parts = rel_path.split('/')
    if any(p in EXCLUDE_DIRS for p in parts[:-1]):
        return True
    name = parts[-1]
    if name in EXCLUDE_DB_NAMES:
        return True
    return name in EXCLUDE_FILES or name.endswith(EXCLUDE_SUFFIXES)


def build(output=None):
    version = app_version()
    if output is None:
        output = os.path.join(
            os.path.dirname(ROOT),
            f'vn-tracking-cloudcode-{version}-full.zip',
        )

    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for base, dirs, files in os.walk(ROOT):
            dirs[:] = sorted(d for d in dirs if d not in EXCLUDE_DIRS)
            rel_dir = os.path.relpath(base, ROOT).replace('\\', '/')
            if rel_dir != '.':
                if not should_skip(rel_dir + '/x'):
                    zf.write(base, rel_dir + '/')
            for name in sorted(files):
                full = os.path.join(base, name)
                rel = os.path.relpath(full, ROOT).replace('\\', '/')
                if should_skip(rel):
                    continue
                zf.write(full, rel)

    with zipfile.ZipFile(output) as zf:
        entries = zf.namelist()

    size_mb = os.path.getsize(output) / 1024 / 1024
    with open(output, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest().upper()
    print(f'Output : {output}')
    print(f'Version: {version} (full: kèm secrets/data)')
    print(f'Entries: {len(entries)}')
    print(f'Size   : {size_mb:.2f} MB')
    print(f'SHA256 : {sha}')
    if 'cloudflared' in entries:
        print('Cloudflared: có trong zip')
    else:
        print('Cloudflared: KHÔNG có; app sẽ tự tải trên Linux khi khởi động')
    if not os.path.exists(os.path.join(ROOT, 'cloudflared')):
        print('WARN   : thiếu file cloudflared trong thư mục project')
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-o', '--output', help='Đường dẫn file zip đầu ra')
    args = parser.parse_args()
    build(args.output)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Đóng gói zip để upload lên Cloudcode (Pterodactyl panel).

Yêu cầu quan trọng:
- Entry trong zip phải dùng dấu `/` (POSIX). Nếu dùng `\\` của Windows,
  panel Linux sẽ không tạo thư mục templates/static -> TemplateNotFound / 404.
- Nội dung phẳng ở gốc zip (không bọc thư mục project).
- Mặc định là bản FULL: kèm env_vars.yaml, credentials.json và data/*.json.

Cách dùng:
    python scripts/build_cloudcode_zip.py
    python scripts/build_cloudcode_zip.py --no-private
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
}
EXCLUDE_FILES = {'.DS_Store', 'Thumbs.db'}
EXCLUDE_SUFFIXES = ('.pyc', '.pyo', '.log', '.zip', '.msi', '.bak')
PRIVATE_FILES = {'env_vars.yaml', 'credentials.json'}


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


def should_skip(rel_path, include_private):
    parts = rel_path.split('/')
    if any(p in EXCLUDE_DIRS for p in parts[:-1]):
        return True
    name = parts[-1]
    if name in EXCLUDE_FILES or name.endswith(EXCLUDE_SUFFIXES):
        return True
    if not include_private:
        if name in PRIVATE_FILES:
            return True
        if rel_path.startswith('data/'):
            return True
    return False


def build(output, include_private=True):
    version = app_version()
    if output is None:
        suffix = '' if include_private else '-code'
        output = os.path.join(
            os.path.dirname(ROOT),
            f'vn-tracking-cloudcode-{version}{suffix}.zip',
        )

    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for base, dirs, files in os.walk(ROOT):
            dirs[:] = sorted(d for d in dirs if d not in EXCLUDE_DIRS)
            rel_dir = os.path.relpath(base, ROOT).replace('\\', '/')
            if rel_dir != '.':
                if not should_skip(rel_dir + '/x', include_private):
                    zf.write(base, rel_dir + '/')
            for name in sorted(files):
                full = os.path.join(base, name)
                rel = os.path.relpath(full, ROOT).replace('\\', '/')
                if should_skip(rel, include_private):
                    continue
                zf.write(full, rel)

    size_mb = os.path.getsize(output) / 1024 / 1024
    with open(output, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest().upper()
    print(f'Output : {output}')
    print(f'Version: {version} ({"" if include_private else "KHÔNG "}kèm secrets/data)')
    print(f'Size   : {size_mb:.2f} MB')
    print(f'SHA256 : {sha}')
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-o', '--output', help='Đường dẫn file zip đầu ra')
    parser.add_argument('--no-private', action='store_true',
                        help='Bỏ env_vars.yaml, credentials.json và data/')
    args = parser.parse_args()
    build(args.output, include_private=not args.no_private)


if __name__ == '__main__':
    main()

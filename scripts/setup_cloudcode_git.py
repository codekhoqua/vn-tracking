#!/usr/bin/env python3
r"""Chuyển server CloudCode từ bản upload ZIP sang deploy bằng GitHub.

Script chạy trên server Linux (CloudCode/Pterodactyl), trong thư mục app
(mặc định /home/container). Nó sẽ:

1. Backup toàn bộ app cũ vào backup_local/pre_git_<thời-gian>/old_tree.
2. Khởi tạo Git repo và kéo đúng branch từ GitHub.
3. Giữ lại các file runtime/secret không có trên Git:
   - env_vars.yaml, credentials.json, .env*
   - cloudflared (binary Cloudflare Tunnel)
   - data/ (DB, notifications, leave requests, ...)
   - static/chat_uploads/
   - static/weather_album/
4. Đánh dấu skip-worktree cho các file runtime đã bị sửa để `git pull` không
   ghi đè hoặc báo lỗi.
5. Nếu có lỗi giữa chừng, tự rollback về trạng thái cũ.

Cách dùng trên CloudCode Console:

    cd /home/container
    curl -fsSL https://raw.githubusercontent.com/codekhoqua/vn-tracking/master/scripts/setup_cloudcode_git.py -o /tmp/setup_cloudcode_git.py
    python /tmp/setup_cloudcode_git.py

Sau đó vào panel → Startup:
    GIT REPO ADDRESS = https://github.com/codekhoqua/vn-tracking
    GIT BRANCH       = master
    AUTO UPDATE      = 1
rồi restart server.

Nếu repo private, tải file này lên bằng Files/File Manager thay vì curl.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT_APP_DIR = "/home/container"
DEFAULT_REPO = "https://github.com/codekhoqua/vn-tracking.git"
DEFAULT_BRANCH = "master"

# Các đường dẫn runtime/secret phải giữ lại khi thay code bằng Git.
PRESERVE = [
    "env_vars.yaml",
    "env.yaml",
    "credentials.json",
    "cloudflared",
    "cloudflared.log",
    "data",
    "logs",
    "drive_data",
    "static/chat_uploads",
    "static/weather_album",
]

# Không bao giờ di chuyển thư mục backup; nó chứa old_tree của lần chạy này.
SKIP_TOP = {"backup_local"}

# File runtime đã tracked trong Git nhưng có thể đã được server sửa.
# Sau khi khôi phục, đánh dấu skip-worktree để git pull không ghi đè.
RUNTIME_TRACKED_PATHS = ["data", "static/weather_album"]


def log(message: str) -> None:
    print(f"\n[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def warn(message: str) -> None:
    print(f"\n[!] {message}", flush=True)


def run(
    command: list[str],
    cwd: Path,
    *,
    check: bool = True,
    quiet: bool = False,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.setdefault("GIT_TERMINAL_PROMPT", "0")
    proc = subprocess.run(
        command,
        cwd=str(cwd),
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if not quiet and proc.stdout.strip():
        print(proc.stdout.rstrip(), flush=True)
    if proc.returncode != 0:
        if proc.stderr.strip():
            print(proc.stderr.rstrip(), file=sys.stderr, flush=True)
        if check:
            raise RuntimeError(
                f"Lệnh thất bại ({proc.returncode}): {' '.join(command)}"
            )
    return proc


def remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink(missing_ok=True)
    elif path.is_dir():
        shutil.rmtree(path)


def copy_path(src: Path, dst: Path) -> None:
    """Copy file/thư mục, giữ nguyên symlink và quyền file."""
    remove_path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_symlink():
        os.symlink(os.readlink(src), dst)
    elif src.is_dir():
        shutil.copytree(src, dst, symlinks=True)
    else:
        shutil.copy2(src, dst)


def discover_env_files(app_dir: Path) -> list[str]:
    names: list[str] = []
    for entry in app_dir.iterdir():
        if entry.name == "env_vars.example.yaml":
            continue
        if entry.name.startswith(".env") or (
            entry.name.startswith("env") and entry.suffix.lower() in {".yaml", ".yml"}
        ):
            names.append(entry.name)
    return names


def restore_paths(app_dir: Path, old_tree: Path, names: list[str]) -> list[str]:
    restored: list[str] = []
    for rel in names:
        src = old_tree / rel
        if not src.exists() and not src.is_symlink():
            continue
        dst = app_dir / rel
        copy_path(src, dst)
        if rel == "cloudflared" and os.name == "posix":
            try:
                os.chmod(dst, 0o755)
            except OSError as exc:
                warn(f"Không chmod được cloudflared: {exc}")
        restored.append(rel)
    return restored


def setup_git(app_dir: Path, repo: str, branch: str) -> None:
    run(["git", "init", "-q"], app_dir)
    # Phải set trước khi checkout: nếu global autocrlf=true (Windows),
    # checkout sẽ ghi CRLF và làm toàn bộ file bị coi là sửa.
    run(["git", "config", "core.autocrlf", "false"], app_dir, check=False, quiet=True)
    run(["git", "remote", "add", "origin", repo], app_dir)

    fetch = run(
        ["git", "fetch", "--depth=1", "origin", branch],
        app_dir,
        check=False,
    )
    if fetch.returncode != 0:
        warn("Fetch depth=1 thất bại, thử fetch đầy đủ...")
        run(["git", "fetch", "origin", branch], app_dir)

    run(["git", "checkout", "-f", "-B", branch, f"origin/{branch}"], app_dir)
    run(
        ["git", "branch", "--set-upstream-to", f"origin/{branch}", branch],
        app_dir,
        check=False,
        quiet=True,
    )
    run(["git", "config", "pull.ff", "only"], app_dir, check=False, quiet=True)


def mark_runtime_tracked(app_dir: Path) -> list[str]:
    """Giữ file runtime đã sửa mà không làm bẩn git status / kẹt git pull."""
    if not (app_dir / ".git").exists():
        return []

    diff = run(
        ["git", "diff", "--name-only", "-z", "--", *RUNTIME_TRACKED_PATHS],
        app_dir,
        check=False,
        quiet=True,
    )
    if diff.returncode != 0:
        return []

    changed = [name for name in diff.stdout.split("\0") if name]
    marked: list[str] = []
    for name in changed:
        result = run(
            ["git", "update-index", "--skip-worktree", "--", name],
            app_dir,
            check=False,
            quiet=True,
        )
        if result.returncode == 0:
            marked.append(name)
    return marked


def verify_install(app_dir: Path) -> None:
    required = [
        ".git",
        "app.py",
        "requirements.txt",
        "templates/dashboard.html",
        "static/css/style.css",
        "static/js/app.js",
        "static/js/motion.js",
    ]
    missing = [rel for rel in required if not (app_dir / rel).exists()]
    if missing:
        raise RuntimeError("Thiếu file sau khi checkout: " + ", ".join(missing))


def rollback(app_dir: Path, old_tree: Path, clean_app: bool) -> None:
    log("Đang rollback về code cũ...")
    if clean_app:
        for child in list(app_dir.iterdir()):
            if child.name in SKIP_TOP:
                continue
            remove_path(child)
    else:
        # Lỗi khi đang move: chỉ cần dọn .git (nếu đã tạo) rồi trả file cũ về.
        remove_path(app_dir / ".git")

    if old_tree.exists():
        for child in list(old_tree.iterdir()):
            copy_path(child, app_dir / child.name)
    log("Rollback xong. Code cũ đã được khôi phục.")


def print_secret_warnings(app_dir: Path) -> None:
    if not (app_dir / "env_vars.yaml").exists() and not (app_dir / ".env").exists():
        warn(
            "Chưa thấy env_vars.yaml/.env trên server. Hãy upload hoặc cấu hình "
            "Environment Variables trước khi restart."
        )
    if not (app_dir / "credentials.json").exists() and not os.environ.get(
        "GOOGLE_CREDENTIALS_B64"
    ):
        warn(
            "Chưa thấy credentials.json. App cần file này hoặc biến "
            "GOOGLE_CREDENTIALS_B64 để đọc/ghi Google Sheets."
        )
    if not (app_dir / "cloudflared").exists():
        warn(
            "Chưa thấy binary cloudflared. Trên Linux app sẽ tự tải bản "
            "amd64/arm64 khi khởi động; nếu server chặn GitHub Releases thì "
            "upload cloudflared thủ công."
        )
    else:
        if os.name == "posix":
            try:
                os.chmod(app_dir / "cloudflared", 0o755)
            except OSError:
                pass
        log("cloudflared: đã giữ binary hiện có.")


def existing_repo_update(app_dir: Path, repo: str, branch: str) -> int:
    log(f"{app_dir} đã là Git repo. Kiểm tra/cập nhật code...")
    current = run(
        ["git", "remote", "get-url", "origin"],
        app_dir,
        check=False,
        quiet=True,
    )
    if current.returncode != 0:
        run(["git", "remote", "add", "origin", repo], app_dir)
    elif current.stdout.strip() != repo:
        warn(f"Đổi remote origin: {current.stdout.strip()} -> {repo}")
        run(["git", "remote", "set-url", "origin", repo], app_dir)

    run(["git", "fetch", "origin", branch], app_dir)
    run(["git", "pull", "--ff-only", "origin", branch], app_dir)
    run(["git", "config", "pull.ff", "only"], app_dir, check=False, quiet=True)
    commit = run(
        ["git", "rev-parse", "--short", "HEAD"],
        app_dir,
        check=False,
        quiet=True,
    ).stdout.strip()
    log(f"Đã cập nhật. Commit hiện tại: {commit or 'unknown'}")
    print_secret_warnings(app_dir)
    return 0


def migrate(app_dir: Path, repo: str, branch: str, backup_root: Path | None) -> int:
    stamp = time.strftime("%Y%m%d_%H%M%S")
    if backup_root is None:
        backup_root = app_dir / "backup_local" / f"pre_git_{stamp}"
    old_tree = backup_root / "old_tree"

    if old_tree.exists():
        raise RuntimeError(f"Backup đã tồn tại, không ghi đè: {old_tree}")
    old_tree.mkdir(parents=True, exist_ok=True)
    log(f"Backup code cũ vào: {old_tree}")

    preserve = list(PRESERVE)
    for name in discover_env_files(app_dir):
        if name not in preserve:
            preserve.append(name)

    checkout_done = False
    try:
        for child in list(app_dir.iterdir()):
            if child.name in SKIP_TOP:
                continue
            shutil.move(str(child), str(old_tree / child.name))

        setup_git(app_dir, repo, branch)
        checkout_done = True

        restored = restore_paths(app_dir, old_tree, preserve)
        if restored:
            log("Đã giữ lại: " + ", ".join(restored))

        (app_dir / "data").mkdir(exist_ok=True)
        (app_dir / "static" / "chat_uploads").mkdir(parents=True, exist_ok=True)

        marked = mark_runtime_tracked(app_dir)
        if marked:
            log(
                "Đã đánh dấu skip-worktree cho file runtime đã sửa: "
                + ", ".join(marked)
            )

        verify_install(app_dir)
    except BaseException as exc:
        warn(f"Lỗi: {exc}")
        try:
            rollback(app_dir, old_tree, clean_app=checkout_done)
        except BaseException as rollback_exc:
            warn(f"Rollback cũng lỗi: {rollback_exc}")
            warn(f"Backup vẫn còn tại: {old_tree}")
        return 130 if isinstance(exc, KeyboardInterrupt) else 1

    commit = run(
        ["git", "rev-parse", "--short", "HEAD"],
        app_dir,
        check=False,
        quiet=True,
    ).stdout.strip()

    print("\n" + "=" * 62)
    print("HOÀN TẤT: server đã chuyển sang deploy bằng GitHub")
    print("=" * 62)
    print(f"App dir : {app_dir}")
    print(f"Commit  : {commit or 'unknown'}")
    print(f"Branch  : {branch}")
    print(f"Backup  : {backup_root}")
    print("\nKiểm tra trên panel → Startup:")
    print(f"  GIT REPO ADDRESS = {repo}")
    print(f"  GIT BRANCH       = {branch}")
    print("  AUTO UPDATE      = 1")
    print("\nSau đó restart server. Lần sau chỉ cần push GitHub + restart.")
    print("Khi mọi thứ chạy ổn, có thể xoá thư mục backup để giải phóng dung lượng.")
    print("=" * 62)

    print_secret_warnings(app_dir)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Chuyển server CloudCode từ ZIP sang Git deployment."
    )
    parser.add_argument(
        "--app-dir",
        default=os.environ.get("APP_DIR", DEFAULT_APP_DIR),
        help=f"Thư mục app trên server (mặc định: {DEFAULT_APP_DIR})",
    )
    parser.add_argument(
        "--repo",
        default=os.environ.get("REPO_URL", DEFAULT_REPO),
        help="URL Git repo",
    )
    parser.add_argument(
        "--branch",
        default=os.environ.get("BRANCH", DEFAULT_BRANCH),
        help="Branch cần deploy",
    )
    parser.add_argument(
        "--backup-root",
        default=os.environ.get("BACKUP_ROOT"),
        help="Thư mục backup (mặc định: <app>/backup_local/pre_git_<timestamp>)",
    )
    args = parser.parse_args()

    app_dir = Path(args.app_dir).expanduser().resolve()
    if not app_dir.is_dir():
        warn(f"Không thấy thư mục app: {app_dir}")
        return 1
    if not shutil.which("git"):
        warn("Chưa cài git trên server. Hãy cài git rồi chạy lại.")
        return 1
    if not args.repo.strip() or not args.branch.strip():
        warn("Repo URL hoặc branch rỗng.")
        return 1

    try:
        if (app_dir / ".git").exists():
            return existing_repo_update(app_dir, args.repo, args.branch)
        backup_root = (
            Path(args.backup_root).expanduser().resolve()
            if args.backup_root
            else None
        )
        return migrate(app_dir, args.repo, args.branch, backup_root)
    except KeyboardInterrupt:
        warn("Đã huỷ.")
        return 130
    except BaseException as exc:
        warn(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

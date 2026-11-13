#!/bin/bash
# VN-TRACKING SYNC (bản macOS của sync_master.bat)
# - Kéo code mới nhất từ GitHub (branch master) về thư mục này
# - Tải bundle config từ Supabase (credentials.json + env_vars.yaml), backup bản cũ
# - Giữ DB archive (data/*.db) nguyên vẹn
set -u
cd "$(dirname "$0")" || exit 1

REPO_URL="https://github.com/codekhoqua/vn-tracking.git"
BRANCH="master"
CONFIG_URL="https://umlxmlfsbrhnnnzchrij.supabase.co/storage/v1/object/public/app-config/config_bundle.zip"

say() { printf '%s\n' "$*"; }
ok()  { printf '[OK] %s\n' "$*"; }
warn(){ printf '[!] %s\n' "$*"; }
info(){ printf '[i] %s\n' "$*"; }

say "========================================================"
say "   VN-TRACKING SYNC (macOS) — branch: $BRANCH"
say "========================================================"

# ── 1. Code: clone hoặc pull ───────────────────────────────────────────
if [ ! -d .git ]; then
    info "Chưa có git → clone toàn bộ code..."
    git init -q
    git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
    if git fetch origin "$BRANCH" --quiet; then
        git reset --hard "origin/$BRANCH" >/dev/null
        git branch -M "$BRANCH" 2>/dev/null
        git branch -u "origin/$BRANCH" "$BRANCH" 2>/dev/null
        ok "Đã kéo toàn bộ code."
    else
        warn "Không kết nối được GitHub — kiểm tra mạng."
    fi
else
    info "Đang kiểm tra cập nhật từ GitHub..."
    if git fetch origin "$BRANCH" --quiet; then
        LOCAL=$(git rev-parse HEAD)
        REMOTE=$(git rev-parse "origin/$BRANCH")
        if [ "$LOCAL" = "$REMOTE" ]; then
            ok "Code local đã mới nhất."
        else
            BEHIND=$(git rev-list --count "HEAD..origin/$BRANCH")
            if [ "$BEHIND" = "0" ]; then
                info "Local có commit mới hơn GitHub chưa push."
            else
                warn "GitHub có $BEHIND commit mới. File thay đổi:"
                git diff --name-status HEAD "origin/$BRANCH"
                if git pull --ff-only origin "$BRANCH" >/dev/null 2>&1; then
                    ok "Đã cập nhật code."
                else
                    warn "Không pull nhanh được (có thay đổi local hoặc xung đột). Giữ nguyên code hiện tại."
                fi
            fi
        fi
    else
        warn "Không fetch được từ GitHub."
    fi
fi

# ── 2. Config từ Supabase ──────────────────────────────────────────────
info "Tải bundle config từ Supabase..."
TMPZ=$(mktemp -t vncfg).zip
TMPD=$(mktemp -d)
if curl -sSL -m 60 "$CONFIG_URL" -o "$TMPZ" && unzip -tq "$TMPZ" >/dev/null 2>&1; then
    unzip -oq "$TMPZ" -d "$TMPD" >/dev/null 2>&1
    TS=$(date +%Y%m%d_%H%M%S)
    BAK="backup_local/config_$TS"
    if [ -f credentials.json ] || [ -f env_vars.yaml ]; then
        mkdir -p "$BAK"
        [ -f credentials.json ] && cp -p credentials.json "$BAK/" 2>/dev/null
        [ -f env_vars.yaml ] && cp -p env_vars.yaml "$BAK/" 2>/dev/null
        info "Đã backup config cũ → $BAK"
    fi
    for f in credentials.json env_vars.yaml; do
        if [ -f "$TMPD/$f" ]; then
            if cmp -s "$TMPD/$f" "$f" 2>/dev/null; then
                info "$f không thay đổi."
            else
                cp -f "$TMPD/$f" "$f" && ok "Đã cập nhật $f từ Supabase."
            fi
        fi
    done
    # giữ tối đa 10 bản backup config
    ls -1dt backup_local/config_* 2>/dev/null | tail -n +11 | while read -r old; do rm -rf "$old"; done
else
    warn "Không tải/giải nén được config — giữ nguyên config hiện có."
fi
rm -f "$TMPZ"; rm -rf "$TMPD"

# ── 3. Kiểm tra cloudflared (chỉ cảnh báo, Mac dùng tunnel chung) ──────
[ -x cloudflared ] || info "Không có binary cloudflared trong thư mục (không bắt buộc trên Mac)."

# ── 4. DB archive ──────────────────────────────────────────────────────
if [ -f "data/vn_tracking_archive.db" ]; then
    ok "DB archive: $(du -h data/vn_tracking_archive.db | cut -f1)"
else
    info "Chưa có data/vn_tracking_archive.db (sẽ tạo khi app chạy)."
fi

say "========================================================"
ok "SYNC XONG"
say "========================================================"

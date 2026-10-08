#!/usr/bin/env bash
REPO_URL="https://github.com/codekhoqua/vn-tracking.git"
BRANCH="master"

echo "========================================================"
echo "    VN-TRACKING AUTO SYNC TOOL (BRANCH: $BRANCH)       "
echo "========================================================"

# 1. Kiểm tra nếu thư mục chưa có git hoặc folder trống
if [ ! -d ".git" ]; then
    echo ">> Thư mục chưa có Git. Đang kéo toàn bộ code từ GitHub về..."
    git clone -b "$BRANCH" "$REPO_URL" .
    if [ $? -eq 0 ]; then
        echo ">> [SUCCESS] Đã clone thành công toàn bộ code từ nhánh $BRANCH!"
    else
        echo ">> [ERROR] Clone thất bại. Vui lòng kiểm tra lại mạng hoặc thư mục."
    fi
    exit 0
fi

# 2. Đã có git repo -> Fetch metadata mới nhất từ GitHub
echo ">> Đang kiểm tra cập nhật từ GitHub ($BRANCH)..."
git fetch origin "$BRANCH" --quiet

# Đảm bảo đang ở nhánh master
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo ">> Chuyển về nhánh $BRANCH..."
    git checkout "$BRANCH"
fi

# 3. So sánh commit
LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null)
REMOTE_COMMIT=$(git rev-parse "origin/$BRANCH" 2>/dev/null)

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo ">> [OK] Code local ĐÃ MỚI NHẤT, đồng bộ 100% với GitHub!"
    
    CHANGES=$(git status --porcelain)
    if [ -n "$CHANGES" ]; then
        echo ">> Lưu ý: Đang có một số file sửa đổi ở local chưa commit."
    fi
else
    BEHIND=$(git rev-list --count HEAD.."origin/$BRANCH" 2>/dev/null)
    AHEAD=$(git rev-list --count "origin/$BRANCH"..HEAD 2>/dev/null)

    if [ "$BEHIND" -gt 0 ]; then
        echo ">> [UPDATE FOUND] GitHub có $BEHIND commit mới hơn local!"
        echo ">> Danh sách các file có thay đổi:"
        git diff --name-status HEAD.."origin/$BRANCH"
        echo "--------------------------------------------------------"
        echo ">> Đang tự động kéo code mới nhất về thư mục..."
        git pull origin "$BRANCH"
        if [ $? -eq 0 ]; then
            echo ">> [SUCCESS] Đã cập nhật code mới nhất thành công!"
        else
            echo ">> [CONFLICT] Có xung đột code, vui lòng kiểm tra lại."
        fi
    elif [ "$AHEAD" -gt 0 ]; then
        echo ">> [AHEAD] Local đang có $AHEAD commit chưa được push lên GitHub."
    fi
fi

echo "========================================================"

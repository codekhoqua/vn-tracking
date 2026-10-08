@echo off
chcp 65001 >nul
title VN-Tracking Sync Master Tool
cd /d "%~dp0"

set REPO_URL=https://github.com/codekhoqua/vn-tracking.git
set BRANCH=master

echo ========================================================
echo     VN-TRACKING AUTO SYNC TOOL (BRANCH: %BRANCH%)
echo ========================================================

REM 1. Kiem tra neu chua co git hoac thu muc trong
if not exist ".git" (
    echo [i] Thu muc chua co Git. Dang keo toan bo code ve...
    git clone -b %BRANCH% %REPO_URL% .
    if %errorlevel% equ 0 (
        echo [OK] Da keo toan bo code thanh cong!
    ) else (
        echo [FAIL] Khong the clone code. Kiem tra lai ket noi mang.
    )
    goto end
)

REM 2. Fetch metadata tu GitHub
echo [i] Dang kiem tra cap nhat tu GitHub...
git fetch origin %BRANCH% --quiet

REM 3. So sanh commit hash
for /f %%i in ('git rev-parse HEAD') do set LOCAL_HASH=%%i
for /f %%i in ('git rev-parse origin/%BRANCH%') do set REMOTE_HASH=%%i

if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo [OK] Code local DA MOI NHAT, dong bo 100%% voi GitHub!
) else (
    for /f %%c in ('git rev-list --count HEAD..origin/%BRANCH%') do set BEHIND=%%c
    if not "%%BEHIND%%"=="0" (
        echo [!] Phat hien GitHub co %%BEHIND%% commit moi!
        echo [i] Danh sach file thay doi:
        git diff --name-status HEAD origin/%BRANCH%
        echo --------------------------------------------------------
        echo [i] Dang tu dong keo code moi ve...
        git pull origin %BRANCH%
        if %errorlevel% equ 0 (
            echo [OK] Da cap nhat code moi thanh cong!
        ) else (
            echo [!] Co xung dot code, vui long kiem tra.
        )
    ) else (
        echo [i] Local dang co commit moi hon GitHub chua push.
    )
)

:end
echo ========================================================
echo Nhan phim bat ky de thoat...
pause >nul

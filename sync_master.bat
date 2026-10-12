@echo off
chcp 65001 >nul
title VN-Tracking Sync Master Tool
cd /d "%~dp0"

set "REPO_URL=https://github.com/codekhoqua/vn-tracking.git"
set "BRANCH=master"
set "CONFIG_URL=https://umlxmlfsbrhnnnzchrij.supabase.co/storage/v1/object/public/app-config/config_bundle.zip"
set "CF_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"

echo ========================================================
echo     VN-TRACKING AUTO SYNC TOOL (BRANCH: %BRANCH%)
echo ========================================================

REM 1. Kiem tra neu chua co git hoac thu muc trong
if not exist ".git" goto do_clone

REM 2. Fetch metadata tu GitHub
echo [i] Dang kiem tra cap nhat tu GitHub...
git fetch origin %BRANCH% --quiet

REM 3. So sanh commit hash
for /f %%i in ('git rev-parse HEAD') do set "LOCAL_HASH=%%i"
for /f %%i in ('git rev-parse origin/%BRANCH%') do set "REMOTE_HASH=%%i"

if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo [OK] Code local DA MOI NHAT, dong bo 100%% voi GitHub!
    goto check_config
)

for /f %%c in ('git rev-list --count HEAD..origin/%BRANCH%') do set "BEHIND=%%c"
if "%BEHIND%"=="0" (
    echo [i] Local dang co commit moi hon GitHub chua push.
    goto check_config
)

echo [!] Phat hien GitHub co %BEHIND% commit moi!
echo [i] Danh sach file thay doi:
git diff --name-status HEAD origin/%BRANCH%
echo --------------------------------------------------------
echo [i] Dang tu dong keo code moi ve...
git pull origin %BRANCH%
if %errorlevel% equ 0 (
    echo [OK] Da cap nhat code moi thanh cong!
) else (
    echo [!] Co xung dot code, vui long kiem tra lai.
)
goto check_config

:do_clone
echo [i] Thu muc chua co Git. Dang khoi tao va keo toan bo code ve...
git init >nul
git remote add origin %REPO_URL% 2>nul || git remote set-url origin %REPO_URL%
git fetch origin %BRANCH%
if %errorlevel% neq 0 (
    echo [FAIL] Khong the ket noi den GitHub. Kiem tra lai mang.
    goto check_config
)
git reset --hard origin/%BRANCH%
git branch -M %BRANCH% 2>nul
git branch -u origin/%BRANCH% %BRANCH% 2>nul
if %errorlevel% equ 0 (
    echo [OK] Da keo toan bo code thanh cong!
) else (
    echo [FAIL] Khong the reset code.
)
goto check_config

:check_config
REM 4. Kiem tra va tu dong tai credentials.json va env_vars.yaml
if exist "credentials.json" if exist "env_vars.yaml" goto check_cloudflared

echo.
echo --------------------------------------------------------
echo [i] Phat hien thieu credentials.json hoac env_vars.yaml
echo [i] Dang tu dong tai bo config tu Cloud...
curl.exe -s -L "%CONFIG_URL%" -o config_bundle.zip
if exist "config_bundle.zip" (
    tar -xf config_bundle.zip 2>nul || powershell -Command "Expand-Archive -Path config_bundle.zip -DestinationPath . -Force"
    del config_bundle.zip 2>nul
    echo [OK] Da tu dong khoi phuc day du credentials.json va env_vars.yaml!
) else (
    echo [!] Khong the tai bo config tu Cloud.
)

:check_cloudflared
REM 5. Kiem tra va tu dong tai file cloudflared neu thieu
if exist "cloudflared" goto end

echo.
echo --------------------------------------------------------
echo [i] Phat hien thieu file cloudflared.
echo [i] Dang tu dong tai cloudflared tu Cloudflare Releases...
curl.exe -s -L "%CF_URL%" -o cloudflared
if exist "cloudflared" (
    echo [OK] Da tu dong tai cloudflared thanh cong!
) else (
    echo [!] Khong the tai cloudflared tu Cloudflare.
)

:end
echo ========================================================
echo Nhan phim bat ky de thoat...
pause >nul

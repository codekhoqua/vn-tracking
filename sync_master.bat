@echo off
chcp 65001 >nul
title VN-Tracking Sync Master Tool
cd /d "%~dp0"

set REPO_URL=https://github.com/codekhoqua/vn-tracking.git
set BRANCH=master

REM ========================================================
REM ĐIỀN ID FILE GOOGLE DRIVE CỦA FILE config_bundle.zip TẠI ĐÂY
REM Link chia sẻ dạng: https://drive.google.com/file/d/FILE_ID/view
REM ========================================================
set "GDRIVE_FILE_ID=YOUR_GDRIVE_FILE_ID"

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
        goto check_config
    )
) else (
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
)

:check_config
REM ========================================================
REM 4. Kiem tra va tu dong tai credentials.json / env_vars.yaml
REM ========================================================
set "NEED_CONFIG=0"
if not exist "credentials.json" set "NEED_CONFIG=1"
if not exist "env_vars.yaml" set "NEED_CONFIG=1"

if "%NEED_CONFIG%"=="1" (
    echo.
    echo --------------------------------------------------------
    echo [!] Phat hien THIEU file cau hinh (credentials.json hoac env_vars.yaml)...
    if not "%GDRIVE_FILE_ID%"=="YOUR_GDRIVE_FILE_ID" (
        echo [i] Dang tu dong tai config_bundle.zip tu Google Drive...
        curl.exe -L "https://drive.usercontent.google.com/download?id=%GDRIVE_FILE_ID%&export=download" -o config_bundle.zip --silent
        if exist "config_bundle.zip" (
            tar -xf config_bundle.zip 2>nul || powershell -Command "Expand-Archive -Path config_bundle.zip -DestinationPath . -Force"
            del config_bundle.zip 2>nul
            echo [OK] Da tu dong khoi phuc day du credentials.json va env_vars.yaml!
        ) else (
            echo [!] Khong the tai tu Google Drive. Vui long kiem tra lai quyen truy cap link.
        )
    ) else (
        echo [!] Chua cai dat GDRIVE_FILE_ID trong sync_master.bat.
        echo [!] Vui long copy credentials.json va env_vars.yaml vao thu muc nay.
    )
)

:end
echo ========================================================
echo Nhan phim bat ky de thoat...
pause >nul

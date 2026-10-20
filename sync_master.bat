@echo off
chcp 65001 >nul
title VN-Tracking Sync Master Tool

set "REPO_URL=https://github.com/codekhoqua/vn-tracking.git"
set "BRANCH=master"
set "CONFIG_URL=https://umlxmlfsbrhnnnzchrij.supabase.co/storage/v1/object/public/app-config/config_bundle.zip"
set "CF_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"

set "SELF=%~f0"
set "CHILD=%TEMP%\vn_sync_master_run.bat"

REM ============================================================
REM Chay tu ban sao trong %TEMP%.
REM Ly do: khi clone/pull, git co the ghi de chinh file
REM sync_master.bat NGAY GIUA LUC script dang chay -> cmd doc sai
REM offset trong file -> script dung giua chung (loi gap o folder moi).
REM ============================================================
if /i "%~1"=="__child" goto run_child

if exist "%SELF%" copy /y "%SELF%" "%CHILD%" >nul 2>nul
if not exist "%CHILD%" goto run_direct
call "%CHILD%" __child "%~dp0" "%~1"
set "RC=%errorlevel%"
del "%CHILD%" >nul 2>nul
exit /b %RC%

:run_child
set "ROOT=%~2"
set "FORCE_ARG=%~3"
if "%ROOT%"=="" set "ROOT=%~dp0"
cd /d "%ROOT%"
goto init

:run_direct
REM Khong copy duoc sang %TEMP% -> chay truc tiep (co the bi loi neu file bi ghi de)
set "ROOT=%~dp0"
set "FORCE_ARG=%~1"
set "CHILD="
cd /d "%ROOT%"

:init
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

REM Goi kem tham so "avatars" de ep dong bo avatar tu production:
REM     sync_master.bat avatars
set "FORCE_AVATARS=0"
if /i "%FORCE_ARG%"=="avatars" set "FORCE_AVATARS=1"
if /i "%FORCE_ARG%"=="--avatars" set "FORCE_AVATARS=1"

set "PY="
where python >nul 2>nul
if not errorlevel 1 set "PY=python"
if not defined PY (
    where py >nul 2>nul
    if not errorlevel 1 set "PY=py -3"
)

echo ========================================================
echo     VN-TRACKING AUTO SYNC TOOL (BRANCH: %BRANCH%)
echo ========================================================
echo [i] DB archive + avatar nam trong data\vn_tracking_archive.db
echo     KHONG co trong Git va KHONG co trong zip deploy.
echo.

REM ========================================================
REM 0. BACKUP DB TRUOC KHI DONG VAO CODE
REM    - git pull / git reset --hard khong dong toi file DB
REM      (da nam trong .gitignore), nhung neu DB tung bi commit
REM      o commit cu thi Git co the xoa no khoi working tree.
REM    - Vi vay luon snapshot truoc khi sync.
REM ========================================================
call :db_backup

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
    echo     DB archive van an toan nho backup o buoc 0.
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
echo [OK] Da keo toan bo code thanh cong!
goto check_config

:check_config
REM Giu lai ban sync_master.bat moi nhat (git vua co the ghi de bang ban cu)
call :restore_self

REM 4. Luon tai bo config MOI NHAT tu Supabase (credentials.json + env_vars.yaml)
REM    - Sua env tren Supabase roi chay sync la co ngay, khong can xoa file cu.
REM    - Config cu duoc backup vao backup_local\config_<ts>\ truoc khi ghi de.
REM    - Tai loi / file hong -> giu nguyen config dang co.
echo.
echo --------------------------------------------------------
echo [i] Dang tai bo config moi nhat tu Supabase...
set "CFG_ZIP=%TEMP%\vn_config.zip"
set "CFG_DIR=%TEMP%\vn_config_files"
if exist "%CFG_DIR%" rmdir /s /q "%CFG_DIR%" >nul 2>nul
if exist "%CFG_ZIP%" del "%CFG_ZIP%" >nul 2>nul

curl.exe -s -L "%CONFIG_URL%" -o "%CFG_ZIP%"
if not exist "%CFG_ZIP%" goto config_failed
tar -tf "%CFG_ZIP%" >nul 2>nul
if errorlevel 1 goto config_invalid

mkdir "%CFG_DIR%" >nul 2>nul
tar -xf "%CFG_ZIP%" -C "%CFG_DIR%" 2>nul || powershell -Command "Expand-Archive -Path '%CFG_ZIP%' -DestinationPath '%CFG_DIR%' -Force"
if not exist "%CFG_DIR%\credentials.json" if not exist "%CFG_DIR%\env_vars.yaml" goto config_invalid

call :backup_config
if exist "%CFG_DIR%\credentials.json" call :update_cfg "%CFG_DIR%\credentials.json" "credentials.json"
if exist "%CFG_DIR%\env_vars.yaml" call :update_cfg "%CFG_DIR%\env_vars.yaml" "env_vars.yaml"

if exist "%CFG_ZIP%" del "%CFG_ZIP%" >nul 2>nul
if exist "%CFG_DIR%" rmdir /s /q "%CFG_DIR%" >nul 2>nul
goto check_cloudflared

:config_invalid
echo [!] File config tai ve khong hop le - giu nguyen config hien tai.
if exist "%CFG_ZIP%" del "%CFG_ZIP%" >nul 2>nul
if exist "%CFG_DIR%" rmdir /s /q "%CFG_DIR%" >nul 2>nul
goto check_cloudflared

:config_failed
echo [!] Khong tai duoc config tu Supabase - giu nguyen config hien tai.
goto check_cloudflared

:check_cloudflared
REM 5. Kiem tra va tu dong tai file cloudflared neu thieu
if exist "cloudflared" goto check_db

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

:check_db
REM 6. Kiem tra DB sau sync: tu phuc hoi neu DB bi mat/rong,
REM    va tu keo avatar tu production neu bang user_avatars trong.
echo.
echo --------------------------------------------------------
call :db_verify
goto end

:end
call :restore_self
echo ========================================================
if "%FORCE_AVATARS%"=="1" echo [i] Da chay o che do ep dong bo avatar.
echo Nhan phim bat ky de thoat...
pause >nul
exit /b 0

REM ========================================================
REM HELPERS
REM ========================================================

:restore_self
REM Neu git vua ghi de sync_master.bat bang ban cu tren GitHub thi
REM copy lai ban moi nhat dang chay (trong %TEMP%) de khong mat tinh nang.
if not defined CHILD exit /b 0
if not exist "%CHILD%" exit /b 0
if not exist "%ROOT%sync_master.bat" exit /b 0
fc /b "%CHILD%" "%ROOT%sync_master.bat" >nul 2>nul
if not errorlevel 1 exit /b 0
copy /y "%CHILD%" "%ROOT%sync_master.bat" >nul
echo [i] Da giu ban sync_master.bat moi nhat trong thu muc.
exit /b 0

:backup_config
REM Backup credentials.json / env_vars.yaml hien tai truoc khi ghi de
if not exist "credentials.json" if not exist "env_vars.yaml" exit /b 0
set "TS="
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%i"
if "%TS%"=="" set "TS=manual"
set "CFG_BAK=%ROOT%backup_local\config_%TS%"
mkdir "%CFG_BAK%" >nul 2>nul
if exist "credentials.json" copy /y "credentials.json" "%CFG_BAK%\credentials.json" >nul
if exist "env_vars.yaml" copy /y "env_vars.yaml" "%CFG_BAK%\env_vars.yaml" >nul
echo [i] Da backup config cu vao backup_local\config_%TS%\
for /f "skip=10 delims=" %%d in ('dir /b /ad /o-d "%ROOT%backup_local\config_*" 2^>nul') do rd /s /q "%ROOT%backup_local\%%d" >nul 2>nul
exit /b 0

:update_cfg
REM %1 = file moi (trong %TEMP%), %2 = file trong thu muc app
fc /b "%~1" "%~2" >nul 2>nul
if not errorlevel 1 (
    echo [i] %~nx2 khong thay doi.
    exit /b 0
)
copy /y "%~1" "%~2" >nul
echo [OK] Da cap nhat %~nx2 tu Supabase.
exit /b 0

:db_backup
if not defined PY (
    echo [!] Khong tim thay Python - BO QUA backup DB.
    echo     Python la bat buoc de chay app - hay cai truoc khi sync.
    exit /b 0
)
if not exist "scripts\db_guard.py" exit /b 0
echo [i] Dang backup DB archive...
%PY% scripts\db_guard.py backup
echo.
exit /b 0

:db_verify
if not defined PY (
    echo [!] Khong tim thay Python - khong the kiem tra DB/avatar.
    exit /b 0
)
if not exist "scripts\db_guard.py" exit /b 0
echo [i] Kiem tra DB archive va avatar sau khi sync...
%PY% scripts\db_guard.py verify --restore
if errorlevel 3 goto :db_avatar_restored
if errorlevel 2 goto :db_sync_avatars
if "%FORCE_AVATARS%"=="1" goto :db_sync_avatars
exit /b 0

:db_avatar_restored
echo [OK] DB/avatar da duoc phuc hoi tu backup.
if "%FORCE_AVATARS%"=="1" goto :db_sync_avatars
exit /b 0

:db_sync_avatars
if not exist "scripts\sync_avatars.py" (
    echo [!] Khong thay scripts\sync_avatars.py - bo qua dong bo avatar.
    exit /b 0
)
echo [i] Dang keo avatar tu production ve DB...
%PY% scripts\sync_avatars.py
exit /b 0

@echo off
chcp 65001 >nul
title VN-Tracking Localhost
echo ========================================================
echo   Khoi dong Local Server: http://127.0.0.1:5000
echo   Lan IP:                http://192.168.1.11:5000
echo ========================================================
cd /d "%~dp0"
python app.py
pause

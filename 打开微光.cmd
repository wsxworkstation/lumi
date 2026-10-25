@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "Lumi Server - keep this window open" cmd /k "node server.cjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173"


@echo off
rem 주사위 성채(Dicekeep) 로컬 실행 스크립트
cd /d "%~dp0"
start "" http://localhost:8137
where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py
) else (
  npx -y http-server -p 8137 -c-1
)

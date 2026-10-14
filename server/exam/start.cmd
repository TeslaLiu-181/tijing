@echo off
chcp 65001 >nul
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo 请先安装 Node.js 24，再启动学习空间。
  pause
  exit /b 1
)
if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules\sharp\package.json" (
  call npm ci --omit=dev --no-audit --no-fund
  if errorlevel 1 exit /b 1
)
node --env-file-if-exists=.env server/exam/setup.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
node --env-file-if-exists=.env server/exam/main.mjs
pause

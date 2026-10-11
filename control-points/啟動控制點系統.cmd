@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules\wrangler\bin\wrangler.js (
  echo 請先安裝 Node.js 並在這個資料夾執行 npm install。
  pause
  exit /b 1
)
if not exist .local\setup-complete.json (
  echo 請先依 README 完成本機資料庫設定。
  pause
  exit /b 1
)
start "" "http://127.0.0.1:8789"
call npm.cmd run dev
pause

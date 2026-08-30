@echo off
chcp 65001 >nul
title کارآگاه یخچال
cd /d "%~dp0"

echo.
echo ====== کارآگاه یخچال ======
echo.

if "%GEMINI_API_KEY%"=="" (
  if not exist ".env" (
    echo [!] کلید GEMINI_API_KEY پیدا نشد.
    echo     یا در System Environment Variables ویندوز تنظیمش کن،
    echo     یا فایلی به نام .env بساز و این خط را در آن بگذار:
    echo     GEMINI_API_KEY=کلید_شما
    echo.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo نصب پکیج‌ها...
  call npm install
)

echo آدرس‌هایی که می‌توانی باز کنی:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=1" %%b in ("%%a") do echo    http://%%b:3000
)
echo    http://localhost:3000
echo.

call npm start
pause

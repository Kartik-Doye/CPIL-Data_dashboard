@echo off
title GO Gas Executive Suite - 24/7 Production Service
cd /d "%~dp0"

if not exist "logs" mkdir logs

echo [1/2] Building optimized frontend bundle...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Frontend build failed. Fix errors above and retry.
  pause
  exit /b 1
)

echo [2/2] Starting GO Gas Executive Suite in Production Mode (Port 5050)...
echo Automated Email and WhatsApp Briefings active at 02:15 PM and 06:30 PM Daily.
set NODE_ENV=production
call npm start

@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo   GO Gas -- Zero-Cost Automated Morning Email Dispatcher
echo ========================================================
echo Running daily morning executive briefing email...
echo Time: %TIME%  Date: %DATE%
echo.

node send_morning_mail.cjs

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Email dispatch encountered an issue. See log above or morning_email_log.txt.
) else (
  echo.
  echo [SUCCESS] Morning briefing delivered successfully!
)

timeout /t 5

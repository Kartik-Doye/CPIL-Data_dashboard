@echo off
echo ========================================================
echo   Starting GO Gas Executive Suite (Vite + Node Server)
echo ========================================================
cd /d "%~dp0"
call npm.cmd run dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] If packages are missing, run: npm.cmd install
    pause
)


@echo off
echo ========================================================
echo   Starting GO Gas Executive Suite (TypeScript + Node Engine)
echo   Connecting to PostgreSQL (sale_alds on localhost:5432)
echo ========================================================
cd /d "%~dp0.."
call npm.cmd run dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server exited. If dependencies are needed, run: npm.cmd install
    pause
)

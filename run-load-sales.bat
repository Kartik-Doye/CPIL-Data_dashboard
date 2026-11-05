@echo off
setlocal enabledelayedexpansion
echo ========================================================
echo   Manual Work -- Sales Data Loader
echo   Loading Manual Work/sale.xlsx into PostgreSQL (sale_alds)
echo ========================================================
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Node.js is not found in your Windows PATH.
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules\" (
    echo.
    echo [INFO] "node_modules" not found. Installing project dependencies...
    call npm.cmd install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] npm install encountered an issue.
        pause
        exit /b 1
    )
    echo.
)

call npm.cmd run load-sales
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Ingestion failed. Check database credentials or Excel formatting.
    pause
) else (
    echo.
    echo [SUCCESS] Ingestion completed.
    pause
)

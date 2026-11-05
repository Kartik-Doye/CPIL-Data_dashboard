@echo off
setlocal enabledelayedexpansion
echo ========================================================
echo   GO Gas -- Local PostgreSQL Database Connection Tester
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
    echo [INFO] Running: npm install (please wait a moment)...
    echo.
    call npm.cmd install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] npm install encountered an issue. Please run "npm install" in your terminal.
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed successfully.
    echo.
)

:: Run the database tester
call npm.cmd run test-db
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Database connection or schema verification failed.
    pause
    exit /b 1
)

echo.
pause

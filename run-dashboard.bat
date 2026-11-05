@echo off
setlocal enabledelayedexpansion
echo ========================================================
echo   Starting GO Gas Executive Suite (Dashboard Server)
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
        echo [ERROR] npm install failed. Please verify your internet connection.
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed successfully.
    echo.
)

call npm.cmd run dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to start server. If packages need reinstalling, run: npm.cmd install
    pause
)

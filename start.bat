@echo off
title PDD_STAT
cd /d "%~dp0"

:: =============================================
:: Auto-setup if .venv missing
:: =============================================
if not exist ".venv\" (
    echo First run - running setup...
    call setup.bat
    if errorlevel 1 (
        echo.
        echo Setup failed. Run setup.bat manually.
        pause
        exit /b 1
    )
)

:: =============================================
:: Check for updates
:: =============================================
where git >nul 2>&1
if errorlevel 1 goto :update_checked

git rev-parse --git-dir >nul 2>&1
if errorlevel 1 goto :update_checked

echo Checking for updates...
git fetch origin 2>nul
if errorlevel 1 goto :update_checked

git rev-parse --verify origin/main >nul 2>&1
if errorlevel 1 goto :update_checked

set "UPD_COUNT=0"
git rev-list --count HEAD..origin/main > "%TEMP%\pdd_upd.txt" 2>nul
set /p "UPD_COUNT=" < "%TEMP%\pdd_upd.txt"
if not defined UPD_COUNT set "UPD_COUNT=0"
if "%UPD_COUNT%"=="0" goto :update_checked

echo.
echo Updates available (%UPD_COUNT% new commit^(s^)^).
choice /c YN /m "Install and start"
if errorlevel 2 goto :update_checked

echo.
call update.bat
echo.

:update_checked

:: =============================================
:: Search Python (same logic as setup.bat)
:: =============================================
set "PYTHON_CMD="

py -3.12 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3.12"
    goto :start_found
)

py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3.11"
    goto :start_found
)

py -3.13 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3.13"
    goto :start_found
)

py --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py"
    goto :start_found
)

python --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=python"
    goto :start_found
)

echo.
echo ERROR: Python not found.
echo Run setup.bat to install.
echo.
pause
exit /b 1

:start_found

:: =============================================
:: Activate venv
:: =============================================
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo.
    echo ERROR: virtual environment is broken.
    Run setup.bat again.
    echo.
    pause
    exit /b 1
)

cd app\backend

echo ============================================
echo  PDD_STAT server started
echo  Open: http://127.0.0.1:8000
echo  Ctrl+C to stop
echo ============================================

:: Open browser
start "" http://127.0.0.1:8000

:: Start server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

echo.
echo Server stopped.
pause

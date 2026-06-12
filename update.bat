@echo off
title PDD_STAT - Update
cd /d "%~dp0"

echo ============================================
echo  PDD_STAT - Update
echo ============================================
echo.

:: Check Git
where git >nul 2>&1
if errorlevel 1 (
    echo Git not found. Download from https://git-scm.com/download/win
    start https://git-scm.com/download/win
    pause
    exit /b 1
)

:: Pull updates
echo Pulling updates from repository...
git pull
if errorlevel 1 (
    echo.
    echo ERROR: failed to pull updates.
    echo Check your internet connection.
    pause
    exit /b 1
)

:: Update dependencies
if exist ".venv\" (
    echo.
    echo Updating dependencies...
    call .venv\Scripts\activate.bat
    python -m pip install --upgrade pip >nul 2>&1
    pip install -r app\backend\requirements.txt
    if errorlevel 1 (
        echo.
        echo [WARNING] Some dependencies failed to update.
        echo Run setup.bat to reinstall.
    )
) else (
    echo.
    echo No virtual environment found. Run setup.bat first.
)

echo.
echo ============================================
echo  Update complete!
echo ============================================
timeout /t 5 /nobreak >nul

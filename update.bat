@echo off
title PDD_STAT - Update
cd /d "%~dp0"

echo ============================================
echo  PDD_STAT - Update
echo ============================================
echo.

:: Check Git
where git >nul 2>&1
if not errorlevel 1 goto :git_ok

echo Git not found. Installing automatically...
echo.

set "GIT_INSTALLER=%TEMP%\git-install.exe"
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/git-scm/git/releases/download/v2.45.2.windows.1/Git-2.45.2-64-bit.exe' -OutFile '%GIT_INSTALLER%' -UseBasicParsing"
if not exist "%GIT_INSTALLER%" (
    echo ERROR: Download failed.
    echo Download manually: https://git-scm.com/download/win
    start https://git-scm.com/download/win
    pause
    exit /b 1
)

echo Installing Git...
"%GIT_INSTALLER%" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"
del "%GIT_INSTALLER%" >nul 2>&1

:: Refresh PATH
set "PATH=%ProgramFiles%\Git\cmd;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

where git >nul 2>&1
if errorlevel 1 (
    echo Git installed but not found in PATH.
    echo Close this window and run update.bat again.
    pause
    exit /b 1
)

echo [OK] Git installed
echo.

:git_ok

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
pause

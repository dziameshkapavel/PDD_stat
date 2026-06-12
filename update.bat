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

set "GIT_URL=https://github.com/git-for-windows/git/releases/download/v2.54.0.windows.1/Git-2.54.0-64-bit.exe"

:: Try curl first (built into Windows 10+)
where curl >nul 2>&1
if not errorlevel 1 (
    curl -L -o "%GIT_INSTALLER%" "%GIT_URL%"
    goto :check_download
)

:: Fallback to PowerShell
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%GIT_URL%' -OutFile '%GIT_INSTALLER%' -UseBasicParsing"

:check_download
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

:: Check if this is a git repository
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo.
    echo This folder is not a git repository.
    echo It was probably downloaded as a ZIP file.
    echo.
    echo Initializing git in this folder...
    echo.
    git init
    git remote add origin https://github.com/dziameshkapavel/PDD_stat.git
    git fetch origin main
    git checkout main
    if errorlevel 1 (
        echo.
        echo ERROR: Could not initialize repository.
        echo Delete this folder and clone properly:
        echo   git clone https://github.com/dziameshkapavel/PDD_stat.git
        pause
        exit /b 1
    )
    echo [OK] Repository initialized
    echo.
)

:: Pull updates
echo Pulling updates from repository...
echo.
git remote -v
echo.
git pull 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: failed to pull updates.
    echo.
    echo Possible causes:
    echo   1. Windows Defender or antivirus is blocking Git
    echo   2. Git Credential Manager popup was blocked
    echo   3. Repository is not accessible
    echo.
    echo Try running manually in this folder:
    echo   git pull
    echo.
    echo If git pull asks for login, use a Personal Access Token:
    echo   https://github.com/settings/tokens
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

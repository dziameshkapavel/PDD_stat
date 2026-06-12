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
if not errorlevel 1 goto :pull_updates

echo.
echo This folder is not a git repository (probably ZIP download).
echo Auto-converting to git repository...
echo.
goto :auto_convert

:auto_convert
echo.
echo Initializing git repository...
git init
if errorlevel 1 (
    echo ERROR: git init failed.
    pause
    exit /b 1
)

git remote add origin https://github.com/dziameshkapavel/PDD_stat.git >nul 2>&1
echo Fetching from remote...
git fetch origin
if errorlevel 1 (
    echo ERROR: failed to fetch from remote.
    echo Check your internet connection.
    pause
    exit /b 1
)

echo Resetting to latest version...

git rev-parse --verify origin/main >nul 2>&1
if errorlevel 1 (
    git checkout -f -b master origin/master
) else (
    git checkout -f -b main origin/main
)
if errorlevel 1 (
    echo ERROR: failed to create local branch.
    pause
    exit /b 1
)

echo.
echo [OK] Folder converted to git repository.
echo.
goto :pull_updates

:skip_update
echo.
echo Update skipped.
pause
exit /b 1

:pull_updates

:: Pull updates (fetch + hard reset to avoid untracked file conflicts)
echo Fetching updates from repository...
echo.
git remote -v
echo.

git fetch origin
if errorlevel 1 (
    echo.
    echo ERROR: failed to fetch updates.
    echo Check your internet connection.
    pause
    exit /b 1
)

echo Resetting to latest version...
git rev-parse --verify origin/main >nul 2>&1
if errorlevel 1 (
    git reset --hard origin/master
) else (
    git reset --hard origin/main
)
if errorlevel 1 (
    echo.
    echo ERROR: failed to reset.
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
    echo.
    echo Ensuring autograd-gamma is installed...
    pip install autograd-gamma==0.4.2
    if errorlevel 1 (
        echo [WARNING] autograd-gamma install failed.
        echo    Cox regression may be unavailable.
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

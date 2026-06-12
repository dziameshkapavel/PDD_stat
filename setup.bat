@echo off
title PDD_STAT - Install
cd /d "%~dp0"

echo ============================================
echo  PDD_STAT - Install
echo ============================================
echo.

:: =============================================
:: 1. Check 64-bit
:: =============================================
if "%PROCESSOR_ARCHITECTURE%"=="x86" (
    if not defined PROCESSOR_ARCHITEW6432 (
        echo ERROR: 64-bit Windows required.
        echo.
        pause
        exit /b 1
    )
)

:: =============================================
:: 2. Remove Microsoft Store fake aliases
:: =============================================
set "STUB_DIR=%LOCALAPPDATA%\Microsoft\WindowsApps"

if exist "%STUB_DIR%\python.exe" (
    echo [!] Removing Microsoft Store stub: python.exe
    del "%STUB_DIR%\python.exe" >nul 2>&1
)

if exist "%STUB_DIR%\python3.exe" (
    echo [!] Removing Microsoft Store stub: python3.exe
    del "%STUB_DIR%\python3.exe" >nul 2>&1
)

if exist "%STUB_DIR%\py.exe" (
    echo [!] Removing Microsoft Store stub: py.exe
    del "%STUB_DIR%\py.exe" >nul 2>&1
)

:: Verify stubs are gone
where python >nul 2>&1
if not errorlevel 1 (
    python --version >nul 2>&1
    if errorlevel 1 (
        echo.
        echo ERROR: Could not remove Microsoft Store stubs.
        echo Please disable them manually:
        echo   Settings ^> Apps ^> Advanced app settings
        echo   ^> App execution aliases
        echo   Turn off "python.exe" and "python3.exe"
        echo.
        pause
        exit /b 1
    )
)

:: =============================================
:: 3. Search for Python (3.12 -> 3.11 -> 3.13)
:: =============================================
set "PYTHON_CMD="
set "PYTHON_VERSION="

echo Searching for Python...

py -3.12 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3.12"
    set "PYTHON_VERSION=3.12"
    goto :found_python
)

py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3.11"
    set "PYTHON_VERSION=3.11"
    goto :found_python
)

py -3.13 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3.13"
    set "PYTHON_VERSION=3.13"
    goto :found_python
)

py --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py"
    for /f "tokens=2" %%v in ('py --version 2^>^&1') do set "PYTHON_VERSION=%%v"
    goto :found_python
)

python --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=python"
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set "PYTHON_VERSION=%%v"
    goto :found_python
)

:: =============================================
:: 4. Python not found - offer to install
:: =============================================
echo.
echo ============================================
echo  Python NOT FOUND on this computer.
echo ============================================
echo.
echo  Recommended: Python 3.12
echo  (all packages install without compilation)
echo.

echo  [A] Download and install Python 3.12 automatically
echo  [B] Open download page in browser
echo.
choice /c AB /m "Choose"
if errorlevel 1 goto :install_auto
if errorlevel 2 goto :install_manual

:install_auto
echo.
echo Downloading Python 3.12 installer...
echo This may take 1-2 minutes depending on your connection.
echo.

set "PY_INSTALLER=%TEMP%\python-3.12.7-amd64.exe"
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe' -OutFile '%PY_INSTALLER%' -UseBasicParsing"
if not exist "%PY_INSTALLER%" (
    echo.
    echo ERROR: Download failed.
    goto :install_manual
)

echo Installing Python 3.12 (silent mode)...
"%PY_INSTALLER%" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
if errorlevel 1 (
    echo.
    echo ERROR: Installation failed.
    del "%PY_INSTALLER%" >nul 2>&1
    goto :install_manual
)

del "%PY_INSTALLER%" >nul 2>&1
echo.
echo Python installed! Refreshing PATH...
set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
py -3.12 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3.12"
    set "PYTHON_VERSION=3.12"
    goto :found_python
)
python --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=python"
    set "PYTHON_VERSION=3.12"
    goto :found_python
)
echo Python installed but not found in PATH.
echo Close this window and run setup.bat again.
pause
exit /b 1

:install_manual
echo.
echo Download Python 3.12: https://www.python.org/downloads/
echo IMPORTANT: check "Add Python to PATH" during install
start https://www.python.org/downloads/
pause
exit /b 1

:found_python
echo [OK] Found Python %PYTHON_VERSION%: %PYTHON_CMD%

:: =============================================
:: 5. Check version (need 3.11+)
:: =============================================
%PYTHON_CMD% -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>&1
if errorlevel 1 (
    for /f "tokens=2" %%v in ('%PYTHON_CMD% --version 2^>^&1') do set "pyver=%%v"
    echo.
    echo ERROR: Python 3.11 or newer required.
    echo Current version: %pyver%
    echo.
    echo Install Python 3.12: https://www.python.org/downloads/
    start https://www.python.org/downloads/
    pause
    exit /b 1
)

:: =============================================
:: 6. Check / install Git
:: =============================================
echo.
echo Checking Git...

where git >nul 2>&1
if not errorlevel 1 (
    echo [OK] Git found
    goto :check_git_repo
)

echo Git not found. Installing automatically...
echo.

set "GIT_INSTALLER=%TEMP%\git-install.exe"
set "GIT_URL=https://github.com/git-for-windows/git/releases/download/v2.54.0.windows.1/Git-2.54.0-64-bit.exe"

where curl >nul 2>&1
if not errorlevel 1 (
    curl -L -o "%GIT_INSTALLER%" "%GIT_URL%"
    goto :git_download_check
)

powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%GIT_URL%' -OutFile '%GIT_INSTALLER%' -UseBasicParsing"

:git_download_check
if not exist "%GIT_INSTALLER%" (
    echo [WARNING] Git download failed. Install manually:
    echo   https://git-scm.com/download/win
    echo   Setup will continue, but update.bat will not work.
    echo.
    goto :check_git_repo
)

echo Installing Git...
"%GIT_INSTALLER%" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"
del "%GIT_INSTALLER%" >nul 2>&1

set "PATH=%ProgramFiles%\Git\cmd;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

where git >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Git installed but not found in PATH.
    echo   Run setup.bat again or install manually.
    echo.
    goto :check_git_repo
)

echo [OK] Git installed
echo.

:check_git_repo

:: =============================================
:: 7. Check git repository (ZIP download → auto-convert)
:: =============================================
git rev-parse --git-dir >nul 2>&1
if not errorlevel 1 goto :git_repo_ok

echo.
echo This folder is not a git repository (probably ZIP download).
echo Auto-converting to git repository...
echo.
goto :auto_convert

echo.
echo Initializing git repository...
git init
if errorlevel 1 (
    echo [WARNING] git init failed.
    goto :git_repo_skip
)

git remote add origin https://github.com/dziameshkapavel/PDD_stat.git >nul 2>&1
echo Fetching from remote...
git fetch origin
if errorlevel 1 goto :git_repo_skip

git rev-parse --verify origin/main >nul 2>&1
if errorlevel 1 (
    git checkout -f -b master origin/master
) else (
    git checkout -f -b main origin/main
)
if errorlevel 1 goto :git_repo_skip

echo.
echo [OK] Folder converted to git repository.
echo.
goto :git_repo_ok

:git_repo_skip
echo.
echo [WARNING] Git repository not set up.
echo   update.bat will not work, but setup continues.
echo.

:git_repo_ok

:: =============================================
:: 8. Create virtual environment
:: =============================================
if not exist ".venv\" (
    echo.
    echo Creating virtual environment...
    %PYTHON_CMD% -m venv .venv
    if errorlevel 1 (
        echo.
        echo ERROR: failed to create virtual environment.
        Try running as Administrator.
        echo.
        pause
        exit /b 1
    )
) else (
    echo Virtual environment already exists
)

:: =============================================
:: 9. Activate and install dependencies
:: =============================================
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo.
    echo ERROR: failed to activate virtual environment.
    echo Try: rmdir /s /q .venv ^&^& setup.bat
    echo.
    pause
    exit /b 1
)

echo.
echo Upgrading pip...
python -m pip install --upgrade pip

echo.
echo Installing core packages...
pip install fastapi uvicorn pandas openpyxl jinja2 matplotlib numpy python-multipart scipy seaborn python-docx httpx pyyaml tabulate pyarrow
if errorlevel 1 (
    echo [ERROR] Core packages install failed. Check output above.
    pause
    exit /b 1
)

echo.
echo Installing stats packages...
pip install lifelines scikit-learn statsmodels scikit-survival autograd
if errorlevel 1 (
    echo [WARNING] Some stats packages failed. Survival analysis may be unavailable.
)

echo.
echo Installing autograd-gamma (required by lifelines on Windows)...
pip install autograd-gamma==0.4.2
if errorlevel 1 (
    echo [WARNING] autograd-gamma install failed.
    echo    This is required for Cox regression. Install manually:
    echo    pip install autograd-gamma==0.4.2
)

echo.
echo Installing shap...
pip install shap
if errorlevel 1 (
    echo [WARNING] shap install failed. Some features may be unavailable.
    echo    shap requires Python 3.12+ on Windows.
)

echo.
echo Installing dev tools...
pip install pytest pytest-asyncio pytest-timeout

:: =============================================
:: 10. Verify critical packages
:: =============================================
echo.
echo Verifying critical packages...

python -c "import fastapi; import pandas; import numpy; import matplotlib; import sklearn; print('[OK] Core packages installed')" 2>nul
if errorlevel 1 (
    echo [ERROR] Some core packages missing
    pause
    exit /b 1
)

python -c "import shap; print('[OK] shap installed')" 2>nul
if errorlevel 1 (
    echo [WARNING] shap not installed - some features unavailable
)

python -c "import sksurv; print('[OK] scikit-survival installed')" 2>nul
if errorlevel 1 (
    echo [WARNING] scikit-survival not installed - survival analysis unavailable
)

python -c "import autograd_gamma; print('[OK] autograd-gamma installed')" 2>nul
if errorlevel 1 (
    echo [WARNING] autograd-gamma not installed.
    echo    Cox regression will fail. Install manually:
    echo    pip install autograd-gamma==0.4.2
)

:: =============================================
:: Done
:: =============================================
echo.
echo ============================================
echo  Installation complete!
echo ============================================
echo.
echo  Run start.bat to launch the server
echo  Open http://127.0.0.1:8000 in browser
echo.
pause

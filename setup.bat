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
:: 2. Check for Microsoft Store fake aliases
:: =============================================
set "FAKE_PYTHON="

where python >nul 2>&1
if not errorlevel 1 (
    python --version >nul 2>&1
    if errorlevel 1 (
        set "FAKE_PYTHON=1"
        echo [!] Microsoft Store stub detected for python.exe
        echo     This is NOT real Python.
        echo.
        echo     To disable stubs:
        echo       Settings ^> Apps ^> Advanced app settings
        echo       ^> App execution aliases
        echo       Turn off "python.exe" and "python3.exe"
        echo.
    )
)

where py >nul 2>&1
if not errorlevel 1 (
    py --version >nul 2>&1
    if errorlevel 1 (
        set "FAKE_PYTHON=1"
        echo [!] Microsoft Store stub detected for py.exe
        echo.
    )
)

if defined FAKE_PYTHON (
    echo ============================================
    echo  Microsoft Store stubs are blocking Python.
    echo  Disable them and run setup.bat again.
    echo ============================================
    echo.
    pause
    exit /b 1
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

where winget >nul 2>&1
if not errorlevel 1 (
    echo  [A] Install Python 3.12 via winget (automatic)
    echo  [B] Open download page in browser
    echo.
    choice /c AB /m "Choose"
    if errorlevel 1 goto :install_winget
    if errorlevel 2 goto :install_manual
) else (
    goto :install_manual
)

:install_winget
echo.
echo Installing Python 3.12 via winget...
winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo.
    echo ERROR: winget failed to install Python.
    goto :install_manual
)
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
:: 6. Create virtual environment
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
:: 7. Activate and install dependencies
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
python -m pip install --upgrade pip >nul 2>&1

echo Installing dependencies (may take 2-5 minutes)...
echo.

pip install -r app\backend\requirements.txt
if errorlevel 1 (
    echo.
    echo ============================================
    echo  ERROR: dependency installation failed.
    echo ============================================
    echo.
    echo  Possible causes:
    echo  - No internet connection
    echo  - Missing admin privileges
    echo  - Old Python version (need 3.12+)
    echo.
    echo  Try manually:
    echo    .venv\Scripts\activate.bat
    echo    pip install -r app\backend\requirements.txt
    echo.
    pause
    exit /b 1
)

:: =============================================
:: 8. Verify critical packages
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
timeout /t 10 /nobreak >nul

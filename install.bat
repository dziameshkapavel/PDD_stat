@echo off
setlocal enabledelayedexpansion

echo ============================================
echo        PDD_STAT - Survival Analysis App
echo            Installer for Windows
echo ============================================
echo.

:: Step 1: Check Python
echo [1/5] Checking Python...
where python >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
    echo         Python found: !PYVER!
    goto :deps
)
echo         Python not found.
set /p INSTALLPY="Install Python 3.11 automatically? [Y/n]: "
if /i "!INSTALLPY!"=="n" (
    start https://python.org/downloads/
    pause >nul
    goto :checkpy
)
curl -L -o "%TEMP%\python-3.11.9-amd64.exe" "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
"%TEMP%\python-3.11.9-amd64.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1
call :refresh_path

:checkpy
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python not found.
    pause
    exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo         Python: !PYVER!

:: Step 2: Dependencies
:deps
echo.
echo [2/5] Installing dependencies...
python -m pip install --upgrade pip --quiet
pip install -r app\backend\requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)
echo         Done.

:: Step 3: Install path
echo.
echo [3/5] Choose install folder...
set "DEFAULT_PATH=%USERPROFILE%\PDD_STAT"
set /p INSTALL_PATH="Path [%DEFAULT_PATH%]: "
if "!INSTALL_PATH!"=="" set "INSTALL_PATH=!DEFAULT_PATH!"
if exist "!INSTALL_PATH!" (
    choice /c yn /n /m "Folder exists. Overwrite? [y/n]: "
    if errorlevel 2 exit /b 1
)

:: Step 4: Copy files
echo.
echo [4/5] Installing files...

:: Create folder structure
mkdir "!INSTALL_PATH!\app\backend\app\api"          2>nul
mkdir "!INSTALL_PATH!\app\backend\app\core"         2>nul
mkdir "!INSTALL_PATH!\app\backend\app\templates"    2>nul
mkdir "!INSTALL_PATH!\app\frontend\js\core"         2>nul
mkdir "!INSTALL_PATH!\app\frontend\js\models"       2>nul
mkdir "!INSTALL_PATH!\app\frontend\js\ui"           2>nul
mkdir "!INSTALL_PATH!\app\frontend\js\projects"     2>nul
mkdir "!INSTALL_PATH!\projects"                     2>nul

:: Copy app folder
xcopy "app\*" "!INSTALL_PATH!\app\" /E /I /Y /Q

:: Create empty active_project.txt
type nul > "!INSTALL_PATH!\app\backend\active_project.txt"

echo         Done.

:: Step 5: Create shortcut
echo.
echo [5/5] Creating start script and shortcut...

:: Start script
(
echo @echo off
echo cd /d "!INSTALL_PATH!\app\backend"
echo echo Starting PDD_STAT...
echo start http://127.0.0.1:8000
echo python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
echo pause
) > "!INSTALL_PATH!\start_backend.bat"

:: Desktop shortcut
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\PDD_STAT.lnk'); $Shortcut.TargetPath = '!INSTALL_PATH!\start_backend.bat'; $Shortcut.WorkingDirectory = '!INSTALL_PATH!'; $Shortcut.Save()" >nul 2>&1
echo         Done.

echo.
echo ============================================
echo   Installation complete!
echo   Double-click PDD_STAT on your desktop.
echo ============================================
pause
exit /b 0

:refresh_path
for /f "skip=2 tokens=1,2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USER_PATH=%%c"
for /f "skip=2 tokens=1,2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%c"
set "PATH=!USER_PATH!;!SYS_PATH!;%PATH%"
goto :eof
@echo off
chcp 65001 >nul 2>&1
title PDD_STAT
cd /d "%~dp0"

:: =============================================
:: Автоустановка если .venv нет
:: =============================================
if not exist ".venv\" (
    echo Первый запуск — выполняю установку...
    call setup.bat
    if errorlevel 1 (
        echo.
        echo Установка не удалась. Запустите setup.bat вручную.
        pause
        exit /b 1
    )
)

:: =============================================
:: Поиск Python (тот же алгоритм что и в setup.bat)
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
echo ОШИБКА: Python не найден.
echo Запустите setup.bat для установки.
echo.
pause
exit /b 1

:start_found

:: =============================================
:: Активация venv
:: =============================================
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo.
    echo ОШИБКА: виртуальное окружение повреждено.
    echo Запустите setup.bat заново.
    echo.
    pause
    exit /b 1
)

cd app\backend

echo ============================================
echo  PDD_STAT — сервер запущен
echo  Откройте: http://127.0.0.1:8000
echo  Ctrl+C для остановки
echo ============================================

:: Открыть браузер
start "" http://127.0.0.1:8000

:: Запустить сервер
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

echo.
echo Сервер остановлен.
pause

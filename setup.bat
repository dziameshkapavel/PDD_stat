@echo off
chcp 65001 >nul
title PDD_STAT — Установка
cd /d "%~dp0"

echo ============================================
echo  PDD_STAT v3 — установка
echo ============================================
echo.

:: 1. Проверка разрядности
if "%PROCESSOR_ARCHITECTURE%"=="x86" (
    if not defined PROCESSOR_ARCHITEW6432 (
        echo ОШИБКА: PDD_STAT требует 64-разрядную версию Python.
        echo Скачайте 64-bit Python с https://www.python.org/downloads/
        start https://www.python.org/downloads/
        pause
        exit /b 1
    )
)

:: 2. Проверка Python (сначала py, потом python)
set PYTHON_CMD=
where py >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py -3.11
) else (
    where python >nul 2>&1
    if not errorlevel 1 (
        set PYTHON_CMD=python
    )
)

if not defined PYTHON_CMD (
    echo Python не найден.
    echo.
    echo 1. Скачайте Python 3.11 (или новее) 64-bit:
    echo    https://www.python.org/downloads/
    echo.
    echo 2. В установщике ОБЯЗАТЕЛЬНО отметьте "Add Python to PATH"
    echo 3. Запустите setup.bat снова
    echo.
    start https://www.python.org/downloads/
    pause
    exit /b 1
)

:: 3. Проверка версии (нужна 3.11+)
%PYTHON_CMD% -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>&1
if errorlevel 1 (
    for /f "tokens=2" %%v in ('%PYTHON_CMD% --version 2^>^&1') do set pyver=%%v
    echo ОШИБКА: Требуется Python 3.11 или новее.
    echo Текущая версия: %pyver%
    echo Скачайте: https://www.python.org/downloads/
    start https://www.python.org/downloads/
    pause
    exit /b 1
)

echo Найден: %PYTHON_CMD%

:: 4. Создание виртуального окружения
if not exist ".venv\" (
    echo Создаю виртуальное окружение...
    %PYTHON_CMD% -m venv .venv
    if errorlevel 1 (
        echo ОШИБКА: не удалось создать виртуальное окружение
        pause
        exit /b 1
    )
) else (
    echo Виртуальное окружение уже существует
)

:: 5. Установка зависимостей
echo Устанавливаю зависимости...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo ОШИБКА: не удалось активировать виртуальное окружение
    pause
    exit /b 1
)

python -m pip install --upgrade pip >nul
pip install -r app\backend\requirements.txt
if errorlevel 1 (
    echo.
    echo ⚠ Некоторые пакеты не установились.
    echo Попробуйте установить вручную:
    echo   .venv\Scripts\activate.bat
    echo   pip install -r app\backend\requirements.txt
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Установка завершена!
echo  Запустите start.bat для старта сервера
echo ============================================
timeout /t 5 /nobreak >nul

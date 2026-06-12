@echo off
chcp 65001 >nul 2>&1
title PDD_STAT — Установка
cd /d "%~dp0"

echo ============================================
echo  PDD_STAT — Установка
echo ============================================
echo.

:: =============================================
:: 1. Проверка разрядности
:: =============================================
if "%PROCESSOR_ARCHITECTURE%"=="x86" (
    if not defined PROCESSOR_ARCHITEW6432 (
        echo ОШИБКА: PDD_STAT требует 64-разрядную версию Windows.
        echo.
        pause
        exit /b 1
    )
)

:: =============================================
:: 2. Проверка Microsoft Store aliases (заглушки)
:: =============================================
set "FAKE_PYTHON="

where python >nul 2>&1
if not errorlevel 1 (
    python --version >nul 2>&1
    if errorlevel 1 (
        set "FAKE_PYTHON=1"
        echo [!] Обнаружена заглушка Microsoft Store для Python.
        echo     Это НЕ настоящий Python.
        echo.
        echo     Чтобы отключить заглушки:
        echo     1. Откройте Параметры Windows
        echo     2. Приложения ^> Дополнительные параметры приложений
        echo     3. Управление параметрами запуска приложений
        echo     4. Выключите "python.exe" и "python3.exe"
        echo.
    )
)

where py >nul 2>&1
if not errorlevel 1 (
    py --version >nul 2>&1
    if errorlevel 1 (
        set "FAKE_PYTHON=1"
        echo [!] Обнаружена заглушка Microsoft Store для py.exe.
        echo.
    )
)

if defined FAKE_PYTHON (
    echo ============================================
    echo  Заглушки Microsoft Store мешают работе.
    echo  Отключите их и запустите setup.bat заново.
    echo ============================================
    echo.
    pause
    exit /b 1
)

:: =============================================
:: 3. Поиск настоящего Python (3.12 -> 3.11 -> 3.13)
:: =============================================
set "PYTHON_CMD="
set "PYTHON_VERSION="

echo Поиск Python...

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
:: 4. Python не найден — предлагаем установить
:: =============================================
echo.
echo ============================================
echo  Python НЕ НАЙДЕН на этом компьютере.
echo ============================================
echo.
echo  Рекомендуется Python 3.12 (все пакеты ставятся без компиляции).
echo.

where winget >nul 2>&1
if not errorlevel 1 (
    echo  [A] Установить Python 3.12 автоматически через winget
    echo  [B] Открыть страницу скачивания вручную
    echo.
    choice /c AB /m "Выберите вариант"
    if errorlevel 1 goto :install_winget
    if errorlevel 2 goto :install_manual
) else (
    goto :install_manual
)

:install_winget
echo.
echo Устанавливаю Python 3.12 через winget...
winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo.
    echo ОШИБКА: winget не смог установить Python.
    goto :install_manual
)
echo.
echo Python установлен! Обновляю PATH...
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
echo Python установлен, но не находится в PATH.
echo Закройте окно и запустите setup.bat заново.
pause
exit /b 1

:install_manual
echo.
echo Скачайте Python 3.12: https://www.python.org/downloads/
echo При установке ОБЯЗАТЕЛЬНО отметьте "Add Python to PATH"
start https://www.python.org/downloads/
pause
exit /b 1

:found_python
echo [OK] Найден Python %PYTHON_VERSION%: %PYTHON_CMD%

:: =============================================
:: 5. Проверка версии (нужна 3.11+)
:: =============================================
%PYTHON_CMD% -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>&1
if errorlevel 1 (
    for /f "tokens=2" %%v in ('%PYTHON_CMD% --version 2^>^&1') do set "pyver=%%v"
    echo.
    echo ОШИБКА: Требуется Python 3.11 или новее.
    echo Текущая версия: %pyver%
    echo.
    echo Установите Python 3.12: https://www.python.org/downloads/
    start https://www.python.org/downloads/
    pause
    exit /b 1
)

:: =============================================
:: 6. Создание виртуального окружения
:: =============================================
if not exist ".venv\" (
    echo.
    echo Создаю виртуальное окружение...
    %PYTHON_CMD% -m venv .venv
    if errorlevel 1 (
        echo.
        echo ОШИБКА: не удалось создать виртуальное окружение.
        echo Попробуйте запустить от имени администратора.
        echo.
        pause
        exit /b 1
    )
) else (
    echo Виртуальное окружение уже существует
)

:: =============================================
:: 7. Активация и установка зависимостей
:: =============================================
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo.
    echo ОШИБКА: не удалось активировать виртуальное окружение.
    echo Попробуйте: rmdir /s /q .venv ^&^& setup.bat
    echo.
    pause
    exit /b 1
)

echo.
echo Устанавливаю pip...
python -m pip install --upgrade pip >nul 2>&1

echo Устанавливаю зависимости (это может занять 2-5 минут)...
echo.

pip install -r app\backend\requirements.txt
if errorlevel 1 (
    echo.
    echo ============================================
    echo  ОШИБКА при установке зависимостей.
    echo ============================================
    echo.
    echo  Возможные причины:
    echo  - Нет подключения к интернету
    echo  - Нет прав администратора
    echo  - Старая версия Python (нужна 3.12+)
    echo.
    echo  Попробуйте вручную:
    echo    .venv\Scripts\activate.bat
    echo    pip install -r app\backend\requirements.txt
    echo.
    pause
    exit /b 1
)

:: =============================================
:: 8. Проверка критических пакетов
:: =============================================
echo.
echo Проверяю установку критических пакетов...

python -c "import fastapi; import pandas; import numpy; import matplotlib; import sklearn; print('[OK] Базовые пакеты установлены')" 2>nul
if errorlevel 1 (
    echo [ОШИБКА] Некоторые базовые пакеты не установлены
    pause
    exit /b 1
)

python -c "import shap; print('[OK] shap установлен')" 2>nul
if errorlevel 1 (
    echo [ПРЕДУПРЕЖДЕНИЕ] shap не установлен - некоторые функции недоступны
)

python -c "import sksurv; print('[OK] scikit-survival установлен')" 2>nul
if errorlevel 1 (
    echo [ПРЕДУПРЕЖДЕНИЕ] scikit-survival не установлен - анализ выживаемости недоступен
)

:: =============================================
:: Готово
:: =============================================
echo.
echo ============================================
echo  Установка завершена!
echo ============================================
echo.
echo  Запустите start.bat для старта сервера
echo  Откройте http://127.0.0.1:8000 в браузере
echo.
timeout /t 10 /nobreak >nul

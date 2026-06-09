@echo off
chcp 65001 >nul
title PDD_STAT — Обновление
cd /d "%~dp0"

echo ============================================
echo  PDD_STAT — проверка обновлений
echo ============================================
echo.

:: Проверка Git
where git >nul 2>&1
if errorlevel 1 (
    echo Git не найден. Скачайте с https://git-scm.com/download/win
    echo Или скачайте новую версию архива вручную.
    start https://git-scm.com/download/win
    pause
    exit /b 1
)

:: Обновление
echo Получаю обновления из репозитория...
git pull
if errorlevel 1 (
    echo Ошибка при получении обновлений.
    echo Проверьте подключение к интернету.
    pause
    exit /b 1
)

:: Обновление зависимостей
if exist ".venv\" (
    echo Обновляю зависимости...
    call .venv\Scripts\activate.bat
    pip install -r app\backend\requirements.txt
)

echo.
echo ============================================
echo  Обновление завершено!
echo ============================================
timeout /t 3 /nobreak >nul

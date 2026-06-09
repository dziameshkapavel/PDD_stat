@echo off
chcp 65001 >nul
title PDD_STAT
cd /d "%~dp0"

:: Auto-setup if needed
if not exist ".venv\" (
    echo Первый запуск — выполняю установку...
    call setup.bat
    if errorlevel 1 (
        echo Установка не удалась.
        pause
        exit /b 1
    )
)

call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo Виртуальное окружение повреждено. Запустите setup.bat заново.
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

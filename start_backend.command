#!/bin/bash
cd "$(dirname "$0")"

echo "PDD_STAT — запуск сервера..."

# Try Docker first
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    echo "Docker detected — using docker compose"
    docker compose up -d --build
    if [ $? -eq 0 ]; then
        sleep 2
        open http://127.0.0.1:8000
        echo "Server running at http://127.0.0.1:8000"
        echo "Stop with: docker compose down"
        exit 0
    fi
    echo "Docker failed — falling back to local server"
fi

# Auto-setup if needed
if [ ! -d ".venv" ]; then
    echo "Первый запуск — выполняю установку..."
    bash setup_mac.command
    if [ $? -ne 0 ]; then
        echo "Установка не удалась."
        exit 1
    fi
fi

# Activate virtual environment
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif [ -f "app/backend/.venv311/bin/activate" ]; then
    # Backward compatibility with old setup
    source app/backend/.venv311/bin/activate
else
    echo "ОШИБКА: виртуальное окружение не найдено."
    echo "Запустите: bash setup_mac.command"
    exit 1
fi

cd app/backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
sleep 2
open http://127.0.0.1:8000
echo "Server running at http://127.0.0.1:8000"
echo "Press Ctrl+C to stop"
wait

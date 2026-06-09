#!/bin/bash
cd "$(dirname "$0")"

echo "============================================"
echo " PDD_STAT v3 — установка"
echo "============================================"
echo ""

# 1. Поиск Python 3.11+
PYTHON=""
for cmd in python3.12 python3.11 python3.10 python3; do
    if command -v "$cmd" &>/dev/null; then
        ver=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
        major="${ver%.*}"
        minor="${ver#*.}"
        if [ "$major" -ge 3 ] && [ "$minor" -ge 11 ]; then
            PYTHON="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo "Python 3.11+ не найден."
    echo ""
    echo "Установите через Homebrew (рекомендуется):"
    echo "  brew install python@3.11"
    echo ""
    echo "Или скачайте с python.org:"
    echo "  https://www.python.org/downloads/"
    echo ""
    command -v brew &>/dev/null && brew install python@3.11 && {
        for cmd in python3.12 python3.11 python3.10 python3; do
            if command -v "$cmd" &>/dev/null && "$cmd" -c "import sys; exit(0 if sys.version_info>=(3,11) else 1)" 2>/dev/null; then
                PYTHON="$cmd"
                break
            fi
        done
    }
fi

if [ -z "$PYTHON" ]; then
    echo "Python 3.11+ не установлен."
    echo "Установите и запустите setup_mac.command снова."
    open "https://www.python.org/downloads/"
    exit 1
fi

echo "Найден: $($PYTHON --version)"

# 2. Создание виртуального окружения
if [ ! -d ".venv" ]; then
    echo "Создаю виртуальное окружение..."
    $PYTHON -m venv .venv
    if [ $? -ne 0 ]; then
        echo "ОШИБКА: не удалось создать виртуальное окружение"
        exit 1
    fi
else
    echo "Виртуальное окружение уже существует"
fi

# 3. Установка зависимостей
echo "Устанавливаю зависимости..."
source .venv/bin/activate
if [ $? -ne 0 ]; then
    echo "ОШИБКА: не удалось активировать виртуальное окружение"
    exit 1
fi

python -m pip install --upgrade pip
pip install -r app/backend/requirements.txt
if [ $? -ne 0 ]; then
    echo ""
    echo "Предупреждение: некоторые пакеты не установились."
    echo "Попробуйте вручную:"
    echo "  source .venv/bin/activate"
    echo "  pip install -r app/backend/requirements.txt"
    exit 1
fi

# 4. Права на запуск
chmod +x start_backend.command 2>/dev/null
chmod +x update_mac.command 2>/dev/null

echo ""
echo "============================================"
echo " Установка завершена!"
echo " Запустите start_backend.command"
echo "============================================"

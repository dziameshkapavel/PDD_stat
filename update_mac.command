#!/bin/bash
cd "$(dirname "$0")"

echo "============================================"
echo " PDD_STAT — проверка обновлений"
echo "============================================"
echo ""

# Проверка Git
if ! command -v git &>/dev/null; then
    echo "Git не найден."
    echo "Установите: brew install git"
    echo "Или: xcode-select --install"
    echo "Или скачайте новую версию архива вручную."
    exit 1
fi

# Обновление
echo "Получаю обновления из репозитория..."
git pull
if [ $? -ne 0 ]; then
    echo "Ошибка при получении обновлений."
    echo "Проверьте подключение к интернету."
    exit 1
fi

# Обновление зависимостей
if [ -d ".venv" ]; then
    echo "Обновляю зависимости..."
    source .venv/bin/activate
    pip install -r app/backend/requirements.txt
fi

echo ""
echo "============================================"
echo " Обновление завершено!"
echo "============================================"

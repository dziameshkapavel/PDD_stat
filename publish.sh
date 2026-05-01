#!/bin/bash
cd "$(dirname "$0")"

echo "=== PDD_STAT Publisher ==="
echo "Publishing to GitHub..."

# Добавляем все изменения
git add -A

# Спрашиваем описание обновления
echo ""
echo "What changed in this version?"
read -p "> " message

# Коммитим
git commit -m "$message"

# Пушим
git push origin main

echo ""
echo "Done! Users can now download the update."

# PDD STAT

Веб-приложение для статистического анализа медицинских данных.  
FastAPI backend + vanilla JS frontend.

## Быстрый старт (Docker)

```bash
# 1. Клонировать
git clone https://github.com/dziameshkapavel/PDD_stat
cd PDD_stat

# 2. Запустить
docker compose up -d --build

# 3. Открыть в браузере
open http://localhost:8000
```

## Локальный запуск (без Docker)

```bash
cd app/backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Production

```bash
# Использовать gunicorn с несколькими workers
PDD_STAT_API_KEY=my-secret docker compose up -d
```

См. [User Guide](USER_GUIDE_RU.md) для деталей использования.

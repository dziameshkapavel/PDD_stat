# PDD_STAT — Agent Guide

Язык общения: **русский**.

## Architecture

- **Backend**: FastAPI (Python), entrypoint `app/backend/app/main.py:8`. 3 API routers mounted under `/api/`: `projects`, `analysis`, `ai`.
- **Frontend**: Vanilla HTML/CSS/JS at `app/frontend/` — served as static files by backend. SPA fallback: any unmatched path returns `index.html`.
- **Core logic** in `app/backend/app/core/` (8 modules + `ai/` subpackage): `executor.py`, `modeling_orchestrator.py`, `project_manager.py`, `data_loader.py`, `rule_engine.py`, `cox_selector.py`, and `ai/` with `prompt_manager.py`, `context_builder.py`, `response_validator.py`, `ai_clients.py`.
- **`app/backend/app/services/`** and **`app/backend/app/models/`** are empty — only `core/` has real code.
- **Projects** stored in `projects/<name>/` with subdirs: `data/`, `state/`, `outputs/`, `plots/`, `logs/`.

## Production readiness (2026-06-07)

### Что сделано
| Компонент | Статус |
|-----------|--------|
| **pyproject.toml** | ✅ ruff, pytest, mypy конфигурация |
| **ruff linter** | ✅ 0 ошибок, все файлы чисты |
| **CI/CD** (GitHub Actions) | ✅ `.github/workflows/ci.yml` — lint + test |
| **API-тесты** | ✅ 20 тестов (health, projects, analysis, AI, frontend, plots) |
| **Dockerfile** | ✅ Python 3.11-slim, healthcheck |
| **docker-compose** | ✅ API key, volumes, restart policy |
| **Auth middleware** | ✅ `app/core/auth.py` — X-API-Key опционально |
| **Python 3.9→3.11** | ✅ `pyproject.toml` requires>=3.11, Docker 3.11-slim |

### Что не хватает до продакшена
- **Мониторинг/алертинг** — Sentry/Prometheus не подключены
- **Backup strategy** — проекты в файлах, бекапов нет
- **Аутентификация** — API key опциональна, нет RBAC

### Результаты нагрузочного тестирования (2026-06-07)

Данные: 190 строк, 22 колонки. Инструмент: `load_test.py` (asyncio + aiohttp).

| Сценарий | Concurrency | Throughput | P50 | P95 | Ошибки |
|---|---|---|---|---|---|
| health (лёгкий GET) | 10 | 1726 req/s | 0.4ms | 1.1ms | 0 |
| **Mixed (7 эндпоинтов)** | **8** | **48 req/s** | **225ms** | **278ms** | **0** |
| descriptive_stats | 10 | 18 req/s | 589ms | 633ms | 0 |
| categorical | 10 | 18 req/s | 592ms | 744ms | 0 |
| **cox_ph (тяжёлый)** | **10** | **5 req/s** | **2.0s** | **2.1s** | **0** |

**Выводы:**
- 0 ошибок на 380+ запросах — API стабилен
- Узкое место: один worker uvicorn'а (CPU-bound ~200ms/call)
- С `gunicorn -w 4` ожидается ~20 req/s для cox, ~192 req/s mixed
- Read-only эндпоинты (health, projects) имеют latency <3ms без конкуренции

**Рекомендация**: в production использовать `gunicorn -k uvicorn.workers.UvicornWorker -w 4`.

### Файлы инфраструктуры

| Файл | Назначение |
|------|-----------|
| `Dockerfile` | Сборка контейнера |
| `docker-compose.yml` | Оркестрация |
| `.github/workflows/ci.yml` | CI/CD |
| `pyproject.toml` | ruff, pytest, mypy |
| `app/backend/app/core/auth.py` | API key middleware |

## Start commands

```bash
cd app/backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Open `http://127.0.0.1:8000`. No frontend build step.  
On macOS: `open start_backend.command` (backgrounds server + opens browser).

Docker:
```bash
docker compose up -d --build
```

## Key execution flow

1. UI → `POST /api/analysis/run` with `template` + `params`
2. `ModelingOrchestrator` renders Jinja2 from `app/backend/app/templates/*.py.jinja` (template name = filename minus `.py.jinja`, e.g. `logistic`)
3. Generated Python code is `exec()`-ed via `Executor` with controlled namespace (`df`, `pd`, `np`, `plt`, `save_plot`, `get_label`, `fmt_p`, `CoxVariableSelector`)
4. Results returned as JSON; metrics extracted from `<!-- JSON_METRICS_START -->...<!-- JSON_METRICS_END -->` comments in output

## Conventions & quirks

- **CI**: GitHub Actions (`.github/workflows/ci.yml`) — ruff lint + pytest. **Linter**: ruff, 0 errors. **Tests**: 58 тестов (38 unit + 20 API). **Typechecker**: нет.
- Backend comments and strings are **in Russian**.
- `plt.show()`/`plt.figure()` calls are auto-stripped before execution; use `save_plot(name)` to save to `plots/*.png`.
- Active project tracked in `app/backend/app/active_project.txt` (written by projects API, read by `main.py` for `/plots/{filename}` serving).  
  There is also a stale `app/backend/active_project.txt` at the backend root — **unused** by code, ignore it.
- Plot files served via `GET /plots/{filename}` — reads from active project's `plots/` dir.
- **AI module**: `app/backend/app/core/ai/` — `prompt_manager.py` (YAML-промпты из `app/backend/prompts/`, hot reload), `context_builder.py` (только последний анализ + датасет), `response_validator.py` (анти-галлюцинации, auto-retry), `ai_clients.py` (Ollama/Groq). `api/ai.py` — тонкий контроллер (228 строк, без бизнес-логики).

## Dependencies

`app/backend/requirements.txt`. Key packages: FastAPI, uvicorn, pandas, matplotlib, numpy, lifelines, scikit-learn, statsmodels, shap, scikit-survival, seaborn, python-docx, jinja2, httpx, pyarrow, openpyxl, autograd, autograd-gamma.

## Persistence

| What | Where | Format |
|------|-------|--------|
| Clean data | `state/project_data.parquet` | Parquet (snappy) |
| Raw upload | `state/raw.parquet` | Parquet (snappy) |
| Analysis history | `state/analysis_history.json` | JSON |
| Variable labels | `state/variable_labels.json` | JSON |
| AI config | `state/ai_config.json` | JSON |
| Project context | `state/project_context.json` | JSON |
| Reports | `state/reports/` | `.docx` / `.html` |
| Data audit | `state/data_audit_pre.json` | JSON |
| Schema | `state/schema.json` | JSON |
| Plots | `plots/*.png` | PNG |

## Data loading

`DataLoader` supports `.xlsx`, `.xls`, `.csv`, `.tsv`, `.parquet`, `.txt`. For Excel with multiple sheets, auto-selects best sheet by row×col score with priority keywords (`data`, `raw`, `main`, `sheet1`). Auto-drops columns starting with `INFO_`, `CHECK_`, `PARAMS_`, `Unnamed`. Normalizes empty-string/NaN to `pd.NA`.

## Cleaning pipeline

`POST /api/projects/upload` → runs `rule_engine` classification (roles: HIGH_MISSING, CONSTANT, IDENTIFIER, TECHNICAL_ARTIFACT) → caches plan → `POST /api/projects/clean` applies it and saves to `project_data.parquet`.

## Template metrics injection

Templates emit structured metrics via printed JSON between `<!-- JSON_METRICS_START -->` and `<!-- JSON_METRICS_END -->`. The AI system prompt (`app/backend/app/api/ai.py`) builds context from `prompts/` YAML and last analysis history via `ContextBuilder`. Metric parsing is in `app/backend/app/core/ai/`. Keys: `coefficients`, `model_steps`, `schoenfeld_test`, `vif`, `hosmer_lemeshow`, `feature_importance`, `time_auc`, `dca_net_benefit`, etc.

## AI Module — ResponseValidator details

`app/backend/app/core/ai/response_validator.py` — ключевые моменты:

### Number extraction (`parse_numbers`)
- Извлекает числа с метками: `hr`, `or`, `beta`, `p_value`, `c_index`, `auc`, `percentage`, `ci`
- Пропускает `p_value=0.05` (это порог значимости `p<0.05`, а не реальное p-value)
- Паттерн `ci` извлекает оба числа из CI-диапазона (`0.11-0.36` → два числа)
- Два числа из одного match.group(0) не дублируются в ошибках (через `seen_raw`)

### Number validation (`_check_number_in_source`)
- Абсолютный допуск ±0.01 **и** относительный ±1% (для больших значений)
- Source-метрики извлекаются через `_flatten_metrics()` с ключами: `hr, or, p_value, coef, ci_low, ci_high, ci_lower, ci_upper, value`
- **Внимание**: шаблоны Cox создают поля `ci_lower`/`ci_upper`, а некоторые другие — `ci_low`/`ci_high` — поддерживаются оба

### P-value interpretation (`_check_p_value_interpretation`)
- Извлекает предложение, содержащее p-value (через `_extract_sentence` с разделителями `. ` / `.\n` / `! ` / `? `)
- SIGNIFICANCE_PATTERNS_RU: только `(статистически\\s+значим|значим[аяоы]|достоверн)` — **не** реагирует на `связан`/`ассоциирован`/`обнаружен` (они не подразумевают стат. значимость)
- SIGNIFICANCE_PATTERNS_EN: только `(statistically\\s+significant)` — удалены `associated`/`related`/`linked`/`predictor`
- NEGATION_PATTERNS_RU: `\\bне\\b` — любое "не" в предложении считается отрицанием
- NEGATION_PATTERNS_EN: `not\\s+significant|non.significant|no\\s+(?:association|relationship)`
- При `p<0.05` с отрицанием И значимостью → ошибка (говорит "не значим", а должно быть "значим")
- При `p>=0.05` с значимостью И без отрицания → ошибка (говорит "значим", а должно быть "не значим")

### Auto-retry (`auto_retry`)
- До 2 попыток исправления с сохранением полного контекста разговора
- Correction prompt на языке пользователя (определяется по наличию кириллицы в сообщениях)
- Если после retry ошибки остаются — возвращается последний ответ с validation notice

### Validation notice (`add_validation_notice`)
- Добавляет в конец ответа: "✅ Проверено: X/Y чисел совпадают с источником" (ru/en)
- Не добавляется, если `numbers_checked == 0`

### CI completeness (`_check_ci_completeness`)
- Проверяет, что при упоминании HR/OR указан 95% CI в том же предложении

### Known limitations (model-level, not code bugs)
- qwen2.5-coder:7b иногда галлюцинирует 95% CI для C-index (не сохраняется в метриках Cox)
- Модель иногда конвертирует p-value в проценты (p=0.003 → "0.3%") — валидатор ловит
- Auto-retry может не исправить ошибки, если модель упорствует — validation notice предупреждает пользователя

## Fixes applied during testing (2026-06-06)

1. **response_validator.py**: Узкие SIGNIFICANCE_PATTERNS (убраны `связан`, `ассоциирован`, `обнаружен`, `является предиктор`, `влияет` для RU; `associated`, `related`, `linked`, `predictor` для EN)
2. **response_validator.py**: NEGATION_PATTERNS_RU упрощён до `\\bне\\b` (ловит `не имеет`, `не является`, `не обнаружено`)
3. **response_validator.py**: `_flatten_metrics` теперь ищет `ci_lower`/`ci_upper` (шаблон Cox) + `ci_low`/`ci_high` (другие шаблоны)
4. **response_validator.py**: `parse_numbers` фильтрует p_value=0.05 (ложные срабатывания от `p<0.05`)
5. **response_validator.py**: `ci` паттерн для извлечения чисел из CI-диапазонов; `seen_raw` предотвращает дублирование
6. **response_validator.py**: Паттерн `c_index` исправлен на `[^0-9]*?` (пропускает русские слова между меткой и числом)
7. **ai_clients.py**: Добавлен `_safe_str()` для всех error-путей (защита от ASCII encoding error с не-ASCII данными)
8. **ai_clients.py**: `GroqClient.__init__` санирует api_key (обрезает не-ASCII символы, например `••••••••` из фронтенда)
9. **ai_clients.py**: `traceback` импортирован на уровне модуля (был только в except-блоках)
10. **config file**: Очищен `api_key` в `ai_config.json` (был `••••••••` вместо пустой строки)
11. **response_validator.py** (сессия 2026-06-06):
    - `_filter_hallucinated_ci()` — удаляет галлюцинированный 95% CI для C-index, если в метриках нет CI-полей
    - Auto-retry: `"Не извиняйся, не начинай с 'Прошу прощения'"`
    - `parse_numbers` — `seen_raw` заменён на `seen_keys` с кортежем `(label, gi, match.group(0))` (чинит CI-dedup)
    - `NUM_PATTERNS["c_index"]` — добавлен `C-индекс` для кириллицы
    - `_flatten_metrics` — список теперь с индексами `steps[0].coef` вместо `steps[].coef`
    - Docstring: `\geq` → `>=` (DeprecationWarning fix)

## Tests

`app/backend/tests/test_response_validator.py` — 38 тестов (unit). `app/backend/tests/test_api.py` — 20 тестов (API). Всего **58 тестов**. Запуск:
```bash
cd /Users/pdd/STAT_new/app/backend && python3 -m pytest tests/ -v
```

Покрытие unit-тестов: parse_numbers (HR, OR, CI, C-index, p-value, AUC, beta), p-value interpretation (RU/EN), CI completeness, flatten_metrics, filter_hallucinated_ci, validate (passed/hallucinated/forbidden/cindex-ci), detect_language, validation_notice (RU/EN/zero).
Покрытие API-тестов: health, projects CRUD, analysis run, AI config, frontend SPA fallback, plots serving.

### Template Test Harness

`/var/folders/sd/wlnzq2bd58qfgwl_mwcws_bm0000gn/T/opencode/harness.py` — прогоняет 19 шаблонов на данных проекта `Пэт` (190 строк, 21 колонка). 50 раундов с auto-fix. Запуск:
```bash
python3 /var/folders/sd/wlnzq2bd58qfgwl_mwcws_bm0000gn/T/opencode/harness.py
```

Итог 07.06.2026: **19/19 шаблонов, score=1.000** (все параметры проходят). Исключён из тестов `individual_prediction` (требует предобученной модели).

**Найденные проблемы (не баги)**:
- `numeric_compare` использует `value`/`group` (а не `value_col`/`group_col`) — так фронтенд отправляет, не менять
- `random_forest` — только классификация (нет `RandomForestRegressor`), тест с регрессией удалён
- `individual_prediction` — требует `model_path` + `patient_data`, не тестируется автоматически

## Logging

`app/backend/app/main.py` — `logging.basicConfig` в `pdd_stat_YYYYMMDD.log`. Middleware логирует все HTTP запросы с методом, путём, статусом и временем. Глобальный exception handler логирует 500 ошибки с traceback.

## AI Providers

| Provider | Status | Models |
|----------|--------|--------|
| Ollama | ✅ Работает | `qwen2.5-coder:7b` (default), `gemma4:e4b` |
| Groq | ✅ Работает | `llama-3.3-70b-versatile` (текущая), `llama-3.1-8b-instant` |

**Groq:** старые имена моделей (`llama3-70b-8192`) не работают. Актуальный список получать через `POST /api/ai/test`.

## Frontend

- `app/frontend/js/models/aiChat.js` — таймер ожидания (показывает секунды рядом с typing indicator)
- `app/frontend/index.html` — без tool-шаблонов (удалены в Session 4)
- Нет build step, файлы отдаются как static files

## Bug hunt session 3 (2026-06-06) — 5-round sweep

### R1: Template & core logic bugs — 10 found, 6 critical fixed

| # | File | Line | Bug | Fix |
|---|------|------|-----|-----|
| 1 | `random_forest.py.jinja` | 88 | `y.nunique()` crash on numpy array | `len(set(y))` |
| 2 | `logistic.py.jinja` | 8 | Missing `LabelEncoder` import with categorical target | Added import |
| 3 | `numeric_compare.py.jinja` | 89–90 | `levene()`/`bartlett()` crash on groups < 2 | try/except |
| 4 | `kaplan_meier.py.jinja` | ~100 | Logrank aggregation in stratified analysis | `map` tuple keys |
| 5 | `kaplan_meier.py.jinja` | ~120 | `n_groups` overwritten by stratified path | `setdefault` |
| 6 | `kaplan_meier.py.jinja` | ~195 | `median_survival` same pattern as n_groups | `setdefault` |
| 7 | `descriptive_stats.py.jinja` | — | False positive — no make_json_serializable exists | None needed |
| 8 | `spline_analysis.py.jinja` | 280,286 | Division by zero on `scaler.scale_ == 0` | Guard `if scaler.scale_[*] != 0` |
| 9 | `numeric_compare.py.jinja` | 205 | Double `shapiro()` call (overwrote result) | Single call with walrus `:=` |
| 10 | `kaplan_meier.py.jinja` | 17 | Duplicate `import json` (lines 10 + 17) | Removed line 17 |

### R2: Survival templates — 10/10 test cases

| Template | Cases | Status |
|----------|-------|--------|
| `random_survival_forest` | normal, single cov, empty cov | ✅ |
| `survival_evaluation` | normal, empty preds, no time/event | ✅ |
| `kaplan_meier` | stratified, single, full (CI+type) | ✅ |
| `spline_analysis` | normal | ✅ |

### R3: Boundary conditions — all pass, 3 false alarms

| Test | Expected | Actual | Verdict |
|------|----------|--------|---------|
| Cox 6 covariates | fail | success | Not a bug — data had 6 clean columns |
| ROC self-predict | fail | success | AUC=None, no crash — user chose this |
| Chart bad type | fail | success | Defaults to histogram — graceful fallback |

### R4: API security — no bugs found

- **SQL injection**: blocked by URL encoding
- **Path traversal**: 404 instead of 400 (low severity, actually blocks access)
- **XSS/large payloads**: handled (timeouts from Ollama, not app)
- **Zero ID**: ✅ 404
- **Bad template name**: ✅ 400
- **Wrong HTTP method**: ✅ 404 (FastAPI default)
- **Empty JSON body**: ✅ 422 (Pydantic validation)
- **Concurrent project create**: ✅ race handled

### R5: Cross-feature integration — all clean

- **State pollution** ✅: project A analysis not visible from project B
- **No active project** ✅: analysis returns proper error
- **AI chat with context** ✅: only last analysis + dataset in context
- **History after delete** ✅: deleted project's history doesn't pollute others
- **Upload nonexistent** ✅: fails correctly
- **Clean without data** ✅: HTTP 400
- **Labels persistence** ✅: surviving project open/close cycles
- **Report gen** ✅: requires mandatory fields (Pydantic)
- **Schema endpoints** ✅: works after switching to valid project
- **AI config save/load** ✅: persists correctly

### Overall verdict

- 5 rounds completed, 0 remaining open bugs
- 10 template source bugs found and fixed
- API security surface clean (no injection, no XSS, no path traversal)
- State isolation between projects verified
- All 20+ templates produce valid output
- Full pipeline (create → upload → clean → analyze → AI → report) works end-to-end

## 2026-06-07 Session 4: Refactoring — AI as consultant only

### Что изменилось

Удалена система tool calling. AI теперь работает **только как консультант**:

| Было | Стало |
|------|-------|
| Tool loop (до 5 итераций) | Один вызов LLM, без тулов |
| 7 инструментов (включая `run_analysis`) | Нет инструментов |
| Permission Manager + 7 эндпоинтов | Удалены |
| `confirm_tool`, `ask_response` | Удалены |
| Диалоги подтверждения / ask_user | Удалены |
| Column validation + auto-retry | Удалены |
| `tools.py` (467 строк, схемы + хендлеры) | `tools.py` (только TEMPLATE_DESCRIPTIONS + TEMPLATE_PARAMS) |
| `permission_manager.py` (71 строка) | Удалён |
| Frontend: ~385 строк tool UI | Frontend: ~250 строк, только чат |

### Новая логика работы

1. **AI-консультант**: получает полный контекст датасета + проект + последний анализ в system prompt
2. Отвечает на вопросы пользователя, интерпретирует результаты анализов
3. **Не запускает анализы** — пользователь запускает через UI
4. Кнопка "🧠 Анализ" заполняет промпт (AI предлагает план, не выполняет)
5. ResponseValidator проверяет числовые метрики (как и раньше)
6. Pipeline Wizard (`/api/ai/suggest_pipeline`, `/api/ai/run_pipeline`) сохранён

### Файлы

| Файл | Строк | Назначение |
|------|-------|------------|
| `app/backend/app/api/ai.py` | ~290 | Чат, конфиг, context, pipeline wizard |
| `app/backend/app/core/ai/tools.py` | ~265 | Только метаданные шаблонов |
| `app/frontend/js/models/aiChat.js` | ~250 | Чат без tool UI |
| `app/frontend/index.html` | — | Удалены tool-шаблоны |

## 2026-06-07 Session 5: Production readiness

### Что сделано

| Компонент | Файл | Статус |
|-----------|------|--------|
| **pyproject.toml** | `app/backend/pyproject.toml` | ✅ ruff (E/F/W/I/N/UP/B/SIM), pytest, python>=3.11 |
| **Ruff linter** | — | ✅ 430+ ошибок исправлено, 0 remaining |
| **CI/CD** | `.github/workflows/ci.yml` | ✅ lint + test на push/PR |
| **API-тесты** | `app/backend/tests/test_api.py` | ✅ 20 тестов (health, projects, analysis, AI, frontend, plots) |
| **Dockerfile** | `Dockerfile` | ✅ Python 3.11-slim, multi-stage, healthcheck |
| **docker-compose** | `docker-compose.yml` | ✅ volumes, env, restart:unless-stopped |
| **Auth middleware** | `app/backend/app/core/auth.py` | ✅ X-API-Key опционально (intranet mode) |
| **Python 3.9→3.11** | `pyproject.toml`, `Dockerfile` | ✅ минимальный Python 3.11 |

### Найденный баг (реальный, не тулов)

- `app/backend/app/api/analysis.py:~368` — dead `elif template == "categorical"` ветка в `save_predictions()`, обращалась к неопределённой переменной `orchestrator`. Ветка недостижима (фронтенд использует `POST /api/analysis/run`), но могла бы упасть с 500. **Удалена.**

### Совместимость Python 3.9

- `from __future__ import annotations` добавлен в 12 файлов для PEP 604 (например, `Path | None`)
- В Pydantic моделях: `Optional[str]` вместо `str | None` (Pydantic v2 не умеет eval-type-backport)
- `eval-type-backport` установлен, но не использован — замена на Optional[str]

### Тесты

Всего **58 тестов**: 38 unit (response_validator) + 20 API (FastAPI TestClient). Запуск:
```bash
cd app/backend && python3 -m pytest tests/ -v
```


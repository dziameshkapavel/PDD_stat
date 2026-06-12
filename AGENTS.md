# PDD_STAT — Agent Guide

Language: **Russian** (comments, strings, UI). Agent responses may be in English or Russian.

## Quick commands

```bash
# Start dev server
cd app/backend && source ../../.venv/bin/activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Run all tests (70 total)
cd app/backend && python -m pytest tests/ -v --timeout=60

# Run single test file
cd app/backend && python -m pytest tests/test_response_validator.py -v --timeout=60

# Lint (ruff)
cd app/backend && ruff check .
```

**⚠️ Do NOT use system Python (`/usr/bin/python3` is 3.9).** Tests and code require Python 3.11+. Always activate `.venv` first.

## Windows installation

Three `.bat` scripts in project root — use **ASCII only** (Russian UTF-8 breaks cmd.exe):

| Script | Purpose |
|--------|---------|
| `setup.bat` | Install Python 3.12, create venv, install deps, create default project |
| `start.bat` | Launch dev server (auto-finds Python, activates venv) |
| `update.bat` | Pull latest changes from GitHub, update deps |

## Architecture

- **Backend**: FastAPI, entrypoint `app/backend/app/main.py`. 3 routers: `/api/projects`, `/api/analysis`, `/api/ai`. Healthcheck at `/api/health`.
- **Frontend**: Vanilla HTML/CSS/JS at `app/frontend/` — served as static files by backend. No build step. **No optional chaining (`?.`)** — must work in Chrome < 80.
- **Core logic** in `app/backend/app/core/` — `executor.py` (sandboxed exec), `modeling_orchestrator.py` (Jinja2 template engine), `project_manager.py`, `data_loader.py`, `rule_engine.py`, `cox_selector.py`, `auth.py`, `pubmed_api.py`.
- **AI module** in `app/backend/app/core/ai/` — `prompt_manager.py` (YAML prompts, hot reload), `context_builder.py`, `response_validator.py` (anti-hallucination, auto-retry), `ai_clients.py` (Ollama/Groq), `tools.py`.
- **Prompts** in `app/backend/prompts/` — YAML system prompts: `roles/` (coder, consultant), `rules/` (formatting, safety).
- **Templates**: 20 `*.py.jinja` files in `app/backend/app/templates/`.
- **Projects** stored in `projects/<name>/` with subdirs: `data/`, `state/`, `outputs/`, `plots/`, `logs/`.

## Key execution flow

1. UI → `POST /api/analysis/run` with `template` + `params`
2. `ModelingOrchestrator` renders Jinja2 from `templates/*.py.jinja`
3. Code `exec()`-ed via `Executor` with controlled namespace (`df`, `pd`, `np`, `plt`, `save_plot`, `get_label`, `fmt_p`, `CoxVariableSelector`)
4. Results returned as JSON; metrics extracted from `<!-- JSON_METRICS_START --> ... <!-- JSON_METRICS_END -->` comments in stdout

## Critical quirks

- **`plt.show()`/`plt.figure()` are auto-stripped** before execution; use `save_plot(name)` to save plots (PNG, 150dpi).
- **Active project** tracked in `app/backend/app/active_project.txt` (read by `main.py` and `projects.py`).
- **`numeric_compare` template** uses `value`/`group` params (not `value_col`/`group_col`).
- **Web UI labels**: Backend strings (comments, error messages, log entries) are in Russian.
- **History capped** at 200 entries (`analysis_history.json`).
- **Executor timeout** 60s via SIGALRM (Unix main thread only).
- **AST analysis** blocks dangerous imports (`os`, `subprocess`, `sys`, `socket`, etc.) in template code.
- **Allowed imports** in templates: `pandas`, `numpy`, `matplotlib`, `scipy`, `lifelines`, `json`, `time`, `pathlib`, `warnings`, `statsmodels`, `sklearn`, `itertools`, `typing`, `math`, `seaborn`, `collections`, `docx`, `jinja2`, `pyarrow`, `openpyxl`, `autograd`, `shutil`, `numbers`.
- **Log files** (`pdd_stat_*.log`) accumulate in the working directory where the server was started.

## Persistence

Per-project under `projects/<name>/state/`:
| File | Format |
|------|--------|
| `project_data.parquet` | Parquet (snappy, fallback lz4, then none) |
| `raw.parquet` | Parquet |
| `analysis_history.json` | JSON (max 200 entries) |
| `variable_labels.json` | JSON |
| `ai_config.json` | JSON |
| `project_context.json` | JSON |
| `reports/` | `.docx` / `.html` |

Plots at `projects/<name>/plots/*.png`.

## Testing

- **70 tests** (all pass): 38 unit + 20 API + 12 hallucination/systematic in `app/backend/tests/`.
- Requires Python 3.11+ (`.venv/bin/python`). CI also runs `pytest --timeout=60`.
- **Linter**: ruff (E/F/W/I/N/UP/B/SIM), `pyproject.toml` config, line-length=120.

## CI

`.github/workflows/ci.yml` — runs `ruff check .` then `pytest tests/ -v --timeout=60` on pushes to `main`/`master`/`develop`.

## AI providers

| Provider | Default model |
|----------|--------------|
| Ollama | `qwen2.5-coder:7b` |
| Groq | `llama-3.3-70b-versatile` |

Old Groq model names (`llama3-70b-8192`) do not work.

## Docker

```bash
docker compose up -d --build   # Python 3.11-slim, 2 workers, healthcheck
docker compose down            # stop
PDD_STAT_API_KEY=my-key docker compose up -d  # with API key
```

Production: `gunicorn -k uvicorn.workers.UvicornWorker -w 4`.

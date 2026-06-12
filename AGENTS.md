# PDD_STAT — Agent Guide

Language: **Russian** (comments, strings, UI). Agent responses may be in English or Russian.

## Quick commands

```bash
# Start dev server
cd app/backend && source ../../.venv/bin/activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Run tests (70 total)
cd app/backend && python -m pytest tests/ -v

# Run single test file
cd app/backend && python -m pytest tests/test_response_validator.py -v

# Lint (ruff)
cd app/backend && ruff check .
```

**⚠️ Do NOT use system Python (`/usr/bin/python3` is 3.9).** Tests and code require Python 3.11+. Always activate `.venv` first.

## Windows installation

Three `.bat` scripts in project root:

| Script | Purpose |
|--------|---------|
| `setup.bat` | Install Python 3.12, create venv, install deps, create default project |
| `start.bat` | Launch dev server (auto-finds Python, activates venv) |
| `update.bat` | Pull latest changes from GitHub, update deps |

- `setup.bat` auto-downloads Python 3.12 if missing, disables MS Store stubs.
- `update.bat` auto-installs Git 2.54.0 if missing; detects ZIP downloads and tells user to clone properly.
- All `.bat` files use **ASCII only** — Russian UTF-8 breaks cmd.exe.

## Architecture

- **Backend**: FastAPI, entrypoint `app/backend/app/main.py`. 3 routers: `/api/projects`, `/api/analysis`, `/api/ai`.
- **Frontend**: Vanilla HTML/CSS/JS at `app/frontend/` — served as static files by backend. No build step. **No optional chaining (`?.`)** — must work in Chrome < 80.
- **Core logic**: `app/backend/app/core/` — `executor.py` (exec with sandboxed namespace), `modeling_orchestrator.py` (Jinja2 template engine), `project_manager.py`, `data_loader.py`, `rule_engine.py`, `cox_selector.py`, `auth.py` (API key auth), `pubmed_api.py` (PubMed/NCBI client).
- **AI module**: `app/backend/app/core/ai/` — `prompt_manager.py` (YAML prompts, hot reload), `context_builder.py`, `response_validator.py` (anti-hallucination, auto-retry), `ai_clients.py` (Ollama/Groq), `tools.py` (template metadata/schemas).
- **Templates**: 20 `*.py.jinja` files in `app/backend/app/templates/`.
- **Projects** stored in `projects/<name>/` with subdirs: `data/`, `state/`, `outputs/`, `plots/`, `logs/`.
- `app/backend/app/services/` and `app/backend/app/models/` are empty.

## Key execution flow

1. UI → `POST /api/analysis/run` with `template` + `params`
2. `ModelingOrchestrator` renders Jinja2 from `templates/*.py.jinja`
3. Code `exec()`-ed via `Executor` with controlled namespace (`df`, `pd`, `np`, `plt`, `save_plot`, `get_label`, `fmt_p`, `CoxVariableSelector`)
4. Results as JSON; metrics extracted from `<!-- JSON_METRICS_START/END -->` comments in output

## Critical quirks

- **`plt.show()`/`plt.figure()` are auto-stripped** before execution; use `save_plot(name)` to save plots.
- Active project tracked in `app/backend/app/active_project.txt`. There is also a stale `app/backend/active_project.txt` — **unused, ignore it**.
- `numeric_compare` template uses `value`/`group` params (not `value_col`/`group_col`) — matches frontend, do not change.
- Backend strings/comments are **in Russian**.
- History capped at 200 entries (`analysis_history.json`).
- Executor timeout: 60s via SIGALRM (Unix main thread only).
- AST analysis blocks dangerous imports (`os`, `subprocess`, `sys`, `socket`, etc.) in template code.
- Frontend JS has **no optional chaining (`?.`)** — replaced with `&&` or ternary for Chrome < 80 compatibility.

## Persistence

| What | Where | Format |
|------|-------|--------|
| Clean data | `state/project_data.parquet` | Parquet |
| Raw upload | `state/raw.parquet` | Parquet |
| Analysis history | `state/analysis_history.json` | JSON (max 200) |
| Variable labels | `state/variable_labels.json` | JSON |
| AI config | `state/ai_config.json` | JSON |
| Project context | `state/project_context.json` | JSON |
| Reports | `state/reports/` | `.docx` / `.html` |
| Plots | `plots/*.png` | PNG |

## Testing

- **70 tests**: 38 unit (`test_response_validator.py`) + 20 API (`test_api.py`) + 12 hallucination tests.
- All tests require Python 3.11+ (`.venv/bin/python`).
- **Linter**: ruff (E/F/W/I/N/UP/B/SIM), `pyproject.toml` config, line-length=120.

## AI providers

| Provider | Default model |
|----------|--------------|
| Ollama | `qwen2.5-coder:7b` |
| Groq | `llama-3.3-70b-versatile` |

Old Groq model names (`llama3-70b-8192`) do not work.

## Dependencies

`app/backend/requirements.txt`. Key: FastAPI, uvicorn, pandas, matplotlib, numpy, lifelines, scikit-learn, statsmodels, shap, scikit-survival, seaborn, python-docx, jinja2, httpx, pyarrow, openpyxl, autograd, autograd-gamma, tabulate, python-multipart, scipy, pyyaml.

## Docker

```bash
docker compose up -d --build   # Python 3.11-slim, 2 workers, healthcheck
```

Production: `gunicorn -k uvicorn.workers.UvicornWorker -w 4`.

# PDD_STAT - Survival Analysis Web App

## Run
```bash
cd app/backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Or: double-click `start_backend.command` in repo root (opens browser at `http://127.0.0.1:8000`)

Install deps: `pip install -r app/backend/requirements.txt`

## Architecture
- **Frontend**: vanilla JS SPA (ES modules) served by FastAPI at root
- **Backend**: FastAPI in `app/backend/app/` — three routers: `projects`, `analysis`, `ai`
- **Projects**: `projects/{name}/` — each contains `data/`, `state/`, `plots/`, `logs/`, `models/`, and a `.lock` file
- **Active project**: stored in `app/backend/app/active_project.txt`

## No tests, lint, or CI
No test suite, linter, type checker, or CI pipeline. No pre-commit config. Verify changes manually by running the server and testing in the browser.

## Data Flow
1. Upload xlsx → `raw.parquet` + audit + cleaning plan
2. `POST /api/projects/clean` → `project_data.parquet` (drops high-missing/constant cols, imputes median/mode)

## Key API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/projects/create` | Create project |
| POST | `/api/projects/upload` | Upload xlsx |
| POST | `/api/projects/clean` | Apply cleaning plan |
| POST | `/api/projects/columns/rename` | Rename column |
| POST | `/api/projects/columns/delete` | Delete column |
| POST | `/api/analysis/code/run` | Sandbox code execution |
| POST | `/api/analysis/run` | Run Jinja2 template |
| DELETE | `/api/analysis/history` | Clear analysis history |
| DELETE | `/api/analysis/plots` | Clear plots |
| POST | `/api/ai/chat` | AI chat (Ollama or Groq) |
| POST | `/api/ai/config` | Configure AI provider |

## Templates (`app/backend/app/templates/`)
Jinja2 `.py.jinja` files rendered then executed in sandbox.
- **Survival**: `cox_ph`, `kaplan_meier`, `random_survival_forest`, `survival_evaluation`
- **Classification**: `logistic`, `roc_analysis`, `model_evaluation_binary`
- **Other**: `random_forest`, `lasso_regression`, `categorical`, `numeric_compare`, `correlation_analysis`, `descriptive_stats`, `violin_plot`, `spline_analysis`, `anova`, `diagnostic_accuracy`, `external_validation`, `individual_prediction`, `agreement_categorical`

## Sandbox Globals
`df`, `pd`, `np`, `plt`, `save_plot(name)`, `CoxVariableSelector`, `get_label()`, `var_labels`

## Critical Gotchas
- **API base hardcoded** at `app/frontend/js/core/api.js:2` → `http://127.0.0.1:8000/api`
- **Metrics extraction**: templates output `<!-- JSON_METRICS_START -->...<!-- JSON_METRICS_END -->`, parsed by `modeling_orchestrator.py:33`
- **Plots**: `save_plot()` writes to project `plots/` dir only (no shared plots dir)
- **Sandbox df persistence**: `Executor.execute_code()` auto-saves modified `df` to `state/project_data.parquet`
- **Project state**: module-level `state` dict in `api/projects.py:15` — no auth, stateless per request; reads active project from `active_project.txt`
- **AI config per-project**: stored in `projects/{name}/state/ai_config.json`
- **Reports**: `projects/{name}/state/reports/`, **History**: `projects/{name}/state/analysis_history.json`

## Key Files in Projects
- `state/project_data.parquet` — cleaned data after running `/api/projects/clean`
- `state/schema.json` — column types and metadata
- `state/project_config.json` — configuration
- `state/variable_labels.json` — human-readable column labels
- `state/ai_config.json` — AI provider settings
- `data/` — uploaded xlsx files
- `.lock` — project lock file

## Key Dependencies
`fastapi`, `uvicorn`, `pandas`, `lifelines`, `scikit-survival`, `scikit-learn`, `matplotlib`, `seaborn`, `shap`, `statsmodels`, `scipy`, `python-docx`, `httpx`, `pyarrow`, `autograd`, `autograd-gamma`

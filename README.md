# PDD STAT

A web application for statistical analysis of medical data.  
**Backend:** FastAPI (Python) · **Frontend:** Vanilla HTML/JS (no build step)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
  - [Check & Install Git](#1-git)
  - [Check & Install Python](#2-python-39-or-later)
  - [Check & Install Docker (optional)](#3-docker-optional)
- [Installation Guide](#installation-guide)
  - [Option A: Local (no Docker)](#option-a-local-run-without-docker)
  - [Option B: Docker](#option-b-docker)
- [Running the Application](#running-the-application)
  - [macOS — One-click](#macos--one-click)
  - [Windows — One-click](#windows--one-click)
  - [Manual start (any OS)](#manual-start-any-os)
  - [Docker start](#docker-start)
- [Production](#production)
- [Project Structure](#project-structure)
- [Tests](#tests)

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/dziameshkapavel/PDD_stat.git
cd PDD_stat

# 2a. Local (requires Python 3.9+)
cd app/backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2b. Or Docker (requires Docker)
docker compose up -d --build

# 3. Open in browser
open http://localhost:8000
```

---

## Prerequisites

### 1. Git

**Check if Git is installed:**
```bash
git --version
```
If you see `git version x.y.z` — you're good.

**If not installed:**

- **macOS:** Install Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```
  Or download from https://git-scm.com/download/mac

- **Windows:** Download from https://git-scm.com/download/win  
  Run the installer (defaults are fine). After install, restart your terminal.

- **Linux:** `sudo apt install git` (Debian/Ubuntu) or `sudo dnf install git` (Fedora)

### 2. Python 3.9 or later

**Check if Python is installed:**
```bash
python3 --version
# or
python --version
```
You need **3.9 or newer**. If you see `Python 3.x.x` with x ≥ 9 — you're good.

**If not installed:**

- **macOS (Intel + Apple Silicon):**
  ```bash
  # Using Homebrew (recommended)
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  brew install python@3.11
  ```
  Or download from https://www.python.org/downloads/

- **Windows:**
  Download from https://www.python.org/downloads/  
  **Important:** during installation, check **"Add Python to PATH"**.

- **Linux:**
  ```bash
  sudo apt update && sudo apt install python3 python3-pip python3-venv
  ```

**Verify after install:**
```bash
python3 --version
pip3 --version
```

### 3. Docker (optional)

Only needed if you want to run via Docker instead of locally.

**Check:**
```bash
docker --version
docker compose version
```

**If not installed:**

- **macOS:** Download [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)  
  Apple Silicon users: choose the **Apple Chip** version.

- **Windows:** Download [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)  
  Requires WSL 2 — the installer will guide you.

- **Linux:** `sudo apt install docker.io docker-compose-v2`

---

## Installation Guide

### Option A: Local run (without Docker)

**Step 1. Clone the repository**
```bash
git clone https://github.com/dziameshkapavel/PDD_stat.git
cd PDD_stat
```

**Step 2. Install Python dependencies**
```bash
cd app/backend
pip3 install -r requirements.txt
```
This installs all required packages: pandas, matplotlib, lifelines, scikit-learn, statsmodels, shap, scikit-survival, seaborn, etc.

**Step 3. Start the server** (see [Running](#running-the-application) below)

### Option B: Docker

**Step 1. Clone the repository**
```bash
git clone https://github.com/dziameshkapavel/PDD_stat.git
cd PDD_stat
```

**Step 2. Build and start**
```bash
docker compose up -d --build
```

The first build downloads dependencies and may take 3–5 minutes.  
After completion, open http://localhost:8000.

---

## Running the Application

### macOS — One-click

Double-click **`start_backend.command`** in the project root folder.

This will:
1. Launch the server in the background
2. Wait 2 seconds
3. Open the app in your default browser

To stop the server: press `Ctrl+C` in the terminal window.

### Windows — One-click

Create a file `start_backend.bat` in the project root with:
```bat
@echo off
cd /d "%~dp0app\backend"
start python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
timeout /t 3 /nobreak >nul
start http://localhost:8000
```
Double-click `start_backend.bat` to run.

### Manual start (any OS)

```bash
cd app/backend
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Then open http://localhost:8000 in your browser.  
To stop: `Ctrl+C`.

### Docker start

```bash
docker compose up -d
```
Then open http://localhost:8000.  
To stop: `docker compose down`.

---

## Production

For production deployment, use `gunicorn` with multiple workers:

```bash
PDD_STAT_API_KEY=my-secret-key docker compose up -d
```

Or without Docker:

```bash
cd app/backend
pip install gunicorn
gunicorn -k uvicorn.workers.UvicornWorker -w 4 app.main:app
```

Set `PDD_STAT_API_KEY` environment variable to enable API key authentication (optional).

---

## Project Structure

```
PDD_stat/
├── app/
│   ├── backend/
│   │   ├── app/
│   │   │   ├── main.py              # FastAPI entrypoint
│   │   │   ├── api/                 # API routers (projects, analysis, ai)
│   │   │   ├── core/                # Business logic
│   │   │   │   ├── executor.py      # Python code executor
│   │   │   │   ├── modeling_orchestrator.py  # Template engine
│   │   │   │   ├── data_loader.py   # File loading
│   │   │   │   ├── rule_engine.py   # Data cleaning rules
│   │   │   │   ├── ai/              # AI chat module
│   │   │   │   │   ├── ai_clients.py
│   │   │   │   │   ├── context_builder.py
│   │   │   │   │   ├── response_validator.py
│   │   │   │   │   └── tools.py
│   │   │   ├── templates/           # Analysis templates (*.py.jinja)
│   │   │   └── core/auth.py         # Optional API key auth
│   │   ├── tests/                   # Pytest tests (58 tests)
│   │   └── requirements.txt
│   └── frontend/                    # Static frontend (no build step)
├── projects/                        # User project data (gitignored)
├── Dockerfile
├── docker-compose.yml
├── start_backend.command            # macOS one-click launcher
└── README.md
```

### Audit status (implemented fixes)

| Template | Fixes applied |
|----------|--------------|
| **Cox PH** | EPV grading, rare category check, separation detection, linearity (Spearman + LOWESS), dfbeta influential obs, convergence warning |
| **Logistic Regression** | Optional `class_weight='balanced'`, EPV control, separation diagnostics, Box-Tidwell linearity, Brier score, **ROC plot**, Hosmer-Lemeshow, VIF, stepwise selection |
| **LASSO** | Small sample warning, correlated cluster detection, 1-SE rule, EPV after selection |
| **Random Forest** | Class imbalance detection, calibration (Brier + slope + intercept + plot), permutation importance, SHAP by default, leakage detection, low event warning |
| **Survival Evaluation** | Uno C-index (IPCW), per-time-point Brier score, calibration by tertile groups, risk set / event count validation, bootstrap percentile CI (no z-test) |
| **All 20 templates** | Structured JSON metrics (`JSON_METRICS_START` / `END`) for AI validation |

---

## Tests

```bash
cd app/backend
python3 -m pytest tests/ -v
```

58 tests total: 38 unit (response validator) + 20 API (FastAPI TestClient).

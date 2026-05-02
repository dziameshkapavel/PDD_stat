# PDD MedStat
# Statistical Analysis Platform for Clinical Research

A web-based statistical analysis application for survival analysis and binary outcome modeling in clinical studies. Built with FastAPI (Python) and vanilla JavaScript SPA.

## Installation (Windows)

1. Download ZIP from [latest release](https://github.com/dziameshkapavel/PDD_stat)
2. Extract the archive
3. Run `install.bat` (checks Python, installs dependencies, creates desktop shortcut)
4. Open `http://127.0.0.1:8000`

## Features

### Regression Analysis
- **Cox Proportional Hazards** — univariate, multivariate, forward/backward selection. Schoenfeld residuals, VIF diagnostics, forest plots
- **Logistic Regression** — univariate, multivariate, stepwise. Hosmer-Lemeshow test, ROC curves, odds ratios
- **Logistic LASSO** — automatic feature selection with cross-validated regularization
- **Random Forest** — feature importance, OOB scoring, SHAP analysis

### Survival Analysis
- **Kaplan-Meier Curves** — survival and cumulative hazard, log-rank test (overall + pairwise), number at risk, stratified analysis, customizable axes
- **Random Survival Forest** — ensemble survival modeling with feature importance

### Model Evaluation
- **Model Evaluation (Binary)** — AUC, accuracy, sensitivity, specificity, PPV, NPV with bootstrap confidence intervals, DCA curves, calibration plots
- **ROC Analysis** — multiple predictors comparison, Hanley-McNeil confidence intervals, DeLong test for pairwise comparison, optimal threshold (Youden index)
- **Diagnostic Accuracy** — sensitivity, specificity, LR+, LR-, DOR with 95% CI, McNemar test for paired comparison
- **Agreement Analysis** — Cohen's Kappa, Fleiss' Kappa, weighted Kappa (linear/quadratic)
- **Survival Prediction Evaluation** — C-index with BCa bootstrap CI, time-dependent AUC, model comparison (IPCW DeLong test)

### Basic Statistics
- **Descriptive Statistics** — summary statistics, normality tests (Shapiro-Wilk), histograms
- **Categorical Comparison** — Chi-square, Fisher's exact, Monte Carlo simulation
- **Numeric Comparison** — t-test, Mann-Whitney U, ANOVA, Kruskal-Wallis
- **Correlation Analysis** — Pearson/Spearman with heatmaps
- **ANOVA / Kruskal-Wallis** — post-hoc tests (Tukey HSD, Dunn), trend test (Jonckheere-Terpstra)
- **Spline Analysis** — restricted cubic splines for non-linear associations (Cox/Logistic)
- **Violin Plots** — distribution visualization with statistical tests

### Prediction
- **Individual Prediction** — patient-level risk prediction with SHAP waterfall plots
- **External Validation** — validate saved models on new datasets with feature mapping

### AI Assistant
- Integrated LLM chat for result interpretation
- Supports **Ollama** (local, private) and **Groq** (cloud)
- Context-aware: has access to dataset schema and analysis history
- Coder mode: generate and execute Python code directly

### Project Management
- Multiple projects support
- Automatic data audit and cleaning (missing values, constant columns, identifiers)
- Variable renaming, deletion, labeling
- Analysis history with chain navigation
- DOCX report generation with tables and metrics


## Requirements

- Python 3.9+
- Windows 10/11 (macOS supported via `start_backend.command`)
- 4 GB RAM
- Dependencies: FastAPI, pandas, lifelines, scikit-survival, scikit-learn, statsmodels, SHAP, matplotlib, seaborn, python-docx

## Quick Start (macOS/Linux)

```bash
cd app/backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# License: MIT

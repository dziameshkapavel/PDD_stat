# PDD_STAT — User Guide

> **Version:** 1.0  
> **Developer:** P. Demeshko  
> **Interface language:** English (labels, metrics, plot annotations)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Installation & Startup](#2-installation--startup)
3. [Project & Data Management](#3-project--data-management)
   - 3.1. Creating a project and uploading data
   - 3.2. Data cleaning
   - 3.3. Variable management
   - 3.4. Project context (description, aim)
4. [Interface](#4-interface)
   - 4.1. Left panel — Project Manager
   - 4.2. Workspace
   - 4.3. Right panel — Variables
5. [Statistical Analysis Templates](#5-statistical-analysis-templates)
   - 5.1. Categorical Comparison
   - 5.2. Numeric Comparison
   - 5.3. Correlation Analysis
   - 5.4. Spline Analysis
   - 5.5. Descriptive Statistics
   - 5.6. Violin Plots
   - 5.7. ANOVA / Kruskal-Wallis
   - 5.8. Chart Builder
   - 5.9. Cox Regression
   - 5.10. Logistic Regression
   - 5.11. Logistic LASSO
   - 5.12. Random Forest
   - 5.13. Kaplan-Meier
   - 5.14. ROC Analysis
   - 5.15. Model Evaluation (Binary)
   - 5.16. Survival Prediction Evaluation
   - 5.17. Diagnostic Accuracy
   - 5.18. Agreement Analysis
   - 5.19. Individual Prediction
6. [AI Chat](#6-ai-chat)
   - 6.1. AI Settings
   - 6.2. Modes: Assistant and Coder
 7. [Reports](#7-reports)
    - 7.1. Standard DOCX Report
    - 7.2. AI Report
    - 7.3. AI Article Draft
 8. [Code Editor Mode](#8-code-editor-mode)
 9. [Analysis History (Chain)](#9-analysis-history-chain)
 10. [Tips & Best Practices](#10-tips--best-practices)

---

## 1. System Overview

**PDD_STAT** is a web application for statistical analysis of medical and clinical data. The system provides:

- **22 analysis templates** (from descriptive statistics to regression models and survival analysis)
- **AI assistant** powered by Ollama (local), Groq (cloud API), or Gemini (Google API)
- **DOCX report generation** (standard and AI-generated)
- **Code editor** for custom Python analysis
- **Visualizations**: matplotlib, SHAP, DCA, calibration curves

### Key Features

- **All output in English** (metrics, tables, plot labels)
- **Built-in statistical safeguards**: proportional hazards testing (Schoenfeld), multicollinearity (VIF), normality tests, homogeneity of variances, calibration (Hosmer-Lemeshow)
- **Multiple comparison correction** (Bonferroni) in pairwise tests
- **Stratified survival analysis**
- **Stepwise predictor selection** with p-value thresholds
- **DCA** (Decision Curve Analysis) and **calibration curves** for regression models
- **Bootstrap** confidence intervals for metrics
- **SHAP** for Random Forest model interpretation

---

## 2. Installation & Startup

### Requirements

| Component | Version |
|-----------|---------|
| Python | ≥ 3.11 |
| pip | ≥ 21.0 |

### Quick Start (one-click)

**macOS:**
```bash
git --version 2>/dev/null || xcode-select --install
git clone https://github.com/dziameshkapavel/PDD_stat.git && cd PDD_stat
./setup_mac.command && ./start_backend.command
```

**Windows:**
```batch
git --version >nul 2>&1 || winget install --id Git.Git -e --source winget >nul
git clone https://github.com/dziameshkapavel/PDD_stat.git
cd PDD_stat
setup.bat
start.bat
```

The scripts auto-detect Python 3.11+, create a virtual environment, install dependencies, and start the server.

### Manual Setup (alternative)

```bash
git clone https://github.com/dziameshkapavel/PDD_stat.git && cd PDD_stat
pip install -r app/backend/requirements.txt
cd app/backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open your browser at: **http://127.0.0.1:8000**

---

## 3. Project & Data Management

### 3.1. Creating a Project and Uploading Data

1. Click **"+ Create Project"** (left panel).
2. Enter a project name (Latin or Cyrillic).
3. Select a data file:
   - Supported formats: `.xlsx`, `.xls`, `.csv`
4. Click **"Create"**.
5. After upload, the **Cleaning Recommendations** modal appears (see section 3.2).

**Re-uploading** to an existing project: click the project name with the left mouse button — a file dialog opens.

### 3.2. Data Cleaning

Upon data upload, the system automatically analyzes every column and suggests a cleaning plan:

#### Dropped Columns

| Rule | Condition | Level |
|------|-----------|-------|
| **HIGH_MISSING** | >30% missing values | Hard |
| **MODERATE_MISSING** | 20–30% missing values | Soft |
| **CONSTANT** | Singleton column | Hard |
| **IDENTIFIER** | All unique values (n>10) | Hard |
| **TECHNICAL** | Name starts with `INFO_`, `CHECK_`, `PARAMS_` etc. | Hard |

#### Imputation

Remaining columns with missing values:
- **Numeric** → filled with **median**
- **Categorical/string** → filled with **mode**

**Buttons:**
- **"Apply Cleaning"** — apply recommendations
- **"Skip (Keep as is)"** — save raw data as-is

After cleaning, data is persisted as `state/project_data.parquet` (snappy compression).

### 3.3. Variable Management

Right panel → **"Columns"** tab:

- **Search** by variable name
- **Type badge**: `num` (numeric), `cat` (categorical), `bin` (binary), `str` (string)
- **Actions:**
  - ✎ — rename
  - ✕ — delete from dataset
  - ⚙ — open Label modal:
    - **Chart Name** — display name on plots
    - **Value Labels** — label for values (e.g., `0 = No, 1 = Yes`)

**Quick variable selection:** click a variable name to assign it to the active card field (field highlights in color).

### 3.4. Project Context (Description, Aim)

Click ✎ on a project item → **Project Context**:

- **Description** — project description (used by AI for context)
- **Research Aim** — study objective
- **Notes** — additional notes

Context is automatically injected into the AI assistant's system prompt and AI reports.

---

## 4. Interface

### 4.1. Left Panel — Project Manager

| Element | Description |
|---------|-------------|
| **+ Create Project** | Create a new project |
| Project list | Project names. Click → open/upload data. ✎ → context. ✕ → delete |
| **AI Settings** | Configure AI assistant |
| ◀ ▶ | Collapse/expand panel |

### 4.2. Workspace

Central area — container for analysis cards (see section 5).

**Template menu bar** (top):

| Menu | Templates |
|------|-----------|
| **Basic Stats ▾** | Categorical, Numeric, Correlation, Spline, Descriptive, Violin, ANOVA, Chart Builder |
| **Regression ▾** | Cox, Logistic, LASSO, Random Forest |
| **Survival ▾** | Kaplan-Meier |
| **Evaluation ▾** | Model Evaluation (Binary), Survival Eval, ROC, Diagnostic Accuracy, Agreement |
| **Prediction ▾** | Individual Prediction |

**Action buttons:**
- **AI Chat** — open AI assistant chat
- **Code** — switch to code editor mode
- **☀ / ☾** — toggle light/dark theme

### 4.3. Right Panel — Variables

| Tab | Content |
|-----|---------|
| **Columns** | Variable list with search, type badges, editing |
| **Reports** | DOCX report generation |
| **Chain** | Analysis history |

---

## 5. Statistical Analysis Templates

### 5.1. Categorical Comparison

**Method:** χ²-test / Fisher's Exact Test / Monte Carlo simulation

**Parameters:**
| Field | Description |
|-------|-------------|
| `col1` | First categorical variable (table rows) |
| `col2` | Second categorical variable (table columns) |

**Test selection logic:**
1. All expected frequencies ≥ 5 → **χ²-test**
2. Low expected AND 2×2 table → **Fisher's Exact Test**
3. Otherwise → **Monte Carlo** (10,000 iterations)

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| `chi2` | Chi-square statistic |
| `p_value` | Significance level; **p < 0.05** = significant association |
| `df` | Degrees of freedom |
| `min_expected_frequency` | Minimum expected cell count |
| `all_expected_ge5` | All expected ≥ 5? |
| `odds_ratio` | Odds ratio (Fisher, 2×2 only) |

---

### 5.2. Numeric Comparison

**Method:** t-test (independent) / ANOVA or Mann-Whitney U / Kruskal-Wallis H

**Parameters:**
| Field | Description |
|-------|-------------|
| `value` | Numeric dependent variable |
| `group` | Categorical grouping variable |

**Test selection:**
- If **normal** (Shapiro-Wilk) AND **equal variances** (Levene):
  - 2 groups → **t-test** + Cohen's d
  - >2 groups → **ANOVA** + η²
- Otherwise:
  - 2 groups → **Mann-Whitney U**
  - >2 groups → **Kruskal-Wallis H**

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| `statistic` | Test statistic value |
| `p_value` | Significance level |
| `cohens_d` | Cohen's d effect size (t-test only): 0.2 = small, 0.5 = medium, 0.8 = large |
| `normality` | Shapiro-Wilk test results per group |
| `equal_var` | Levene's test result |

**Plots:** Boxplot + barplot (mean ± SD), 2 panels.

---

### 5.3. Correlation Analysis

**Method:** Pearson (parametric) or Spearman (rank) correlation

**Parameters:**
| Field | Description |
|-------|-------------|
| `predictors` | Select multiple variables |
| `method` | `Pearson` (assumes normality) or `Spearman` (any distribution) |
| `threshold` | |r| cutoff: 0.3, 0.5 (default), 0.7 |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| `n_variables` | Number of variables |
| `n_strong_pairs` | Pairs with |r| > threshold |
| `strongest_r` | Maximum |r| |
| `pairs` | Strong pairs with **Bonferroni-corrected p-values**. Corrects for family-wise error rate (FWER) |

**p-values** are Bonferroni-corrected (multiplied by number of all pairwise tests) to control FWER.

**Plot:** Correlation heatmap (lower triangle).

---

### 5.4. Spline Analysis

**Method:** Linear spline analysis within Cox or Logistic regression

**Parameters:**
| Field | Description |
|-------|-------------|
| `variable` | Variable for spline transformation |
| `target` | (Logistic) Binary outcome |
| `time` + `event` | (Cox) Time-to-event |
| `covariates` | Adjustment covariates |
| `knots` | Knot placement: `Median`, `Quartiles`, `Custom` |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| `nonlinear_p` | p-value for non-linearity test. **p < 0.05** = significant deviation from linearity |
| `knots` | Knot positions |

**Plot:** Log-HR / Log-OR vs variable with knot markers + histogram.

---

### 5.5. Descriptive Statistics

**Method:** Summary statistics + Shapiro-Wilk normality test

**Parameters:**
| Field/Option | Description |
|-------------|-------------|
| `covariates` | Variables (empty = all numeric) |
| `Include histograms` | Plot histograms per variable |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| N, Mean, Median, Std, Min, Max, Q1, Q3 | Standard descriptive statistics |
| Skewness | Asymmetry of distribution (0 = symmetric) |
| Kurtosis | Tail heaviness (3 = normal distribution) |
| Missing count | Number of NaN values |
| Outlier count | IQR method: beyond Q1-1.5×IQR / Q3+1.5×IQR |
| Shapiro-Wilk W, p | **p < 0.05** = distribution deviates from normality |

---

### 5.6. Violin Plots

**Method:** Violin plots + Mann-Whitney / Kruskal-Wallis test

**Parameters:**
| Field | Description |
|-------|-------------|
| `value` | Numeric variable |
| `group` | Grouping variable |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| `mann_whitney_p` | Mann-Whitney U p-value (2 groups) |
| `kruskal_p` | Kruskal-Wallis H p-value (>2 groups) |

**Plot:** Violin plot, optional box overlay and swarm points.

---

### 5.7. ANOVA / Kruskal-Wallis

**Method:** One-way ANOVA (parametric) or Kruskal-Wallis (non-parametric)

**Parameters:**
| Field | Description |
|-------|-------------|
| `value` | Numeric outcome |
| `group` | Categorical grouping (≥2 groups) |

**Output metrics (tabs):**

**Statistics tab:**

| Metric | Interpretation |
|--------|----------------|
| `test_name` | `ANOVA` or `Kruskal-Wallis` |
| `F_stat` / `H_stat` | Test statistic |
| `p_value` | Significance level |
| `eta_sq` | η² — proportion of variance explained by group (ANOVA) |
| `omega_sq` | ω² — less biased effect size than η² |
| `epsilon_sq` | ε² — effect size for Kruskal-Wallis |
| `trend_test` | Jonckheere-Terpstra trend test (≥3 groups) |

**Post-hoc tab:**

| Metric | Interpretation |
|--------|----------------|
| Pairwise comparisons | Tukey HSD (ANOVA) or Mann-Whitney with Bonferroni (KW) |
| `significant` | p < 0.05 after correction |

**Diagnostics tab:**

| Metric | Interpretation |
|--------|----------------|
| `all_normal` | All groups normal (Shapiro-Wilk p>0.05) |
| `equal_var` | Variances equal (Levene p>0.05) |

**Plot:** Boxplot + jitter + barplot (mean ± SD).

---

### 5.8. Chart Builder

**Method:** Quick visualization (no statistical tests)

**Parameters:**
| Field | Description |
|-------|-------------|
| `Chart type` | `Histogram`, `Box Plot`, `Scatter`, `Bar (mean±SD)`, `Density` |
| `x` | X variable |
| `y` | Y variable (scatter only) |
| `group` | Color/group by |
| `Bins` | Histogram bins (default 20) |
| `KDE curve` | Overlay kernel density estimate (histogram) |
| `Regression line` | Regression line with r² (scatter) |
| `Chart Axes` | Custom title, axis labels |

**Plot:** The requested chart type.

---

### 5.9. Cox Regression

**Method:** Cox Proportional Hazards Regression (lifelines CoxPHFitter)

**Parameters:**
| Field | Description |
|-------|-------------|
| `event` | Event indicator (0 = censored, 1 = event) |
| `time` | Time-to-event |
| `covariates` | Predictors |
| Covariate type | `Cat`/`Cont` toggle — categorical or continuous |
| `Reference groups` | Reference category for categorical variables |
| **Univariate** | Each predictor separately |
| **Multivariate** | All predictors jointly |
| **Method** | `Enter` (all at once), `Forward` (forward selection), `Backward` (backward elimination) |
| `p_enter` | Entry p-value threshold (default 0.05) |
| `p_remove` | Removal p-value threshold (default 0.10) |
| `Adjust Survival Curves` | Covariate for adjusted survival curves |

**Output metrics:**

**Table tab:**

| Metric | Interpretation |
|--------|----------------|
| `Beta (β)` | Regression coefficient |
| `SE` | Standard error |
| `z` | z-statistic (β/SE) |
| **HR (Hazard Ratio)** | exp(β). >1 = increased hazard, <1 = decreased hazard |
| `95% CI` | 95% confidence interval for HR |
| `p-value` | Wald test significance |

**Diagnostics tab:**

| Metric | Interpretation |
|--------|----------------|
| **C-index** | Harrell's Concordance Index — discrimination. 0.5 = random, 1.0 = perfect. Not calibrated for censored data |
| **AIC** | Akaike Information Criterion — model quality (lower = better). Not interpretable in isolation |
| **BIC** | Bayesian Information Criterion — penalizes complexity more than AIC |
| **Log-likelihood** | Log-partial likelihood at convergence |
| **Global LRT p** | Likelihood ratio test p-value for overall model significance |
| **Schoenfeld test** | Proportional hazards assumption test. **p<0.05** = PH violation. **Critical diagnostic check** |
| **VIF** | Variance Inflation Factor. **>10** = problematic multicollinearity, **>5** = moderate |

**Steps tab** (Forward/Backward only): stepwise selection history.

**"Save Risk" button** — saves predicted risk (linear predictor) as a new column.

**Plots (checkboxes, all optional):**
- **Forest plot** — HR with 95% CI
- **Survival curves** — adjusted survival curves
- **Residuals** — Martingale residuals (linearity diagnostic)

**Assumption checks:**
- EPV (Events Per Variable) ≥ 10 — warning if <10
- Schoenfeld — PH test per variable and globally
- VIF — multicollinearity
- **Stepwise warning**: p-values do not account for the selection process and may be inflated

---

### 5.10. Logistic Regression

**Method:** Logistic Regression with L2 penalty, `class_weight='balanced'`

**Parameters:**
| Field | Description |
|-------|-------------|
| `target` | Binary target variable |
| `predictors` | Predictors |
| Covariate type | `Cat`/`Cont` toggle |
| `Reference groups` | Reference category |
| **Univariate** | Each predictor separately |
| **Multivariate** | All predictors jointly |
| **Method** | `Enter`, `Forward`, `Backward` |
| **Validation** | `None`, `Train/Test` (80/20), `Cross-val` (5-fold CV) |
| **Plots** | Checkboxes: ROC, DCA, Calibration. All optional, select what you need |

**Output metrics:**

**Table tab:**

| Metric | Interpretation |
|--------|----------------|
| `Beta (β)` | Regression coefficient |
| **OR (Odds Ratio)** | exp(β). >1 = higher odds, <1 = lower odds |
| `95% CI` | 95% confidence interval for OR |
| `p-value` | Wald test significance |

**Diagnostics tab:**

| Metric | Interpretation |
|--------|----------------|
| **AUC** | Area Under ROC Curve — discrimination. 0.5 = random, 0.8 = excellent, 1.0 = perfect |
| **Accuracy** | (TP+TN)/(Total) — overall correct classification |
| **Sensitivity** | TP/(TP+FN) — true positive rate |
| **Specificity** | TN/(TN+FP) — true negative rate |
| **Hosmer-Lemeshow** | Calibration test: χ², df, p-value. **p<0.05** = significant miscalibration |
| **VIF** | Multicollinearity (>10 = problematic) |
| **Warnings** | VIF errors, convergence issues |

**Steps tab** (Forward/Backward): stepwise selection history.

**"Save Probabilities" button** — saves predicted probabilities as a new column.

**Plots (checkboxes, all optional):**
- ROC curve
- DCA (Decision Curve Analysis) with Treat All / Treat None baselines
- Calibration curve with Brier Score

**Assumption checks:**
- Target must be binary (exactly 2 unique values)
- Minimum 20 complete cases
- All predictors standardized (StandardScaler)
- **Warning** when validation="none": metrics are optimistic

---

### 5.11. Logistic LASSO

**Method:** L1-regularized logistic regression (LASSO)

**Parameters:**
| Field | Description |
|-------|-------------|
| `target` | Binary target |
| `covariates` | Predictors (empty = all numeric + encoded categorical) |
| `Auto-select C` | Automatic C selection via 5-fold CV |
| `C` | Inverse regularization strength (if auto-C off). Smaller C = stronger regularization |
| **Plots** | Checkboxes: Coef Plot, CV Curve, DCA, Calibration. All optional |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| **AUC** | ROC AUC (training data — **optimistic**) |
| **Accuracy** | Overall accuracy (training — **optimistic**) |
| `n_features_selected` | Features with non-zero coefficient |
| `n_features_zeroed` | Features zeroed out (removed by LASSO) |
| `best_C` | Best C value (if auto-select) |
| `selected_features` | List: feature, OR, coefficient |
| `intercept` | Model intercept |

**Plots (checkboxes, all optional):**
- Coefficient bar plot (selected + top 30 all features)
- CV curve (if auto-select C)
- DCA (Decision Curve Analysis)
- Calibration curve

**Important:**
- Metrics are on **training data** — **optimistic** for generalization
- `class_weight='balanced'` — handles class imbalance
- `solver='saga'` — appropriate for L1 penalty

---

### 5.12. Random Forest

**Method:** Random Forest Classifier (sklearn, 200 trees, max_depth=10, min_samples_leaf=5, class_weight='balanced')

**Parameters:**
| Field | Description |
|-------|-------------|
| `target` | Target variable (binary or multiclass) |
| `exclusions` | Columns to exclude (comma-separated) |
| `Top features` | 10, 15 (default), 20, All |
| `SHAP analysis` | Enable SHAP calculation (may be slow on large datasets) |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| **OOB score** | Out-of-Bag R² — unbiased performance estimate from unused trees |
| **Accuracy** | Test set accuracy (75/25 split) |
| **AUC** | ROC AUC (binary targets only) |
| **Precision** | PPV = TP/(TP+FP) |
| **Recall** | Sensitivity = TP/(TP+FN) |
| **F1** | Harmonic mean of precision and recall |
| `top_features` | Gini importance — contribution of each feature to node purity. Not a p-value! |
| `shap_features` | Mean absolute SHAP — more interpretable feature contribution magnitude |

**Plots:**
- Feature importance bar (Gini)
- SHAP bar + summary plots (if enabled)

**Post-run buttons:**
- **"Save Model"** — saves model as .joblib (with metadata: features, target, metrics)
- **"Save Probabilities"** — saves predicted probabilities as new column

**Note:** Auto-excludes columns matching: `_event`, `event_`, `_time`, `time_`, `predicted_`, `_prob`, `censored`, `followup`, `cox_`, `logistic_`. Only numeric predictors are used.

---

### 5.13. Kaplan-Meier

**Method:** Kaplan-Meier survival curves / Nelson-Aalen cumulative hazard

**Parameters:**
| Field | Description |
|-------|-------------|
| `time` | Time-to-event |
| `event` | Event indicator |
| `group` | Grouping variable |
| `stratify` | Stratification variable (separate analysis per stratum) |
| `Survival` / `Hazard` | Plot type: survival probability or cumulative hazard |
| `95% CI` | Show confidence intervals |
| `Chart Axes` | X step (months), Y step (%), labels |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| `summary` | Per group: n, events, median survival (months) |
| **Log-rank p** | Overall log-rank test p-value. **p<0.05** = groups differ significantly |
| **Pairwise log-rank** | Bonferroni-corrected pairwise comparisons. Shows which specific groups differ |
| `number_at_risk` | Number-at-risk table at key time points |
| `survival_probability` | S(t) survival probability table |
| `median_survival` | Median survival per group. `NR` = not reached |

**Plot:** Kaplan-Meier survival curve S(t) or Nelson-Aalen cumulative hazard H(t).

---

### 5.14. ROC Analysis

**Method:** ROC analysis for multiple numeric predictors vs binary target

**Parameters:**
| Field | Description |
|-------|-------------|
| `target` | Binary target |
| `Event value` | Value considered "event" (1 or 0) |
| `predictors` | Numeric predictors |

**Output metrics:**

**ROC Results tab:**

| Metric | Interpretation |
|--------|----------------|
| **AUC** (95% CI) | Area Under ROC Curve. Hanley-McNeil CI method |
| `Threshold` | Optimal cutpoint via Youden's J (sens + spec - 1) |
| `Sensitivity` | True positive rate at optimal threshold |
| `Specificity` | True negative rate at optimal threshold |
| **PPV** | Positive predictive value |
| **NPV** | Negative predictive value |

**Comparison tab** (≥2 predictors):

| Metric | Interpretation |
|--------|----------------|
| **DeLong test** | Pairwise AUC comparison. **p<0.05** = AUCs differ significantly |

**Plot:** Combined ROC curves for all predictors.

---

### 5.15. Model Evaluation (Binary)

**Method:** Comprehensive binary classification evaluation with bootstrap CI

**Parameters:**
| Field | Description |
|-------|-------------|
| `target` | Binary target |
| `predictors` | Predicted probability columns (0-1) |
| `Bootstrap samples` | 500, 1000 (default), 2000 |
| `DCA` | Include Decision Curve Analysis |
| `Calibration` | Include calibration curves |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| **AUC** (bootstrap CI) | ROC AUC with bootstrap 95% CI |
| `Accuracy` | Overall classification accuracy |
| `Sensitivity` / `Specificity` | True positive and negative rates |
| **PPV** / **NPV** | Predictive values |
| **F1** | Harmonic mean of precision and recall |
| **Brier Score** | Mean squared probability error. 0 = perfect, <0.25 = good, >0.25 = poor |
| **DCA Net Benefit** | Clinical net benefit at thresholds 5-50%. NB = (TP/n) - (FP/n) × (p/(1-p)) |

**Plots:**
- DCA curves (all models on one plot)
- Calibration curves (one per model)

---

### 5.16. Survival Prediction Evaluation

**Method:** Survival model evaluation: C-index, time-dependent AUC, bootstrap CI

**Parameters:**
| Field | Description |
|-------|-------------|
| `time` | Time-to-event |
| `event` | Event indicator |
| `predictors` | Risk score/prediction columns |
| `Evaluation time points` | Time points for AUC (comma-separated, e.g., "12,24,48") |
| `stratify` | Stratification variable |
| `Bootstrap samples` | 500, 1000 (default), 2000 |
| `Smooth` | Smoothed AUC curves |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| **C-index** (bootstrap CI) | Harrell's C-index with bootstrap 95% CI. 0.5 = random |
| **Time-dependent AUC** | Cumulative dynamic AUC as function of time |
| **ΔC (model comparison)** | C-index difference between models with bootstrap p-value |
| **Strata** | Separate results per stratum level |

**Plot:** Time-dependent AUC (optionally smoothed).

---

### 5.17. Diagnostic Accuracy

**Method:** Diagnostic accuracy metrics for binary tests vs gold standard

**Parameters:**
| Field | Description |
|-------|-------------|
| `target` | Reference standard (binary, "gold standard") |
| `predictors` | Index tests (binary or probability 0-1) |

**Output metrics (per test):**

| Metric | Interpretation |
|--------|----------------|
| **Sensitivity** (95% CI) | TP/(TP+FN). Proportion of correctly identified positives |
| **Specificity** (95% CI) | TN/(TN+FP). Proportion of correctly identified negatives |
| **PPV** (95% CI) | TP/(TP+FP). Probability that a positive test reflects true disease |
| **NPV** (95% CI) | TN/(TN+FN). Probability that a negative test reflects true absence |
| **Accuracy** (95% CI) | (TP+TN)/(Total). Overall correct classification |
| **LR+** (95% CI) | Positive likelihood ratio = Sens/(1-Spec). >10 = strong evidence |
| **LR-** (95% CI) | Negative likelihood ratio = (1-Sens)/Spec. <0.1 = strong evidence |
| **DOR** | Diagnostic Odds Ratio = (TP×TN)/(FP×FN). 1 = useless test |

**Comparison tab** (>1 test):

| Metric | Interpretation |
|--------|----------------|
| **McNemar test** | Paired comparison. **p<0.05** = tests differ significantly |

**Contingency tables tab:** TP/FP/FN/TN per test.

**Plot:** Forest plot of sensitivity and specificity with 95% CI.

**Note:** Probability columns (0-1) are auto-thresholded at 0.5.

---

### 5.18. Agreement Analysis

**Method:** Cohen's Kappa (2 raters) / Weighted Kappa (ordinal) / Fleiss' Kappa (3+ raters)

**Parameters:**
| Field | Description |
|-------|-------------|
| `predictors` | Rater columns (≥2 required) |
| `Nominal` / `Ordinal` | Scale type |
| `Linear` / `Quadratic` | Weight type (ordinal only) |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| **Kappa** | Agreement coefficient corrected for chance. Range: -1 to 1 |
| `95% CI` | Confidence interval |
| `p-value` | Significance vs zero |
| **Interpretation** | Landis & Koch: Poor (≤0), Slight (0.01-0.20), Fair (0.21-0.40), Moderate (0.41-0.60), Substantial (0.61-0.80), Almost Perfect (0.81-1.00) |
| `percent_agreement` | Raw agreement percentage |

For ≥3 raters: Fleiss' Kappa with per-category breakdown.

**Plot:** Confusion matrix heatmap (2 raters).

---

### 5.19. Individual Prediction

**Method:** Single-patient prediction from saved model with SHAP explanation

**Parameters:**
| Field | Description |
|-------|-------------|
| **Select File** | Upload .joblib or .pkl model |
| Patient form | Radio buttons for categorical features, number inputs for numeric |

**Output metrics:**

| Metric | Interpretation |
|--------|----------------|
| `prediction` | Predicted class |
| `probability` | Probability of class 1 |

**Plot:** SHAP waterfall plot — contribution of each feature to the prediction.

---

## 6. AI Chat

### 6.1. AI Settings

Click **"AI Settings"** (left panel or above AI Chat):

| Parameter | Description |
|-----------|-------------|
| **Provider** | `Ollama (Local)` — run models locally. `Groq (Cloud)` — cloud API. `Gemini (Google)` — Google API |
| **Ollama URL** | Ollama server address (default `http://localhost:11434`) |
| **Ollama Model** | Model (loaded after "Test Connection") |
| **Groq API Key** | API key (get at console.groq.com) |
| **Groq Model** | Model (list loaded after "Test Connection") |
| **Gemini API Key** | API key (get at aistudio.google.com) |
| **Gemini Model** | Model (list loaded after "Test Connection") |
| **Temperature** | Generation temperature: 0 = deterministic, 1 = creative |
| **Max Tokens** | Maximum response length (100-8000) |
| **System Prompt** | AI instruction prompt (includes project context, dataset info, **up to 5 most recent analyses** with metrics and output preview) |

**Buttons:**
- **"Test Connection"** — test provider connectivity and load model list
- **"Connect"** — confirm provider selection
- **"Reset to default"** — reset system prompt to default
- **Save / Cancel** — save or discard settings

### 6.2. Number Validation & Auto-Correction

AI responses that include numbers (OR, HR, p-values, AUC, etc.) are automatically validated:

| Feature | Description |
|---------|-------------|
| **Exact match** | Every number in AI response is compared to source metrics (2 decimal places) |
| **Hallucination detection** | ALL decimal numbers in AI text must exist in source — catches fabricated numbers |
| **CI completeness** | HR/OR mentions must include 95% CI in the same sentence |
| **P-value correctness** | p<0.05 → "significant", p≥0.05 → "not significant" |
| **Citation verification** | Numbers in cited sentences are checked against the article abstract |
| **Forbidden phrases** | "almost significant", "trend toward significance", etc. are blocked |
| **Auto-retry** | On validation failure, AI receives a correction prompt and rewrites (up to 2 retries) |
| **Validation notice** | Summary shown at the end: `✅ Verified: X/Y numbers match` |

### 6.3. Modes: Assistant and Coder

**AI Assistant (default):**
- Conversational chat with AI
- Answers statistical questions, interprets results
- Has context of project description, dataset, and analysis history
- Supports markdown formatting
- Numbers are validated against source metrics before display

**AI Coder ("Coder" toggle):**
- Generates Python analysis code
- Auto-extracts ` ```python ` code blocks and executes them
- Shows code output and generated plots
- Self-corrects on errors (up to 3 retries)
- Uses temperature 0 (deterministic output)
- **Note**: validation is disabled in coder mode

### 6.4. Error Handling

All AI providers display clean error messages without technical tracebacks:

| Error | Displayed as |
|-------|--------------|
| Timeout | `Error (model): Request timed out (60s)...` |
| API unavailable | `Error (model): Model temporarily unavailable...` |
| Invalid API key | `Error (model): API key not valid...` |
| Other | `Error (model): <human-readable message>` |

---

## 7. Reports

Right panel → **Reports** tab.

### 7.1. Standard DOCX Report

| Parameter | Description |
|-----------|-------------|
| **Analyses** | `All analyses` or `Selected` (with checkboxes) |
| **Sections** | Dataset overview, Results tables, Key metrics |
| **Title** | Report title |
| **Generate DOCX** | Create report. Download via link |

**Contents:**
- Dataset overview (row count, column types)
- For each analysis: metrics, tables from preview text

### 7.2. AI Report

| Parameter | Description |
|-----------|-------------|
| **Language** | Report language (user prompt, default "English") |
| **Generate AI Report** | Create AI-generated report |

**Contents (AI-generated):**
1. **Objective** — based on project context
2. **Materials** — dataset description + basic stats
3. **Methods** — statistical methods used
4. **Results** — key findings with exact numbers (HR, OR, p-values, AUC, C-index)
5. **Conclusion** — brief summary

**Requirements:**
- AI must be configured (valid provider and credentials)
- At least one analysis in history (max 5 included in prompt)

### 7.3. AI Article Draft

| Parameter | Description |
|-----------|-------------|
| **Language** | Russian or English |
| **Section** | Full article, Methods, Results, or Discussion |
| **Title** | Article title |
| **Generate Article Draft** | Create AI-written scientific article draft |

**Features:**
- Numbers validated against source metrics with auto-retry
- PubMed citations checked against article abstracts
- Section-level generation (Methods, Results, Discussion, or Full)
- Downloadable .docx file

---

## 8. Code Editor Mode

Click **"Code"** in the header.

| Action | Description |
|--------|-------------|
| Type Python code in the monospace text area |
| **Run** | Execute via `exec()` on the server |
| **Clear Code** | Clear editor |
| **Clear History & Plots** | Delete all analysis history and plot files |
| **Exit Code Mode** | Return to analysis view |

**Available variables in code:**
- `df` — project pandas DataFrame
- `pd`, `np`, `plt`, `shap` — standard libraries
- `save_plot(name)` — save plot with auto-close
- `fmt_p(p)` — format p-value (shows `<0.0001` if tiny)
- `get_label(var, value)` — variable/value labels

---

## 9. Analysis History (Chain)

Right panel → **Chain** tab.

- Chronological list of completed analyses (reverse order, max 200 entries)
- Color coding:
  - **Blue** — regression
  - **Green** — survival
  - **Amber** — evaluation
  - **Gray** — basic tests
  - **Orange** — LASSO
  - **Purple** — Random Forest / Random Survival Forest
- Click an item to restore the analysis card with results

---

## 10. Tips & Best Practices

| Action | Tip |
|--------|-----|
| **Enter** in AI input | Send message |
| **Shift+Enter** | New line |
| Click a variable | Assign to active field |
| **Hide Charts** | Free up memory by hiding plots |
| **☀ / ☾** | Toggle theme |

### Workflow recommendations

1. **Start with Descriptive Statistics** — inspect distributions, missing values, outliers
2. **Use Categorical + Numeric Comparison** for preliminary screening
3. **For regression**: start with Univariate, then Multivariate (Enter), then Stepwise if needed
4. **Always check Schoenfeld PH test** in Cox regression — this is the key assumption
5. **VIF > 10** — remove collinear predictors and re-run
6. **DCA** helps assess clinical utility, not just statistical significance
7. **Bootstrap CI** provides more realistic metric precision estimates
8. **Don't rely solely on Stepwise p-values** — they don't account for the selection process
9. **LASSO with auto-select C** is a good choice for high-dimensional feature selection
10. **AI Coder mode** is useful for quick ad-hoc analyses without leaving the app

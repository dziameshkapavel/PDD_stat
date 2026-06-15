<p align="center">
  <img src="marketing_assets/social_preview.png" alt="PDD_STAT Banner" width="100%">
</p>

<h1 align="center">PDD_STAT · Medical Statistics, No Code Required</h1>

<p align="center">
  <a href="https://github.com/dziameshkapavel/PDD_stat/actions"><img src="https://github.com/dziameshkapavel/PDD_stat/workflows/CI/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/python-3.11%2B-blue.svg" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg" alt="FastAPI">
</p>

<p align="center">
  <strong>20+ medical analysis templates</strong> · <strong>AI Assistant</strong> · <strong>PubMed RAG</strong> · <strong>DOCX Export</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#templates">Templates</a> •
  <a href="#ai-assistant">AI Assistant</a>
</p>

---

## Why PDD_STAT?

PDD_STAT is a **free, open-source web application** for statistical analysis of medical data. It is built for clinicians, medical students, residents, and clinical researchers who need to perform statistical analyses **without writing code**.

| Feature | PDD_STAT | Jamovi | JASP | GraphPad Prism |
|---------|----------|--------|------|----------------|
| **Price** | Free | Free | Free | $300+/year |
| **Open Source** | ✅ | ✅ | ✅ | ❌ |
| **Medical Focus** | High | Medium | Medium | High |
| **Survival Analysis** | Full (KM, Cox, RSF) | Module (limited) | Limited | ✅ |
| **AI Assistant** | ✅ + PubMed RAG | ❌ | ❌ | ❌ |
| **DOCX Export** | ✅ | ❌ | ❌ | ✅ |
| **Docker Deploy** | ✅ | ❌ | ❌ | ❌ |
| **No-Code UI** | ✅ | ✅ | ✅ | ✅ |

**Key differentiators:**
- **Full survival analysis suite** — Kaplan-Meier, Cox PH (with forward/backward/stepwise), Random Survival Forest — out of the box, no modules required
- **AI Assistant with PubMed RAG** — context-aware LLM that searches PubMed, aggregates 5 query variants, and cites real articles to support your analysis
- **Response validation** — automatic hallucination detection: numbers are checked against source metrics, p-value interpretations are verified, and PubMed citations are matched against abstracts
- **Publication-ready export** — tables and figures export directly to DOCX with journal formatting (Times New Roman)
- **Sandbox execution** — all statistical code runs in a controlled environment with AST validation, timeout guards, and filesystem isolation

---

## Quick Start

### macOS (one-click)

```bash
git clone https://github.com/dziameshkapavel/PDD_stat.git
cd PDD_stat
./setup_mac.command && ./start_backend.command
```

### Windows (one-click)

```batch
git clone https://github.com/dziameshkapavel/PDD_stat.git
cd PDD_stat
setup.bat
start.bat
```

### Docker (recommended for servers)

```bash
git clone https://github.com/dziameshkapavel/PDD_stat.git
cd PDD_stat
docker compose up -d --build
```

Then open **http://localhost:8000** in your browser.

> All scripts auto-detect Python 3.11+, create a virtual environment, install dependencies, and start the server. No manual steps required.

---

## Templates

PDD_STAT includes **20+ parameterized analysis templates** that generate Python code via Jinja2, execute it in a sandbox, and return structured results with tables and plots.

### Basic Statistics
| Template | Description | Output |
|----------|-------------|--------|
| **Descriptive Statistics** | Mean, SD, median, IQR | Tables, histograms |
| **Categorical Comparison** | χ², Fisher exact | Contingency tables |
| **Numeric Comparison** | t-test, Mann-Whitney | Group comparisons |
| **Correlation Analysis** | Pearson, Spearman | Heatmaps |
| **ANOVA** | One-way ANOVA, Kruskal-Wallis | Post-hoc, effect sizes |
| **Spline Analysis** | GAM, smoothing splines | Curve plots |
| **Violin Plots** | Distribution by group | Violin + box plots |
| **Chart Builder** | Custom visualizations | Configurable charts |

### Regression & ML
| Template | Description | Output |
|----------|-------------|--------|
| **Cox Regression** | Proportional hazards (uni/multi/forward/backward) | HR, CI, forest plot, survival curves |
| **Logistic Regression** | Binary outcome (uni/multi/stepwise) | OR, CI, ROC, DCA, calibration |
| **LASSO Logistic** | Penalized logistic regression | Feature selection, CV curve |
| **Random Forest** | Classification + feature importance | SHAP values, variable importance |

### Survival Analysis
| Template | Description | Output |
|----------|-------------|--------|
| **Kaplan-Meier** | Survival curves by group | Curves, log-rank, median survival |
| **Survival Evaluation** | Model performance | C-index, calibration plots |
| **Random Survival Forest** | Survival predictions | Risk scores, survival probabilities |

### Evaluation & Diagnostics
| Template | Description | Output |
|----------|-------------|--------|
| **Model Evaluation (Binary)** | Confusion matrix, AUC, sensitivity, specificity | Bootstrap CIs, DCA |
| **Diagnostic Accuracy** | Sensitivity, specificity, PPV, NPV, LR | 2×2 tables |
| **ROC Analysis** | AUC, optimal cutoff, confidence intervals | ROC curves |
| **Agreement Analysis** | Cohen's kappa, weighted kappa | Agreement tables |
| **Individual Prediction** | Risk scores for individual patients | Probability estimates |

---

## AI Assistant

PDD_STAT includes an **AI Assistant** that understands your data and analysis history.

### Features
- **Two providers** — local (Ollama) or cloud (Groq API)
- **Dual modes** — Consultant (medical interpretation) and Coder (code generation)
- **PubMed RAG** — AI searches PubMed, aggregates results from 5 query variants, and cites real articles
- **Response validation** — automatic hallucination detection: checks numbers against source metrics, validates p-value interpretation, verifies PubMed citations against abstracts
- **Auto-retry** — up to 2 correction cycles with LLM when validation fails

### Example conversation
> *User:* "What does the Cox regression result mean for my dataset?"
>
> *AI:* "The multivariate Cox model shows a C-index of 0.81, indicating good discrimination. Age (HR 1.04, 95% CI 1.02–1.06, p<0.001) and tumor stage III (HR 2.3, 95% CI 1.5–3.5, p=0.002) are independent predictors of mortality. According to [PMID: 12345678], these findings are consistent with recent cohort studies..."

---

## Project Structure

```
PDD_stat/
├── app/
│   ├── backend/          # FastAPI + business logic
│   │   ├── app/
│   │   │   ├── api/      # REST routers (projects, analysis, ai)
│   │   │   ├── core/     # Executor, AI, PubMed, auth
│   │   │   ├── templates/# 20+ .py.jinja analysis templates
│   │   │   └── prompts/  # AI system prompts (YAML)
│   │   └── tests/        # 70 tests (pytest)
│   └── frontend/         # Vanilla HTML/JS/CSS (no build step)
├── projects/             # User data (gitignored)
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Tests

```bash
cd app/backend
python3 -m pytest tests/ -v
```

**70 tests:** 38 unit (response validator) + 21 API (FastAPI TestClient) + 11 systematic hallucination tests.

---

## Contributing

We welcome contributions! Please open an issue or pull request.

- **Good first issues:** documentation, UI improvements, new analysis templates
- **Help wanted:** frontend tests, additional statistical templates, internationalization

---

## Citation

If you use PDD_STAT in your research, please cite:

```bibtex
@software{pdd_stat,
  author = {Demeshko, P.},
  title = {PDD_STAT: Medical Statistics, No Code Required},
  url = {https://github.com/dziameshkapavel/PDD_stat},
  year = {2025}
}
```

---

## License

MIT License. 
---

<p align="center">
  <sub>Built with ❤️ for clinical researchers by <a href="https://github.com/dziameshkapavel">P. Demeshko</a></sub>
</p>

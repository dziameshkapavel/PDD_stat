"""Comprehensive validation tests for ALL analysis template metric structures.

Tests that _flatten_metrics extracts all numeric values correctly
and the validator matches typical AI responses for each template type.
"""

import sys
sys.path.insert(0, "app/backend")

from app.core.ai.response_validator import ResponseValidator


def _check_validation(
    response: str,
    metrics: dict,
    expected_checked: int,
    expected_matched: int,
    label: str = "",
):
    """Helper: run validate and assert expected match counts."""
    result = ResponseValidator().validate(response, metrics)
    flat = dict(ResponseValidator._flatten_metrics(metrics))
    src = {round(v, 2) for v in flat.values()}
    found = ResponseValidator.parse_numbers(response)

    print(f"\n--- {label} ---")
    print(f"  source_rounded={sorted(src)}")
    print(f"  found_numbers: {[(f.label, f.value, round(f.value, 2)) for f in found]}")
    print(f"  checked={result.numbers_checked}, matched={result.numbers_matched}")
    print(f"  unmapped={result.unmapped_numbers}")
    if result.errors:
        print(f"  errors={result.errors[:3]}")

    assert result.numbers_checked == expected_checked, (
        f"{label}: expected {expected_checked} checked, got {result.numbers_checked}"
    )
    assert result.numbers_matched == expected_matched, (
        f"{label}: expected {expected_matched} matched, got {result.numbers_matched}"
    )
    if expected_matched == expected_checked and expected_checked > 0:
        assert result.unmapped_numbers == [], (
            f"{label}: expected no unmapped, got {result.unmapped_numbers}"
        )
    return result


# ── 1. LOGISTIC (UNIVARIATE) ────────────────────────────────────────────────

def test_logistic_univariate():
    """Univariate logistic: OR, CI, p, AUC from univariate_results."""
    metrics = {
        "univariate_results": [
            {
                "predictor": "MTV_SUV>4",
                "auc": 0.7988,
                "or": 0.362,
                "ci_lower": 0.247,
                "ci_upper": 0.531,
                "p_value": 0.00001234,
                "coef": -1.015,
            }
        ],
        "auc": 0.7988,
        "best_predictor": "MTV_SUV>4",
    }
    response = (
        "* Odds Ratio (OR) = 0.362 (95% ДИ: 0.247–0.531)\n"
        "* p-значение <0.0001\n"
        "* AUC (площадь под кривой ROC) = 0.7988"
    )
    _check_validation(response, metrics, 5, 5, "logistic_univariate")


def test_logistic_univariate_interpretation_section():
    """Full AI response with interpretation section repeating OR."""
    metrics = {
        "univariate_results": [
            {
                "predictor": "MTV_SUV>4",
                "auc": 0.7988,
                "or": 0.362,
                "ci_lower": 0.247,
                "ci_upper": 0.531,
                "p_value": 0.00001234,
                "coef": -1.015,
            }
        ],
        "auc": 0.7988,
    }
    response = (
        "Результаты логистической регрессии (унивариантный анализ):\n"
        "* Odds Ratio (OR) = 0.362 (95% ДИ: 0.247–0.531)\n"
        "* p-значение <0.0001\n\n"
        "Интерпретация:\n"
        "* Значение OR = 0.362 указывает на отрицательную связь.\n"
        "* Данная связь является статистически значимой (p < 0.0001).\n\n"
        "Дополнительные метрики:\n"
        "* AUC (площадь под кривой ROC) = 0.7988"
    )
    result =     _check_validation(response, metrics, 5, 5, "logistic_univariate_full")
    assert result.total_decimals >= 5


def test_logistic_univariate_russian():
    """Univariate logistic with CYRILLIC OR (ОШ) and CI (ДИ) — user reported bug."""
    metrics = {
        "univariate_results": [
            {
                "predictor": "MTV_SUV>4",
                "auc": 0.7988,
                "or": 0.362,
                "ci_lower": 0.247,
                "ci_upper": 0.531,
                "p_value": 0.00001234,
                "coef": -1.015,
            }
        ],
        "auc": 0.7988,
    }
    response = (
        "Отношение шансов (ОШ): 0.362 (95% ДИ 0.247–0.531)\n"
        "AUC: 0.7988\n"
        "p<0.0001"
    )
    _check_validation(response, metrics, 5, 5, "logistic_univariate_russian")


def test_logistic_univariate_russian_ci_completeness():
    """Cyrillic OR and CI should not trigger CI completeness error."""
    metrics = {
        "univariate_results": [{"or": 0.362, "ci_lower": 0.247,
                                "ci_upper": 0.531, "p_value": 0.00001234,
                                "auc": 0.7988, "coef": -1.015}],
        "auc": 0.7988,
    }
    response = (
        "ОШ = 0.362 (95% ДИ: 0.247–0.531), p<0.0001, AUC=0.7988"
    )
    result = _check_validation(response, metrics, 5, 5, "logistic_univariate_russian_ci")
    # No CI completeness errors for "ОШ" with "ДИ"
    assert not any("without 95% CI" in e for e in result.errors)


def test_logistic_univariate_multi_predictors():
    """Multiple predictors — only MTV_SUV>4 cited by AI."""
    metrics = {
        "univariate_results": [
            {"predictor": "MTV_SUV>4", "auc": 0.7988, "or": 0.362,
             "ci_lower": 0.247, "ci_upper": 0.531, "p_value": 0.00001234,
             "coef": -1.015},
            {"predictor": "Age", "auc": 0.6543, "or": 1.123,
             "ci_lower": 0.987, "ci_upper": 1.279, "p_value": 0.0734,
             "coef": 0.116},
        ],
        "auc": 0.7988,
    }
    response = (
        "OR = 0.362 (95% CI: 0.247–0.531), p<0.001, AUC=0.7988"
    )
    _check_validation(response, metrics, 5, 5, "logistic_univariate_multi")


# ── 2. LOGISTIC (MULTIVARIATE) ──────────────────────────────────────────────

def test_logistic_multivariate():
    """Multivariate logistic: coefficients list with OR, CI, p."""
    metrics = {
        "coefficients": [
            {"variable": "MTV_SUV>4", "display_name": "MTV_SUV>4",
             "coef": -1.015, "or": 0.362, "ci_lower": 0.247,
             "ci_upper": 0.531, "p_value": 0.00001234},
            {"variable": "Age", "display_name": "Age",
             "coef": 0.051, "or": 1.052, "ci_lower": 1.021,
             "ci_upper": 1.085, "p_value": 0.0012},
        ],
        "auc": 0.8345,
    }
    response = (
        "Multivariate analysis:\n"
        "* MTV_SUV>4: OR = 0.362 (95% CI: 0.247–0.531), p<0.001\n"
        "* AUC = 0.8345"
    )
    _check_validation(response, metrics, 5, 5, "logistic_multivariate")


# ── 3. COX REGRESSION ───────────────────────────────────────────────────────

def test_cox_univariate():
    """Cox univariate: table with HR, CI, p, C-index."""
    metrics = {
        "table": [
            {"variable": "MTV_SUV>4", "hr": 1.85, "ci_lower": 1.32,
             "ci_upper": 2.59, "p_value": 0.0008, "beta": 0.615, "z": 3.36},
        ],
        "c_index": 0.723,
        "n_total": 300,
        "n_events": 80,
    }
    response = (
        "Univariate Cox regression:\n"
        "* MTV_SUV>4: HR = 1.85 (95% CI: 1.32–2.59), p=0.0008\n"
        "* C-index = 0.723"
    )
    _check_validation(response, metrics, 5, 5, "cox_univariate")


def test_cox_with_hazard_ratio_text():
    """HR with full 'Hazard Ratio' text and parenthetical."""
    metrics = {
        "table": [
            {"variable": "MTV_SUV>4", "hr": 1.85, "ci_lower": 1.32,
             "ci_upper": 2.59, "p_value": 0.0008},
        ],
    }
    response = (
        "Hazard Ratio (HR) = 1.85 (95% CI: 1.32–2.59), p=0.0008"
    )
    _check_validation(response, metrics, 4, 4, "cox_hazard_ratio_text")


# ── 4. ROC ANALYSIS ─────────────────────────────────────────────────────────

def test_roc_analysis():
    """ROC analysis: results list with AUC, CI, Se, Sp."""
    metrics = {
        "results": [
            {"predictor": "MTV_SUV>4", "auc": 0.799, "ci_low": 0.721,
             "ci_high": 0.877, "sensitivity": 0.85, "specificity": 0.72,
             "optimal_threshold": 2.5},
        ],
        "best_auc": 0.799,
        "best_predictor": "MTV_SUV>4",
    }
    response = (
        "ROC analysis:\n"
        "* MTV_SUV>4: AUC = 0.799 (95% CI: 0.721–0.877)\n"
        "* Sensitivity = 0.85, Specificity = 0.72"
    )
    _check_validation(response, metrics, 5, 5, "roc_analysis")


# ── 5. KAPLAN-MEIER ─────────────────────────────────────────────────────────

def test_kaplan_meier():
    """Kaplan-Meier: log-rank p, median survival, number at risk."""
    metrics = {
        "logrank_overall": 0.0034,
        "median_survival": {"High": 12.5, "Low": 34.8},
        "n_total": 200,
        "events_total": 80,
        "significant": True,
    }
    response = (
        "Kaplan-Meier analysis:\n"
        "* Median survival: High = 12.5 months, Low = 34.8 months\n"
        "* Log-rank p = 0.0034"
    )
    _check_validation(response, metrics, 2, 2, "kaplan_meier")


# ── 6. DESCRIPTIVE STATISTICS ───────────────────────────────────────────────

def test_descriptive_stats():
    """Descriptive stats: variables_stats with mean, median, std."""
    metrics = {
        "variables_stats": [
            {"variable": "MTV_SUV>4", "n": 200, "mean": 15.3, "median": 12.1,
             "std": 8.7, "min": 2.1, "max": 45.6, "q1": 6.8, "q3": 21.5},
        ],
    }
    response = (
        "MTV_SUV>4: mean = 15.3, median = 12.1, std = 8.7"
    )
    _check_validation(response, metrics, 3, 3, "descriptive_stats")


# ── 7. RANDOM FOREST ────────────────────────────────────────────────────────

def test_random_forest():
    """Random forest: AUC, OOB score, feature importance."""
    metrics = {
        "auc": 0.892,
        "oob_score": 0.78,
        "accuracy": 0.82,
        "top_features": [
            {"variable": "MTV_SUV>4", "importance": 0.42},
            {"variable": "Age", "importance": 0.31},
        ],
    }
    response = (
        "Random Forest:\n"
        "* AUC = 0.892\n"
        "* OOB score = 0.78\n"
        "* MTV_SUV>4 importance = 0.42"
    )
    _check_validation(response, metrics, 3, 3, "random_forest")


# ── 8. CORRELATION ANALYSIS ─────────────────────────────────────────────────

def test_correlation_analysis():
    """Correlation: r and p-value from pairs."""
    metrics = {
        "method": "pearson",
        "pairs": [
            {"var1": "MTV_SUV>4", "var2": "Outcome", "r": 0.45,
             "p_value": 0.0021, "p_bonferroni": 0.042},
        ],
        "strongest_r": 0.45,
        "strongest_pair": "MTV_SUV>4 vs Outcome",
        "n_strong_pairs": 1,
    }
    response = (
        "Correlation analysis:\n"
        "* MTV_SUV>4 and Outcome: r = 0.45, p = 0.002"
    )
    _check_validation(response, metrics, 2, 2, "correlation")


# ── 9. AGREEMENT (KAPPA) ────────────────────────────────────────────────────

def test_agreement_kappa():
    """Cohen's kappa with CI and p-value."""
    metrics = {
        "kappa": 0.78,
        "ci_low": 0.65,
        "ci_high": 0.91,
        "p_value": 0.0001,
        "z_statistic": 5.23,
        "percent_agreement": 85.5,
    }
    response = (
        "Cohen's κ = 0.78 (95% CI: 0.65–0.91), p < 0.001\n"
        "Percent agreement = 85.5%"
    )
    _check_validation(response, metrics, 5, 5, "agreement_kappa")


# ── 10. LASSO REGRESSION ────────────────────────────────────────────────────

def test_lasso_regression():
    """LASSO: selected features with coefficient and OR."""
    metrics = {
        "selected_features": [
            {"feature": "MTV_SUV>4", "display_name": "MTV_SUV>4",
             "coefficient": -1.015, "or": 0.362},
        ],
        "auc": 0.821,
        "intercept": -0.75,
        "best_C": 0.01,
        "n_features_selected": 1,
    }
    response = (
        "LASSO selected:\n"
        "* MTV_SUV>4: coef = -1.015, OR = 0.362\n"
        "* AUC = 0.821"
    )
    _check_validation(response, metrics, 2, 2, "lasso")


# ── 11. ANOVA ───────────────────────────────────────────────────────────────

def test_anova():
    """ANOVA: F-stat, p-value, eta-squared."""
    metrics = {
        "test_name": "ANOVA",
        "F_stat": 12.34,
        "p_value": 0.0015,
        "eta_sq": 0.234,
        "omega_sq": 0.210,
        "significant": True,
    }
    response = (
        "ANOVA: F = 12.34, p = 0.0015\n"
        "η² = 0.234"
    )
    _check_validation(response, metrics, 2, 2, "anova")


# ── 12. NUMERIC COMPARE (T-TEST) ────────────────────────────────────────────

def test_numeric_compare_ttest():
    """T-test: statistic, p-value, Cohen's d."""
    metrics = {
        "test_name": "Independent t-test",
        "statistic": -2.45,
        "p_value": 0.015,
        "cohens_d": -0.52,
        "significant": True,
    }
    response = (
        "Independent t-test: t = -2.45, p = 0.015, Cohen's d = -0.52"
    )
    # t=2.45 not captured by any label pattern, only as unlabeled decimal
    # cohen's d captured
    _check_validation(response, metrics, 2, 2, "ttest")


# ── 13. INDIVIDUAL PREDICTION ───────────────────────────────────────────────

def test_individual_prediction():
    """Individual prediction: class and probability."""
    metrics = {
        "prediction": 1,
        "probability": 0.873,
    }
    response = (
        "Prediction: class = 1, probability = 0.873"
    )
    # class=1 is integer (not decimal), probability=0.873 caught
    _check_validation(response, metrics, 1, 1, "individual_prediction")


# ── 14. SPLINE ANALYSIS ─────────────────────────────────────────────────────

def test_spline_analysis():
    """Spline: LRT p-value and non-linearity p."""
    metrics = {
        "lrt_p": 0.023,
        "nonlinear_p": 0.456,
        "model_comparisons": [
            {"model1": "linear", "model2": "spline", "delta": 0.023,
             "p_value": 0.023},
        ],
    }
    response = (
        "Spline analysis:\n"
        "* LRT p = 0.023\n"
        "* Non-linearity p = 0.456"
    )
    _check_validation(response, metrics, 2, 2, "spline")


# ── 15. SURVIVAL EVALUATION ─────────────────────────────────────────────────

def test_survival_evaluation():
    """Survival evaluation: C-index per stratum/model."""
    metrics = {
        "c_indices": {
            "overall": {"Cox": {"value": 0.723}},
        },
    }
    response = "C-index = 0.723"
    _check_validation(response, metrics, 1, 1, "survival_evaluation")

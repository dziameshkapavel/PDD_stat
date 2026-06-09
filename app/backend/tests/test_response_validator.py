"""Tests for ResponseValidator."""

from app.core.ai.response_validator import (
    CINDEX_CI_PATTERN,
    ResponseValidator,
    ValidationResult,
)

# ── parse_numbers ──────────────────────────────────────────────────────────


def test_parse_numbers_hr():
    text = "HR=1.5"
    result = ResponseValidator.parse_numbers(text)
    labels = [f.label for f in result]
    assert "hr" in labels
    assert any(f.value == 1.5 for f in result)


def test_parse_numbers_or():
    text = "OR = 2.34"
    result = ResponseValidator.parse_numbers(text)
    assert any(f.label == "or" and f.value == 2.34 for f in result)


def test_parse_numbers_skips_p_005():
    """p<0.05 — это порог, а не реальное p-value — должен быть пропущен."""
    text = "p<0.05, HR=1.5"
    result = ResponseValidator.parse_numbers(text)
    for f in result:
        assert not (f.label == "p_value" and f.value == 0.05)


def test_parse_numbers_extracts_true_p_value():
    text = "p=0.032, HR=1.5"
    result = ResponseValidator.parse_numbers(text)
    assert any(f.label == "p_value" and f.value == 0.032 for f in result)


def test_parse_numbers_c_index():
    text = "C-index = 0.81"
    result = ResponseValidator.parse_numbers(text)
    assert any(f.label == "c_index" and f.value == 0.81 for f in result)


def test_parse_numbers_c_index_with_russian():
    """Русские слова между меткой и числом не должны мешать."""
    text = "C-индекс составляет 0.808"
    result = ResponseValidator.parse_numbers(text)
    assert any(f.label == "c_index" for f in result)


def test_parse_numbers_ci_range():
    text = "95% CI: 1.10-2.50"
    result = ResponseValidator.parse_numbers(text)
    ci = [f for f in result if f.label == "ci"]
    assert len(ci) == 2, f"Expected 2 CI values, got {len(ci)}: {[(f.value, f.raw) for f in ci]}"
    assert any(abs(f.value - 1.10) < 0.01 for f in ci)
    assert any(abs(f.value - 2.50) < 0.01 for f in ci)


def test_parse_numbers_ci_dash():
    """CI с длинным тире."""
    text = "95%CI 1.10–2.50"
    result = ResponseValidator.parse_numbers(text)
    ci = [f for f in result if f.label == "ci"]
    assert len(ci) == 2, f"Expected 2 CI values, got {len(ci)}"


def test_parse_numbers_auc():
    text = "AUC = 0.89"
    result = ResponseValidator.parse_numbers(text)
    assert any(f.label == "auc" and f.value == 0.89 for f in result)


def test_parse_numbers_percentage():
    text = "25.3% of patients"
    result = ResponseValidator.parse_numbers(text)
    assert any(f.label == "percentage" and f.value == 25.3 for f in result)


def test_parse_numbers_beta():
    text = "β = -0.45"
    result = ResponseValidator.parse_numbers(text)
    assert any(f.label == "beta" and f.value == -0.45 for f in result)


# ── _check_p_value_interpretation ──────────────────────────────────────────


def test_check_p_significant_correct():
    """p<0.05 + 'статистически значим' — OK."""
    text = "Получено p=0.003, что является статистически значимым."
    errors = ResponseValidator._check_p_value_interpretation(text)
    assert len(errors) == 0


def test_check_p_significant_wrong_negation():
    """p<0.05 + 'не значим' — ошибка."""
    text = "p=0.003, результат не является статистически значимым."
    errors = ResponseValidator._check_p_value_interpretation(text)
    assert len(errors) == 1


def test_check_p_not_significant_correct():
    """p>=0.05 + 'не значим' — OK."""
    text = "p=0.15, что не является статистически значимым."
    errors = ResponseValidator._check_p_value_interpretation(text)
    assert len(errors) == 0


def test_check_p_not_significant_wrong():
    """p>=0.05 + 'значим' — ошибка."""
    text = "p=0.15 — статистически значимое различие."
    errors = ResponseValidator._check_p_value_interpretation(text)
    assert len(errors) == 1


def test_check_p_en_significant_correct():
    text = "p=0.003 which is statistically significant."
    errors = ResponseValidator._check_p_value_interpretation(text)
    assert len(errors) == 0


def test_check_p_en_not_significant_wrong():
    text = "p=0.15 which is statistically significant."
    errors = ResponseValidator._check_p_value_interpretation(text)
    assert len(errors) == 1


# ── _check_ci_completeness ────────────────────────────────────────────────


def test_ci_completeness_hr_with_ci():
    text = "HR=1.5 (95%CI 1.10-2.50)"
    errors = ResponseValidator._check_ci_completeness(text)
    assert len(errors) == 0


def test_ci_completeness_hr_without_ci():
    text = "HR=1.5 is significant"
    errors = ResponseValidator._check_ci_completeness(text)
    assert len(errors) == 1


def test_ci_completeness_or_with_ci():
    text = "OR 2.34, 95% CI: 1.50-3.65"
    errors = ResponseValidator._check_ci_completeness(text)
    assert len(errors) == 0


# ── _flatten_metrics ──────────────────────────────────────────────────────


def test_flatten_metrics_simple():
    metrics = {"hr": 1.5, "p_value": 0.03}
    result = ResponseValidator._flatten_metrics(metrics)
    assert ("hr", 1.5) in result
    assert ("p_value", 0.03) in result


def test_flatten_metrics_nested():
    metrics = {"cox": {"hr": 1.5, "ci_lower": 1.1}}
    result = dict(ResponseValidator._flatten_metrics(metrics))
    assert result.get("cox.hr") == 1.5
    assert result.get("cox.ci_lower") == 1.1


def test_flatten_metrics_list_of_dicts():
    metrics = {"steps": [{"coef": 0.5}, {"coef": -0.3}]}
    result = dict(ResponseValidator._flatten_metrics(metrics))
    assert result.get("steps[0].coef") == 0.5
    assert result.get("steps[1].coef") == -0.3



# ── _filter_hallucinated_ci ───────────────────────────────────────────────


def test_filter_cindex_ci_removed():
    """C-index CI должен быть удалён, т.к. в источнике нет CI-полей."""
    response = "C-index = 0.808 (95%CI 0.65-0.81)"
    metrics = {"c_index": 0.808}
    filtered = ResponseValidator._filter_hallucinated_ci(response, metrics)
    assert "95%CI" not in filtered
    assert "0.808" in filtered


def test_filter_cindex_without_ci_unchanged():
    response = "C-index = 0.808"
    metrics = {"c_index": 0.808}
    filtered = ResponseValidator._filter_hallucinated_ci(response, metrics)
    assert filtered == response


def test_filter_no_cindex_unchanged():
    response = "HR = 1.5 (95%CI 1.10-2.50)"
    metrics = {"hr": 1.5, "ci_lower": 1.10, "ci_upper": 2.50}
    filtered = ResponseValidator._filter_hallucinated_ci(response, metrics)
    assert filtered == response


def test_filter_cindex_with_source_ci_unchanged():
    """Если в метриках есть CI, C-index CI не трогаем."""
    response = "C-index = 0.808 (95%CI 0.65-0.81)"
    metrics = {"c_index": 0.808, "ci_lower": 0.65}
    filtered = ResponseValidator._filter_hallucinated_ci(response, metrics)
    assert "95%CI" in filtered


def test_filter_cindex_pattern_matches():
    text = "C-index = 0.808 (95%CI 0.65-0.81)"
    match = CINDEX_CI_PATTERN.search(text)
    assert match is not None


def test_filter_cindex_pattern_no_match():
    text = "C-index = 0.808"
    match = CINDEX_CI_PATTERN.search(text)
    assert match is None


# ── validate ─────────────────────────────────────────────────────────────


def test_validate_passed():
    response = "HR = 1.5 (95%CI 1.10-2.50)"
    metrics = {"hr": 1.5, "ci_lower": 1.10, "ci_upper": 2.50}
    result = ResponseValidator().validate(response, metrics)
    assert result.passed is True


def test_validate_hallucinated_number():
    response = "HR = 99.99"
    metrics = {"hr": 1.5}
    result = ResponseValidator().validate(response, metrics)
    assert result.passed is False
    assert any("hallucination" in e.lower() for e in result.errors)


def test_validate_forbidden_phrase():
    response = "The result is almost significant"
    metrics = {"p_value": 0.06}
    result = ResponseValidator().validate(response, metrics)
    assert result.passed is False
    assert any("forbidden" in e.lower() for e in result.errors)


def test_validate_cindex_hallucinated_ci():
    """C-index с галлюцинированным CI — CI должен быть отфильтрован."""
    response = "C-index = 0.808 (95%CI 0.65-0.81)"
    metrics = {"c_index": 0.808}
    result = ResponseValidator().validate(response, metrics)
    assert result.passed is True
    assert result.numbers_checked >= 1


# ── _detect_language ─────────────────────────────────────────────────────


def test_detect_language_ru():
    assert ResponseValidator._detect_language("Привет мир") == "ru"


def test_detect_language_en():
    assert ResponseValidator._detect_language("Hello world") == "en"


# ── add_validation_notice ─────────────────────────────────────────────────


def test_validation_notice_ru():
    vr = ValidationResult(passed=True, errors=[], numbers_found=2,
                          numbers_checked=2, numbers_matched=2)
    result = ResponseValidator.add_validation_notice(
        "HR=1.5 — значимый предиктор", vr
    )
    assert "Проверено" in result
    assert "2/2" in result


def test_validation_notice_en():
    vr = ValidationResult(passed=True, errors=[], numbers_found=2,
                          numbers_checked=2, numbers_matched=2)
    result = ResponseValidator.add_validation_notice(
        "HR=1.5 is significant", vr
    )
    assert "Verified" in result
    assert "2/2" in result


def test_validation_notice_zero_numbers():
    vr = ValidationResult(passed=True, errors=[], numbers_found=0,
                          numbers_checked=0, numbers_matched=0)
    result = ResponseValidator.add_validation_notice("Hello", vr)
    assert result == "Hello"


# ── _extract_all_decimals ──────────────────────────────────────────────────


def test_extract_all_decimals_simple():
    text = "AUC was 0.82 and HR was 1.45"
    result = ResponseValidator._extract_all_decimals(text)
    assert 0.82 in result
    assert 1.45 in result
    assert len(result) == 2


def test_extract_all_decimals_no_duplicates():
    text = "value 0.82 and another 0.82"
    result = ResponseValidator._extract_all_decimals(text)
    assert result.count(0.82) == 1


def test_extract_all_decimals_skips_pmid():
    text = "PMID 42256545 and AUC 0.82"
    result = ResponseValidator._extract_all_decimals(text)
    assert 42256545 not in result
    assert 0.82 in result


def test_extract_all_decimals_skips_integers():
    text = "29 patients, 190 samples, AUC 0.82"
    result = ResponseValidator._extract_all_decimals(text)
    assert 0.82 in result
    assert len(result) == 1


# ── _check_unlabeled_numbers ───────────────────────────────────────────────


def test_check_unlabeled_all_match():
    text = "Importance was 0.4216 and OOB was 0.71"
    source_rounded = {0.42, 0.71, 0.82}
    errors, total, matched, unknown = ResponseValidator._check_unlabeled_numbers(
        text, source_rounded, set()
    )
    assert errors == []
    assert total == 2
    assert matched == 2
    assert unknown == 0


def test_check_unlabeled_unknown_detected():
    text = "Unknown metric: 0.99"
    source_rounded = {0.42, 0.71, 0.82}
    errors, total, matched, unknown = ResponseValidator._check_unlabeled_numbers(
        text, source_rounded, set()
    )
    assert len(errors) == 1
    assert "unlabeled" in errors[0].lower()
    assert total == 1
    assert matched == 0
    assert unknown == 1


def test_check_unlabeled_skips_labeled():
    """Числа, уже проверенные через parse_numbers, не добавляют ошибок."""
    text = "HR = 1.45 and AUC was 0.82"
    source_rounded = {1.45, 0.82, 0.71}
    labeled = {1.45, 0.82}
    errors, total, matched, unknown = ResponseValidator._check_unlabeled_numbers(
        text, source_rounded, labeled
    )
    # Both numbers are labeled = counted as matched, no errors
    assert errors == []
    assert total == 2
    assert matched == 2
    assert unknown == 0


def test_check_unlabeled_mixed():
    """Часть чисел совпадает, часть нет."""
    text = "AUC 0.82, unknown 0.99, and OOB 0.71"
    source_rounded = {0.82, 0.71}
    errors, total, matched, unknown = ResponseValidator._check_unlabeled_numbers(
        text, source_rounded, set()
    )
    assert len(errors) >= 1
    assert any("0.99" in e for e in errors)
    assert total == 3
    assert matched == 2
    assert unknown >= 1


# ── validate with systematic check ──────────────────────────────────────────


def test_validate_systematic_all_good():
    """Все десятичные числа присутствуют в source-метриках."""
    response = ("HR = 1.45 (95%CI 1.10-2.50), "
                "model OOB score was 0.71")
    metrics = {"hr": 1.45, "ci_lower": 1.10, "ci_upper": 2.50,
               "oob_score": 0.71}
    result = ResponseValidator().validate(response, metrics)
    assert result.passed is True
    assert result.total_decimals >= 1
    assert result.unknown_decimals == 0


def test_validate_systematic_finds_hallucinated_decimal():
    """Галлюцинированное десятичное число (Importance=0.99) ловится."""
    response = ("The most important feature was MTV_SUV>4 "
                "with importance 0.99")
    metrics = {"auc": 0.82, "oob_score": 0.71,
               "top_features": [{"importance": 0.42}]}
    result = ResponseValidator().validate(response, metrics)
    assert result.passed is False
    assert any("unlabeled" in e.lower() for e in result.errors)
    assert result.total_decimals >= 1
    assert result.unknown_decimals >= 1


def test_validate_notice_has_total_decimals():
    """Валидационное уведомление включает строку total_decimals."""
    vr = ValidationResult(
        passed=True, errors=[], numbers_found=2,
        numbers_checked=2, numbers_matched=2,
        total_decimals=3, decimals_matched=3, unknown_decimals=0,
    )
    result = ResponseValidator.add_validation_notice("HR=1.5, AUC=0.82", vr)
    assert "Все числа" in result or "All numbers" in result
    assert "3/3" in result

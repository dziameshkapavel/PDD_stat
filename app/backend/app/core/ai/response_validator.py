"""
ResponseValidator — проверка ответа ИИ на соответствие исходным данным.
"""

import logging
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# Pattern to remove hallucinated 95% CI for C-index
# Matches "C-index = 0.808 (95%CI 0.65-0.81)" and variants
CINDEX_CI_PATTERN = re.compile(
    r"(c-index|C-index|concordance)"
    r"\s*[=:≈]?\s*[0-9]+[.][0-9]+"
    r"[\s,;]*\(?95%\s*(?:CI|confidence\s*interval)\s*[=:≈]?\s*"
    r"[0-9]+[.][0-9]+\s*[-–]\s*[0-9]+[.][0-9]+\)?",
    re.IGNORECASE
)

PMID_PATTERN = re.compile(r'(?:PMID|PubMed\s*ID|pmid)\s*:?\s*(\d{8})', re.IGNORECASE)

FORBIDDEN_PHRASES = [
    "almost significant",
    "trend toward significance",
    "borderline significant",
    "nearly significant",
    "approaching significance",
    "почти значимо",
    "тенденция к значимости",
    "вызывает",
    "приводит к",
]

# Patterns to detect p-value misinterpretation
# For p<0.05: near the p-value, check for negation words
NEGATION_PATTERNS_RU = re.compile(
    r'\bне\b',
    re.IGNORECASE
)
NEGATION_PATTERNS_EN = re.compile(
    r'(not\s+(?:significant)|'
    r'non.significant|no\s+(?:association|relationship))',
    re.IGNORECASE
)
SIGNIFICANCE_PATTERNS_RU = re.compile(
    r'(статистически\s+значим|значим[аяоы]|достоверн)',
    re.IGNORECASE
)
SIGNIFICANCE_PATTERNS_EN = re.compile(
    r'\b(statistically\s+significant)\b',
    re.IGNORECASE
)

# Regex patterns to extract numbers with context labels
NUM_PATTERNS = {
    "hr": re.compile(r"(?:HR|hazard\s*ratio)\s*[=:≈]?\s*([0-9]+[.][0-9]+)", re.IGNORECASE),
    "or": re.compile(r"(?:OR|odds\s*ratio)\s*[=:≈]?\s*([0-9]+[.][0-9]+)", re.IGNORECASE),
    "beta": re.compile(r"[ββ]\s*[=:≈]?\s*(-?[0-9]+[.][0-9]+)", re.IGNORECASE),
    "p_value": re.compile(
        r"(?:p|p-value|p\s*value)\s*[=:≈<>]?\s*([0-9]+[.]?[0-9]*(?:e[+-]?[0-9]+)?)",
        re.IGNORECASE,
    ),
    "c_index": re.compile(r"(?:c-index|C-index|concordance|C-индекс)[^0-9]*?([0-9]+[.][0-9]+)", re.IGNORECASE),
    "auc": re.compile(r"(?:AUC|auc)\s*[=:≈]?\s*([0-9]+[.][0-9]+)", re.IGNORECASE),
    "percentage": re.compile(r"(?<!\d)([0-9]+[.]?[0-9]*)\s*%(?!\s*(?:CI|confidence|ДИ|доверит))"),
    "ci": re.compile(
        r"(?:95%\s*(?:CI|confidence\s*interval)\s*[=:≈]?\s*)?"
        r"([0-9]+[.][0-9]+)\s*[-–]\s*([0-9]+[.][0-9]+)",
        re.IGNORECASE
    ),
    "mean": re.compile(
        r"(?:mean|Mean|среднее)\s*(?:[a-zа-яё]+\s+)*?([0-9]+[.][0-9]+)",
        re.IGNORECASE,
    ),
    "median": re.compile(
        r"(?:median|Median|медиана)\s*(?:[a-zа-яё]+\s+)*?([0-9]+[.][0-9]+)",
        re.IGNORECASE,
    ),
    "std": re.compile(
        r"(?:std|Std|SD|standard\s*deviation|σ)\s*(?:[a-zа-яё]+\s+)*?([0-9]+[.][0-9]+)",
        re.IGNORECASE,
    ),
    "kappa": re.compile(r"(?:[κκ]\s*[=:≈]?\s*|kappa\s*[=:≈]?\s*|коэффицент\s+каппа\s*[=:≈]?\s*)([0-9]+[.][0-9]+)", re.IGNORECASE),
    "z_stat": re.compile(r"\bz\s*[=:≈]?\s*(-?[0-9]+[.][0-9]+)", re.IGNORECASE),
    "brier": re.compile(
        r"(?:Brier|brier)\s*(?:score)?\s*(?:was|is|=|:)\s*([0-9]+[.][0-9]+)",
        re.IGNORECASE,
    ),
    "threshold": re.compile(
        r"(?:threshold|cut.?off|порог)\s*(?:value)?\s*(?:was|is|=|:)\s*([0-9]+[.][0-9]+)",
        re.IGNORECASE,
    ),
    "cal_intercept": re.compile(
        r"(?:calibration\s*intercept|intercept)\s*(?:of|was|is|=|:)\s*(-?[0-9]+[.][0-9]+)",
        re.IGNORECASE,
    ),
    "cal_slope": re.compile(
        r"(?:calibration\s*slope|slope)\s*(?:of|was|is|=|:)\s*(-?[0-9]+[.][0-9]+)",
        re.IGNORECASE,
    ),
}

# Check for CI presence near HR/OR
CI_NEAR_HR = re.compile(
    r"(?:HR|hazard\s*ratio|OR|odds\s*ratio)[^.]*?"
    r"(?:95%\s*(?:CI|confidence\s*interval)|"
    r"[0-9]+[.]?[0-9]*\s*[-–]\s*[0-9]+[.]?[0-9]*)",
    re.IGNORECASE,
)


@dataclass
class FoundNumber:
    value: float
    label: str
    raw: str


@dataclass
class ValidationResult:
    passed: bool
    errors: list[str] = field(default_factory=list)
    numbers_found: int = 0
    numbers_checked: int = 0
    numbers_matched: int = 0
    citations_checked: int = 0
    citations_matched: int = 0
    total_decimals: int = 0
    decimals_matched: int = 0
    unknown_decimals: int = 0
    unmapped_numbers: list[tuple[str, str]] = field(default_factory=list)  # [(value_str, label), ...]


class ResponseValidator:
    """Проверяет ответ ИИ на соответствие исходным метрикам."""

    # Tolerance for numerical comparison — exact match only
    TOLERANCE = 0.0

    @staticmethod
    def _check_number_in_source(
        number: float,
        source_rounded: set,
        abs_tolerance: float = 0.0,
        rel_tolerance: float = 0.0,
    ) -> bool:
        """
        Проверяет число в источнике: ТОЛЬКО точное совпадение
        после округления обоих значений до 2 знаков.
        """
        rounded = round(number, 2)
        for sv in source_rounded:
            if abs(rounded - sv) <= abs_tolerance:
                return True
            if sv != 0 and abs(rounded - sv) / abs(sv) <= rel_tolerance:
                return True
        return False

    @staticmethod
    def _extract_sentence(text: str, position: int) -> str:
        """Извлекает предложение, содержащее позицию position.
        Использует '. ' (точка+пробел) или '.\n' как границу предложения,
        чтобы не путать с десятичной точкой."""
        start = 0
        for sep in ('. ', '.\n', '! ', '? '):
            idx = text.rfind(sep, 0, position)
            if idx != -1:
                start = max(start, idx + len(sep))
        end = len(text)
        for sep in ('. ', '.\n', '! ', '? '):
            idx = text.find(sep, position)
            if idx != -1:
                end = idx
                break
        return text[start:end].strip().lower()

    @staticmethod
    def _check_p_value_interpretation(text: str) -> list[str]:
        """
        Проверяет корректность интерпретации p-value.
        p<0.05 → должно быть "statistically significant", не "not significant"
        p>=0.05 → должно быть "not significant", не "significant"
        """
        errors = []
        found = ResponseValidator.parse_numbers(text)

        for fn in found:
            if fn.label != "p_value":
                continue

            p_val = fn.value
            idx = text.lower().find(fn.raw.lower())
            if idx == -1:
                continue

            sentence = ResponseValidator._extract_sentence(text, idx)

            is_significant = p_val < 0.05
            has_negation = bool(
                NEGATION_PATTERNS_RU.search(sentence) or NEGATION_PATTERNS_EN.search(sentence)
            )
            has_signif = bool(
                SIGNIFICANCE_PATTERNS_RU.search(sentence) or SIGNIFICANCE_PATTERNS_EN.search(sentence)
            )

            # Only flag if both negation AND significance words appear in the SAME sentence
            # with the p-value — this avoids cross-sentence contamination
            if is_significant and has_negation and has_signif:
                errors.append(
                    f"p={p_val:.4f} (<0.05) is statistically significant but response says "
                    f"it's not significant near: '{sentence[:80]}'"
                )
            elif not is_significant and has_signif and not has_negation:
                errors.append(
                    f"p={p_val:.4f} (>=0.05) is NOT significant but response calls "
                    f"it significant near: '{sentence[:80]}'"
                )

        return errors

    @staticmethod
    def _detect_language(text: str) -> str:
        """Определяет язык текста по наличию кириллицы."""
        if re.search('[а-яА-ЯёЁ]', text):
            return "ru"
        return "en"

    @staticmethod
    def _filter_hallucinated_ci(response: str, metrics: dict[str, Any]) -> str:
        """Удаляет галлюцинированный 95% CI для C-index, если в метриках нет CI-полей."""
        flat = dict(ResponseValidator._flatten_metrics(metrics))
        has_c_index = any("c_index" in k for k in flat)
        has_ci_source = any("ci" in k.lower() for k in flat if "c_index" not in k.lower())

        if not (has_c_index and not has_ci_source):
            return response

        def _replace(m):
            text = m.group(0)
            ci_match = re.search(r"95%\s*(?:CI|confidence\s*interval)", text)
            if ci_match:
                return text[:ci_match.start()].strip().rstrip("(,; ")
            return text

        return CINDEX_CI_PATTERN.sub(_replace, response)

    @staticmethod
    def _extract_all_decimals(text: str) -> list[float]:
        """Извлекает ВСЕ десятичные числа (вида 0.73, 14.2) из текста, игнорируя PMID."""
        pattern = re.compile(r'(?<!\d)(\d+\.\d+)(?!\d)')
        result = []
        seen = set()
        for m in pattern.finditer(text):
            val = round(float(m.group(1)), 6)
            if val in seen:
                continue
            seen.add(val)
            # Skip PMIDs (8-digit identifiers)
            if 10000000 <= val <= 99999999:
                continue
            result.append(val)
        return result

    @staticmethod
    def _check_unlabeled_numbers(
        response: str,
        source_rounded: set,
        labeled_values: set,
    ) -> tuple[list[str], int, int, int]:
        """
        Проверяет ВСЕ десятичные числа в ответе против source-метрик.
        Пропускает числа, уже проверенные через parse_numbers.
        Возвращает (errors, total_decimals, decimals_matched, unknown_decimals).
        """
        errors = []
        all_decimals = ResponseValidator._extract_all_decimals(response)
        total = len(all_decimals)
        matched = 0
        unknown = 0

        for val in all_decimals:
            # Skip if already caught by parse_numbers (exact match only)
            if any(abs(val - lv) <= ResponseValidator.TOLERANCE for lv in labeled_values):
                matched += 1
                continue
            if ResponseValidator._check_number_in_source(val, source_rounded):
                matched += 1
            else:
                unknown += 1
                # Find context
                str_val = str(val) if val == int(val) else f"{val:.6g}"
                response_lower = response.lower()
                idx = response_lower.find(str_val)
                if idx == -1:
                    str_val = f"{val:.2f}"
                    idx = response_lower.find(str_val)
                if idx == -1:
                    str_val = f"{val:.4f}"
                    idx = response_lower.find(str_val)
                ctx = ""
                if idx >= 0:
                    start = max(0, idx - 50)
                    end = min(len(response), idx + len(str_val) + 50)
                    ctx = response[start:end].strip()
                errors.append(
                    f"Unlabeled number '{val}' not found in source metrics"
                    + (f": ...{ctx}..." if ctx else "")
                )

        return errors, total, matched, unknown

    @staticmethod
    def _extract_pmids(text: str) -> list[str]:
        """Извлекает все PMID из текста."""
        return [m.group(1) for m in PMID_PATTERN.finditer(text)]

    @staticmethod
    def _check_number_in_abstract(
        number: float, article_text: str
    ) -> bool:
        """Проверяет, встречается ли число в тексте статьи."""
        text = article_text.lower()

        # Check integer/float representation
        for fmt in [
            f"{number:.0f}", f"{number:.1f}", f"{number:.2f}",
            f"{number:.0f}.0",
        ]:
            val = float(fmt)
            if val == number and fmt in text:
                return True

        # Check percentage: 78% or 78 % or 0.78 (as proportion)
        if 0 < number <= 100:
            pct_str = f"{number:.0f}%"
            if pct_str in text or pct_str.replace("%", " %") in text:
                return True
            # Also check as proportion e.g. 0.78 for 78%
            as_proportion = f"{number / 100:.2f}"
            if as_proportion in text:
                return True

        # Check as percent if it's a small decimal (e.g. 0.78)
        if 0 < number < 10:
            as_pct = f"{number * 100:.0f}%"
            if as_pct in text or as_pct.replace("%", " %") in text:
                return True

        return False

    @staticmethod
    def _check_citations(
        response: str, pubmed_articles: list[dict]
    ) -> list[str]:
        """Проверяет числа в предложениях с PMID против текста статей."""
        errors = []
        pmids = ResponseValidator._extract_pmids(response)
        if not pmids:
            return errors

        article_map = {a.get("pmid", ""): a for a in pubmed_articles}
        # Pattern to find any number (int or float) in text
        any_number = re.compile(r'(?<!\d)(\d+[.]?\d*)(?!\d)')

        for pmid in set(pmids):
            article = article_map.get(pmid)
            if not article:
                errors.append(
                    f"Cited PMID {pmid} not found in project PubMed articles"
                )
                continue

            article_text = f"{article.get('title', '')} {article.get('abstract', '')}"

            # Find citation positions in response
            for match in PMID_PATTERN.finditer(response):
                if match.group(1) != pmid:
                    continue
                idx = match.start()
                sentence = ResponseValidator._extract_sentence(response, idx)
                if not sentence:
                    continue

                # 1. Check labeled numbers via parse_numbers
                from_numbers = ResponseValidator.parse_numbers(sentence)
                for fn in from_numbers:
                    if not ResponseValidator._check_number_in_abstract(
                        fn.value, article_text
                    ):
                        errors.append(
                            f"Number '{fn.raw}' ({fn.label}) in sentence "
                            f"citing PMID {pmid} not found in article abstract: "
                            f"'{sentence[:120]}'"
                        )

                # 2. Check ANY number in the citation sentence
                #    (including standalone numbers without labels)
                for num_match in any_number.finditer(sentence):
                    try:
                        value = float(num_match.group(1))
                    except ValueError:
                        continue
                    # Skip the PMID itself (8-digit identifier)
                    if 10000000 <= value <= 99999999:
                        continue
                    # Skip if already checked via parse_numbers
                    already = any(
                        abs(fn.value - value) < 0.001 for fn in from_numbers
                    )
                    if already:
                        continue
                    if not ResponseValidator._check_number_in_abstract(
                        value, article_text
                    ):
                        errors.append(
                            f"Number '{value}' in sentence citing PMID {pmid} "
                            f"not found in article abstract: "
                            f"'{sentence[:120]}'"
                        )

        return errors

    @staticmethod
    def _fmt_label(label: str) -> str:
        """Human-readable label for display."""
        mapping = {
            "hr": "HR", "or": "OR", "auc": "AUC", "ci": "CI",
            "p_value": "p", "c_index": "C-index", "beta": "β",
            "kappa": "κ", "brier": "Brier", "cal_intercept": "cal_intercept",
            "cal_slope": "cal_slope",
        }
        return mapping.get(label, label)

    @staticmethod
    def add_validation_notice(response: str, v_result: ValidationResult) -> str:
        """Добавляет в конец ответа уведомление о проверке чисел."""
        parts = []
        if v_result.numbers_checked > 0:
            ratio = f"{v_result.numbers_matched}/{v_result.numbers_checked}"
            line = f"✅ Verified: {ratio} numbers match source data"
            if v_result.numbers_matched < v_result.numbers_checked:
                unmatched = [
                    f"{val} ({ResponseValidator._fmt_label(label)})"
                    for val, label in v_result.unmapped_numbers
                ]
                if unmatched:
                    line += "\n" + f"❌ Not found in source: {'; '.join(unmatched[:5])}"
            parts.append(line)

        if v_result.citations_checked > 0:
            parts.append(f"📖 Citations: {v_result.citations_matched}/{v_result.citations_checked} verified")

        if parts:
            return response + "\n\n" + "\n".join(parts)
        return response

    @staticmethod
    def _flatten_metrics(metrics: dict[str, Any], prefix: str = "") -> list[tuple[str, float]]:
        """Рекурсивно извлекает все числовые значения из metrics."""
        result = []
        for key, value in metrics.items():
            full_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                if not (isinstance(value, float) and (value != value)):  # skip NaN
                    result.append((full_key, float(value)))
            elif isinstance(value, dict):
                result.extend(ResponseValidator._flatten_metrics(value, full_key))
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                for idx, item in enumerate(value):
                    for item_key, item_val in item.items():
                        if isinstance(item_val, (int, float)) and not isinstance(item_val, bool):
                            if isinstance(item_val, float) and (item_val != item_val):
                                continue
                            result.append((f"{full_key}[{idx}].{item_key}", float(item_val)))
        return result

    @staticmethod
    def parse_numbers(text: str) -> list[FoundNumber]:
        """Извлекает все числа с контекстными метками из текста."""
        found = []
        seen_values = set()
        seen_keys = set()

        for label, pattern in NUM_PATTERNS.items():
            for match in pattern.finditer(text):
                ngroups = pattern.groups
                for gi in range(1, ngroups + 1):
                    try:
                        value = float(match.group(gi))
                    except (ValueError, TypeError):
                        continue
                    # Skip "p<0.05" threshold — not a real p-value
                    if label == "p_value" and value == 0.05:
                        continue
                    rounded = round(value, 2)
                    key = (label, gi, match.group(0))
                    if rounded not in seen_values and key not in seen_keys:
                        seen_values.add(rounded)
                        seen_keys.add(key)
                        found.append(FoundNumber(value=value, label=label, raw=match.group(0)))

        return found

    @staticmethod
    def _check_ci_completeness(text: str) -> list[str]:
        """Проверяет, что при упоминании HR/OR указан 95% CI."""
        errors = []
        mentions = re.findall(r"\b(HR|hazard\s*ratio|OR|odds\s*ratio)\b", text, re.IGNORECASE)
        for mention in set(m.lower().replace(" ", "_") for m in mentions):
            for match in re.finditer(
                rf"\b{re.escape(mention.replace('_', ' ?'))}\b", text, re.IGNORECASE
            ):
                start = match.start()
                # Find end of sentence (period + space, end of string, newline, etc.)
                text[start:]
                sentence_end = len(text)
                for sep in (". ", ".\n", "!", "?", "\n"):
                    pos = text.find(sep, start)
                    if pos != -1:
                        sentence_end = min(sentence_end, pos + len(sep) - 1)
                        break
                segment = text[start:sentence_end]
                has_number = bool(re.search(r"[=:≈]\s*[0-9]+[.][0-9]+", segment))
                has_ci = bool(
                    re.search(
                        r"95%\s*(?:CI|confidence\s*interval)|[0-9]+[.]?[0-9]*\s*[-–]\s*[0-9]+[.]?[0-9]*",
                        segment,
                    )
                )
                if has_number and not has_ci:
                    errors.append(
                        f"'{mention.replace('_', ' ').upper()}' mentioned without 95% CI in: "
                        f"'{segment[:80]}'"
                    )
        return errors

    def validate(
        self,
        response: str,
        metrics: dict[str, Any],
        pubmed_articles: list[dict] | None = None,
    ) -> ValidationResult:
        """
        Проверяет ответ ИИ на соответствие исходным метрикам.

        - Извлекает числа из ответа
        - Сверяет с source-метриками (с допуском ±TOLERANCE)
        - Ищет запрещённые фразы
        - Проверяет полноту CI
        - Проверяет цитаты PubMed (если передан pubmed_articles)
        """
        errors = []

        # 0. Filter hallucinated C-index CI before validation
        response = self._filter_hallucinated_ci(response, metrics)

        # 1. Parse numbers from response
        found_numbers = self.parse_numbers(response)
        numbers_checked = len(found_numbers)

        # 2. Flatten source metrics
        source_values = [v for _, v in self._flatten_metrics(metrics)]
        # Normalize all source values to 2 decimal places for comparison
        source_rounded = {round(v, 2) for v in source_values}

        # 3. Check each number against source values
        unmatched = []
        matched = 0
        for fn in found_numbers:
            if self._check_number_in_source(fn.value, source_rounded,
                                            self.TOLERANCE, self.TOLERANCE):
                matched += 1
            else:
                unmatched.append(fn)

        # Report unmatched numbers (potential hallucinations)
        if unmatched:
            examples = "; ".join(f"{fn.raw} ({fn.label})" for fn in unmatched[:5])
            errors.append(
                f"Numbers not found in source metrics (potential hallucination): {examples}"
            )

        # CI diagnostic: log when CI bounds don't match source
        ci_unmatched = [fn for fn in unmatched if fn.label == "ci"]
        if ci_unmatched:
            logger.warning(
                "CI numbers not found in source_rounded: %s | source_rounded=%s",
                [(fn.raw, fn.value) for fn in ci_unmatched],
                sorted(source_rounded),
            )

        # 3b. Systematic check: check ALL decimal numbers against source
        labeled_values = {round(fn.value, 2) for fn in found_numbers}
        unlabeled_errors, total_decimals, decimals_matched, unknown = \
            self._check_unlabeled_numbers(response, source_rounded, labeled_values)
        errors.extend(unlabeled_errors)

        # 4. Check forbidden phrases
        lower_resp = response.lower()
        for phrase in FORBIDDEN_PHRASES:
            if phrase.lower() in lower_resp:
                errors.append(f"Contains forbidden phrase: '{phrase}'")

        # 5. Check CI completeness
        ci_errors = self._check_ci_completeness(response)
        errors.extend(ci_errors)

        # 6. Check p-value interpretation
        p_errors = self._check_p_value_interpretation(response)
        errors.extend(p_errors)

        # 7. Check PubMed citations
        citations_checked = 0
        citations_matched = 0
        if pubmed_articles:
            citation_errors = self._check_citations(response, pubmed_articles)
            pmids_checked = len(set(self._extract_pmids(response)))
            if pmids_checked > 0:
                citations_checked = pmids_checked
                citations_matched = max(0, pmids_checked - len(citation_errors))
            errors.extend(citation_errors)

        unmapped = []
        for fn in unmatched[:5]:
            try:
                val = f"{fn.value:.3g}"
            except (ValueError, OverflowError):
                val = str(fn.value)
            unmapped.append((val, fn.label))

        return ValidationResult(
            passed=len(errors) == 0,
            errors=errors,
            numbers_found=len(found_numbers),
            numbers_checked=numbers_checked,
            numbers_matched=matched,
            citations_checked=citations_checked,
            citations_matched=citations_matched,
            total_decimals=total_decimals,
            decimals_matched=decimals_matched,
            unknown_decimals=unknown,
            unmapped_numbers=unmapped,
        )

    @classmethod
    async def auto_retry(
        cls,
        response: str,
        metrics: dict[str, Any],
        llm_rewrite_fn: Callable[[str, Any], Any],
        max_retries: int = 2,
        response_language: str = "en",
        pubmed_articles: list[dict] | None = None,
    ) -> tuple[str, bool, ValidationResult]:
        """
        Цикл: validate → при ошибке → correction_prompt + повторный вызов LLM.
        Возвращает (исправленный_ответ, validation_passed, последний_ValidationResult).
        """
        current_response = cls._filter_hallucinated_ci(response, metrics)
        last_result = cls().validate(current_response, metrics, pubmed_articles)

        for _attempt in range(max_retries):
            if last_result.passed:
                break

            # Build correction prompt with specific errors in the right language
            error_text = "\n".join(f"- {e}" for e in last_result.errors)
            if response_language == "ru":
                correction_msg = (
                    "Твой предыдущий ответ содержит ошибки:\n"
                    f"{error_text}\n\n"
                    "Исправь ответ. Используй ТОЛЬКО числа из раздела "
                    '"LAST ANALYSIS". '
                    "Не округляй числа — используй ТОЧНЫЕ значения, "
                    "сохраняя все знаки после запятой как в источнике. "
                    "Для цитат статей используй ТОЛЬКО числа, "
                    "которые реально есть в абстракте статьи. "
                    "Не извиняйся, не начинай с 'Прошу прощения' — "
                    "просто дай исправленный ответ. "
                    "Сохрани контекст вопроса пользователя и ответь на том же языке (русском)."
                )
            else:
                correction_msg = (
                    "Your previous response contains errors:\n"
                    f"{error_text}\n\n"
                    "Correct the response. Use ONLY numbers from the "
                    '"LAST ANALYSIS" section. '
                    "Do NOT round numbers — use EXACT values, "
                    "preserving all decimal places as in the source. "
                    "For cited articles, use ONLY numbers that actually "
                    "appear in the article abstract. "
                    "Do NOT apologize or start with 'I'm sorry' — "
                    "just provide the corrected answer. "
                    "Keep the context of the user's question and respond in the same language."
                )

            # Call LLM with correction prompt
            try:
                if callable(llm_rewrite_fn):
                    corrected = await llm_rewrite_fn(correction_msg)
                else:
                    break

                if corrected and isinstance(corrected, str) and corrected.strip():
                    current_response = corrected.strip()
                else:
                    break
            except Exception:
                break

            last_result = cls().validate(current_response, metrics, pubmed_articles)

        return current_response, last_result.passed, last_result

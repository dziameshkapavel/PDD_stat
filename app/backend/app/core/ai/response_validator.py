"""
ResponseValidator — проверка ответа ИИ на соответствие исходным данным.
"""
from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

# Pattern to remove hallucinated 95% CI for C-index
# Matches "C-index = 0.808 (95%CI 0.65-0.81)" and variants
CINDEX_CI_PATTERN = re.compile(
    r"(c-index|C-index|concordance)"
    r"\s*[=:≈]?\s*[0-9]+[.][0-9]+"
    r"[\s,;]*\(?95%\s*(?:CI|confidence\s*interval)\s*[=:≈]?\s*"
    r"[0-9]+[.][0-9]+\s*[-–]\s*[0-9]+[.][0-9]+\)?",
    re.IGNORECASE
)

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
    "percentage": re.compile(r"(?<!\d)([0-9]+[.]?[0-9]*)\s*%(?!\s*(?:CI|confidence))"),
    "ci": re.compile(
        r"(?:95%\s*(?:CI|confidence\s*interval)\s*[=:≈]?\s*)?"
        r"([0-9]+[.][0-9]+)\s*[-–]\s*([0-9]+[.][0-9]+)",
        re.IGNORECASE
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


class ResponseValidator:
    """Проверяет ответ ИИ на соответствие исходным метрикам."""

    # Tolerance for numerical comparison
    TOLERANCE = 0.01

    @staticmethod
    def _check_number_in_source(
        number: float,
        source_rounded: set,
        abs_tolerance: float = 0.01,
        rel_tolerance: float = 0.01,
    ) -> bool:
        """
        Проверяет число в источнике: абсолютный допуск ±0.01 или
        относительный ±1% (для больших значений, например chi²=29.5).
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
    def add_validation_notice(response: str, v_result: ValidationResult) -> str:
        """Добавляет в конец ответа уведомление о проверке чисел."""
        if v_result.numbers_checked == 0:
            return response
        checked = v_result.numbers_checked
        matched = v_result.numbers_matched
        lang = ResponseValidator._detect_language(response)
        if lang == "ru":
            notice = f"\n\n✅ Проверено: {matched}/{checked} чисел совпадают с источником"
        else:
            notice = f"\n\n✅ Verified: {matched}/{checked} numbers match source data"
        return response + notice

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

    def validate(self, response: str, metrics: dict[str, Any]) -> ValidationResult:
        """
        Проверяет ответ ИИ на соответствие исходным метрикам.

        - Извлекает числа из ответа
        - Сверяет с source-метриками (с допуском ±TOLERANCE)
        - Ищет запрещённые фразы
        - Проверяет полноту CI
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
                                            self.TOLERANCE, 0.01):
                matched += 1
            else:
                unmatched.append(fn)

        # Report unmatched numbers (potential hallucinations)
        if unmatched:
            examples = "; ".join(f"{fn.raw} ({fn.label})" for fn in unmatched[:5])
            errors.append(
                f"Numbers not found in source metrics (potential hallucination): {examples}"
            )

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

        return ValidationResult(
            passed=len(errors) == 0,
            errors=errors,
            numbers_found=len(found_numbers),
            numbers_checked=numbers_checked,
            numbers_matched=matched,
        )

    @classmethod
    async def auto_retry(
        cls,
        response: str,
        metrics: dict[str, Any],
        llm_rewrite_fn: Callable[[str, Any], Any],
        max_retries: int = 2,
        response_language: str = "en",
    ) -> tuple[str, bool, ValidationResult]:
        """
        Цикл: validate → при ошибке → correction_prompt + повторный вызов LLM.
        Возвращает (исправленный_ответ, validation_passed, последний_ValidationResult).
        """
        current_response = cls._filter_hallucinated_ci(response, metrics)
        last_result = cls().validate(current_response, metrics)

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

            last_result = cls().validate(current_response, metrics)

        return current_response, last_result.passed, last_result

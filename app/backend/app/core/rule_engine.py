"""
Детерминированные правила классификации колонок для очистки.
Выделены из PlannerAgent.
"""
from __future__ import annotations

from typing import Any

import pandas as pd


def classify_column(df: pd.DataFrame, col: str) -> dict[str, Any] | None:
    """Возвращает роль колонки или None."""
    series = df[col]
    missing_pct = (series.isna().sum() / len(df)) * 100
    unique_count = series.nunique()
    total_rows = len(df)
    str(series.dtype)

    # HARD: >30% пропусков → HIGH_MISSING
    if missing_pct > 30:
        return {
            "role": "HIGH_MISSING",
            "confidence": 1.0,
            "level": "HARD",
            "reasoning": f"Более 30% пропусков ({missing_pct:.1f}%)"
        }

    # HARD: 1 уникальное значение → CONSTANT
    if unique_count == 1:
        return {
            "role": "CONSTANT",
            "confidence": 1.0,
            "level": "HARD",
            "reasoning": "Только одно уникальное значение"
        }

    # HARD: идентификатор (все значения уникальны)
    if unique_count == total_rows and total_rows > 10:
        return {
            "role": "IDENTIFIER",
            "confidence": 0.95,
            "level": "HARD",
            "reasoning": "Все значения уникальны — вероятно, идентификатор"
        }

    # HARD: технические префиксы
    col_upper = col.upper()
    if any(col_upper.startswith(p) for p in ['INFO_', 'CHECK_', 'PARAMS_', 'PRIVATE_', 'UNNAMED']):
        return {
            "role": "TECHNICAL_ARTIFACT",
            "confidence": 1.0,
            "level": "HARD",
            "reasoning": "Техническая колонка (префикс)"
        }

    # SOFT: 20-30% пропусков
    if missing_pct > 20:
        return {
            "role": "HIGH_MISSING",
            "confidence": 0.7,
            "level": "SOFT",
            "reasoning": f"20-30% пропусков ({missing_pct:.1f}%)"
        }

    return None


def generate_cleaning_plan(df: pd.DataFrame, user_specified: dict[str, str] = None) -> dict[str, Any]:
    """
    Генерирует план очистки на основе правил.
    user_specified: {'target': 'col1', 'time': 'col2', 'event': 'col3'} — не трогать.
    """
    user_cols = set(user_specified.values()) if user_specified else set()
    plan = {
        "drop_columns": [],
        "to_impute": [],
        "imputation_log": []
    }

    for col in df.columns:
        if col in user_cols:
            continue
        classification = classify_column(df, col)
        if classification and classification["role"] in ("HIGH_MISSING", "CONSTANT", "IDENTIFIER", "TECHNICAL_ARTIFACT"):
            plan["drop_columns"].append(col)

    for col in df.columns:
        if col in plan["drop_columns"] or col in user_cols:
            continue
        missing = df[col].isna().sum()
        if missing > 0:
            method = "median" if pd.api.types.is_numeric_dtype(df[col]) else "mode"
            plan["to_impute"].append({"column": col, "method": method})
            plan["imputation_log"].append({
                "column": col,
                "method": method,
                "reason": f"{missing} missing values"
            })

    return plan


def apply_cleaning_plan(df: pd.DataFrame, plan: dict[str, Any]) -> pd.DataFrame:
    """Применяет план очистки к копии DataFrame."""
    df_clean = df.copy()
    if plan.get("drop_columns"):
        df_clean = df_clean.drop(columns=plan["drop_columns"], errors='ignore')
    for item in plan.get("to_impute", []):
        col = item["column"]
        if col not in df_clean.columns:
            continue
        if item["method"] == "median":
            df_clean[col] = df_clean[col].fillna(df_clean[col].median())
        elif item["method"] == "mode":
            mode_val = df_clean[col].mode()
            if not mode_val.empty:
                df_clean[col] = df_clean[col].fillna(mode_val[0])
    return df_clean

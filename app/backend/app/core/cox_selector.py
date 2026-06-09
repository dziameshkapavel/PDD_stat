"""
Cox Variable Selector - Forward/Backward selection algorithms
Переписан: LabelEncoder → dummy-кодирование с референсной группой
"""

from typing import Any

import pandas as pd
from lifelines import CoxPHFitter


class CoxVariableSelector:
    """Класс для пошагового отбора переменных в регрессии Кокса"""

    def __init__(
        self,
        df: pd.DataFrame,
        time_col: str,
        event_col: str,
        covariate_types: dict | None = None,
        reference_groups: dict | None = None,
    ):
        self.df = df.copy()
        self.time_col = time_col
        self.event_col = event_col
        self.covariate_types = covariate_types or {}
        self.reference_groups = reference_groups or {}
        self.encoding_map: dict[str, dict] = {}
        self.dummy_to_info: dict[str, dict] = {}
        self.encoded_covs: list[str] = []

    def prepare_dummies(self, covariates_list: list[str]) -> list[str]:
        """Кодирует категориальные переменные как dummy, оставляет непрерывные как есть"""
        if not covariates_list:
            return []

        df_out = self.df.copy()
        self.encoding_map = {}
        self.dummy_to_info = {}
        self.encoded_covs = []

        for col in covariates_list:
            if col in (self.time_col, self.event_col):
                continue

            is_cat = self.covariate_types.get(col) == 'categorical'
            if not is_cat:
                is_cat = (
                    df_out[col].dtype == 'object'
                    or df_out[col].dtype.name == 'category'
                    or hasattr(df_out[col].dtype, 'categories')
                )

            if is_cat:
                df_out[col] = df_out[col].astype(str).fillna('__MISSING__')
                categories = sorted(df_out[col].unique().tolist())
                ref = self.reference_groups.get(col)
                if ref not in categories:
                    ref = categories[0] if categories else '__MISSING__'

                self.encoding_map[col] = {
                    'categories': categories,
                    'reference': ref,
                    'dummy_cols': [],
                }

                for cat in categories:
                    if cat == ref:
                        continue
                    dummy_name = f"{col}_{cat}"
                    df_out[dummy_name] = (df_out[col] == cat).astype(int)
                    self.encoding_map[col]['dummy_cols'].append(dummy_name)
                    self.encoded_covs.append(dummy_name)
                    self.dummy_to_info[dummy_name] = {
                        'original': col,
                        'category': cat,
                        'reference': ref,
                    }
            else:
                df_out[col] = pd.to_numeric(df_out[col], errors='coerce')
                self.encoded_covs.append(col)

        self.df = df_out
        return self.encoded_covs

    def _fit_model(self, covariates: list[str]) -> tuple[CoxPHFitter, pd.DataFrame] | None:
        if not covariates:
            return None
        cols = [self.time_col, self.event_col] + covariates
        df_temp = self.df[cols].dropna()
        if len(df_temp) < 10:
            return None
        try:
            cph = CoxPHFitter()
            cph.fit(df_temp, duration_col=self.time_col, event_col=self.event_col)
            return cph, df_temp
        except Exception:
            return None

    def _get_pvalue(self, cph: CoxPHFitter, variable: str) -> float:
        try:
            summary = cph.summary
            if variable in summary.index:
                return float(summary.loc[variable, 'p'])
        except Exception:
            pass
        return 1.0

    def forward_selection(
        self,
        candidates: list[str],
        p_threshold: float = 0.05,
        verbose: bool = False,
    ) -> dict[str, Any]:
        selected = []
        remaining = candidates.copy()
        steps = []

        while remaining:
            best_pval = 1.0
            best_cov = None

            for cov in remaining:
                test_covs = selected + [cov]
                encoded = self._expand_covs(test_covs)
                result = self._fit_model(encoded)

                if result is None:
                    continue

                cph, _ = result
                encoded_cov = self._expand_covs([cov])
                pval = 1.0
                for ec in encoded_cov:
                    pv = self._get_pvalue(cph, ec)
                    if pv < pval:
                        pval = pv

                if pval < best_pval:
                    best_pval = pval
                    best_cov = cov

            if best_pval < p_threshold and best_cov:
                selected.append(best_cov)
                remaining.remove(best_cov)

                step_info = {
                    'step': len(steps) + 1,
                    'action': 'added',
                    'variable': best_cov,
                    'p_value': best_pval,
                    'current_model': selected.copy(),
                }
                steps.append(step_info)

                if verbose:
                    print(
                        f"Step {len(steps)}: Added '{best_cov}'"
                        f" (p={best_pval:.4f})"
                    )
            else:
                break

        final_encoded = self._expand_covs(selected)
        final_result = self._fit_model(final_encoded) if final_encoded else None
        final_model = final_result[0] if final_result else None
        c_index = final_model.concordance_index_ if final_model else None

        return {
            'selected': selected,
            'steps': steps,
            'final_model': final_model,
            'c_index': c_index,
            'n_selected': len(selected),
        }

    def backward_elimination(
        self,
        candidates: list[str],
        p_threshold: float = 0.1,
        verbose: bool = False,
    ) -> dict[str, Any]:
        current = candidates.copy()
        steps = []

        while len(current) > 1:
            encoded = self._expand_covs(current)
            result = self._fit_model(encoded)

            if result is None:
                break

            cph, _ = result

            max_pval = 0.0
            worst_cov = None

            for cov in current:
                encoded_cov = self._expand_covs([cov])
                pval = 1.0
                for ec in encoded_cov:
                    pv = self._get_pvalue(cph, ec)
                    if pv > pval:
                        pval = pv

                if pval > max_pval:
                    max_pval = pval
                    worst_cov = cov

            if max_pval > p_threshold and worst_cov:
                current.remove(worst_cov)

                step_info = {
                    'step': len(steps) + 1,
                    'action': 'removed',
                    'variable': worst_cov,
                    'p_value': max_pval,
                    'current_model': current.copy(),
                }
                steps.append(step_info)

                if verbose:
                    print(
                        f"Step {len(steps)}: Removed '{worst_cov}'"
                        f" (p={max_pval:.4f})"
                    )
            else:
                break

        final_encoded = self._expand_covs(current)
        final_result = self._fit_model(final_encoded) if final_encoded else None
        final_model = final_result[0] if final_result else None
        c_index = final_model.concordance_index_ if final_model else None

        return {
            'selected': current,
            'steps': steps,
            'final_model': final_model,
            'c_index': c_index,
            'n_selected': len(current),
        }

    def _expand_covs(self, original_vars: list[str]) -> list[str]:
        expanded = []
        for v in original_vars:
            if v in self.encoding_map:
                expanded.extend(self.encoding_map[v]['dummy_cols'])
            else:
                expanded.append(v)
        return expanded

    def get_model_summary(self, model: CoxPHFitter) -> pd.DataFrame:
        if model is None:
            return pd.DataFrame()
        summary = model.summary.copy()
        summary.index.name = 'Variable'
        summary = summary.reset_index()

        for idx, row in summary.iterrows():
            var = row['Variable']
            if var in self.dummy_to_info:
                info = self.dummy_to_info[var]
                summary.loc[idx, 'Variable'] = (
                    f"{info['original']} [{info['category']} vs {info['reference']}]"
                )

        return summary

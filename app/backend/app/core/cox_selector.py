"""
Cox Variable Selector - Forward/Backward selection algorithms
Выделено из шаблона для улучшения производительности и тестируемости
"""

import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
from lifelines import CoxPHFitter
from sklearn.preprocessing import LabelEncoder


class CoxVariableSelector:
    """Класс для пошагового отбора переменных в регрессии Кокса"""
    
    def __init__(self, df: pd.DataFrame, time_col: str, event_col: str):
        """
        Инициализация селектора
        
        Args:
            df: DataFrame с данными
            time_col: колонка со временем
            event_col: колонка с событием (0/1)
        """
        self.df = df.copy()
        self.time_col = time_col
        self.event_col = event_col
        self.encoding_map = {}
        self._prepare_categorical()
        
    def _prepare_categorical(self):
        """Кодирует категориальные переменные"""
        for col in self.df.columns:
            if col in [self.time_col, self.event_col]:
                continue
            if self.df[col].dtype == 'object' or self.df[col].dtype.name == 'category':
                self.df[col] = self.df[col].fillna('__MISSING__')
                le = LabelEncoder()
                self.df[col] = le.fit_transform(self.df[col].astype(str))
                self.encoding_map[col] = dict(zip(range(len(le.classes_)), le.classes_))
    
    def _fit_model(self, covariates: List[str]) -> Optional[Tuple[CoxPHFitter, pd.DataFrame]]:
        """
        Обучает модель Кокса на выбранных ковариатах
        
        Returns:
            Tuple (модель, данные для обучения) или None если модель не сошлась
        """
        if not covariates:
            return None
            
        # Оставляем только нужные колонки и удаляем пропуски
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
        """Извлекает p-value для переменной из модели"""
        try:
            summary = cph.summary
            if variable in summary.index:
                return float(summary.loc[variable, 'p'])
        except Exception:
            pass
        return 1.0
    
    def forward_selection(self, 
                         candidates: List[str], 
                         p_threshold: float = 0.05,
                         verbose: bool = False) -> Dict[str, Any]:
        """
        Прямой пошаговый отбор переменных
        
        Args:
            candidates: список кандидатов для включения
            p_threshold: порог p-value для включения
            verbose: выводить ли прогресс
            
        Returns:
            Словарь с результатами:
            {
                'selected': [...],
                'steps': [...],
                'final_model': CoxPHFitter or None,
                'c_index': float
            }
        """
        selected = []
        remaining = candidates.copy()
        steps = []
        
        while remaining:
            best_pval = 1.0
            best_cov = None
            best_model = None
            
            # Проверяем каждую оставшуюся переменную
            for cov in remaining:
                test_covs = selected + [cov]
                result = self._fit_model(test_covs)
                
                if result is None:
                    continue
                    
                cph, _ = result
                pval = self._get_pvalue(cph, cov)
                
                if pval < best_pval:
                    best_pval = pval
                    best_cov = cov
                    best_model = cph
            
            # Если нашли значимую переменную - добавляем
            if best_pval < p_threshold and best_cov:
                selected.append(best_cov)
                remaining.remove(best_cov)
                
                step_info = {
                    'step': len(steps) + 1,
                    'action': 'added',
                    'variable': best_cov,
                    'p_value': best_pval,
                    'current_model': selected.copy()
                }
                steps.append(step_info)
                
                if verbose:
                    print(f"Step {len(steps)}: Added '{best_cov}' (p={best_pval:.4f})")
            else:
                break
        
        # Финальная модель
        final_result = self._fit_model(selected) if selected else None
        final_model = final_result[0] if final_result else None
        c_index = final_model.concordance_index_ if final_model else None
        
        return {
            'selected': selected,
            'steps': steps,
            'final_model': final_model,
            'c_index': c_index,
            'n_selected': len(selected)
        }
    
    def backward_elimination(self,
                            candidates: List[str],
                            p_threshold: float = 0.1,
                            verbose: bool = False) -> Dict[str, Any]:
        """
        Обратное исключение переменных
        
        Args:
            candidates: начальный список переменных
            p_threshold: порог p-value для исключения (> threshold)
            verbose: выводить ли прогресс
            
        Returns:
            Словарь с результатами (аналогично forward_selection)
        """
        current = candidates.copy()
        steps = []
        
        while len(current) > 1:
            result = self._fit_model(current)
            
            if result is None:
                break
                
            cph, _ = result
            
            # Ищем переменную с наибольшим p-value
            max_pval = 0.0
            worst_cov = None
            
            for cov in current:
                pval = self._get_pvalue(cph, cov)
                if pval > max_pval:
                    max_pval = pval
                    worst_cov = cov
            
            # Если самая незначимая переменная превышает порог - удаляем
            if max_pval > p_threshold and worst_cov:
                current.remove(worst_cov)
                
                step_info = {
                    'step': len(steps) + 1,
                    'action': 'removed',
                    'variable': worst_cov,
                    'p_value': max_pval,
                    'current_model': current.copy()
                }
                steps.append(step_info)
                
                if verbose:
                    print(f"Step {len(steps)}: Removed '{worst_cov}' (p={max_pval:.4f})")
            else:
                break
        
        # Финальная модель
        final_result = self._fit_model(current) if current else None
        final_model = final_result[0] if final_result else None
        c_index = final_model.concordance_index_ if final_model else None
        
        return {
            'selected': current,
            'steps': steps,
            'final_model': final_model,
            'c_index': c_index,
            'n_selected': len(current)
        }
    
    def get_model_summary(self, model: CoxPHFitter) -> pd.DataFrame:
        """Получает красивую сводку по модели"""
        if model is None:
            return pd.DataFrame()
            
        summary = model.summary.copy()
        summary.index.name = 'Variable'
        summary = summary.reset_index()
        
        # Добавляем информацию о кодировании
        for idx, row in summary.iterrows():
            var = row['Variable']
            if var in self.encoding_map:
                baseline = self.encoding_map[var].get(0, 'Baseline')
                summary.loc[idx, 'Variable'] = f"{var} [{baseline}]"
        
        return summary

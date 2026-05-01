"""
Executor for safe Python code execution.
"""

import io
import traceback
from pathlib import Path
from typing import Dict, Any, Optional
from contextlib import redirect_stdout, redirect_stderr

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


class Executor:
    def __init__(self, project_path: Path):
        self.project_path = Path(project_path)
        self.state_folder = self.project_path / "state"
        self.plots_folder = self.project_path / "plots"
        self.plots_folder.mkdir(parents=True, exist_ok=True)
        self.df: Optional[pd.DataFrame] = None
        self.namespace = {}
        self._load_data()
        self._init_namespace()

    def _load_data(self):
        """Загружает данные из state или data папки"""
        parquet_path = self.state_folder / "project_data.parquet"
        if parquet_path.exists():
            self.df = pd.read_parquet(parquet_path)
        else:
            data_dir = self.project_path / "data"
            for f in data_dir.glob("*.xlsx"):
                self.df = pd.read_excel(f)
                break
            if self.df is None:
                for f in data_dir.glob("*.csv"):
                    self.df = pd.read_csv(f)
                    break

    def _init_namespace(self):
        """Инициализирует пространство имён для выполнения кода"""
        from app.core.cox_selector import CoxVariableSelector
        
        def get_label(var_name, value=None):
            """Получить пользовательскую метку для переменной или её значения"""
            import json
            from pathlib import Path
            labels_path = Path(self.project_path) / "state" / "variable_labels.json"
            labels = {}
            if labels_path.exists():
                try:
                    with open(labels_path, 'r', encoding='utf-8') as f:
                        labels = json.load(f)
                except:
                    pass
            
            var_labels = labels.get(var_name, {})
            
            if value is not None:
                return var_labels.get('value_labels', {}).get(str(value), str(value))
            else:
                return var_labels.get('chart_name', var_name)
        
        self.namespace = {
            'df': self.df,
            'pd': pd,
            'np': np,
            'plt': plt,
            'save_plot': self._save_plot,
            'CoxVariableSelector': CoxVariableSelector,
            'get_label': get_label,
        }

    def _save_plot(self, name: str, fig=None) -> str:
        safe_name = name.replace('/', '_').replace('\\', '_')
        plot_path = self.plots_folder / f"{safe_name}.png"
        
        if fig is not None:
            fig.savefig(plot_path, dpi=150, bbox_inches='tight')
        else:
            plt.savefig(plot_path, dpi=150, bbox_inches='tight')
        plt.close('all')
        
        return str(plot_path)

    def execute_code(self, code: str) -> Dict[str, Any]:
        """
        Выполняет Python код в контролируемом окружении
        """
        # Очистка от markdown блоков
        import re
        code = re.sub(r'^```python\s*', '', code, flags=re.MULTILINE)
        code = re.sub(r'^```\s*$', '', code, flags=re.MULTILINE)
        code = code.strip()
        
# Удаляем plt.show() и plt.figure() перед выполнением (построчно)
        def remove_call(line):
            stripped = line.strip()
            if stripped.startswith('#'):
                return line
            # Проверяем plt.show() или plt.figure()
            match = re.match(r'^(\s*)(plt\.show|plt\.figure)\s*\(', stripped)
            if match:
                indent = match.group(1)
                prefix = match.group(2)
                # Находим конец скобок
                start = line.find('(')
                depth = 0
                for i, c in enumerate(line[start:]):
                    if c == '(':
                        depth += 1
                    elif c == ')':
                        depth -= 1
                        if depth == 0:
                            end = start + i + 1
                            return indent + f'# {prefix}() removed\n' + line[end:]
                return line
            return line
        
        lines = code.split('\n')
        processed_lines = []
        for line in lines:
            processed_lines.append(remove_call(line))
        code = '\n'.join(processed_lines)
        
        # Добавляем print после save_plot (с сохранением отступов)
        lines = code.split('\n')
        result_lines = []
        for line in lines:
            result_lines.append(line)
            if 'save_plot(' in line and not line.strip().startswith('#'):
                indent = len(line) - len(line.lstrip())
                result_lines.append(' ' * indent + 'print("[PLOT] saved")')
        code = '\n'.join(result_lines)
        
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        
        # Обновляем df в namespace
        self.namespace['df'] = self.df
        
        try:
            with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                exec(code, self.namespace)
            
            # Если код модифицировал df - сохраняем изменения
            if 'df' in self.namespace and isinstance(self.namespace['df'], pd.DataFrame):
                self.df = self.namespace['df']
                self.df.to_parquet(
                    self.state_folder / "project_data.parquet", 
                    compression='snappy'
                )
            
            return {
                "success": True, 
                "output": stdout_capture.getvalue(), 
                "error": None
            }
            
        except Exception as e:
            return {
                "success": False, 
                "output": stdout_capture.getvalue(), 
                "error": str(e), 
                "traceback": traceback.format_exc()
            }
    
    def get_df_info(self) -> Dict[str, Any]:
        """Возвращает информацию о загруженных данных"""
        if self.df is None:
            return {"loaded": False}
        
        return {
            "loaded": True,
            "shape": self.df.shape,
            "columns": list(self.df.columns),
            "dtypes": {col: str(dtype) for col, dtype in self.df.dtypes.items()}
        }

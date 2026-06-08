"""
Executor for safe Python code execution.
"""
from __future__ import annotations

import io
import traceback
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use('Agg')
import matplotlib.pyplot as plt

from app.core.data_loader import normalize_dataframe


class Executor:
    def __init__(self, project_path: Path):
        self.project_path = Path(project_path)
        self.state_folder = self.project_path / "state"
        self.plots_folder = self.project_path / "plots"
        self.plots_folder.mkdir(parents=True, exist_ok=True)
        self.df: pd.DataFrame | None = None
        self.namespace = {}
        self._load_data()
        self._init_namespace()

    def _load_data(self):
        """Loads data from state or data folder"""
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
            if self.df is not None:
                self.df = normalize_dataframe(self.df)

    def _init_namespace(self):
        """Инициализирует пространство имён для выполнения кода"""
        import json
        from pathlib import Path

        from app.core.cox_selector import CoxVariableSelector

        # Load labels once
        labels_path = Path(self.project_path) / "state" / "variable_labels.json"
        labels = {}
        if labels_path.exists():
            try:
                with open(labels_path, encoding='utf-8') as f:
                    labels = json.load(f)
            except Exception:
                pass

        def get_label(var_name, value=None):
            """Получить пользовательскую метку для переменной или её значения"""
            var_labels = labels.get(var_name, {})

            if value is not None:
                return var_labels.get('value_labels', {}).get(str(value), str(value))
            else:
                return var_labels.get('chart_name', var_name)

        var_labels_dict = labels

        def fmt_p(p, epsilon=0.0001):
            if p is None or (isinstance(p, float) and np.isnan(p)) or (hasattr(p, 'dtype') and np.isnan(p)):
                return "—"
            if p < epsilon:
                return f"<{epsilon}"
            return f"{p:.4f}"

        self.namespace = {
            'df': self.df,
            'pd': pd,
            'np': np,
            'plt': plt,
            'save_plot': self._save_plot,
            'CoxVariableSelector': CoxVariableSelector,
            'get_label': get_label,
            'var_labels': var_labels_dict,
            'project_path': str(self.project_path),
            'fmt_p': fmt_p,
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

    def execute_code(self, code: str) -> dict[str, Any]:
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

            # If code modified df - save changes
            if 'df' in self.namespace and isinstance(self.namespace['df'], pd.DataFrame):
                self.df = self.namespace['df']
                parquet_path = self.state_folder / "project_data.parquet"
                try:
                    self.df.to_parquet(parquet_path, compression='snappy')
                except Exception:
                    try:
                        self.df.to_parquet(parquet_path, compression='lz4')
                    except Exception:
                        self.df.to_parquet(parquet_path, compression=None)

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

    def get_df_info(self) -> dict[str, Any]:
        """Возвращает информацию о загруженных данных"""
        if self.df is None:
            return {"loaded": False}

        return {
            "loaded": True,
            "shape": self.df.shape,
            "columns": list(self.df.columns),
            "dtypes": {col: str(dtype) for col, dtype in self.df.dtypes.items()}
        }

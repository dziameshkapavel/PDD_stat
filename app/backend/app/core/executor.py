"""
Executor for safe Python code execution.
"""

import io
import os
import signal
import threading
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

EXEC_TIMEOUT = int(os.environ.get('PDD_STAT_EXEC_TIMEOUT', '60'))


class ExecTimeoutError(Exception):
    pass


def _timeout_handler(signum, frame):
    raise ExecTimeoutError(f"Code execution timed out ({EXEC_TIMEOUT}s)")


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
        import builtins
        import json
        from pathlib import Path

        try:
            from app.core.cox_selector import CoxVariableSelector
        except ModuleNotFoundError:
            CoxVariableSelector = None

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

        def safe_open(file, mode='r', *args, **kwargs):
            if any(char in mode for char in ('w', 'a', 'x', '+')):
                raise PermissionError("Writing is not allowed in sandbox")
            p = Path(file).resolve()
            if not str(p).startswith(str(Path(self.project_path).resolve())):
                raise PermissionError("Access denied: file is outside project path")
            return open(file, mode, *args, **kwargs)

        safe_builtins = {
            'print': print, 'len': len, 'range': range,
            'int': int, 'float': float, 'str': str, 'bool': bool,
            'list': list, 'dict': dict, 'tuple': tuple, 'set': set,
            'isinstance': isinstance, 'hasattr': hasattr, 'getattr': getattr,
            'setattr': setattr, 'delattr': delattr,
            'enumerate': enumerate, 'zip': zip, 'map': map, 'filter': filter,
            'sorted': sorted, 'reversed': reversed, 'min': min, 'max': max,
            'sum': sum, 'abs': abs, 'round': round, 'any': any, 'all': all,
            'None': None, 'True': True, 'False': False,
            'ValueError': ValueError, 'TypeError': TypeError,
            'KeyError': KeyError, 'IndexError': IndexError,
            'AttributeError': AttributeError, 'ZeroDivisionError': ZeroDivisionError,
            'RuntimeError': RuntimeError, 'Exception': Exception,
            'dir': dir,
            '__build_class__': __build_class__,
            '__import__': builtins.__import__,
            'open': safe_open,
        }

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
            '__builtins__': safe_builtins,
            '__name__': '__main__',
            '__doc__': None,
            '__package__': None,
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
        # AST-анализ на запрещенные импорты
        import ast
        allowed_user_imports = {
            'pandas', 'numpy', 'matplotlib', 'scipy', 'lifelines', 'json',
            'time', 'pathlib', 'warnings', 'statsmodels', 'sklearn', 'itertools',
            'typing', 'math', 'seaborn', 'collections', 'docx', 'jinja2',
            'pyarrow', 'openpyxl', 'autograd', 'shutil', 'numbers'
        }
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        root = alias.name.split('.')[0]
                        if root not in allowed_user_imports:
                            return {
                                "success": False,
                                "output": "",
                                "error": f"Import of module '{alias.name}' is not allowed in sandbox",
                                "traceback": ""
                            }
                elif isinstance(node, ast.ImportFrom) and node.module:
                    root = node.module.split('.')[0]
                    if root not in allowed_user_imports:
                        return {
                            "success": False,
                            "output": "",
                            "error": f"Import from module '{node.module}' is not allowed in sandbox",
                            "traceback": ""
                        }
        except SyntaxError:
            pass

        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()

        # Пересоздаём namespace для чистоты между шаблонами
        self._init_namespace()
        self.namespace['df'] = self.df

        try:
            # Timeout guard via SIGALRM (Unix only, main thread only)
            using_timeout = (
                hasattr(signal, 'SIGALRM')
                and getattr(signal, 'SIGALRM', None) is not None
                and threading.current_thread() is threading.main_thread()
            )
            if using_timeout:
                signal.signal(signal.SIGALRM, _timeout_handler)
                signal.alarm(EXEC_TIMEOUT)
            try:
                with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                    exec(code, self.namespace)
            finally:
                if using_timeout:
                    signal.alarm(0)

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

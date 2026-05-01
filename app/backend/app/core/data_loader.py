"""
Data loader for PDD_STAT.
Loads data files, runs audit, saves state.
"""

import json
import csv
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

import pandas as pd
import numpy as np


class DataLoader:
    SUPPORTED_EXTENSIONS = {'.xlsx', '.xls', '.csv', '.tsv', '.parquet', '.txt'}

    def __init__(self, project_path: Path):
        self.project_path = Path(project_path)
        self.data_folder = self.project_path / "data"
        self.state_folder = self.project_path / "state"
        self.df: Optional[pd.DataFrame] = None
        self.audit_results: Dict[str, Any] = {}
        self.loaded_file_path: Optional[Path] = None

    def find_data_files(self) -> List[Path]:
        if not self.data_folder.exists():
            return []
        files = []
        for ext in self.SUPPORTED_EXTENSIONS:
            files.extend(self.data_folder.glob(f"*{ext}"))
            files.extend(self.data_folder.glob(f"*{ext.upper()}"))
        return sorted(files)

    def _select_excel_sheet(self, file_path: Path) -> str:
        xl = pd.ExcelFile(file_path)
        sheet_names = xl.sheet_names
        if len(sheet_names) == 1:
            return sheet_names[0]
        priority_keywords = ['data', 'raw', 'main', 'sheet1']
        best_sheet = sheet_names[0]
        best_score = -1
        for sheet in sheet_names:
            try:
                df_temp = pd.read_excel(file_path, sheet_name=sheet, nrows=10)
            except:
                continue
            rows, cols = len(df_temp), len(df_temp.columns)
            if rows < 5:
                continue
            score = rows * cols
            if any(kw in sheet.lower() for kw in priority_keywords):
                score *= 2
            if score > best_score:
                best_score = score
                best_sheet = sheet
        return best_sheet

    def _normalize_missing_values(self):
        if self.df is None:
            return
        object_cols = self.df.select_dtypes(include=['object']).columns
        for col in object_cols:
            self.df[col] = self.df[col].replace(['', 'nan', 'NaN', 'None', 'null', 'NULL'], pd.NA)
            self.df[col] = self.df[col].apply(lambda x: pd.NA if isinstance(x, str) and x.strip() == '' else x)

    def _remove_technical_columns(self):
        if self.df is None:
            return
        cols_to_drop = []
        for col in self.df.columns:
            if str(col).upper().startswith(('INFO_', 'CHECK_', 'PARAMS_', 'Unnamed')):
                cols_to_drop.append(col)
        if cols_to_drop:
            self.df = self.df.drop(columns=cols_to_drop)

    def load_file(self, file_path: Path) -> pd.DataFrame:
        self.loaded_file_path = file_path
        ext = file_path.suffix.lower()
        if ext in ['.xlsx', '.xls']:
            sheet = self._select_excel_sheet(file_path)
            self.df = pd.read_excel(file_path, sheet_name=sheet)
        elif ext == '.csv':
            self.df = pd.read_csv(file_path)
        elif ext == '.tsv':
            self.df = pd.read_csv(file_path, sep='\t')
        elif ext == '.parquet':
            self.df = pd.read_parquet(file_path)
        elif ext == '.txt':
            self.df = pd.read_csv(file_path, sep=None, engine='python')
        else:
            raise ValueError(f"Unsupported format: {ext}")
        self._normalize_missing_values()
        self._remove_technical_columns()
        return self.df

    def _count_missing(self, series: pd.Series) -> int:
        return series.isna().sum()

    def run_audit(self) -> Dict[str, Any]:
        if self.df is None:
            raise ValueError("Data not loaded.")
        df = self.df
        audit = {
            "file_name": self.loaded_file_path.name if self.loaded_file_path else None,
            "audit_time": datetime.now().isoformat(),
            "shape": {"rows": len(df), "columns": len(df.columns)},
            "columns": list(df.columns),
            "dtypes": {col: str(df[col].dtype) for col in df.columns},
        }
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        audit["column_types"] = {
            "numeric": numeric_cols,
            "categorical": categorical_cols,
            "counts": {"numeric": len(numeric_cols), "categorical": len(categorical_cols)}
        }
        missing_dict = {}
        high_missing = []
        for col in df.columns:
            miss = self._count_missing(df[col])
            pct = (miss / len(df)) * 100
            missing_dict[col] = {"count": int(miss), "percent": round(pct, 2)}
            if pct > 30:
                high_missing.append({"column": col, "percent": round(pct, 1)})
        audit["missing_data"] = missing_dict
        audit["high_missing_columns"] = high_missing
        self.audit_results = audit
        return audit

    def save_state(self):
        if self.df is None:
            raise ValueError("No data to save.")
        parquet_path = self.state_folder / "project_data.parquet"
        self.df.to_parquet(parquet_path, compression='snappy', index=False)
        audit_path = self.state_folder / "data_audit_pre.json"
        with open(audit_path, 'w', encoding='utf-8') as f:
            json.dump(self.audit_results, f, indent=2, ensure_ascii=False)
        self._save_schema()

    def _save_schema(self):
        if self.df is None:
            return
        schema = {"columns": {}, "total_rows": len(self.df), "total_columns": len(self.df.columns)}
        for col in self.df.columns:
            dtype = str(self.df[col].dtype)
            n_unique = int(self.df[col].nunique())
            n_missing = int(self._count_missing(self.df[col]))
            schema["columns"][col] = {
                "dtype": dtype,
                "n_unique": n_unique,
                "n_missing": n_missing,
                "missing_pct": round(n_missing / len(self.df) * 100, 2)
            }
        with open(self.state_folder / "schema.json", 'w', encoding='utf-8') as f:
            json.dump(schema, f, indent=2, ensure_ascii=False)

    def get_columns_info(self) -> List[Dict[str, Any]]:
        if self.df is None:
            return []
        columns = []
        for col in self.df.columns:
            dtype = str(self.df[col].dtype)
            if pd.api.types.is_numeric_dtype(self.df[col]):
                col_type = "numeric"
            elif pd.api.types.is_bool_dtype(self.df[col]):
                col_type = "binary"
            else:
                col_type = "categorical"
            complete = 100 - round((self._count_missing(self.df[col]) / len(self.df)) * 100, 1)
            columns.append({"name": col, "type": col_type, "complete": complete})
        return columns

    def _load_parquet(self, path: Path):
        import pandas as pd
        return pd.read_parquet(path)

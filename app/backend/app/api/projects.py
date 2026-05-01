import shutil
import os
import json
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Optional
from pydantic import BaseModel

from app.core.project_manager import ProjectManager
from app.core.data_loader import DataLoader
from app.core.rule_engine import generate_cleaning_plan, apply_cleaning_plan

router = APIRouter()

state = {"current_project_name": None, "cached_cleaning_plan": None}


def get_project_manager() -> ProjectManager:
    pm = ProjectManager()
    name = state.get("current_project_name")
    print(f"[DEBUG] get_project_manager: current_project_name = {name}")
    if name:
        pm.open_project(name)
    return pm


def get_loader() -> DataLoader:
    pm = get_project_manager()
    if pm.current_project_path is None:
        raise HTTPException(status_code=400, detail="No active project")
    loader = DataLoader(pm.current_project_path)
    clean_path = pm.current_project_path / "state" / "project_data.parquet"
    if clean_path.exists():
        loader.df = loader._load_parquet(clean_path)
    else:
        files = loader.find_data_files()
        if files:
            loader.load_file(files[0])
    return loader


@router.get("/")
async def list_projects():
    pm = ProjectManager()
    return {"projects": pm.list_projects()}


@router.post("/create")
async def create_project(name: str):
    pm = ProjectManager()
    try:
        project_path = pm.create_project(name)
        state["current_project_name"] = name
        state["cached_cleaning_plan"] = None
        active_path = Path(__file__).parent.parent / "active_project.txt"
        active_path.write_text(str(project_path))
        print(f"[DEBUG] Project created: {name}, path: {project_path}")
        return {"status": "created", "name": name, "path": str(project_path)}
    except FileExistsError:
        raise HTTPException(status_code=400, detail="Project already exists")


@router.post("/open")
async def open_project(name: str):
    pm = ProjectManager()
    try:
        project_path = pm.open_project(name)
        state["current_project_name"] = name
        state["cached_cleaning_plan"] = None
        active_path = Path(__file__).parent.parent / "active_project.txt"
        active_path.write_text(str(project_path))
        print(f"[DEBUG] Project opened: {name}")
        return {"status": "opened", "name": name, "path": str(project_path)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    name = state.get("current_project_name")
    print(f"[DEBUG] Upload: current_project_name = {name}")
    if not name:
        raise HTTPException(status_code=400, detail="No active project")
    
    pm = ProjectManager()
    pm.open_project(name)
    data_folder = pm.current_project_path / "data"
    data_folder.mkdir(parents=True, exist_ok=True)
    file_path = data_folder / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    loader = DataLoader(pm.current_project_path)
    loader.load_file(file_path)
    audit = loader.run_audit()
    raw_path = pm.current_project_path / "state" / "raw.parquet"
    loader.df.to_parquet(raw_path)
    
    plan = generate_cleaning_plan(loader.df)
    state["cached_cleaning_plan"] = plan
    
    return {
        "filename": file.filename,
        "audit": audit,
        "cleaning_plan": plan,
        "columns": loader.get_columns_info()
    }


@router.post("/clean")
async def apply_cleaning(apply: bool = True):
    name = state.get("current_project_name")
    if not name:
        raise HTTPException(status_code=400, detail="No active project")
    
    pm = ProjectManager()
    pm.open_project(name)
    raw_path = pm.current_project_path / "state" / "raw.parquet"
    if not raw_path.exists():
        raise HTTPException(status_code=400, detail="No raw data found")
    
    import pandas as pd
    df = pd.read_parquet(raw_path)
    
    plan = state.get("cached_cleaning_plan")
    if apply and plan:
        df = apply_cleaning_plan(df, plan)
    
    clean_path = pm.current_project_path / "state" / "project_data.parquet"
    df.to_parquet(clean_path, compression='snappy')
    state["cached_cleaning_plan"] = None
    
    loader = DataLoader(pm.current_project_path)
    loader.df = df
    return {"status": "cleaned" if apply else "skipped", "columns": loader.get_columns_info()}


@router.get("/columns")
async def get_columns():
    loader = get_loader()
    if loader.df is None:
        raise HTTPException(status_code=400, detail="No data loaded")
    columns = loader.get_columns_info()
    for col in columns:
        if col['name'] in loader.df.columns:
            unique_vals = loader.df[col['name']].dropna().unique()[:20].tolist()
            col['unique_values'] = [str(v) for v in unique_vals]
    return {"columns": columns}


class ColumnRenameRequest(BaseModel):
    old_name: str
    new_name: str


class ColumnDeleteRequest(BaseModel):
    name: str


@router.post("/columns/rename")
async def rename_column(req: ColumnRenameRequest):
    loader = get_loader()
    if loader.df is None:
        raise HTTPException(status_code=400, detail="No data loaded")
    if req.old_name not in loader.df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{req.old_name}' not found")
    if req.new_name in loader.df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{req.new_name}' already exists")
    
    loader.df = loader.df.rename(columns={req.old_name: req.new_name})
    loader.save_state()
    return {"columns": loader.get_columns_info()}


@router.post("/columns/delete")
async def delete_column(req: ColumnDeleteRequest):
    loader = get_loader()
    if loader.df is None:
        raise HTTPException(status_code=400, detail="No data loaded")
    if req.name not in loader.df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{req.name}' not found")
    
    loader.df = loader.df.drop(columns=[req.name])
    loader.save_state()
    return {"columns": loader.get_columns_info()}


@router.delete("/{name}")
async def delete_project(name: str):
    pm = ProjectManager()
    project_path = pm.base_path / name
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    
    import time, os, stat
    def on_rmtree_error(func, path, exc_info):
        os.chmod(path, stat.S_IWRITE)
        time.sleep(0.5)
        func(path)
    for attempt in range(3):
        try:
            shutil.rmtree(project_path, onerror=on_rmtree_error)
            break
        except PermissionError:
            if attempt == 2:
                raise HTTPException(status_code=500, detail="Cannot delete project. Close files and try again.")
            time.sleep(1)
    
    if state.get("current_project_name") == name:
        state["current_project_name"] = None
        state["cached_cleaning_plan"] = None
        active_path = Path(__file__).parent.parent / "active_project.txt"
        active_path.write_text("")
    return {"status": "deleted", "name": name}


@router.get("/plots")
async def get_project_plots():
    """Возвращает список графиков текущего проекта"""
    name = state.get("current_project_name")
    if not name:
        return {"charts": []}
    
    pm = ProjectManager()
    pm.open_project(name)
    plots_dir = pm.current_project_path / "plots"
    charts = []
    if plots_dir.exists():
        for png in plots_dir.glob("*.png"):
            charts.append(png.name)
    charts.sort(key=lambda x: x, reverse=True)
    return {"charts": charts}

class LabelRequest(BaseModel):
    chart_name: Optional[str] = None
    value_labels: Optional[dict] = None

@router.get("/labels")
async def get_labels():
    """Получить пользовательские метки переменных"""
    loader = get_loader()
    labels_path = loader.project_path / "state" / "variable_labels.json"
    if labels_path.exists():
        with open(labels_path, 'r', encoding='utf-8') as f:
            return {"labels": json.load(f)}
    return {"labels": {}}

@router.post("/labels/{var_name}")
async def save_label(var_name: str, req: LabelRequest):
    """Сохранить метку для переменной"""
    loader = get_loader()
    labels_path = loader.project_path / "state" / "variable_labels.json"
    
    labels = {}
    if labels_path.exists():
        with open(labels_path, 'r', encoding='utf-8') as f:
            labels = json.load(f)
    
    if var_name not in labels:
        labels[var_name] = {}
    
    if req.chart_name is not None:
        labels[var_name]['chart_name'] = req.chart_name
    if req.value_labels is not None:
        labels[var_name]['value_labels'] = req.value_labels
    
    labels_path.parent.mkdir(parents=True, exist_ok=True)
    with open(labels_path, 'w', encoding='utf-8') as f:
        json.dump(labels, f, indent=2, ensure_ascii=False)
    
    return {"status": "saved", "labels": labels}

@router.delete("/labels/{var_name}")
async def delete_label(var_name: str):
    """Удалить метку переменной"""
    loader = get_loader()
    labels_path = loader.project_path / "state" / "variable_labels.json"
    
    if labels_path.exists():
        with open(labels_path, 'r', encoding='utf-8') as f:
            labels = json.load(f)
        if var_name in labels:
            del labels[var_name]
        with open(labels_path, 'w', encoding='utf-8') as f:
            json.dump(labels, f, indent=2, ensure_ascii=False)
    
    return {"status": "deleted"}

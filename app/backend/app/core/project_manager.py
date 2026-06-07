"""
Менеджер проектов для PDD_STAT.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path


class ProjectManager:
    def __init__(self, base_projects_path: Path | None = None):
        if base_projects_path is None:
            self.base_path = Path(__file__).parent.parent.parent.parent.parent / "projects"
        else:
            self.base_path = Path(base_projects_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.current_project_path: Path | None = None
        self.current_project_name: str | None = None

    def list_projects(self) -> list:
        if not self.base_path.exists():
            return []
        projects = []
        for item in self.base_path.iterdir():
            if item.is_dir() and (item / "data").exists():
                projects.append(item.name)
        return sorted(projects)

    def project_exists(self, project_name: str) -> bool:
        project_path = self.base_path / project_name
        return project_path.exists() and project_path.is_dir()

    def create_project(self, project_name: str) -> Path:
        safe_name = self._sanitize_project_name(project_name)
        project_path = self.base_path / safe_name
        if project_path.exists():
            raise FileExistsError(f"Project '{safe_name}' already exists.")
        folders = [project_path, project_path / "data", project_path / "state",
                   project_path / "outputs", project_path / "plots", project_path / "logs"]
        for folder in folders:
            folder.mkdir(parents=True, exist_ok=True)
        metadata = {
            "project_name": project_name,
            "safe_name": safe_name,
            "created_at": datetime.now().isoformat(),
            "last_accessed": datetime.now().isoformat(),
            "status": "created"
        }
        with open(project_path / "state" / "project_metadata.json", 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        empty_config = {"clinical_context": {}, "technical_config": {}, "analysis_plan": {}}
        with open(project_path / "state" / "project_config.json", 'w', encoding='utf-8') as f:
            json.dump(empty_config, f, indent=2, ensure_ascii=False)
        summary_content = f"# BioStat Analysis: {project_name}\n\n**Created:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        (project_path / "summary.md").write_text(summary_content, encoding='utf-8')
        (project_path / ".lock").write_text(str(datetime.now()))
        self.current_project_path = project_path
        self.current_project_name = safe_name
        return project_path

    def open_project(self, project_name: str) -> Path:
        safe_name = self._sanitize_project_name(project_name)
        project_path = self.base_path / safe_name
        if not project_path.exists():
            raise FileNotFoundError(f"Project '{safe_name}' not found.")
        metadata_path = project_path / "state" / "project_metadata.json"
        if metadata_path.exists():
            with open(metadata_path, encoding='utf-8') as f:
                metadata = json.load(f)
            metadata["last_accessed"] = datetime.now().isoformat()
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)
        self.current_project_path = project_path
        self.current_project_name = safe_name
        return project_path

    def _sanitize_project_name(self, name: str) -> str:
        safe = re.sub(r'[^\w\s-]', '', name)
        safe = re.sub(r'[-\s]+', '_', safe).strip('_')
        if not safe:
            safe = f"project_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        return safe

    def get_data_folder(self) -> Path:
        if self.current_project_path is None:
            raise ValueError("Project not selected.")
        return self.current_project_path / "data"

    def get_state_folder(self) -> Path:
        if self.current_project_path is None:
            raise ValueError("Project not selected.")
        return self.current_project_path / "state"

    def get_plots_folder(self) -> Path:
        return self.current_project_path / "plots"

    def release_lock(self):
        if self.current_project_path:
            lock_path = self.current_project_path / ".lock"
            if lock_path.exists():
                lock_path.unlink()

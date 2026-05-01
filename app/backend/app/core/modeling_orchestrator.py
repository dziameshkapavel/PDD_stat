"""
Modeling Orchestrator — executes analysis templates.
"""

import json
import re
from pathlib import Path
from typing import Dict, Any
from jinja2 import Environment, FileSystemLoader


class ModelingOrchestrator:
    def __init__(self, project_path: Path, executor):
        self.project_path = Path(project_path)
        self.executor = executor
        self.templates_path = Path(__file__).parent.parent / "templates"
        self.jinja_env = Environment(
            loader=FileSystemLoader(str(self.templates_path)),
            auto_reload=True
        )

    def render_template(self, template_name: str, params: Dict[str, Any]) -> str:
        """Рендерит шаблон с параметрами"""
        template = self.jinja_env.get_template(f"{template_name}.py.jinja")
        
        render_params = dict(params)
        render_params['project_path'] = str(self.project_path).replace('\\', '/')
        
        return template.render(**render_params)

    def _extract_json_metrics(self, output: str) -> Dict[str, Any]:
        """Извлекает JSON метрики из вывода шаблона"""
        pattern = r'<!-- JSON_METRICS_START -->\s*(.*?)\s*<!-- JSON_METRICS_END -->'
        match = re.search(pattern, output, re.DOTALL)
        
        if match:
            try:
                metrics = json.loads(match.group(1))
                return metrics
            except json.JSONDecodeError:
                return {}
        return {}

    def _extract_table_from_output(self, output: str) -> list:
        """Извлекает таблицу HR из markdown вывода"""
        lines = output.split('\n')
        table_data = []
        
        i = 0
        while i < len(lines):
            line = lines[i]
            # Ищем начало таблицы
            if '| Variable | HR |' in line:
                # Skip header and separator
                i += 1
                while i < len(lines):
                    line = lines[i].strip()
                    # Skip separator |-----|
                    if line.startswith('|') and all(c in '|- ' for c in line.replace('|','')):
                        i += 1
                        continue
                    # End of table - empty line or ---
                    if line == '' or line == '---':
                        i += 1
                        break
                    # Data row
                    if line.startswith('|') and '|' in line[1:]:
                        cells = [c.strip() for c in line.split('|') if c.strip()]
                        if len(cells) >= 4 and cells[0] != '(baseline)':
                            table_data.append({
                                'variable': cells[0],
                                'hr': cells[1],
                                'ci': cells[2],
                                'p_value': cells[3]
                            })
                    i += 1
            i += 1
        
        return table_data

    def execute_template(self, template_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Выполняет шаблон и возвращает структурированный результат
        """
        try:
            # Рендерим и выполняем код
            code = self.render_template(template_name, params)
            exec_result = self.executor.execute_code(code)
            
            if not exec_result["success"]:
                return {
                    "success": False,
                    "output": exec_result.get("output", ""),
                    "error": exec_result.get("error", "Unknown error"),
                    "metrics": {},
                    "table": []
                }
            
            # Извлекаем метрики и таблицу
            output = exec_result["output"]
            metrics = self._extract_json_metrics(output)
            table = self._extract_table_from_output(output)
            
            # Формируем структурированный ответ
            return {
                "success": True,
                "output": output,  # Сохраняем оригинальный вывод для отладки
                "metrics": metrics,
                "table": table,
                "error": None
            }
            
        except Exception as e:
            return {
                "success": False,
                "output": "",
                "error": str(e),
                "metrics": {},
                "table": []
            }

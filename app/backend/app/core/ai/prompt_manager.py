"""
PromptManager — загрузка YAML-промптов и сборка системного промпта.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml


class PromptManager:
    """Загружает, кэширует и собирает промпты из YAML-файлов."""

    def __init__(self, prompts_dir: Path | None = None):
        if prompts_dir is None:
            prompts_dir = Path(__file__).parent.parent.parent.parent / "prompts"
        self.prompts_dir = Path(prompts_dir)
        self._cache: dict[str, Any] = {}
        self._load_all()

    def _load_all(self):
        """Загружает все YAML-файлы из prompts/ в кэш."""
        self._cache = {}
        if not self.prompts_dir.exists():
            return
        for yaml_file in self.prompts_dir.rglob("*.yaml"):
            yaml_file.relative_to(self.prompts_dir)
            try:
                with open(yaml_file, encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                if data and "id" in data:
                    self._cache[data["id"]] = data
            except Exception:
                pass

    def reload(self):
        """Горячая перезагрузка всех YAML-файлов без рестарта сервера."""
        self._load_all()

    def _get_role(self, role_id: str = "consultant") -> dict[str, Any]:
        role_id = role_id.replace(".yaml", "")
        data = self._cache.get(role_id)
        if data is None:
            return {"system_prompt": "", "temperature": 0.3, "max_tokens": 800}
        return data

    def _get_rules(self) -> str:
        """Собирает инструкции из всех правил safety + formatting в текст."""
        parts = []
        for rule_id in ("safety_rules", "formatting_rules"):
            data = self._cache.get(rule_id)
            if not data:
                continue
            rules = data.get("rules", [])
            for rule in rules:
                instruction = rule.get("instruction", "").strip()
                if instruction:
                    parts.append(instruction)
        return "\n\n".join(parts)

    def build_system_prompt(self, role: str = "consultant") -> str:
        """
        Собирает финальный системный промпт:
        Роль + Safety rules + Formatting rules
        """
        role_data = self._get_role(role)
        role_prompt = role_data.get("system_prompt", "").strip()

        rules_text = self._get_rules()

        parts = [role_prompt, rules_text]
        return "\n\n".join(p for p in parts if p)

    def get_temperature(self, role: str = "consultant") -> float:
        """Возвращает temperature для роли из YAML."""
        role_data = self._get_role(role)
        return role_data.get("temperature", 0.3)

    def get_max_tokens(self, role: str = "consultant") -> int:
        """Возвращает max_tokens для роли из YAML."""
        role_data = self._get_role(role)
        return role_data.get("max_tokens", 800)

    @staticmethod
    def _detect_language(texts: list) -> str:
        """Определяет язык по наличию кириллицы в текстах."""
        for t in texts:
            if re.search('[а-яА-ЯёЁ]', t):
                return "ru"
        return "en"

    def build_correction_prompt(self, errors: list, language: str = "en") -> str:
        """Возвращает промпт для auto-retry с указанием на ошибки."""
        error_list = "\n".join(f"- {e}" for e in errors)
        if language == "ru":
            return (
                "Твой предыдущий ответ содержит ошибки:\n"
                f"{error_list}\n\n"
                "Исправь ответ. Используй ТОЛЬКО числа из раздела "
                '"LAST ANALYSIS". '
                "Сохрани контекст вопроса пользователя и ответь на том же языке."
            )
        return (
            "Your previous response contains errors:\n"
            f"{error_list}\n\n"
            "Please correct your response. Use ONLY numbers from the "
            '"LAST ANALYSIS" section. '
            "Keep the context of the user's question and respond in the same language."
        )

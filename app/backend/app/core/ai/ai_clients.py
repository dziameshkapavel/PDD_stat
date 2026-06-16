"""
AI Clients for Ollama (local) and Groq (cloud)
"""
import json
import os
import re
import traceback
from collections.abc import AsyncGenerator
from typing import Any

import httpx

OLLAMA_TIMEOUT = float(os.environ.get('OLLAMA_TIMEOUT', '600'))


def _safe_str(obj) -> str:
    """Гарантирует ASCII-safe строку для ответа (JSON не любит битые UTF-8)."""
    s = str(obj)
    try:
        s.encode('ascii')
        return s
    except UnicodeEncodeError:
        return s.encode('ascii', errors='replace').decode('ascii')


class OllamaClient:
    """Клиент для Ollama (локальный)"""

    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url.rstrip('/')

    async def test_connection(self) -> dict[str, Any]:
        """Проверка соединения"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    models = [m['name'] for m in data.get('models', [])]
                    return {
                        "status": "connected",
                        "models": models,
                        "count": len(models)
                    }
                return {"status": "error", "message": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"status": "error", "message": _safe_str(e)}

    async def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
        tools: list[dict] | None = None
    ) -> dict[str, Any]:
        """Отправка сообщения в Ollama"""
        try:
            body = {
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens
                }
            }
            if tools:
                body["tools"] = tools
            async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
                response = await client.post(f"{self.base_url}/api/chat", json=body)
                if response.status_code == 200:
                    data = response.json()
                    msg = data.get("message", {})
                    content = msg.get("content", "") or ""
                    tool_calls = msg.get("tool_calls")
                    return {
                        "success": True,
                        "content": content,
                        "tool_calls": tool_calls,
                        "model": model,
                        "total_duration": data.get("total_duration", 0)
                    }
                return {"success": False, "error": f"HTTP {response.status_code}: {response.text}"}
        except Exception as e:
            return {"success": False, "error": _safe_str(f"{str(e)}\n{traceback.format_exc()}")}

    async def chat_stream(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> AsyncGenerator[str, None]:
        """Потоковая отправка сообщений"""
        try:
            async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client, client.stream(
                'POST',
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "temperature": temperature,
                        "num_predict": max_tokens
                    }
                }
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            if 'message' in data:
                                yield data['message'].get('content', '')
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            yield f"Error: {_safe_str(e)}"


class GroqClient:
    """Клиент для Groq Cloud API"""

    def __init__(self, api_key: str):
        # Sanitize: strip non-ASCII (e.g. obscured "••••••••" from frontend)
        self.api_key = api_key.encode('ascii', errors='ignore').decode('ascii').strip()
        self.base_url = "https://api.groq.com/openai/v1"

    async def test_connection(self) -> dict[str, Any]:
        """Проверка соединения и получение списка моделей"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    models = [m['id'] for m in data.get('data', [])]
                    return {
                        "status": "connected",
                        "models": models,
                        "count": len(models)
                    }
                return {"status": "error", "message": f"HTTP {response.status_code}: {response.text}"}
        except Exception as e:
            return {"status": "error", "message": _safe_str(e)}

    async def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
        tools: list[dict] | None = None
    ) -> dict[str, Any]:
        """Отправка сообщения в Groq"""
        try:
            body = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            if tools:
                body["tools"] = tools
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json=body
                )
                if response.status_code == 200:
                    data = response.json()
                    choice = data['choices'][0]['message']
                    content = choice.get('content', '') or ''
                    tool_calls = choice.get('tool_calls')
                    finish_reason = data['choices'][0].get('finish_reason')
                    return {
                        "success": True,
                        "content": content,
                        "tool_calls": tool_calls,
                        "finish_reason": finish_reason,
                        "model": model,
                        "usage": data.get('usage', {})
                    }
                return {"success": False, "error": f"HTTP {response.status_code}: {response.text}"}
        except Exception as e:
            return {"success": False, "error": _safe_str(f"{str(e)}\n{traceback.format_exc()}")}

    async def chat_stream(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> AsyncGenerator[str, None]:
        """Потоковая отправка сообщений"""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client, client.stream(
                'POST',
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": True
                }
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith('data: ') and line != 'data: [DONE]':
                        try:
                            data = json.loads(line[6:])
                            delta = data['choices'][0].get('delta', {})
                            if 'content' in delta:
                                yield delta['content']
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            yield f"Error: {_safe_str(e)}"


class AIClientFactory:
    """Фабрика AI-клиентов"""

    @staticmethod
    def create(config: dict[str, Any]):
        """Создаёт клиент на основе конфигурации"""
        provider = config.get('provider', 'ollama')

        if provider == 'ollama':
            ollama_config = config.get('ollama', {})
            return OllamaClient(
                base_url=ollama_config.get('url', 'http://localhost:11434')
            )
        elif provider == 'groq':
            groq_config = config.get('groq', {})
            return GroqClient(
                api_key=groq_config.get('api_key', '')
            )
        else:
            raise ValueError(f"Unknown provider: {provider}")

    @staticmethod
    def get_default_config() -> dict[str, Any]:
        """Возвращает конфигурацию по умолчанию"""
        return {
            "provider": "ollama",
            "ollama": {
                "url": "http://localhost:11434",
                "default_model": "llama3:8b",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            "groq": {
                "api_key": "",
                "default_model": "llama-3.3-70b-versatile",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            "system_prompt": "You are PDD_STAT Assistant, a biostatistics AI for clinical researchers. You have access to the dataset and analysis history. Be concise, cite specific numbers, and explain statistical concepts clearly.",
            "last_used_model": "llama3:8b"
        }


# ========== Tool call helpers ==========

_TOOL_CALL_RE = re.compile(
    r'\[TOOL_CALL:\s*(\w+)\s*\(\s*(\{.*?\})?\s*\)\s*\]',
    re.DOTALL
)

# Fallback: модель может выдать JSON с name/arguments без [TOOL_CALL]
_TOOL_JSON_RE = re.compile(
    r'\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:\s*(\{.*?\})\s*\}',
    re.DOTALL
)


def has_tool_calls(result: dict[str, Any]) -> bool:
    """Проверяет, есть ли tool_calls в ответе (native или regex)."""
    if result.get("tool_calls"):
        return True
    content = result.get("content", "")
    if not content:
        return False
    # Проверяем все паттерны, включая внутри ``` code blocks
    if _TOOL_CALL_RE.search(content):
        return True
    plain = re.sub(r'```(?:json)?\s*', '', content)
    return bool(_TOOL_JSON_RE.search(plain))


def extract_tool_calls(result: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Извлекает tool_calls из ответа.
    Сначала пробует native (Ollama/Groq), потом regex fallback.
    Возвращает список: [{"name": "func", "arguments": {...}}, ...]
    """
    native = result.get("tool_calls")
    if native:
        calls = []
        for tc in native:
            if isinstance(tc, dict):
                func = tc.get("function", tc)
                name = func.get("name", "")
                args = func.get("arguments", {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                calls.append({"name": name, "arguments": args})
        return calls

    # Regex fallback for models without native tool support
    content = result.get("content", "")
    if content:
        calls = []
        # First try [TOOL_CALL: format]
        for match in _TOOL_CALL_RE.finditer(content):
            name = match.group(1)
            args_raw = match.group(2)
            if args_raw:
                try:
                    args = json.loads(args_raw)
                except json.JSONDecodeError:
                    args = {}
            else:
                args = {}
            calls.append({"name": name, "arguments": args})

        # Then try JSON {"name": "...", "arguments": {...}} format
        if not calls:
            # Strip markdown code blocks first
            plain = re.sub(r'```(?:json)?', '', content)
            for match in _TOOL_JSON_RE.finditer(plain):
                name = match.group(1)
                try:
                    args = json.loads(match.group(2))
                except json.JSONDecodeError:
                    args = {}
                calls.append({"name": name, "arguments": args})
        return calls

    return []


def strip_tool_calls_from_content(content: str) -> str:
    """Удаляет [TOOL_CALL: ...] и JSON tool blocks из текста (включая внутри code blocks)."""
    cleaned = _TOOL_CALL_RE.sub('', content)
    plain = re.sub(r'```(?:json)?\n?', '', cleaned)
    cleaned = _TOOL_JSON_RE.sub('', plain)
    return cleaned.strip()


def strip_tool_call_patterns(content: str) -> str:
    """Удаляет только TOOL_CALL и JSON tool паттерны, не трогая ``` code blocks."""
    cleaned = _TOOL_CALL_RE.sub('', content)
    cleaned = _TOOL_JSON_RE.sub('', cleaned)
    return cleaned.strip()




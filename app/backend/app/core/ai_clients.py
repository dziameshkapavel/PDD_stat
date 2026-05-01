"""
AI Clients for Ollama (local) and Groq (cloud)
"""

import json
import httpx
from typing import List, Dict, Any, Optional, AsyncGenerator


class OllamaClient:
    """Клиент для Ollama (локальный)"""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url.rstrip('/')
    
    async def test_connection(self) -> Dict[str, Any]:
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
            return {"status": "error", "message": str(e)}
    
    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> Dict[str, Any]:
        """Отправка сообщения в Ollama"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": model,
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "num_predict": max_tokens
                        }
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "success": True,
                        "content": data.get("message", {}).get("content", ""),
                        "model": model,
                        "total_duration": data.get("total_duration", 0)
                    }
                return {"success": False, "error": f"HTTP {response.status_code}: {response.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def chat_stream(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> AsyncGenerator[str, None]:
        """Потоковая отправка сообщений"""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
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
            yield f"Error: {str(e)}"


class GroqClient:
    """Клиент для Groq Cloud API"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.groq.com/openai/v1"
    
    async def test_connection(self) -> Dict[str, Any]:
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
            return {"status": "error", "message": str(e)}
    
    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> Dict[str, Any]:
        """Отправка сообщения в Groq"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": messages,
                        "temperature": temperature,
                        "max_tokens": max_tokens
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "success": True,
                        "content": data['choices'][0]['message']['content'],
                        "model": model,
                        "usage": data.get('usage', {})
                    }
                return {"success": False, "error": f"HTTP {response.status_code}: {response.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def chat_stream(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> AsyncGenerator[str, None]:
        """Потоковая отправка сообщений"""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
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
            yield f"Error: {str(e)}"


class AIClientFactory:
    """Фабрика AI-клиентов"""
    
    @staticmethod
    def create(config: Dict[str, Any]):
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
    def get_default_config() -> Dict[str, Any]:
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
                "default_model": "llama3-70b-8192",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            "system_prompt": "You are PDD_STAT Assistant, a biostatistics AI for clinical researchers. You have access to the dataset and analysis history. Be concise, cite specific numbers, and explain statistical concepts clearly.",
            "last_used_model": "llama3:8b"
        }

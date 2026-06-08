from __future__ import annotations

import json
import re
import traceback
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.projects import get_loader
from app.core.ai import ai_clients
from app.core.ai.context_builder import ContextBuilder
from app.core.ai.prompt_manager import PromptManager
from app.core.ai.response_validator import ResponseValidator
from app.core.executor import Executor
from app.core.modeling_orchestrator import ModelingOrchestrator

_prompt_manager = PromptManager()

router = APIRouter()


class ChatRequest(BaseModel):
    messages: list[dict[str, str]] = Field(..., min_length=1)
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    coder_mode: bool | None = False


class ConfigRequest(BaseModel):
    provider: str
    ollama_url: str | None = "http://localhost:11434"
    ollama_model: str | None = "llama3:8b"
    groq_api_key: str | None = ""
    groq_model: str | None = "llama3-70b-8192"
    temperature: float | None = 0.7
    max_tokens: int | None = 2000
    system_prompt: str | None = None


class ContextRequest(BaseModel):
    description: str | None = None
    aim: str | None = None
    notes: str | None = None


class PipelineStep(BaseModel):
    template: str
    params: dict[str, Any] = {}


class RunPipelineRequest(BaseModel):
    steps: list[PipelineStep]
    auto_interpret: bool = True


# ========== HELPERS ==========

def get_config_path(loader) -> Path:
    return loader.project_path / "state" / "ai_config.json"

def get_context_path(loader) -> Path:
    return loader.project_path / "state" / "project_context.json"

def load_config(loader) -> dict[str, Any]:
    config_path = get_config_path(loader)
    if config_path.exists():
        with open(config_path, encoding='utf-8') as f:
            return json.load(f)
    return ai_clients.AIClientFactory.get_default_config()

def load_context(loader) -> dict[str, Any]:
    context_path = get_context_path(loader)
    if context_path.exists():
        with open(context_path, encoding='utf-8') as f:
            return json.load(f)
    return {"description": "", "aim": "", "notes": ""}

def load_history(loader, limit: int = 5) -> list[dict[str, Any]]:
    history_path = loader.project_path / "state" / "analysis_history.json"
    if not history_path.exists():
        return []
    with open(history_path, encoding='utf-8') as f:
        data = json.load(f)
    if isinstance(data, list):
        return data[:limit]
    return []


# ========== ENDPOINTS ==========

@router.get("/config")
async def get_config():
    loader = get_loader()
    config = load_config(loader)
    if 'groq' in config and 'api_key' in config['groq'] and config['groq']['api_key']:
        config['groq']['api_key'] = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
    return {"config": config}

@router.post("/config")
async def save_config(req: ConfigRequest):
    loader = get_loader()
    config = load_config(loader)
    config['provider'] = req.provider
    config['ollama'] = {
        'url': req.ollama_url, 'default_model': req.ollama_model,
        'temperature': req.temperature or 0.7, 'max_tokens': req.max_tokens or 2000
    }
    config['groq'] = {
        'api_key': req.groq_api_key or config.get('groq', {}).get('api_key', ''),
        'default_model': req.groq_model,
        'temperature': req.temperature or 0.7, 'max_tokens': req.max_tokens or 2000
    }
    config['temperature'] = req.temperature or 0.7
    config['max_tokens'] = req.max_tokens or 2000
    config['last_used_model'] = req.ollama_model if req.provider == 'ollama' else req.groq_model
    if req.system_prompt:
        config['system_prompt'] = req.system_prompt
    config_path = get_config_path(loader)
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    return {"status": "saved", "provider": req.provider}

@router.post("/test")
async def test_connection(req: dict):
    loader = get_loader()
    config = load_config(loader)
    test_provider = req.get('provider', config.get('provider', 'ollama'))
    test_config = config.copy()
    test_config['provider'] = test_provider
    if test_provider == 'ollama' and 'ollama_url' in req:
        if 'ollama' not in test_config:
            test_config['ollama'] = {}
        test_config['ollama']['url'] = req['ollama_url']
    if test_provider == 'groq' and 'groq_api_key' in req and req['groq_api_key']:
        if 'groq' not in test_config:
            test_config['groq'] = {}
        test_config['groq']['api_key'] = req['groq_api_key']
    try:
        client = ai_clients.AIClientFactory.create(test_config)
        result = await client.test_connection()
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/chat")
async def chat(req: ChatRequest):
    loader = get_loader()
    config = load_config(loader)
    model = (req.model or config.get('last_used_model') or 'llama3:8b').strip()
    if not model:
        model = 'llama3:8b'
    role = "coder" if req.coder_mode else "consultant"
    temperature = (0.0 if req.coder_mode else
                  (req.temperature or _prompt_manager.get_temperature(role)))
    max_tokens = req.max_tokens or _prompt_manager.get_max_tokens(role)

    system_prompt = _prompt_manager.build_system_prompt(role=role)

    project_path = loader.project_path
    context_builder = ContextBuilder(project_path)
    context = context_builder.build_full_context(loader)
    project_context = load_context(loader)
    if project_context.get('description'):
        context += f"\n\n## Project\n{project_context['description'][:500]}"
    if project_context.get('aim'):
        context += f"\nAim: {project_context['aim'][:300]}"

    full_prompt = system_prompt + "\n\n" + context

    full_messages = [{"role": "system", "content": full_prompt}] + req.messages
    sanitized = []
    for msg in full_messages:
        sanitized.append({
            "role": str(msg.get("role", "user")),
            "content": str(msg.get("content", ""))
        })

    user_texts = [m.get("content", "") for m in req.messages if m.get("role") == "user"]
    response_language = "ru" if any(re.search('[а-яА-ЯёЁ]', t) for t in user_texts) else "en"

    try:
        client = ai_clients.AIClientFactory.create(config)
        result = await client.chat(model=model, messages=sanitized,
                                   temperature=temperature, max_tokens=max_tokens)

        final_content = result.get("content", "")
        if not final_content:
            final_content = "I'm ready to help with your analysis."
        result["content"] = final_content

    except Exception as e:
        tb = traceback.format_exc()
        return {"success": False, "error": f"{str(e)}\n{tb}"}

    if not result.get('success'):
        return result

    if not req.coder_mode:
        metrics = context_builder.load_last_analysis_metrics(loader)
        if metrics:
            async def rewrite_fn(correction: str) -> str:
                corr_messages = [
                    {"role": "system", "content": full_prompt},
                ]
                for msg in req.messages:
                    corr_messages.append({
                        "role": msg.get("role", "user"),
                        "content": msg.get("content", ""),
                    })
                corr_messages.append({
                    "role": "assistant",
                    "content": result.get("content", ""),
                })
                corr_messages.append({
                    "role": "user",
                    "content": correction,
                })
                corr_sanitized = [{"role": m["role"], "content": str(m["content"])}
                                  for m in corr_messages]
                corr_result = await client.chat(
                    model=model, messages=corr_sanitized,
                    temperature=0.1, max_tokens=max_tokens
                )
                return corr_result.get("content", "")

            validated_text, passed, v_result = await ResponseValidator.auto_retry(
                response=result["content"],
                metrics=metrics,
                llm_rewrite_fn=rewrite_fn,
                max_retries=2,
                response_language=response_language,
            )

            validated_text = ResponseValidator.add_validation_notice(
                validated_text, v_result
            )
            result["content"] = validated_text
            result["validation_passed"] = passed
            result["numbers_checked"] = v_result.numbers_checked
            result["numbers_matched"] = v_result.numbers_matched
            if not passed:
                result["validation_errors"] = v_result.errors[:3]

    result["role"] = role
    return result


# ========== Pipeline Wizard ==========

@router.post("/suggest_pipeline")
async def suggest_pipeline():
    """AI предлагает pipeline анализа на основе датасета."""
    loader = get_loader()
    project_path = loader.project_path
    config = load_config(loader)
    model = (config.get('last_used_model') or 'llama3:8b').strip()

    context_builder = ContextBuilder(project_path)
    context = context_builder.build_full_context(loader)
    project_context = load_context(loader)

    prompt = (
        "You are a biostatistics expert. Based on the dataset and project context below, "
        "suggest an ordered analysis pipeline (3-5 steps) that would provide maximum clinical insight.\n\n"
        f"{context}\n\n"
    )
    if project_context.get('description'):
        prompt += f"Project: {project_context['description'][:300]}\n"
    if project_context.get('aim'):
        prompt += f"Aim: {project_context['aim'][:300]}\n"

    prompt += "\nAvailable templates:\n"
    from app.core.ai.tools import TEMPLATE_DESCRIPTIONS
    for name, desc in TEMPLATE_DESCRIPTIONS.items():
        prompt += f"- {name}: {desc}\n"

    prompt += (
        "\nReturn a JSON array of steps. Each step: {\"template\": \"name\", \"params\": {...}, "
        "\"rationale\": \"why this step\"}. "
        "Params depend on the template — use typical column names from the dataset.\n"
        "Return ONLY valid JSON, no other text."
    )

    client = ai_clients.AIClientFactory.create(config)
    result = await client.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=2000
    )

    if not result.get('success'):
        return {"success": False, "error": result.get("error")}

    content = result.get("content", "")
    json_match = re.search(r'\[.*\]', content, re.DOTALL)
    if json_match:
        try:
            steps = json.loads(json_match.group(0))
            return {"success": True, "steps": steps}
        except json.JSONDecodeError:
            pass

    return {"success": True, "steps": [], "raw": content[:500]}


@router.post("/run_pipeline")
async def run_pipeline(req: RunPipelineRequest):
    """Выполняет pipeline анализа шаг за шагом."""
    loader = get_loader()
    project_path = loader.project_path

    results = []
    for i, step in enumerate(req.steps):
        try:
            executor = Executor(project_path)
            orch = ModelingOrchestrator(project_path, executor)
            step_result = orch.execute_template(step.template, step.params)

            step_output = {
                "order": i + 1,
                "template": step.template,
                "params": step.params,
                "success": step_result.get("success", False),
                "output": (step_result.get("output") or "")[:2000],
                "metrics": step_result.get("metrics", {}),
                "error": step_result.get("error"),
                "ai_comment": None
            }

            if req.auto_interpret and step_result.get("success"):
                config = load_config(loader)
                model = (config.get('last_used_model') or 'llama3:8b').strip()
                client = ai_clients.AIClientFactory.create(config)

                interpret_prompt = (
                    f"Interpret this {step.template} analysis in 1-2 sentences for a clinician. "
                    f"Be concise, highlight key findings.\n\n"
                    f"Output:\n{step_output['output'][:1000]}"
                )
                try:
                    ai_result = await client.chat(
                        model=model,
                        messages=[{"role": "user", "content": interpret_prompt}],
                        temperature=0.2,
                        max_tokens=500
                    )
                    if ai_result.get("success"):
                        step_output["ai_comment"] = ai_result["content"]
                except Exception:
                    step_output["ai_comment"] = None

            results.append(step_output)

        except Exception as e:
            results.append({
                "order": i + 1,
                "template": step.template,
                "params": step.params,
                "success": False,
                "error": str(e),
                "ai_comment": None
            })
            break

    summary = None
    if req.auto_interpret and any(r.get("success") for r in results):
        try:
            config = load_config(loader)
            model = (config.get('last_used_model') or 'llama3:8b').strip()
            client = ai_clients.AIClientFactory.create(config)

            summary_parts = []
            for r in results:
                if r.get("success") and r.get("ai_comment"):
                    summary_parts.append(f"Step {r['order']} ({r['template']}): {r['ai_comment']}")

            if summary_parts:
                summary_prompt = (
                    "Summarize the complete analysis pipeline in 2-3 sentences. "
                    "Focus on the main clinical findings:\n" + "\n".join(summary_parts)
                )
                ai_result = await client.chat(
                    model=model,
                    messages=[{"role": "user", "content": summary_prompt}],
                    temperature=0.3,
                    max_tokens=500
                )
                summary = ai_result.get("content", "") if ai_result.get("success") else None
        except Exception:
            summary = None

    return {
        "success": True,
        "pipeline_id": f"pipe_{uuid.uuid4().hex[:8]}",
        "steps": results,
        "summary": summary
    }

@router.get("/context")
async def get_context():
    loader = get_loader()
    context = load_context(loader)
    df_info = {}
    if loader.df is not None:
        df_info = {"n_rows": len(loader.df), "n_columns": len(loader.df.columns),
                   "columns": loader.get_columns_info()[:20]}
    history = load_history(loader, limit=10)
    return {"context": context, "dataset": df_info, "history": history}

@router.post("/context")
async def save_context(req: ContextRequest):
    loader = get_loader()
    context = load_context(loader)
    if req.description is not None:
        context['description'] = req.description
    if req.aim is not None:
        context['aim'] = req.aim
    if req.notes is not None:
        context['notes'] = req.notes
    context_path = get_context_path(loader)
    context_path.parent.mkdir(parents=True, exist_ok=True)
    with open(context_path, 'w', encoding='utf-8') as f:
        json.dump(context, f, indent=2, ensure_ascii=False)
    return {"status": "saved", "context": context}

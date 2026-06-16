import json
import re
import traceback
import uuid
from datetime import datetime
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
    groq_model: str | None = "llama-3.3-70b-versatile"
    pubmed_api_key: str | None = ""
    pubmed_email: str | None = "app@pdd-stat.local"
    temperature: float | None = 0.7
    max_tokens: int | None = 2000
    system_prompt: str | None = None


class ContextRequest(BaseModel):
    description: str | None = None
    aim: str | None = None
    notes: str | None = None


class PubMedSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    years: int | None = 5
    max_results: int | None = 50
    append: bool = False


class PubMedDeleteRequest(BaseModel):
    pmid: str = Field(..., min_length=1)


class PubMedClearRequest(BaseModel):
    pass


class PubMedSuggestRequest(BaseModel):
    topic: str = ""
    additional_hints: str | None = ""


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
        try:
            with open(config_path, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return ai_clients.AIClientFactory.get_default_config()

def load_context(loader) -> dict[str, Any]:
    context_path = get_context_path(loader)
    if context_path.exists():
        try:
            with open(context_path, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {"description": "", "aim": "", "notes": ""}

def load_history(loader, limit: int = 5) -> list[dict[str, Any]]:
    history_path = loader.project_path / "state" / "analysis_history.json"
    if not history_path.exists():
        return []
    try:
        with open(history_path, encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list):
            return data[:limit]
    except Exception:
        pass
    return []


# ========== ENDPOINTS ==========

@router.get("/config")
async def get_config():
    loader = get_loader()
    config = load_config(loader)
    if 'groq' in config and 'api_key' in config['groq'] and config['groq']['api_key']:
        config['groq']['api_key'] = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
    if config.get('pubmed'):
        config['pubmed']['api_key'] = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' if config['pubmed'].get('api_key') else ''
    return {"config": config}

MASKED_PLACEHOLDER = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'

@router.post("/config")
async def save_config(req: ConfigRequest):
    loader = get_loader()
    config = load_config(loader)
    config['provider'] = req.provider
    config['ollama'] = {
        'url': req.ollama_url, 'default_model': req.ollama_model,
        'temperature': req.temperature or 0.7, 'max_tokens': req.max_tokens or 2000
    }
    new_groq_key = req.groq_api_key
    if not new_groq_key or new_groq_key == MASKED_PLACEHOLDER:
        new_groq_key = config.get('groq', {}).get('api_key', '')
    config['groq'] = {
        'api_key': new_groq_key,
        'default_model': req.groq_model,
        'temperature': req.temperature or 0.7, 'max_tokens': req.max_tokens or 2000
    }
    new_pubmed_key = req.pubmed_api_key
    if not new_pubmed_key or new_pubmed_key == MASKED_PLACEHOLDER:
        new_pubmed_key = config.get('pubmed', {}).get('api_key', '')
    config['pubmed'] = {
        'api_key': new_pubmed_key,
        'email': req.pubmed_email or config.get('pubmed', {}).get('email', 'app@pdd-stat.local'),
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
    if test_provider == 'pubmed':
        pubmed_cfg = test_config.get('pubmed', {})
        pubmed_key = req.get('pubmed_api_key', pubmed_cfg.get('api_key', ''))
        from app.core.pubmed_api import PubMedAPI
        pubmed = PubMedAPI(api_key=pubmed_key)
        pmids = await pubmed.search('test', max_results=1, years=1)
        count = len(pmids) if pmids is not None else 0
        status = "ok" if pmids is not None else "error"
        return {"status": status, "message": f"PubMed API responded: {count} results"}
    try:
        client = ai_clients.AIClientFactory.create(test_config)
        result = await client.test_connection()
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}

def _save_pubmed_context(loader, articles: list[dict], query: str = ""):
    """Сохраняет статьи в project context."""
    project_context = load_context(loader)
    project_context['pubmed_articles'] = articles
    if query:
        project_context['pubmed_query'] = query
    project_context['pubmed_timestamp'] = str(datetime.now())
    context_path = get_context_path(loader)
    with open(context_path, 'w', encoding='utf-8') as f:
        json.dump(project_context, f, indent=2, ensure_ascii=False)


@router.post("/pubmed_search")
async def pubmed_search(req: PubMedSearchRequest):
    """Поиск статей в PubMed: AI генерирует 5 запросов, ищет по всем, агрегирует."""
    loader = get_loader()
    config = load_config(loader)
    pubmed_cfg = config.get('pubmed', {})
    model = (config.get('last_used_model') or 'llama3:8b').strip()
    client = ai_clients.AIClientFactory.create(config)

    from app.core.pubmed_api import PubMedAPI, format_articles_for_context
    pubmed = PubMedAPI(
        api_key=pubmed_cfg.get('api_key', ''),
        email=pubmed_cfg.get('email', 'app@pdd-stat.local'),
    )

    # 1. AI generates 5 PubMed query variants
    prompt = (
        "You are a PubMed search expert. Convert this query into 5 precise PubMed search queries.\n\n"
        f"USER QUERY: \"{req.query}\"\n\n"
        "RULES:\n"
        "1. Translate to English if the query is not in English\n"
        "2. Use appropriate MeSH terms, Boolean operators (AND, OR), and quotes for phrases\n"
        "3. Create 5 different variations to maximize relevant results\n\n"
        "FORMAT:\n"
        "TRANSLATION: [English translation of the original query]\n"
        "QUERIES:\n"
        "1. [first PubMed query]\n"
        "2. [second PubMed query]\n"
        "3. [third PubMed query]\n"
        "4. [fourth PubMed query]\n"
        "5. [fifth PubMed query]\n"
        "Only output the translation and queries. No other text."
    )

    ai_result = await client.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=1000,
    )

    translation = req.query
    variants: list[str] = []
    if ai_result.get('success'):
        content = ai_result.get('content', '')
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('TRANSLATION:'):
                translation = line.replace('TRANSLATION:', '').strip()
            elif re.match(r'^\d+\.', line):
                q = re.sub(r'^\d+\.\s*', '', line).strip()
                if q and len(q) > 3:
                    variants.append(q)
    if not variants:
        variants = [req.query]

    # 2. Search each variant, aggregate PMIDs
    all_pmids: list[str] = []
    for variant in variants[:5]:
        try:
            pmids = await pubmed.search(variant, max_results=20, years=req.years)
            all_pmids.extend(pmids)
        except Exception:
            pass

    unique_pmids = list(dict.fromkeys(all_pmids))[:req.max_results]
    new_articles = await pubmed.fetch_details(unique_pmids) if unique_pmids else []

    # 3. Append or replace in context
    existing = load_context(loader).get('pubmed_articles', [])
    if req.append and existing:
        seen = {a["pmid"] for a in existing}
        merged = existing[:]
        for a in new_articles:
            if a["pmid"] not in seen:
                merged.append(a)
                seen.add(a["pmid"])
        articles = merged
    else:
        articles = new_articles

    _save_pubmed_context(loader, articles, query=req.query)

    formatted = format_articles_for_context(articles)
    return {
        "success": True,
        "count": len(articles),
        "new_count": len(new_articles),
        "query": req.query,
        "translation": translation,
        "variants": variants,
        "articles": articles,
        "formatted_context": formatted,
    }


@router.post("/pubmed_delete")
async def pubmed_delete(req: PubMedDeleteRequest):
    """Удаляет статью из PubMed контекста по PMID."""
    loader = get_loader()
    existing = load_context(loader).get('pubmed_articles', [])
    articles = [a for a in existing if a.get("pmid") != req.pmid]
    removed = len(existing) - len(articles)
    _save_pubmed_context(loader, articles)
    return {"success": True, "removed": removed, "count": len(articles), "articles": articles}


@router.post("/pubmed_clear")
async def pubmed_clear():
    """Очищает все PubMed статьи из контекста."""
    loader = get_loader()
    _save_pubmed_context(loader, [])
    return {"success": True, "count": 0, "articles": []}


@router.post("/pubmed_suggest")
async def pubmed_suggest(req: PubMedSuggestRequest):
    """Генерация 5 вариантов PubMed-запросов из текста пользователя через AI."""
    if not req.topic.strip():
        return {"success": False, "error": "Query is empty"}
    loader = get_loader()
    config = load_config(loader)
    model = (config.get('last_used_model') or 'llama3:8b').strip()
    client = ai_clients.AIClientFactory.create(config)

    prompt = (
        "You are a PubMed search expert. Convert this query into 5 precise PubMed search queries.\n\n"
        f"USER QUERY: \"{req.topic}\"\n"
        f"ADDITIONAL HINTS: \"{req.additional_hints or 'none'}\"\n\n"
        "RULES:\n"
        "1. Translate to English if the query is not in English\n"
        "2. Use MeSH terms, Boolean operators (AND, OR), and quotes for phrases\n"
        "3. Create 5 different variations to maximize relevant results\n\n"
        "FORMAT:\n"
        "TRANSLATION: [English translation of the original query]\n"
        "QUERIES:\n"
        "1. [first PubMed query]\n"
        "2. [second PubMed query]\n"
        "3. [third PubMed query]\n"
        "4. [fourth PubMed query]\n"
        "5. [fifth PubMed query]\n"
        "Only output the translation and queries. No other text."
    )

    result = await client.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=1000,
    )

    if not result.get('success'):
        return {"success": False, "error": result.get("error")}

    content = result.get("content", "")
    translation = ""
    queries: list[str] = []

    for line in content.split('\n'):
        line = line.strip()
        if line.startswith('TRANSLATION:'):
            translation = line.replace('TRANSLATION:', '').strip()
        elif re.match(r'^\d+\.', line):
            q = re.sub(r'^\d+\.\s*', '', line).strip()
            if q and len(q) > 3:
                queries.append(q)

    if not queries:
        queries = [req.topic]

    return {
        "success": True,
        "translation": translation,
        "queries": queries[:5],
        "raw": content[:500],
    }


def _normalize_pvalues(text: str) -> str:
    """Replace scientific notation p-values with <0.0001 format."""
    # Pattern: p=3.44e-17, p = 1.23e-05, p-value: 2.07e-07, p value = 3e-10, etc.
    text = re.sub(
        r'(\b(?:p|p[- ]?value)\s*[=:≈<>]?\s*)\d+(?:\.\d+)?e[+-]?\d+',
        r'\1<0.0001',
        text,
        flags=re.IGNORECASE,
    )
    # Also catch "p = 3.44 × 10⁻¹⁷" style
    text = re.sub(
        r'(\b(?:p|p[- ]?value)\s*[=:≈]\s*)\d+[.]\d+\s*[×x]\s*10[⁻⁺^]?[⁰¹²³⁴⁵⁶⁷⁸⁹+-]?\d+',
        r'\1<0.0001',
        text,
        flags=re.IGNORECASE,
    )
    return text


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

    last_user_msg = ""
    for m in reversed(req.messages):
        if m.get("role") == "user":
            last_user_msg = m.get("content", "")
            break

    context = context_builder.build_full_context(loader, user_query=last_user_msg)
    project_context = load_context(loader)
    if project_context.get('description'):
        context += f"\n\n## Project\n{project_context['description'][:500]}"
    if project_context.get('aim'):
        context += f"\nAim: {project_context['aim'][:300]}"
    if project_context.get('notes'):
        context += f"\nNotes: {project_context['notes'][:500]}"

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
        final_content = _normalize_pvalues(final_content)
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
                return _normalize_pvalues(corr_result.get("content", ""))

            pubmed_articles = project_context.get('pubmed_articles', [])

            validated_text, passed, v_result = await ResponseValidator.auto_retry(
                response=result["content"],
                metrics=metrics,
                llm_rewrite_fn=rewrite_fn,
                max_retries=2,
                response_language=response_language,
                pubmed_articles=pubmed_articles,
            )

            validated_text = ResponseValidator.add_validation_notice(
                validated_text, v_result
            )
            result["content"] = validated_text
            result["validation_passed"] = passed
            result["numbers_checked"] = v_result.numbers_checked
            result["numbers_matched"] = v_result.numbers_matched
            result["citations_checked"] = v_result.citations_checked
            result["citations_matched"] = v_result.citations_matched
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
    if project_context.get('notes'):
        prompt += f"Notes: {project_context['notes'][:300]}\n"

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

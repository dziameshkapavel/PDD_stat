from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from typing import List, Dict, Any, Optional
import json
import numpy as np
import traceback

from app.api.projects import get_loader
from app.core.ai_clients import AIClientFactory

router = APIRouter()


class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    coder_mode: Optional[bool] = False


class ConfigRequest(BaseModel):
    provider: str
    ollama_url: Optional[str] = "http://localhost:11434"
    ollama_model: Optional[str] = "llama3:8b"
    groq_api_key: Optional[str] = ""
    groq_model: Optional[str] = "llama3-70b-8192"
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 2000
    system_prompt: Optional[str] = None


class ContextRequest(BaseModel):
    description: Optional[str] = None
    aim: Optional[str] = None
    notes: Optional[str] = None


# ========== HELPERS ==========

def get_config_path(loader) -> Path:
    return loader.project_path / "state" / "ai_config.json"

def get_context_path(loader) -> Path:
    return loader.project_path / "state" / "project_context.json"

def load_config(loader) -> Dict[str, Any]:
    config_path = get_config_path(loader)
    if config_path.exists():
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return AIClientFactory.get_default_config()

def load_context(loader) -> Dict[str, Any]:
    context_path = get_context_path(loader)
    if context_path.exists():
        with open(context_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"description": "", "aim": "", "notes": ""}

def load_history(loader, limit: int = 50) -> List[Dict[str, Any]]:
    history_path = loader.project_path / "state" / "analysis_history.json"
    if history_path.exists():
        with open(history_path, 'r', encoding='utf-8') as f:
            history = json.load(f)
        return [h for h in history if h.get('template') != 'ai_chat'][:limit]
    return []


def build_system_prompt(config: Dict, loader) -> str:
    """Собирает системный промпт с контекстом данных и истории"""
    
    prompt = config.get('system_prompt', 
        "You are PDD_STAT Assistant, a biostatistics AI for clinical researchers.")
    
    prompt += "\n\nRULES:"
    prompt += "\n- Use plain text only. NO LaTeX ($, \\text, \\beta)."
    prompt += "\n- Write variable names in `backticks`."
    prompt += "\n- When user mentions an analysis type, find the MOST RECENT matching entry by timestamp."
    prompt += "\n- Quote EXACT numbers from the analyses below. Do NOT mix data from different analyses."
    prompt += "\n- If OR < 1, say \"associated with LOWER odds\"."
    prompt += "\n- Be specific with real numbers from the analyses below."
    prompt += "\n- Do NOT write code unless the user explicitly asks for it (e.g., 'write code for...')."
    prompt += "\n- When user asks for code: write clean, working Python code using `df['column']` for columns. Keep it concise without comments."
    prompt += "\n- When not asked for code: explain in plain text without code blocks."  
    prompt += "\n- When discussing Kaplan-Meier, ALWAYS mention group names, median survival times, and survival rates at key timepoints (12, 24, 36 months) if available."
    prompt += "\n- For plots and code, the user has Code Mode button. Do NOT offer to write code."
    prompt += "\n- When discussing regression results (Cox, Logistic, LASSO), ALWAYS quote exact HR/OR and p-values from the coefficients."
    prompt += "\n- AUC and C-index measure DISCRIMINATION — NOT accuracy and NOT \"predicts survival at X%\". They show how well the model separates patients with events from those without."
    prompt += "\n- CORRECT interpretation: \"C-index of 0.755 means the model correctly ranks pairs of patients 75.5% of the time — a patient with the event gets a higher risk score than a patient without.\""
    prompt += "\n- WRONG interpretation (NEVER say this): \"predicts survival at 85.5%\", \"accuracy of 85.5%\", \"predicts survival rate\"."
    prompt += "\n- Time-dependent AUC(t) measures discrimination at specific time points. AUC=0.85 at 12mo means: at 12 months, the model discriminates well between those who had the event and those who didn't."
    prompt += "\n- AUC scale: 0.5=random, 0.6-0.7=poor, 0.7-0.8=acceptable, 0.8-0.9=good, >0.9=excellent."
    prompt += "\n- When comparing models: cite ΔC and p-value from the formal comparison test. The comparison test (IPCW DeLong) shows whether the difference between models is statistically significant."
    prompt += "\n- When describing trends in time-dependent AUC across time points, note whether discrimination is stable, improving, or declining. Small fluctuations (±0.02) are normal and don't change the overall assessment."
    prompt += "\n- When citing ΔC from model comparison, preserve the original order from the comparison: \"model1 vs model2 ΔC=+X.XXXX\" means model1 has higher C-index by X. Always reference which model is better."
    prompt += "\n- NEVER say \"Kaplan-Meier index\" or \"Cox index\". The correct term is \"C-index\" (concordance index) — it measures discrimination, NOT survival probability."
    prompt += "\n- NEVER say \"predicts survival\" or \"survival forecast\". Say \"discriminates between patients with and without events\" or \"ranks patients by risk\"."
    prompt += "\n- NEVER use vague terms like \"good\", \"high\", \"strong\" without numbers. Always say \"good discrimination (C-index 0.75, above the 0.7 threshold for clinical utility)\"."
    prompt += "\n- C-index/AUC scale (always cite the threshold): 0.5=random, 0.6-0.7=poor discrimination, 0.7-0.8=acceptable/clinical utility, 0.8-0.9=good discrimination, >0.9=excellent discrimination."
    prompt += "\n- When only one model is evaluated: describe its absolute performance against the scale, don't just say \"model has good results\"."
    prompt += "\n- Time-dependent AUC shows discrimination at specific time horizons. Note whether discrimination is stable, improving, or declining over time. AUC >0.8 at late time points (>48mo) is particularly valuable for long-term prognostication."
    prompt += "\n- When stating model quality, ALWAYS anchor C-index/AUC to the scale explicitly. Example: \"C-index 0.755 indicates acceptable discrimination, approaching good (threshold 0.8).\" Not just \"good discrimination\"."
    prompt += "\n- Format: 'variable (HR=X.XX, p=0.XXX)' or 'variable (OR=X.XX, p=0.XXX)'."
    prompt += "\n- Do NOT just list variable names without numbers."
    prompt += "\n- When you see [CODER OUTPUT] in the conversation, those are the EXACT results from executed code. Use ONLY those numbers. Do NOT modify, round differently, or invent new values."
    
    # Проект
    context = load_context(loader)
    if context.get('description'):
        prompt += f"\n\n## Project\n{context['description'][:500]}"
    if context.get('aim'):
        prompt += f"\nAim: {context['aim'][:300]}"
    
    # Данные
    df = loader.df
    if df is not None:
        cols = loader.get_columns_info()
        nums = [c['name'] for c in cols if c['type'] == 'numeric'][:10]
        cats = [c['name'] for c in cols if c['type'] == 'categorical'][:5]
        bins = [c['name'] for c in cols if c['type'] == 'binary'][:5]
        prompt += f"\n\n## Dataset: {len(df)} rows, {len(cols)} cols"
        if nums:
            prompt += f"\nNumeric: {', '.join(nums)}"
        if bins:
            prompt += f"\nBinary: {', '.join(bins)}"
        if cats:
            prompt += f"\nCategorical: {', '.join(cats)}"
    
    # История анализов
    history = load_history(loader, limit=15)
    base_prompt = prompt
    if history:
        base_prompt += f"\n\n## Recent Analyses:"
        for item in history:
            tpl = item.get('template', '')
            title = item.get('title', tpl)
            metrics = item.get('metrics', {})
            ts = item.get('timestamp', '')[:16].replace('T', ' ')
            output_preview = item.get('output_preview', '')

            parts = []

            # ВСЕ числовые метрики автоматически
            for k, v in metrics.items():
                if k in ('model_type', 'plots', 'summary', 'auto_select_C', 'target'):
                    continue
                if isinstance(v, (int, float)) and v is not None:
                    if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                        continue
                    v_str = str(int(v)) if v == int(v) else f"{v:.4f}"
                    parts.append(f"{k}={v_str}")

                # !!! Специальная обработка coefficients ДО общей обработки списков !!!
                elif k == 'coefficients' and isinstance(v, list):
                    model_type = metrics.get('model_type', '')
                    ratio_label = 'HR' if 'cox' in str(model_type).lower() else 'OR'

                    all_vars = []
                    for c in v:
                        var_name = c.get('variable', '?')
                        ratio = c.get('hr') or c.get('or', 0)
                        p_val = c.get('p_value', 1)
                        if p_val < 0.05:
                            all_vars.append(f"{var_name}({ratio_label}={ratio:.2f}, p={p_val:.4f})")
                        else:
                            all_vars.append(f"{var_name}({ratio_label}={ratio:.2f}, p={p_val:.4f} NS)")

                    if all_vars:
                        parts.append(f"coefficients: {'; '.join(all_vars[:10])}")

                elif k == 'model_steps' and isinstance(v, list):
                    steps_desc = []
                    for step in v:
                        action = step.get('action', '?')
                        variable = step.get('variable', '?')
                        p_val = step.get('p_value', 1)
                        steps_desc.append(f"{action} {variable} (p={p_val:.4f})")
                    if steps_desc:
                        parts.append(f"steps: {'; '.join(steps_desc)}")

                # Special handling for diagnostic_accuracy / ROC results
                elif k == 'results' and isinstance(v, list):
                    for res in v[:5]:
                        test_name = res.get('test') or res.get('predictor', '?')
                        sens = res.get('sensitivity', 0)
                        spec = res.get('specificity', 0)
                        auc_val = res.get('accuracy') or res.get('auc', 0)
                        parts.append(f"{test_name}(Se={sens:.2f},Sp={spec:.2f},AUC={auc_val:.3f})")

                # Special handling for pairwise_tests (diagnostic_accuracy + kaplan_meier)
                elif k == 'pairwise_tests' and isinstance(v, list):
                    for pt in v[:5]:
                        t1 = pt.get('test1') or pt.get('group1', '?')
                        t2 = pt.get('test2') or pt.get('group2', '?')
                        sp = pt.get('sens_p') or pt.get('p_value', 1)
                        pp = pt.get('spec_p', 1)
                        parts.append(f"{t1}vs{t2}(sens_p={sp:.4f},spec_p={pp:.4f})")

                elif k == 'posthoc' and isinstance(v, list) and v and isinstance(v[0], dict) and 'group1' in v[0]:
                    sig_pairs = [f"{p.get('group1','?')}vs{p.get('group2','?')}(p={p.get('p_value',1):.4f})" for p in v if p.get('significant')]
                    if sig_pairs:
                        parts.append(f"posthoc_significant: {'; '.join(sig_pairs[:8])}")

                # Special handling for agreement_categorical
                elif k == 'kappa' and isinstance(v, (int, float)):
                    parts.append(f"κ={v:.4f}")
                elif k == 'interpretation' and isinstance(v, str) and v:
                    parts.append(f"agreement={v}")
                elif k == 'percent_agreement' and isinstance(v, (int, float)):
                    parts.append(f"agreement={v:.1f}%")

                elif k == 'selected_features' and isinstance(v, list):
                    feats = []
                    for f in v[:8]:
                        name = f.get('feature', '?')
                        or_val = f.get('or', 0)
                        feats.append(f"{name}(OR={or_val:.2f})")
                    if feats:
                        parts.append(f"selected: {'; '.join(feats)}")

                elif k == 'top_features' and isinstance(v, list):
                    feats = []
                    for f in v[:8]:
                        name = f.get('variable', '?')
                        imp = f.get('importance', 0)
                        feats.append(f"{name}({imp:.3f})")
                    if feats:
                        parts.append(f"importance: {'; '.join(feats)}")

                elif k == 'shap_features' and isinstance(v, list) and v:
                    feats = []
                    for f in v[:8]:
                        name = f.get('feature', '?')
                        imp = f.get('importance', 0)
                        feats.append(f"{name}({imp:.4f})")
                    if feats:
                        parts.append(f"SHAP: {'; '.join(feats)}")

                elif k == 'zeroed_features' and isinstance(v, list):
                    if v:
                        parts.append(f"removed: {', '.join(v[:10])}")

                elif k == 'pairs' and isinstance(v, list):
                    pair_strs = []
                    for p in v[:8]:
                        v1 = p.get('var1', '?')
                        v2 = p.get('var2', '?')
                        r_val = p.get('r', 0)
                        p_val = p.get('p_value', 1)
                        pair_strs.append("{}-{}(r={:.3f},p={:.4f})".format(v1, v2, r_val, p_val))
                    if pair_strs:
                        parts.append("pairs: " + '; '.join(pair_strs))

                elif k == 'descriptive_stats' and isinstance(v, list):
                    for ds in v[:5]:
                        grp = ds.get('group', '?')
                        n = ds.get('n', 0)
                        med = ds.get('median', 0)
                        q1 = ds.get('q1', 0)
                        q3 = ds.get('q3', 0)
                        parts.append("{}(n={},med={:.1f},Q1={:.1f},Q3={:.1f})".format(grp, n, med, q1, q3))

                elif k == 'model_comparisons' and isinstance(v, list):
                    comp_parts = []
                    for comp in v[:5]:
                        m1 = comp.get('model1', '?')
                        m2 = comp.get('model2', '?')
                        delta = comp.get('delta', 0)
                        p_val = comp.get('p_value', 1)
                        sig = '**' if p_val < 0.05 else ''
                        comp_parts.append(f"{m1}vs{m2}(ΔC={delta:+.4f},p={p_val:.4f}{sig})")
                    if comp_parts:
                        parts.append(f"Model comparison: {'; '.join(comp_parts)}")

                elif isinstance(v, list) and v and isinstance(v[0], dict):
                    # Handle strata with number_at_risk and survival_probability
                    if k == 'strata' and isinstance(v, list):
                        for stratum in v[:3]:
                            stratum_name = stratum.get('stratum', '?')
                            nar = stratum.get('number_at_risk', {})
                            sp = stratum.get('survival_probability', {})
                            if nar:
                                tps = nar.get('time_points', [])
                                d = nar.get('data', {})
                                if tps and d:
                                    nar_parts = []
                                    for grp, counts in list(d.items())[:3]:
                                        nar_parts.append(grp + ":" + ','.join(str(c) for c in counts))
                                    parts.append("at_risk(" + stratum_name + ")(" + ','.join(str(t) for t in tps) + "mo): " + '; '.join(nar_parts))
                            if sp:
                                tps = sp.get('time_points', [])
                                d = sp.get('data', {})
                                if tps and d:
                                    surv_parts = []
                                    for grp, probs in list(d.items())[:3]:
                                        surv_str = ','.join(f"{p*100:.0f}%" if p else '-' for p in probs)
                                        surv_parts.append(grp + ":" + surv_str)
                                    parts.append("S(t)(" + stratum_name + ")(" + ','.join(str(t) for t in tps) + "mo): " + '; '.join(surv_parts))
                    elif k in ('significant_predictors',):
                        sig_vars = []
                        for item in v:
                            var_name = item.get('variable', '?')
                            hr = item.get('hr', 0)
                            p_val = item.get('p_value', 1)
                            sig_vars.append(f"{var_name}(HR={hr:.2f}, p={p_val:.4f})")
                        if sig_vars:
                            parts.append(f"significant: {{{'; '.join(sig_vars)}}}")
                    else:
                        names = []
                        for item_dict in v[:5]:
                            name = item_dict.get('feature') or item_dict.get('predictor') or \
                                   item_dict.get('variable') or item_dict.get('group') or \
                                   item_dict.get('var1') or str(item_dict)
                            if len(name) > 30: name = name[:27] + '...'
                            names.append(name)
                        if names:
                            parts.append(f"{k}=[{', '.join(names)}]")

                elif isinstance(v, str):
                    if len(v) < 50:
                        parts.append(f"{k}={v}")
                    elif v.startswith('<') and '>' in v:
                        plain = v.replace('<br>', ' ').replace('<sub>', '').replace('</sub>', '')
                        import re
                        plain = re.sub(r'<[^>]+>', '', plain)
                        if len(plain) < 100:
                            parts.append(f"{k}={plain}")

                elif isinstance(v, dict) and k == 'metrics_by_model':
                    for model_name, mm in v.items():
                        auc = mm.get('auc', '?')
                        if isinstance(auc, float):
                            parts.append(f"{model_name}(AUC={auc:.3f})")
                elif isinstance(v, dict) and k == 'dca_net_benefit':
                    for model_name, thresholds in v.items():
                        nb_vals = []
                        for t, nb in thresholds.items():
                            if nb is not None:
                                nb_vals.append(f"{t}={nb:.3f}")
                        if nb_vals:
                            parts.append(f"DCA_{model_name}=[{', '.join(nb_vals[:4])}]")
                elif isinstance(v, dict) and k == 'median_survival':
                    meds = []
                    for g, val in v.items():
                        if val: meds.append(f"{g}={val:.1f}mo")
                        else: meds.append(f"{g}=NR")
                    if meds: parts.append("medians={" + ', '.join(meds) + "}")
                elif k == 'number_at_risk' and isinstance(v, dict):
                    time_points = v.get('time_points', [])
                    data = v.get('data', {})
                    if time_points and data:
                        nar_parts = []
                        for grp, counts in list(data.items())[:4]:
                            nar_parts.append(grp + ":" + ','.join(str(c) for c in counts))
                        at_risk_str = "at_risk(" + ','.join(str(t) for t in time_points) + "mo): " + '; '.join(nar_parts)
                        parts.append(at_risk_str)
                elif k == 'survival_probability' and isinstance(v, dict):
                    time_points = v.get('time_points', [])
                    data = v.get('data', {})
                    if time_points and data:
                        surv_parts = []
                        for grp, probs in list(data.items())[:4]:
                            surv_str = ','.join(f"{p*100:.0f}%" if p else '-' for p in probs)
                            surv_parts.append(grp + ":" + surv_str)
                        s_t_str = "S(t)(" + ','.join(str(t) for t in time_points) + "mo): " + '; '.join(surv_parts)
                        parts.append(s_t_str)
                elif isinstance(v, list) and len(v) > 0 and isinstance(v[0], (str, int, float)):
                    parts.append(f"{k}=[{', '.join([str(x)[:20] for x in v[:5]])}]")

                # survival_evaluation: c_indices (general or stratified)
                elif k == 'c_indices' and isinstance(v, dict):
                    c_parts = []
                    for stratum_label, model_dict in v.items():
                        if isinstance(model_dict, dict) and any(isinstance(mv, dict) and 'value' in mv for mv in model_dict.values()):
                            for model, cinfo in model_dict.items():
                                if isinstance(cinfo, dict):
                                    c_val = cinfo.get('value', 0)
                                    c_parts.append(f"{stratum_label}/{model}(C={c_val:.4f})")
                        elif isinstance(model_dict, dict) and 'value' in model_dict:
                            c_val = model_dict.get('value', 0)
                            c_parts.append(f"{stratum_label}(C={c_val:.4f})")
                    if c_parts:
                        parts.append(f"C-index: {'; '.join(c_parts)}")

                # survival_evaluation: time_auc
                elif k == 'time_auc' and isinstance(v, dict):
                    auc_parts = []
                    for stratum_label, model_dict in v.items():
                        if isinstance(model_dict, dict):
                            for model, tdata in model_dict.items():
                                if isinstance(tdata, dict):
                                    try:
                                        t_items = sorted([(k2, v2) for k2, v2 in tdata.items() if isinstance(k2, str) and k2.isdigit()], key=lambda x: int(x[0]))
                                    except:
                                        t_items = list(tdata.items())[:5]
                                    auc_str = ', '.join([f"{t}mo={info.get('auc',0):.3f}" for t, info in t_items[:5]])
                                    auc_parts.append(f"{model}: {auc_str}")
                    if auc_parts:
                        parts.append(f"Time-AUC: {'; '.join(auc_parts[:3])}")

                # ========== NEW handlers for previously lost metrics ==========

                # schoenfeld_test (cox_ph): {var: {p_value, test_statistic, violated}}
                elif k == 'schoenfeld_test' and isinstance(v, dict):
                    sch_parts = []
                    for var_name, res in v.items():
                        pv = res.get('p_value', 1)
                        viol = res.get('violated', False)
                        if var_name == 'GLOBAL':
                            sch_parts.append(f"global(PH_p={pv:.4f}{'**' if viol else ''})")
                        else:
                            sch_parts.append(f"{var_name}(PH_p={pv:.4f}{'**' if viol else ''})")
                    if sch_parts:
                        parts.append(f"Schoenfeld: {'; '.join(sch_parts[:8])}")

                # hosmer_lemeshow (logistic): {chi_square, p_value, df, significant}
                elif k == 'hosmer_lemeshow' and isinstance(v, dict):
                    if 'error' not in v:
                        chi2 = v.get('chi_square', 0)
                        pv = v.get('p_value', 1)
                        df = v.get('df', 0)
                        parts.append(f"HL(χ²={chi2:.2f}, df={df}, p={pv:.4f})")

                # vif (cox_ph, logistic): {var: {value, high, moderate}}
                elif k == 'vif' and isinstance(v, dict):
                    vif_parts = []
                    for var_name, vinfo in v.items():
                        val = vinfo.get('value', 0)
                        high = vinfo.get('high', False)
                        vif_parts.append(f"{var_name}(VIF={val:.1f}{'**' if high else ''})")
                    if vif_parts:
                        parts.append(f"VIF: {'; '.join(vif_parts[:8])}")

                # warnings: list of strings — re-enabled for AI
                elif k == 'warnings' and isinstance(v, list) and v:
                    parts.append(f"warnings: {'; '.join(str(w)[:80] for w in v[:5])}")

                # feature_importance (random_survival_forest): {feature: importance}
                elif k == 'feature_importance' and isinstance(v, dict):
                    sorted_feats = sorted(v.items(), key=lambda x: x[1], reverse=True)[:8]
                    fi_parts = [f"{name}({imp:.4f})" for name, imp in sorted_feats]
                    if fi_parts:
                        parts.append(f"importance: {'; '.join(fi_parts)}")

                # univariate_aucs (logistic): [{predictor, auc}, ...]
                elif k == 'univariate_aucs' and isinstance(v, list):
                    ua_parts = []
                    for u in v[:8]:
                        pred = u.get('predictor', '?')
                        auc_val = u.get('auc', 0)
                        ua_parts.append(f"{pred}(AUC={auc_val:.3f})")
                    if ua_parts:
                        parts.append(f"uni_AUC: {'; '.join(ua_parts)}")

                # best_vs_others (roc_analysis): list of strings
                elif k == 'best_vs_others' and isinstance(v, list):
                    for bvo in v[:3]:
                        if isinstance(bvo, str):
                            parts.append(bvo)

                # calibration (model_eval_binary): {model: {brier_score}}
                elif k == 'calibration' and isinstance(v, dict):
                    cal_parts = []
                    for model_name, cal_info in v.items():
                        brier = cal_info.get('brier_score')
                        if brier is not None:
                            cal_parts.append(f"{model_name}(Brier={brier:.4f})")
                    if cal_parts:
                        parts.append(f"calibration: {'; '.join(cal_parts[:5])}")

                # Generic nested dict handler — shows top-level key/value pairs
                elif isinstance(v, dict):
                    flat_parts = []
                    for subk, subv in v.items():
                        if isinstance(subv, (int, float)):
                            if isinstance(subv, float) and (np.isnan(subv) or np.isinf(subv)):
                                continue
                            flat_parts.append(f"{subk}={subv:.4f}" if isinstance(subv, float) else f"{subk}={subv}")
                    if flat_parts:
                        parts.append(f"{k}=[{', '.join(flat_parts[:6])}]")

            analysis_id = f"[{ts}]"

            if parts:
                base_prompt += f"\n{analysis_id} {title}: {'; '.join(parts[:30])}"
            else:
                base_prompt += f"\n{analysis_id} {title}"

            # Inject output_preview for templates with few metrics
            tpl = item.get('template', '')
            if len(parts) <= 2 and output_preview:
                short_preview = output_preview[:600]
                lines = short_preview.split('\n')
                filtered = [l for l in lines if not l.startswith('<!') and not l.startswith('<!--') and len(l) > 10]
                preview = '\n'.join(filtered[:10])
                if preview.strip():
                    base_prompt += f"\n  Output: {preview[:500]}"

    return base_prompt


# ========== ENDPOINTS ==========

@router.get("/config")
async def get_config():
    loader = get_loader()
    config = load_config(loader)
    if 'groq' in config and 'api_key' in config['groq'] and config['groq']['api_key']:
        config['groq']['api_key'] = '••••••••'
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
        if 'ollama' not in test_config: test_config['ollama'] = {}
        test_config['ollama']['url'] = req['ollama_url']
    if test_provider == 'groq':
        if 'groq_api_key' in req and req['groq_api_key']:
            if 'groq' not in test_config: test_config['groq'] = {}
            test_config['groq']['api_key'] = req['groq_api_key']
    try:
        client = AIClientFactory.create(test_config)
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
    temperature = req.temperature or config.get('temperature', 0.7)
    max_tokens = req.max_tokens or config.get('max_tokens', 2000)
    try:
        system_prompt = build_system_prompt(config, loader)
    except Exception as e:
        system_prompt = "You are PDD_STAT Assistant, a biostatistics AI. Be concise and accurate."
    
    if req.coder_mode:
        coder_prompt = "\n\n## CRITICAL: CODER MODE ENABLED\nYou MUST calculate all values using Python code in ```python blocks. Never just state numbers - always execute code first. Example:\nUser: median of age\nResponse:\n```python\nprint(df['age'].median())\n```"
        system_prompt += coder_prompt
    
    full_messages = [{"role": "system", "content": system_prompt}] + req.messages
    
    # Sanitize messages: ensure all content values are strings
    sanitized = []
    for msg in full_messages:
        sanitized.append({
            "role": str(msg.get("role", "user")),
            "content": str(msg.get("content", ""))
        })
    
    try:
        client = AIClientFactory.create(config)
        result = await client.chat(model=model, messages=sanitized,
                                   temperature=temperature, max_tokens=max_tokens)
        return result
    except Exception as e:
        tb = traceback.format_exc()
        error_msg = str(e)
        return {"success": False, "error": f"{error_msg}\n{tb}"}

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
    if req.description is not None: context['description'] = req.description
    if req.aim is not None: context['aim'] = req.aim
    if req.notes is not None: context['notes'] = req.notes
    context_path = get_context_path(loader)
    context_path.parent.mkdir(parents=True, exist_ok=True)
    with open(context_path, 'w', encoding='utf-8') as f:
        json.dump(context, f, indent=2, ensure_ascii=False)
    return {"status": "saved", "context": context}

"""
ContextBuilder — преобразует данные проекта в структурированный текст для ИИ.
"""
import json
from pathlib import Path
from typing import Any


class ContextBuilder:
    """Собирает контекст проекта: датасет + последний анализ."""

    def __init__(self, project_path: Path):
        self.project_path = Path(project_path)
        self.state_folder = self.project_path / "state"

    def build_dataset_summary(self, loader) -> str:
        """Форматирует общую статистику датасета."""
        df = loader.df
        if df is None:
            return "## Dataset: not loaded"

        cols = loader.get_columns_info()
        nums = [c["name"] for c in cols if c["type"] == "numeric"]
        cats = [c["name"] for c in cols if c["type"] == "categorical"]
        bins = [c["name"] for c in cols if c["type"] == "binary"]

        lines = ["## Dataset Summary"]
        lines.append(f"Rows: {len(df)} | Columns: {len(cols)}")
        if nums:
            lines.append(f"Numeric: {', '.join(nums[:10])}" + (f" (+{len(nums)-10} more)" if len(nums) > 10 else ""))
        if bins:
            lines.append(f"Binary: {', '.join(bins[:5])}" + (f" (+{len(bins)-5} more)" if len(bins) > 5 else ""))
        if cats:
            lines.append(f"Categorical: {', '.join(cats[:5])}" + (f" (+{len(cats)-5} more)" if len(cats) > 5 else ""))
        return "\n".join(lines)

    def load_last_analysis(self, loader) -> dict[str, Any] | None:
        """Загружает последний (первый) не-ai_chat анализ из истории."""
        history_path = self.state_folder / "analysis_history.json"
        if not history_path.exists():
            return None
        try:
            with open(history_path, encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            return None
        for item in history:
            if item.get("template") != "ai_chat":
                return item
        return None

    def load_last_analysis_metrics(self, loader) -> dict[str, Any] | None:
        """Возвращает метрики последнего анализа."""
        item = self.load_last_analysis(loader)
        if item is None:
            return None
        return item.get("metrics", {})

    def _format_coefficients(self, coeffs: list[dict], model_type: str) -> list[str]:
        """Форматирует список коэффициентов (HR/OR)."""
        label = "HR" if "cox" in model_type.lower() else "OR"
        parts = []
        for c in coeffs:
            if c.get("is_reference"):
                continue
            var = c.get("variable", c.get("display_name", "?"))
            ratio = c.get(label.lower()) or c.get("hr") or c.get("or", 0)
            p_val = c.get("p_value", 1)
            ci_low = c.get("ci_low") or c.get("ci_lower")
            ci_high = c.get("ci_high") or c.get("ci_upper")
            if ci_low is not None and ci_high is not None:
                parts.append(f"{var}: {label}={ratio:.2f} (95% CI {ci_low:.2f}-{ci_high:.2f}), p={p_val:.4f}")
            else:
                parts.append(f"{var}: {label}={ratio:.2f}, p={p_val:.4f}")
        return parts

    def _format_metrics_text(self, metrics: dict[str, Any]) -> str:
        """Форматирует метрики анализа в читаемый текст."""
        lines = []

        model_type = metrics.get("model_type", "")
        if model_type:
            lines.append(f"Model type: {model_type}")

        # Per-variable statistics (descriptive_stats)
        var_stats = metrics.get("variables_stats")
        if var_stats and isinstance(var_stats, list):
            lines.append("Variable statistics:")
            for vs in var_stats[:15]:
                if vs.get("n", 0) == 0:
                    lines.append(f"  {vs.get('variable', '?')}: N=0")
                    continue
                parts = [f"N={vs.get('n',0)}"]
                for key, label in [("mean","Mean"), ("median","Median"), ("std","Std"),
                    ("min","Min"), ("max","Max"), ("q1","Q1"), ("q3","Q3"),
                    ("skew","Skew"), ("kurtosis","Kurt")]:
                    val = vs.get(key)
                    if val is not None:
                        parts.append(f"{label}={val}")
                lines.append(f"  {vs.get('variable', '?')}: " + ", ".join(parts))
            if len(var_stats) > 15:
                lines.append(f"  ... ({len(var_stats)-15} more variables)")

        # Contingency table (categorical)
        ct = metrics.get("contingency_table")
        if ct and isinstance(ct, list):
            lines.append("Contingency table (2×2):")
            for row in ct[:5]:
                entries = [str(v) for v in row.values()]
                lines.append("  " + " | ".join(entries))

        # Kappa / agreement (agreement_categorical)
        kappa = metrics.get("kappa")
        if kappa is not None:
            interp = metrics.get("interpretation")
            pct = metrics.get("percent_agreement")
            pa_str = f", %agreement={pct:.2f}" if pct is not None else ""
            ip_str = f", {interp}" if interp else ""
            lines.append(f"Cohen's κ={kappa:.4f}{pa_str}{ip_str}")
        z_stat = metrics.get("z_statistic")
        if z_stat is not None:
            lines.append(f"  z={z_stat:.3f}")

        # Group-level statistics (violin_plot, anova, numeric_compare)
        group_stats = metrics.get("group_stats")
        if group_stats and isinstance(group_stats, list):
            lines.append("Group statistics:")
            for gs in group_stats:
                g = gs.get("group", "?")
                parts = [f"N={gs.get('n',0)}"]
                for key, label in [("mean","Mean"), ("median","Median"), ("std","Std"),
                    ("q1","Q1"), ("q3","Q3"), ("iqr","IQR"), ("min","Min"), ("max","Max")]:
                    val = gs.get(key)
                    if val is not None:
                        parts.append(f"{label}={val}")
                lines.append(f"  {g}: " + ", ".join(parts))

        # Коэффициенты (HR/OR) — logistic хранит в "coefficients", cox в "table"
        coeffs = metrics.get("coefficients") or metrics.get("table", [])
        if coeffs:
            lines.append("Coefficients:")
            for line in self._format_coefficients(coeffs, model_type):
                lines.append(f"  {line}")

        # LASSO selected features
        sel = metrics.get("selected_features")
        if sel and isinstance(sel, list) and len(sel) > 0:
            lines.append("Selected features (LASSO):")
            for s in sel[:8]:
                feat = s.get("display_name", s.get("feature", "?"))
                coef = s.get("coefficient", 0)
                or_val = s.get("or")
                if or_val is not None:
                    lines.append(f"  {feat}: coef={coef:.4f}, OR={or_val:.4f}")
                else:
                    lines.append(f"  {feat}: coef={coef:.4f}")
            n_zeroed = metrics.get("n_features_zeroed", 0)
            if n_zeroed:
                lines.append(f"  ({n_zeroed} features zeroed)")

        # Model fit metrics
        for key, fmt in [
            ("c_index", "C-index: {:.3f}"),
            ("concordance", "C-index: {:.3f}"),
            ("auc", "AUC: {:.3f}"),
            ("best_auc", "Best AUC: {:.3f}"),
            ("lrt_p", "LRT p: {:.4f}"),
            ("p_value_global", "Global p: {:.4f}"),
            # ("logrank_overall" handled below with conditional format)
            ("oob_score", "OOB score: {:.4f}"),
            ("intercept", "Intercept: {:.4f}"),
            ("best_C", "Best C: {:.4f}"),
            ("n_features_selected", "Features selected: {}"),
            ("n_predictors_tested", "Predictors tested: {}"),
            ("n_total", "N: {}"),
            ("n_events", "Events: {}"),
            ("events", "Events: {}"),
            ("n_strong_pairs", "Strong pairs (|r|>threshold): {}"),
            ("nonlinear_p", "Non-linearity p: {:.4f}"),
            ("lrt_chi2", "LRT χ²: {:.2f}"),
            ("lrt_df", "LRT df: {}"),
            ("brier_score", "Brier score: {:.4f}"),
            ("brier_skill_score", "Brier skill score: {:.4f}"),
            ("calibration_intercept", "Calibration intercept: {:.4f}"),
            ("calibration_slope", "Calibration slope: {:.4f}"),
            ("n_test_samples", "Test samples: {}"),
            ("best_predictor", "Best predictor: {}"),
        ]:
            val = metrics.get(key)
            if val is not None:
                lines.append(fmt.format(val))

        # Log-rank p-value (conditional: <0.0001 instead of scientific notation)
        lr_p = metrics.get("logrank_overall")
        if lr_p is not None:
            if lr_p < 0.0001:
                lines.append("Log-rank p: <0.0001")
            else:
                lines.append(f"Log-rank p: {lr_p:.4f}")

        # Classification metrics
        for key, fmt in [
            ("accuracy", "Accuracy: {:.3f}"),
            ("sensitivity", "Sensitivity: {:.3f}"),
            ("specificity", "Specificity: {:.3f}"),
            ("precision", "Precision: {:.3f}"),
            ("recall", "Recall: {:.3f}"),
            ("f1", "F1: {:.3f}"),
        ]:
            val = metrics.get(key)
            if val is not None:
                lines.append(fmt.format(val))

        # Hosmer-Lemeshow
        hl = metrics.get("hosmer_lemeshow")
        if hl and isinstance(hl, dict) and "error" not in hl:
            chi = hl.get("chi_square", 0)
            pv = hl.get("p_value", 1)
            df = hl.get("df", 0)
            lines.append(f"Hosmer-Lemeshow: χ²={chi:.2f}, df={df}, p={pv:.4f}")

        # Schoenfeld
        sch = metrics.get("schoenfeld_test")
        if sch and isinstance(sch, dict):
            viol = [vn for vn, vr in sch.items() if vr.get("violated") and vn != "GLOBAL"]
            global_p = sch.get("GLOBAL", {}).get("p_value")
            parts = []
            if global_p is not None:
                parts.append(f"global PH p={global_p:.4f}")
            if viol:
                parts.append(f"violated variables: {', '.join(viol)}")
            if parts:
                lines.append("Schoenfeld residuals: " + "; ".join(parts))

        # VIF
        vif = metrics.get("vif")
        if vif and isinstance(vif, dict):
            high = [f"{vn}(VIF={vi.get('value',0):.1f})" for vn, vi in vif.items() if vi.get("high")]
            mod = [f"{vn}(VIF={vi.get('value',0):.1f})" for vn, vi in vif.items() if vi.get("moderate")]
            if high:
                lines.append("High multicollinearity (VIF>10): " + ", ".join(high))
            if mod:
                lines.append("Moderate multicollinearity (VIF>5): " + ", ".join(mod))

        # Median survival
        med = metrics.get("median_survival")
        if med and isinstance(med, dict):
            vals = [f"{g}: {v:.1f}mo" if v else f"{g}: NR" for g, v in med.items()]
            lines.append("Median survival: " + "; ".join(vals))

        # Number at risk / survival prob (kaplan-meier)
        nar = metrics.get("number_at_risk")
        if nar and isinstance(nar, dict):
            tps = nar.get("time_points", [])
            data = nar.get("data", {})
            if tps and data:
                parts = []
                for grp, counts in list(data.items())[:4]:
                    parts.append(f"{grp}: " + ",".join(str(c) for c in counts))
                lines.append("Number at risk (" + ",".join(str(t) for t in tps) + "mo): " + "; ".join(parts))

        sp = metrics.get("survival_probability")
        if sp and isinstance(sp, dict):
            tps = sp.get("time_points", [])
            data = sp.get("data", {})
            if tps and data:
                parts = []
                for grp, probs in list(data.items())[:4]:
                    s = ",".join(f"{p*100:.0f}%" if p else "-" for p in probs)
                    parts.append(f"{grp}: {s}")
                lines.append("S(t) (" + ",".join(str(t) for t in tps) + "mo): " + "; ".join(parts))

        # C-index per stratum (survival_evaluation)
        cindices = metrics.get("c_indices")
        if cindices and isinstance(cindices, dict):
            parts = []
            for stratum, mdict in cindices.items():
                if isinstance(mdict, dict):
                    for model, cinfo in mdict.items():
                        if isinstance(cinfo, dict):
                            cv = cinfo.get("value", 0)
                            parts.append(f"{stratum}/{model}: C={cv:.3f}")
            if parts:
                lines.append("C-indices: " + "; ".join(parts[:5]))

        # Uno C-index (IPCW-corrected)
        cindices = metrics.get("c_indices")
        if cindices and isinstance(cindices, dict):
            parts = []
            for stratum, mdict in cindices.items():
                if isinstance(mdict, dict):
                    for model, cinfo in mdict.items():
                        if isinstance(cinfo, dict):
                            uno = cinfo.get("uno")
                            if uno is not None:
                                parts.append(f"{stratum}/{model}: UnoC={uno:.3f}")
            if parts:
                lines.append("Uno C-index: " + "; ".join(parts[:5]))

        # Time-dependent AUC
        tauc = metrics.get("time_auc")
        if tauc and isinstance(tauc, dict):
            parts = []
            for _stratum, mdict in tauc.items():
                if isinstance(mdict, dict):
                    for model, tdata in mdict.items():
                        if isinstance(tdata, dict):
                            vals = []
                            for t, info in sorted(tdata.items(), key=lambda x: int(x[0]) if str(x[0]).isdigit() else 0):
                                auc_val = info.get("auc")
                                if auc_val is not None:
                                    vals.append(f"{t}mo: {auc_val:.3f}")
                                else:
                                    vals.append(f"{t}mo: N/A")
                            if vals:
                                parts.append(f"{model}: " + ", ".join(vals[:4]))
            if parts:
                lines.append("Time-AUC: " + "; ".join(parts[:3]))

        # Model comparisons
        comp = metrics.get("model_comparisons")
        if comp and isinstance(comp, list):
            for c in comp[:3]:
                m1, m2 = c.get("model1", "?"), c.get("model2", "?")
                delta = c.get("delta", 0)
                pv = c.get("p_value", 1)
                lines.append(f"Comparison: {m1} vs {m2} ΔC={delta:+.4f}, p={pv:.4f}")

        # DCA net benefit
        dca = metrics.get("dca_net_benefit")
        if dca and isinstance(dca, dict):
            for model, thresh in dca.items():
                vals = [f"{t}: {nb:.3f}" for t, nb in thresh.items() if nb is not None]
                if vals:
                    lines.append(f"DCA {model}: [" + ", ".join(vals[:4]) + "]")

        # Calibration (Brier)
        cal = metrics.get("calibration")
        if cal and isinstance(cal, dict):
            for model, cinfo in cal.items():
                brier = cinfo.get("brier_score")
                if brier is not None:
                    lines.append(f"Brier ({model}): {brier:.4f}")

        # ROC results (from roc_analysis template — has "auc" in items)
        results = metrics.get("results")
        if results and isinstance(results, list) and results and "auc" in results[0]:
                for r in results[:5]:
                    pred = r.get("predictor", "?")
                    auc_val = r.get("auc")
                    if auc_val is None:
                        continue
                    se = r.get("sensitivity", 0)
                    sp = r.get("specificity", 0)
                    opt = r.get("optimal_threshold")
                    ci_low = r.get("ci_low")
                    ci_high = r.get("ci_high")
                    opt_str = f", threshold={opt:.2f}" if opt is not None else ""
                    if ci_low is not None and ci_high is not None:
                        lines.append(f"{pred}: AUC={auc_val:.3f} (95% CI {ci_low:.3f}-{ci_high:.3f}), Se={se:.2f}, Sp={sp:.2f}{opt_str}")
                    else:
                        lines.append(f"{pred}: AUC={auc_val:.3f}, Se={se:.2f}, Sp={sp:.2f}{opt_str}")

        # ROC best vs others
        bvo = metrics.get("best_vs_others")
        if bvo and isinstance(bvo, list):
            for b in bvo[:3]:
                vs = b.get("others", "?")
                zv = b.get("z_value")
                pv = b.get("p_value")
                if zv is not None and pv is not None:
                    lines.append(f"Best vs {vs}: z={zv:.2f}, p={pv:.4f}")

        # Diagnostic accuracy results (different structure — has "test" key)
        if results and isinstance(results, list) and results and "test" in results[0]:
            for r in results[:5]:
                test = r.get("test", "?")
                sens = r.get("sensitivity", 0)
                spec = r.get("specificity", 0)
                ppv = r.get("ppv", 0)
                npv = r.get("npv", 0)
                acc = r.get("accuracy", 0)
                dor = r.get("dor")
                parts = [f"{test}: Se={sens:.3f}, Sp={spec:.3f}, PPV={ppv:.3f}, NPV={npv:.3f}, Acc={acc:.3f}"]
                if dor is not None:
                    parts.append(f"DOR={dor:.2f}")
                lines.append(", ".join(parts))

        # Pairwise tests (diagnostic_accuracy)
        pw = metrics.get("pairwise_tests")
        if pw and isinstance(pw, list):
            for p in pw[:3]:
                t1, t2 = p.get("test1", "?"), p.get("test2", "?")
                sp = p.get("sens_p")
                if sp is not None:
                    lines.append(f"Sens comparison {t1} vs {t2}: p={sp:.4f}")

        # Logrank pairwise (kaplan-meier)
        lrw = metrics.get("logrank_pairwise")
        if lrw and isinstance(lrw, list):
            for pair in lrw[:5]:
                g1 = pair.get("group1", "?")
                g2 = pair.get("group2", "?")
                pv = pair.get("p_value", 1)
                sig = pair.get("significant")
                mark = " *" if sig else ""
                pv_str = "<0.0001" if pv < 0.0001 else f"{pv:.4f}"
                lines.append(f"Log-rank {g1} vs {g2}: p={pv_str}{mark}")

        # Model steps (stepwise selection)
        steps = metrics.get("model_steps")
        if steps and isinstance(steps, list):
            lines.append("Stepwise selection:")
            for s in steps[:6]:
                action = s.get("action", "?")
                var = s.get("variable", "?")
                pv = s.get("p_value", 1)
                lines.append(f"  {action}: {var} (p={pv:.4f})")

        # Feature importance (random_forest, random_survival_forest)
        topf = metrics.get("top_features")
        if topf and isinstance(topf, list):
            lines.append("Top features:")
            for f in topf[:8]:
                var = f.get("variable", "?")
                imp = f.get("importance", 0)
                lines.append(f"  {var}: {imp:.4f}")

        permf = metrics.get("permutation_importance")
        if permf and isinstance(permf, list) and len(permf) > 0:
            lines.append("Permutation importance:")
            for f in permf[:8]:
                var = f.get("variable", "?")
                imp = f.get("importance", 0)
                sd = f.get("sd", 0)
                lines.append(f"  {var}: {imp:.4f} ± {sd:.4f}")

        shapf = metrics.get("shap_features")
        if shapf and isinstance(shapf, list) and len(shapf) > 0:
            lines.append("SHAP importance:")
            for f in shapf[:5]:
                feat = f.get("feature", "?")
                imp = f.get("importance", 0)
                lines.append(f"  {feat}: {imp:.4f}")

        # Class distribution
        cd = metrics.get("class_distribution")
        if cd and isinstance(cd, dict):
            lines.append("Class distribution: " + ", ".join(f"{k}={v}" for k, v in cd.items()))

        # Correlation pairs
        pairs = metrics.get("pairs")
        if pairs and isinstance(pairs, list):
            strongest_r = metrics.get("strongest_r")
            strongest_pair = metrics.get("strongest_pair")
            if strongest_r is not None and strongest_pair:
                lines.append(f"Strongest correlation: {strongest_pair} (r={strongest_r:.4f})")
            for p in pairs[:5]:
                v1 = p.get("var1", "?")
                v2 = p.get("var2", "?")
                r = p.get("r", 0)
                pv = p.get("p_value", 1)
                lines.append(f"  {v1} vs {v2}: r={r:.4f}, p={pv:.4f}")

        # Categorical test
        chi2 = metrics.get("chi2")
        if chi2 is not None:
            test_name = metrics.get("test_name", "Chi-square")
            df = metrics.get("df", 0)
            pv = metrics.get("p_value", 1)
            mf = metrics.get("min_expected_frequency")
            mf_str = f", min exp freq={mf:.2f}" if mf is not None else ""
            lines.append(f"{test_name}: χ²={chi2:.2f}, df={df}, p={pv:.4f}{mf_str}")
        or_val = metrics.get("odds_ratio")
        if or_val is not None:
            pv = metrics.get("p_value", 1)
            lines.append(f"Fisher's Exact: OR={or_val:.4f}, p={pv:.4f}")

        # ANOVA / Kruskal-Wallis
        f_stat = metrics.get("F_stat")
        h_stat = metrics.get("H_stat")
        if f_stat is not None:
            pv = metrics.get("p_value", 1)
            eta = metrics.get("eta_sq")
            omega = metrics.get("omega_sq")
            tail = ""
            if eta is not None and omega is not None:
                tail = f" (η²={eta:.4f}, ω²={omega:.4f})"
            elif eta is not None:
                tail = f" (η²={eta:.4f})"
            lines.append(f"ANOVA: F={f_stat:.3f}, p={pv:.4f}{tail}")
        if h_stat is not None:
            pv = metrics.get("p_value", 1)
            eps = metrics.get("epsilon_sq")
            tail = f" (ε²={eps:.4f})" if eps is not None else ""
            lines.append(f"Kruskal-Wallis: H={h_stat:.3f}, p={pv:.4f}{tail}")

        # Post-hoc (ANOVA)
        post = metrics.get("posthoc")
        if post and isinstance(post, list):
            sig_post = [p for p in post if p.get("significant")]
            if sig_post:
                pairs_str = "; ".join(
                    f"{p['group1']}-{p['group2']} (p={p['p_value']:.4f})"
                    for p in sig_post[:4]
                )
                lines.append(f"Post-hoc significant pairs: {pairs_str}")
            elif not metrics.get("significant"):
                lines.append("Post-hoc: no significant pairwise differences")

        # Levene / Bartlett (numeric_compare, anova)
        if metrics.get("levene_p") is not None:
            lp = metrics["levene_p"]
            eq = metrics.get("equal_var")
            label = f", equal_var={eq}" if eq is not None else ""
            lines.append(f"Levene: p={lp:.4f}{label}")

        # T-test / Mann-Whitney (numeric_compare)
        test_name = metrics.get("test_name", "")
        statistic = metrics.get("statistic")
        pv = metrics.get("p_value")
        if test_name and statistic is not None and pv is not None:
            cohens = metrics.get("cohens_d")
            tail = f", d={cohens:.3f}" if cohens is not None else ""
            lines.append(f"{test_name}: statistic={statistic:.3f}, p={pv:.4f}{tail}")

        # Violin plot group comparison
        mwp = metrics.get("mann_whitney_p")
        kp = metrics.get("kruskal_p")
        if mwp is not None:
            lines.append(f"Mann-Whitney U: p={mwp:.4f}")
        if kp is not None:
            lines.append(f"Kruskal-Wallis: p={kp:.4f}")

        # Kappa (agreement)
        kappa = metrics.get("kappa")
        if kappa is not None:
            ki = metrics.get("interpretation", "")
            ci_low = metrics.get("ci_low")
            ci_high = metrics.get("ci_high")
            pv = metrics.get("p_value", 1)
            pa = metrics.get("percent_agreement")
            ci_part = f" (95% CI {ci_low:.3f}-{ci_high:.3f})" if ci_low is not None and ci_high is not None else ""
            pa_part = f", agreement={pa:.1%}" if pa is not None else ""
            lines.append(f"Cohen's κ={kappa:.3f}{ci_part}, p={pv:.4f}{pa_part}")
            if ki:
                lines.append(f"  Interpretation: {ki}")

        # Descriptive stats per group (anova, numeric_compare)
        desc = metrics.get("descriptive") or metrics.get("descriptive_stats")
        if desc and isinstance(desc, list) and len(desc) > 0:
            if "groups" in metrics or metrics.get("n_groups", 0) > 0:
                lines.append("Group descriptives:")
            for d in desc[:6]:
                g = d.get("group", "?")
                n = d.get("n", 0)
                m = d.get("mean", d.get("median", 0))
                sd = d.get("sd")
                if sd is not None:
                    lines.append(f"  {g}: n={n}, mean={m:.2f}, SD={sd:.2f}")
                else:
                    q1 = d.get("q1", 0)
                    q3 = d.get("q3", 0)
                    lines.append(f"  {g}: n={n}, median={m:.2f} (Q1={q1:.2f}, Q3={q3:.2f})")

        # Normality (numeric_compare)
        norm = metrics.get("normality")
        if norm and isinstance(norm, dict):
            all_norm = norm.get("all_normal")
            if all_norm is not None:
                lines.append(f"Normality: {'all normal' if all_norm else 'not all normal'}")

        # Prediction (individual_prediction)
        pred = metrics.get("prediction")
        prob = metrics.get("probability")
        if pred is not None and prob is not None:
            lines.append(f"Prediction: class={pred}, probability={prob:.4f}")

        # Model-evaluation metrics_by_model
        mem = metrics.get("metrics_by_model")
        if mem and isinstance(mem, dict):
            best_model = metrics.get("best_model", "")
            for model_name, mdata in mem.items():
                acc = mdata.get("accuracy")
                sens = mdata.get("sensitivity")
                spec = mdata.get("specificity")
                f1 = mdata.get("f1")
                brier = mdata.get("brier")
                end = " ← best" if model_name == best_model else ""
                parts = [f"{model_name}:"]
                if acc is not None:
                    parts.append(f"Acc={acc:.3f}")
                if sens is not None:
                    parts.append(f"Se={sens:.3f}")
                if spec is not None:
                    parts.append(f"Sp={spec:.3f}")
                if f1 is not None:
                    parts.append(f"F1={f1:.3f}")
                if brier is not None:
                    parts.append(f"Brier={brier:.4f}")
                lines.append("  " + ", ".join(parts) + end)

        # Warnings
        warns = metrics.get("warnings")
        if warns and isinstance(warns, list):
            for w in warns[:3]:
                lines.append(f"Warning: {w}")

        # Significant flag (categorical, anova, violin)
        sig = metrics.get("significant")
        if sig is not None and sig is True and not any("p=" in line for line in lines[-5:]):
            lines.append("Result: statistically significant")

        return "\n".join(lines)

    def build_last_analysis_context(self, loader) -> str | None:
        """Форматирует последний анализ в текстовый блок для промпта."""
        item = self.load_last_analysis(loader)
        if item is None:
            return None

        ts = item.get("timestamp", "")[:16].replace("T", " ")
        title = item.get("title", item.get("template", "?"))
        template = item.get("template", "?")
        metrics = item.get("metrics", {})

        lines = [f"## Last Analysis ({ts})"]
        lines.append(f"Template: {template}")
        lines.append(f"Title: {title}")

        output = item.get("output_preview", "")
        if output:
            lines.append("")
            lines.append("### Output text")
            lines.append(output[:3000])

        metric_text = self._format_metrics_text(metrics)
        if metric_text:
            lines.append("")
            lines.append("### Metrics")
            lines.append(metric_text)

        return "\n".join(lines)

    def build_pubmed_context(self, loader, user_query: str = "") -> str:
        """PubMed articles from project context, formatted for AI prompt."""
        project_context_path = self.state_folder.parent / "state" / "project_context.json"
        if not project_context_path.exists():
            return ""
        try:
            with open(project_context_path, encoding="utf-8") as f:
                context = json.load(f)
        except Exception:
            return ""
        articles = context.get("pubmed_articles", [])
        if not articles:
            return ""
        from app.core.pubmed_api import format_articles_for_context
        return format_articles_for_context(articles)

    def build_full_context(self, loader, user_query: str = "") -> str:
        """Объединяет сводку датасета + историю анализов + PubMed."""
        parts = [self.build_dataset_summary(loader)]
        history_context = self._build_history_context(loader)
        if history_context:
            parts.append("")
            parts.append(history_context)
        pubmed = self.build_pubmed_context(loader)
        if pubmed:
            parts.append("")
            parts.append(pubmed)
        return "\n".join(parts)

    def _build_history_context(self, loader) -> str | None:
        """Форматирует последние анализы (до 5) с output_preview и метриками."""
        history_path = self.state_folder / "analysis_history.json"
        if not history_path.exists():
            return None
        try:
            with open(history_path, encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            return None
        items = [h for h in history if h.get("template") != "ai_chat"]
        if not items:
            return None
        items = items[:5]

        blocks = []
        for item in items:
            ts = item.get("timestamp", "")[:16].replace("T", " ")
            title = item.get("title", item.get("template", "?"))
            template = item.get("template", "?")
            metrics = item.get("metrics", {})
            block = f"## [{ts}] {title}"
            block += f"\nTemplate: {template}"

            output = item.get("output_preview", "")
            if output:
                block += "\n\n### Output text\n" + output[:3000]

            metric_text = self._format_metrics_text(metrics)
            if metric_text:
                block += "\n\n### Metrics\n" + metric_text

            blocks.append(block)

        return "\n---\n".join(blocks)

    def build_context_for_report(self, loader, selected_ids: list[str]) -> str:
        """Форматирует выбранные анализы для AI-отчёта (report/ai-generate)."""
        history_path = self.state_folder / "analysis_history.json"
        if not history_path.exists():
            return "No analysis history available."

        try:
            with open(history_path, encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            return "Failed to load analysis history."

        if selected_ids:
            items = [h for h in history if h.get("id") in selected_ids]
        else:
            items = [h for h in history if h.get("template") != "ai_chat"]

        # Cap at 5 to keep token count manageable
        items = items[:5]

        blocks = []
        for item in items:
            ts = item.get("timestamp", "")[:10]
            title = item.get("title", item.get("template", "?"))
            metrics = item.get("metrics", {})
            block = f"[{ts}] {title}\n"
            block += self._format_metrics_text(metrics)
            blocks.append(block)

        return "\n---\n".join(blocks)

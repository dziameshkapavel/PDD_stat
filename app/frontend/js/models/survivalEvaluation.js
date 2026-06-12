// js/models/survivalEvaluation.js - Survival Prediction Evaluation Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class SurvivalEvaluationModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'survival_evaluation';
        this.templatePrefix = 'surv_eval';
    }
    
    createCard() {
        const template = document.getElementById('survEvalCardTemplate');
        if (!template) return null;
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `surveval_${Date.now()}`;
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        
        // Chart Axes toggle
        const chartAxesBtn = card.querySelector('.chart-axes-btn');
        const axesRow = card.querySelector('.chart-axes-row');
        
        if (chartAxesBtn && axesRow) {
            axesRow.style.display = 'none';
            chartAxesBtn.classList.remove('active');
            
            chartAxesBtn.addEventListener('click', () => {
                chartAxesBtn.classList.toggle('active');
                axesRow.style.display = chartAxesBtn.classList.contains('active') ? 'flex' : 'none';
            });
        }
        
        // Smooth toggle
        const smoothBtn = card.querySelector('.smooth-btn');
        if (smoothBtn) {
            smoothBtn.addEventListener('click', () => {
                smoothBtn.classList.toggle('active');
            });
        }

        // Кнопка Run
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        // Чекбоксы
        this._setupCheckboxes(card);
        
        return card;
    }
    
    _setupCheckboxes(card) {
        const bootstrapInput = card.querySelector('.bootstrap-input');
        const comparisonCheck = card.querySelector('.comparison-check');
        
        // По умолчанию всё включено
        if (comparisonCheck) comparisonCheck.checked = true;
        
        // Связать bootstrap и comparison (если bootstrap=0, comparison не имеет смысла)
        if (bootstrapInput && comparisonCheck) {
            bootstrapInput.addEventListener('change', () => {
                const val = parseInt(bootstrapInput.value) || 0;
                if (val === 0) {
                    comparisonCheck.checked = false;
                    comparisonCheck.disabled = true;
                } else {
                    comparisonCheck.disabled = false;
                    comparisonCheck.checked = true;
                }
            });
        }
    }
    
    async run(card) {
        const params = this._getParameters(card);
        
        if (!params.time_col || !params.event_col) {
            this.ui.modals.showAlert('Select time and event variables');
            return;
        }
        if (!params.pred_cols || params.pred_cols.length === 0) {
            this.ui.modals.showAlert('Select at least one prediction column');
            return;
        }
        
        const title = `Survival Prediction Evaluation (${params.pred_cols.length} models)`;
        const block = this.createResultsBlock(card, title);
        (block.querySelector('.results-stats') == null ? void 0 : block.querySelector('.results-stats').remove());
        
        const loadingDiv = this._showLoading(block);
        
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: this.templateName, params })
            });
            
            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            
            if (!result.success) throw new Error(result.error || 'Evaluation failed');
            
            loadingDiv.remove();
            this.renderResults(block, result, params);
            await this.displayPlots(block, 'surv_eval');
            
        } catch (e) {
            loadingDiv.remove();
            this._showError(block, e.message);
        }
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        
        const timeInput = card.querySelector('.time-input');
        const eventInput = card.querySelector('.event-input');
        const predictorsInput = card.querySelector('.predictors-input');
        const timePointsInput = card.querySelector('.time-points-input');
        const xStepInput = card.querySelector('.x-step-input');
        const bootstrapInput = card.querySelector('.bootstrap-input');
        const bootstrapSeedInput = card.querySelector('.bootstrap-seed-input');
        const comparisonCheck = card.querySelector('.comparison-check');
        
        const timeCol = timeInput && timeInput.value && value.trim() || vars.time || '';
        const eventCol = eventInput && eventInput.value && value.trim() || vars.event || '';
        
        let predCols = [];
        if (predictorsInput && predictorsInput.value && value.trim()) {
            predCols = predictorsInput.value.split(',').map(s => s.trim()).filter(s => s);
        } else if (vars.predictors instanceof Set) {
            predCols = Array.from(vars.predictors);
        } else if (Array.isArray(vars.predictors)) {
            predCols = vars.predictors;
        }
        
        const timePointsStr = timePointsInput && timePointsInput.value || '';
        const evalTimes = timePointsStr.split(',')
            .map(t => parseInt(t.trim()))
            .filter(t => !isNaN(t) && t > 0);
        const timeStep = evalTimes.length >= 2 ? evalTimes[1] - evalTimes[0] : 6;
        
        const nBootstrap = parseInt(bootstrapInput && bootstrapInput.value) || 1000;
        const runComparison = comparisonCheck && comparisonCheck.checked && nBootstrap > 0;
        const runCalibration = false;
        
        const stratifyInput = card.querySelector('.stratify-input');
        const stratifyCol = stratifyInput && stratifyInput.value && value.trim() || vars.stratify || '';
        
        let xTickStep = 6, xLabel = 'Time, months', yTickStep = 0.1, yLabel = 'AUC';
        const axesRow = card.querySelector('.chart-axes-row');
        if (axesRow && axesRow.style.display !== 'none') {
            xTickStep = parseInt((card.querySelector('.x-step-input') == null ? void 0 : card.querySelector('.x-step-input').value)) || 6;
            xLabel = (card.querySelector('.x-label-input') == null ? void 0 : card.querySelector('.x-label-input').value) || 'Time, months';
            yTickStep = parseFloat((card.querySelector('.y-step-input') == null ? void 0 : card.querySelector('.y-step-input').value)) || 0.1;
            yLabel = (card.querySelector('.y-label-input') == null ? void 0 : card.querySelector('.y-label-input').value) || 'AUC';
        }
        
        const smooth = (card.querySelector('.smooth-btn') == null ? void 0 : card.querySelector('.smooth-btn').classList.contains('active')) || false;

        return {
            time_col: timeCol,
            event_col: eventCol,
            pred_cols: predCols,
            time_points: timePointsStr,
            stratify_col: stratifyCol,
            x_tick_step: xTickStep,
            x_label: xLabel,
            y_tick_step: yTickStep,
            y_label: yLabel,
            n_bootstrap: nBootstrap,
            bootstrap_seed: bootstrapSeedInput ? parseInt(bootstrapSeedInput.value) || 42 : 42,
            run_model_comparison: runComparison,
            run_calibration: runCalibration,
            smooth: smooth
        };
    }
    
    renderResults(block, result, params) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const metrics = result.metrics || {};
        const strata = metrics.strata || [];
        let html = '';
        
        if (strata.length > 0) {
            for (const s of strata) {
                const label = s.label || 'All';
                html += `<div class="diagnostic-card" style="margin-bottom:12px;">`;
                html += `<h3 class="diagnostic-card-title">${label} (n=${s.n}, events=${s.events})</h3>`;
                html += '<div class="diagnostic-card-content">';
                
                const cIndices = s.c_indices || {};
                if (Object.keys(cIndices).length > 0) {
                    html += '<table class="results-table"><thead><tr><th>Model</th><th>C-index</th><th>95% CI</th></tr></thead><tbody>';
                    for (const [m, c] of Object.entries(cIndices)) {
                        html += `<tr><td><strong>${m}</strong></td><td>${(c.value||0).toFixed(4)}</td><td>[${(c.ci_low||0).toFixed(4)}, ${(c.ci_high||0).toFixed(4)}]</td></tr>`;
                    }
                    html += '</tbody></table>';
                }
                
                const timeAuc = metrics.time_auc && time_auc.[s.label] || {};
                if (Object.keys(timeAuc).length > 0) {
                    // Use user-specified time points if any, otherwise show nothing
                    const userPoints = params.time_points ? params.time_points.split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t)) : [];
                    const sortedTimes = userPoints.length > 0 ? userPoints.sort((a, b) => a - b) : [];
                    
                    if (sortedTimes.length > 0) {
                        html += '<table class="results-table"><thead><tr><th>Model</th>';
                        sortedTimes.forEach(t => html += `<th>${t}mo</th>`);
                        html += '</tr></thead><tbody>';
                        for (const [m, data] of Object.entries(timeAuc)) {
                            html += `<tr><td><strong>${m}</strong></td>`;
                            sortedTimes.forEach(t => {
                                const cell = data && data.[String(t)];
                                if (cell) {
                                    const auc = cell.auc && auc.toFixed(3) || '—';
                                    const ciLow = cell.ci_low && ci_low.toFixed(3) || '';
                                    const ciHigh = cell.ci_high && ci_high.toFixed(3) || '';
                                    const p = cell.p_value;
                                    const pStr = (p != null) ? ` p=${Number(p).toFixed(4)}` : '';
                                    if (ciLow && ciHigh) {
                                        html += `<td>${auc}<br><span style="font-size:10px;color:var(--text-muted);">[${ciLow}-${ciHigh}]${pStr}</span></td>`;
                                    } else {
                                        html += `<td>${auc}${pStr}</td>`;
                                    }
                                } else {
                                    html += `<td>—</td>`;
                                }
                            });
                            html += '</tr>';
                        }
                        html += '</tbody></table>';
                    } else {
                        html += '<p style="color:var(--text-muted);font-size:13px;">No time points specified. Enter values (e.g., 12,24,36) in the field above.</p>';
                    }
                }
                
                html += '</div></div>';
            }
        }
        
        const comps = metrics.model_comparisons || [];
        if (comps.length > 0) {
            html += '<div class="diagnostic-card">';
            html += '<h3 class="diagnostic-card-title">Model Comparison</h3>';
            html += '<table class="results-table"><thead><tr><th>Comparison</th><th>ΔC</th><th>p-value</th></tr></thead><tbody>';
            for (const c of comps) {
                const sig = c.p_value < 0.05 ? ' **' : '';
                html += `<tr><td>${c.model1} vs ${c.model2}</td><td>${(c.delta||0).toFixed(4)}</td><td>${(c.p_value||1).toFixed(4)}${sig}</td></tr>`;
            }
            html += '</tbody></table></div>';
        }
        
        container.innerHTML = html || '<p style="padding:16px;">No metrics</p>';
        this._setupHeaderButtons(block);
    }
    
    _renderCIndex(pane, metrics) {
        const cIndices = metrics.c_indices || {};
        const models = Object.keys(cIndices);
        
        if (models.length === 0) {
            pane.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No C-index data</div>';
            return;
        }
        
        let html = '<div style="padding:16px;"><div class="diagnostic-card">';
        html += '<h3 class="diagnostic-card-title">Concordance Index (BCa Bootstrap CI)</h3>';
        html += '<div class="diagnostic-card-content">';
        html += '<table class="results-table"><thead><tr>';
        html += '<th>Model</th><th>C-index</th><th>95% CI</th>';
        html += '</tr></thead><tbody>';
        
        // Sort by C-index descending
        const sortedModels = models.sort((a, b) => 
            ((cIndices[b] == null ? void 0 : cIndices[b].value) || 0) - ((cIndices[a] == null ? void 0 : cIndices[a].value) || 0)
        );
        
        sortedModels.forEach(m => {
            const c = cIndices[m] || {};
            const val = c.value && value.toFixed(4) || '—';
            const ciLow = c.ci_low && ci_low.toFixed(4) || '—';
            const ciHigh = c.ci_high && ci_high.toFixed(4) || '—';
            
            // Color coding
            let color = 'var(--text-muted)';
            if (c.value > 0.7) color = 'var(--accent-green)';
            else if (c.value > 0.6) color = 'var(--accent-blue)';
            
            html += '<tr>';
            html += `<td><strong>${m}</strong></td>`;
            html += `<td style="font-weight:600;color:${color};">${val}</td>`;
            html += `<td>[${ciLow}, ${ciHigh}]</td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table></div></div></div>';
        pane.innerHTML = html;
    }
    
    _renderTimeAUC(pane, metrics, output) {
        const timeAuc = metrics.time_auc || {};
        // Use user-specified time points if any, otherwise show nothing
        const userPoints = output && output.time_points ? output.time_points.split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t)) : [];
        const sortedTimes = userPoints.length > 0 ? userPoints.sort((a, b) => a - b) : [];
        
        if (sortedTimes.length > 0) {
            let html = '<div style="padding:16px;"><div class="diagnostic-card">';
            html += '<h3 class="diagnostic-card-title">Time-dependent AUC with 95% CI</h3>';
            html += '<div class="diagnostic-card-content" style="overflow-x:auto;">';
            html += '<table class="results-table"><thead><tr><th>Model</th>';
            sortedTimes.forEach(t => html += `<th>${t}mo</th>`);
            html += '</tr></thead><tbody>';
            
            const models = Object.keys(timeAuc);
            for (const m of models) {
                html += `<tr><td><strong>${m}</strong></td>`;
                sortedTimes.forEach(t => {
                    html += `<td>${timeAuc[m] && timeAuc[m][String(t)] && timeAuc[m][String(t)].auc && timeAuc[m][String(t)].auc.toFixed(3) || '—'}</td>`;
                });
                html += '</tr>';
            }
            html += '</tbody></table></div></div></div>';
            pane.innerHTML = html;
        } else {
            pane.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:16px;">No time points specified. Enter values (e.g., 12,24,36) in the field above.</p>';
        }
    }
    
    _renderBrier(pane, metrics) {
        const brierScores = metrics.brier_scores || {};
        const models = Object.keys(brierScores);
        
        if (models.length === 0) {
            pane.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No Brier score data</div>';
            return;
        }
        
        // Sort by Brier (lower is better)
        const sortedModels = models.sort((a, b) => 
            (brierScores[a] || 999) - (brierScores[b] || 999)
        );
        
        let html = '<div style="padding:16px;"><div class="diagnostic-card">';
        html += '<h3 class="diagnostic-card-title">Integrated Brier Score (lower = better)</h3>';
        html += '<div class="diagnostic-card-content">';
        html += '<table class="results-table"><thead><tr>';
        html += '<th>Model</th><th>IBS</th><th>Interpretation</th>';
        html += '</tr></thead><tbody>';
        
        sortedModels.forEach(m => {
            const ibs = brierScores[m];
            if (ibs == null) return;
            
            let interpretation = 'Poor';
            let color = 'var(--accent-red)';
            if (ibs < 0.1) { interpretation = 'Good'; color = 'var(--accent-green)'; }
            else if (ibs < 0.15) { interpretation = 'Moderate'; color = 'var(--accent-orange)'; }
            
            html += '<tr>';
            html += `<td><strong>${m}</strong></td>`;
            html += `<td style="font-weight:600;color:${color};">${ibs.toFixed(4)}</td>`;
            html += `<td style="color:${color};">${interpretation}</td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table></div></div></div>';
        pane.innerHTML = html;
    }
    
    _renderComparison(pane, metrics) {
        const comparisons = metrics.model_comparisons || [];
        
        if (comparisons.length === 0) {
            pane.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No model comparisons available</div>';
            return;
        }
        
        let html = '<div style="padding:16px;"><div class="diagnostic-card">';
        html += '<h3 class="diagnostic-card-title">Model Comparison (IPCW DeLong Test)</h3>';
        html += '<div class="diagnostic-card-content">';
        html += '<table class="results-table"><thead><tr>';
        html += '<th>Comparison</th><th>ΔC-index</th><th>z-statistic</th><th>p-value</th>';
        html += '</tr></thead><tbody>';
        
        comparisons.forEach(comp => {
            const sig = comp.p_value < 0.05;
            const sigMark = sig ? ' **' : '';
            const sigClass = sig ? 'diagnostic-good' : '';
            
            html += '<tr>';
            html += `<td>${comp.model1} vs ${comp.model2}</td>`;
            html += `<td style="font-weight:600;">${comp.delta > 0 ? '+' : ''}${comp.delta.toFixed(4)}</td>`;
            html += `<td>${comp.z_statistic.toFixed(3)}</td>`;
            html += `<td class="${sigClass}" style="font-weight:${sig ? 600 : 400};">${comp.p_value.toFixed(4)}${sigMark}</td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        html += '<div style="margin-top:12px;font-size:12px;color:var(--text-muted);">';
        html += '** p < 0.05 indicates significant difference between models.<br>';
        html += 'Test uses IPCW weights to account for censoring.</div>';
        html += '</div></div></div>';
        pane.innerHTML = html;
    }
    
    _renderCalibration(pane, metrics) {
        const calibration = metrics.calibration || {};
        const models = Object.keys(calibration);
        
        if (models.length === 0) {
            pane.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No calibration data</div>';
            return;
        }
        
        let html = '<div style="padding:16px;display:flex;flex-direction:column;gap:16px;">';
        
        models.forEach(model => {
            const calData = calibration[model] || {};
            const timePoints = Object.keys(calData).sort((a, b) => parseInt(a) - parseInt(b));
            
            if (timePoints.length === 0) return;
            
            html += '<div class="diagnostic-card">';
            html += `<h3 class="diagnostic-card-title">${model}</h3>`;
            html += '<div class="diagnostic-card-content" style="overflow-x:auto;">';
            
            // Build table
            html += '<table class="results-table" style="font-size:12px;"><thead><tr>';
            html += '<th>Risk Group</th>';
            timePoints.forEach(t => {
                html += `<th>${t}mo Obs</th><th>${t}mo Pred</th>`;
            });
            html += '</tr></thead><tbody>';
            
            const nGroups = ((calData[timePoints[0]] == null ? void 0 : calData[timePoints[0]].observed) || []).length;
            
            for (let g = 0; g < nGroups; g++) {
                html += '<tr>';
                html += `<td><strong>Q${g + 1}</strong></td>`;
                
                timePoints.forEach(t => {
                    const obs = calData[t] && calData[t].observed && calData[t].observed[g];
                    const pred = calData[t] && calData[t].predicted && calData[t].predicted[g];
                    
                    if (obs != null) {
                        const diff = Math.abs(obs - pred);
                        const wellCalibrated = diff < 0.1;
                        const color = wellCalibrated ? 'var(--accent-green)' : 
                                     (diff < 0.2 ? 'var(--accent-orange)' : 'var(--accent-red)');
                        
                        html += `<td style="font-weight:500;">${obs.toFixed(3)}</td>`;
                        html += `<td style="color:${color};">${pred.toFixed(3)}</td>`;
                    } else {
                        html += '<td style="color:var(--text-muted);">—</td>';
                        html += '<td style="color:var(--text-muted);">—</td>';
                    }
                });
                
                html += '</tr>';
            }
            
            html += '</tbody></table>';
            html += '<div style="margin-top:8px;font-size:11px;color:var(--text-muted);">';
            html += 'Green = |Obs-Pred| < 0.10 (well calibrated), Orange = 0.10–0.20, Red = > 0.20</div>';
            html += '</div></div>';
        });
        
        html += '</div>';
        pane.innerHTML = html;
    }
    
    _setupHeaderButtons(block) {
        const toggleBtn = block.querySelector('.charts-toggle-btn');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                const plotsDiv = block.querySelector('.results-plots');
                if (plotsDiv) {
                    plotsDiv.classList.toggle('hidden');
                    toggleBtn.textContent = plotsDiv.classList.contains('hidden') ? 'Show Charts' : 'Hide Charts';
                }
            };
        }
    }
    
    _showLoading(block) {
        const d = document.createElement('div');
        d.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted);';
        d.innerHTML = '<em>Running survival evaluation...<br>This may take up to 30 seconds with bootstrap.</em>';
        block.appendChild(d);
        return d;
    }
    
    _showError(block, msg) {
        const d = document.createElement('div');
        d.style.cssText = 'padding:16px;color:var(--accent-red);';
        d.innerHTML = `Error: ${msg}`;
        block.appendChild(d);
    }
}
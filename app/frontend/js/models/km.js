// js/models/km.js - Kaplan-Meier Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class KaplanMeierModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'kaplan_meier';
        this.templatePrefix = 'kaplan_meier';
    }
    
    createCard() {
        const template = document.getElementById('kmCardTemplate');
        if (!template) {
            console.error('KM card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `km_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        this._setupKMButtons(card);
        
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        return card;
    }
    
    _setupKMButtons(card) {
        const survivalBtn = card.querySelector('[data-type="survival"]');
        const hazardBtn = card.querySelector('[data-type="hazard"]');
        const ciBtn = card.querySelector('.ci-toggle-btn');
        
        if (survivalBtn) {
            survivalBtn.classList.add('active');
            survivalBtn.addEventListener('click', () => {
                survivalBtn.classList.add('active');
                if (hazardBtn) hazardBtn.classList.remove('active');
            });
        }
        
        if (hazardBtn) {
            hazardBtn.addEventListener('click', () => {
                hazardBtn.classList.add('active');
                if (survivalBtn) survivalBtn.classList.remove('active');
            });
        }
        
        if (ciBtn) {
            ciBtn.classList.add('active');
            ciBtn.addEventListener('click', () => {
                console.log('CI button clicked, before toggle:', ciBtn.classList.contains('active'));
                ciBtn.classList.toggle('active');
                console.log('CI button clicked, after toggle:', ciBtn.classList.contains('active'));
            });
        }
        
        const chartAxesBtn = card.querySelector('.chart-axes-btn');
        const axesRow = card.querySelector('.chart-axes-row');
        
        if (chartAxesBtn && axesRow) {
            chartAxesBtn.addEventListener('click', () => {
                chartAxesBtn.classList.toggle('active');
                axesRow.style.display = chartAxesBtn.classList.contains('active') ? 'flex' : 'none';
            });
        }
    }
    
    async run(card) {
        console.log('=== KM run() CALLED ===');
        
        if (!card || !card.id) {
            console.log('ERROR: No card or card.id');
            this.ui.modals.showAlert('Card error');
            return;
        }
        
        const cardId = card.id;
        console.log('card.id:', cardId);
        
        // Получаем vars напрямую из state
        const allVars = this.state.cardVariables;
        console.log('state.cardVariables:', allVars);
        console.log('cardVariables.get(cardId):', allVars ? allVars.get(cardId) : 'NOT FOUND');
        
        const params = this._getParameters(card);
        
        console.log('=== KM parameters ===');
        console.log(params);
        
        const vars = this.state.getCardVariables(card.id);
        console.log('Vars directly from state:', vars);
        
        if (params.stratify_col && !params.group_col) {
            this.ui.modals.showAlert('Stratify by requires Group by to be selected');
            return;
        }
        
        if (!params.time_col) {
            this.ui.modals.showAlert('Select time variable first');
            return;
        }
        if (!params.event_col) {
            this.ui.modals.showAlert('Select event variable (e.g., death, progression)');
            return;
        }
        
        const title = `Kaplan-Meier (${params.plot_type === 'hazard' ? 'Cumulative Hazard' : 'Survival'})`;
        const block = this.createResultsBlock(card, title);
        (block.querySelector('.results-stats') == null ? void 0 : block.querySelector('.results-stats').remove());
        
        const loadingDiv = this._showLoading(block);
        
        console.log('=== SENDING TO API ===');
        console.log('params:', params);
        
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: this.templateName, params })
            });
            
            if (!response.ok) throw new Error(await response.text() || 'Analysis failed');
            
            const result = await response.json();
            console.log('KM result:', result);
            
            if (!result.success) throw new Error(result.error || 'Analysis failed');
            
            loadingDiv.remove();
            
            const metrics = result.metrics || {};
            
            // Check if stratified analysis
            if (metrics.strata && metrics.strata.length > 0) {
                // Create separate results block for each stratum
                for (let i = 0; i < metrics.strata.length; i++) {
                    const stratum = metrics.strata[i];
                    const stratumTitle = `Stratum: ${stratum.stratum} (n=${stratum.n}, events=${stratum.events})`;
                    const stratumBlock = this.createResultsBlock(card, stratumTitle);
                    (stratumBlock.querySelector('.results-stats') == null ? void 0 : stratumBlock.querySelector('.results-stats').remove());
                    
                    const stratumLoading = this._showLoading(stratumBlock);
                    stratumLoading.remove();
                    
                    this.renderResults(stratumBlock, { metrics: stratum });
                    
                    // Display plot for this stratum
                    if (metrics.plots && metrics.plots[i]) {
                        const plotsDiv = stratumBlock.querySelector('.results-plots');
                        if (plotsDiv) {
                            plotsDiv.innerHTML = '';
                            plotsDiv.style.marginTop = '16px';
                            
                            const img = document.createElement('img');
                            img.src = `/plots/${metrics.plots[i]}`;
                            img.style.width = '100%';
                            img.style.height = 'auto';
                            img.style.borderRadius = '8px';
                            img.style.border = '1px solid var(--border-primary)';
                            img.style.cursor = 'pointer';
                            img.onclick = () => window.open(`/plots/${metrics.plots[i]}`);
                            plotsDiv.appendChild(img);
                        }
                    }
                }
                // Remove the main block created earlier, we have per-stratum blocks
                block.remove();
            } else {
                // Non-stratified - original behavior
                this.renderResults(block, result);
                await this.displayPlots(block, 'kaplan_meier');
            }
            
        } catch (error) {
            console.error('KM error:', error);
            loadingDiv.remove();
            this._showError(block, error.message);
        }
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        const ciBtn = card.querySelector('.ci-toggle-btn');
        const hazardBtn = card.querySelector('[data-type="hazard"]');
        const axesRow = card.querySelector('.chart-axes-row');
        
        let plotType = 'survival';
        if (hazardBtn && hazardBtn.classList.contains('active')) {
            plotType = 'hazard';
        }
        
        let xTickStep = 6, xLabel = 'Time, months', yTickStep = 0.1, yLabel = 'Survival Probability';
        if (axesRow && axesRow.style.display !== 'none') {
            xTickStep = parseInt((card.querySelector('.x-step-input') == null ? void 0 : card.querySelector('.x-step-input').value)) || 6;
            xLabel = (card.querySelector('.x-label-input') == null ? void 0 : card.querySelector('.x-label-input').value) || 'Time, months';
            const yStepPct = parseInt((card.querySelector('.y-step-input') == null ? void 0 : card.querySelector('.y-step-input').value)) || 10;
            yTickStep = yStepPct / 100;
            yLabel = (card.querySelector('.y-label-input') == null ? void 0 : card.querySelector('.y-label-input').value) || 'Survival Probability';
        }
        
        return {
            time_col: vars.time || '',
            event_col: vars.event || '',
            group_col: vars.group || '',
            stratify_col: vars.stratify || '',
            plot_type: plotType,
            show_ci: ciBtn ? ciBtn.classList.contains('active') : true,
            x_tick_step: xTickStep,
            x_label: xLabel,
            y_tick_step: yTickStep,
            y_label: yLabel
        };
    }
    
    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const wrapper = document.createElement('div');
        container.parentNode.insertBefore(wrapper, container);
        
        const [summaryPane, diagPane] = this.ui.tabs.createResultTabs(wrapper, [
            { label: 'Summary' },
            { label: 'Diagnostics' }
        ]);
        
        summaryPane.appendChild(container);
        this._setupHeaderButtons(block);
        
        const metrics = result.metrics || {};
        this._renderTable(container, metrics);
        diagPane.innerHTML = this._renderDiagnostics(metrics);
    }
    
    _renderTable(container, metrics) {
        const summary = metrics.summary;
        
        if (summary && Array.isArray(summary) && summary.length > 0) {
            const sortedSummary = [...summary].sort((a, b) => {
                const ga = a.group || '0';
                const gb = b.group || '0';
                const na = parseFloat(ga);
                const nb = parseFloat(gb);
                return (isNaN(na) ? 1 : 0) - (isNaN(nb) ? 1 : 0) || na - nb;
            });
            
            let html = '<table class="results-table"><thead><tr>';
            html += '<th>Group</th><th>N</th><th>Events</th><th>Median</th>';
            html += '</tr></thead><tbody>';
            
            sortedSummary.forEach(row => {
                html += '<tr>';
                html += `<td>${row.group || ''}</td>`;
                html += `<td>${row.n || 0}</td>`;
                html += `<td>${row.events || 0}</td>`;
                html += `<td>${row.median || 'NR'}</td>`;
                html += '</tr>';
            });
            
            html += '</tbody></table>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="padding: 16px; color: var(--text-muted);">No summary data available</p>';
        }
    }
    
    _setupHeaderButtons(block) {
        const toggleBtn = block.querySelector('.charts-toggle-btn');
        if (toggleBtn) {
            toggleBtn.style.display = 'inline-block';
            toggleBtn.onclick = () => {
                const plots = block.querySelector('.results-plots');
                if (plots) {
                    plots.classList.toggle('hidden');
                    toggleBtn.textContent = plots.classList.contains('hidden') ? 'Show Charts' : 'Hide Charts';
                }
            };
        }
    }
    
    _renderDiagnostics(m) {
        let h = '<div style="padding:16px;display:flex;flex-direction:column;gap:16px;">';
        
        // Log-Rank Test card
        const pOverall = typeof m.logrank_overall === 'number' ? m.logrank_overall : (m.logrank_overall && logrank_overall.p_value ?? null);
        const pairwise = m.logrank_pairwise;
        if (pOverall || (pairwise && pairwise.length)) {
            h += `<div class="diagnostic-card"><h3 class="diagnostic-card-title">Log-Rank Test</h3><div class="diagnostic-card-content">`;
            if (pOverall != null && typeof pOverall === 'number') {
                h += `<div class="diagnostic-item ${pOverall < 0.05 ? 'diagnostic-good' : ''}">Overall: p = ${pOverall.toFixed(4)}${pOverall < 0.05 ? ' **' : ''}</div>`;
            }
            if (pairwise && pairwise.length) {
                h += `<div class="diagnostic-item" style="margin-top:8px;"><strong>Pairwise:</strong></div>`;
                pairwise.forEach(r => {
                    const g1 = r.group1 || r.group || '?';
                    const g2 = r.group2 || '?';
                    const pVal = r.p_value ?? r.p_raw;
                    if (pVal != null && typeof pVal === 'number') {
                        let s = `${g1} vs ${g2}: p = ${pVal.toFixed(4)}`;
                        h += `<div class="diagnostic-item" style="padding-left:20px;font-size:13px;">${s}</div>`;
                    }
                });
            }
            h += `</div></div>`;
        }
        
        // Number at Risk card - transposed: rows = groups, columns = time points
        const nar = m.number_at_risk;
        if (nar && nar.data && nar.time_points) {
            const timePoints = nar.time_points;
            const data = nar.data;
            const groups = Object.keys(data);
            
            if (timePoints.length > 0 && groups.length > 0) {
                h += `<div class="diagnostic-card"><h3 class="diagnostic-card-title">Number at Risk</h3><div class="diagnostic-card-content">`;
                h += `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr><th>Group</th>`;
                timePoints.forEach(t => h += `<th>${t}</th>`);
                h += `</tr>`;
                groups.forEach(g => {
                    h += `<tr><td><strong>${g}</strong></td>`;
                    timePoints.forEach((t, i) => {
                        const val = data[g] ? data[g][i] : '-';
                        h += `<td>${val !== undefined && val !== null ? val : '-'}</td>`;
                    });
                    h += `</tr>`;
                });
                h += `</table></div></div>`;
            }
        }
        
        // Survival Probability card - transposed: rows = groups, columns = time points
        const sp = m.survival_probability;
        if (sp && sp.data && sp.time_points) {
            const timePoints = sp.time_points;
            const data = sp.data;
            const groups = Object.keys(data);
            
            if (timePoints.length > 0 && groups.length > 0) {
                h += `<div class="diagnostic-card"><h3 class="diagnostic-card-title">Survival Probability S(t)</h3><div class="diagnostic-card-content">`;
                h += `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr><th>Group</th>`;
                timePoints.forEach(t => h += `<th>${t}</th>`);
                h += `</tr>`;
                groups.forEach(g => {
                    h += `<tr><td><strong>${g}</strong></td>`;
                    timePoints.forEach((t, i) => {
                        const val = data[g] ? data[g][i] : null;
                        if (val != null && typeof val === 'number') {
                            h += `<td>${(val * 100).toFixed(1)}%</td>`;
                        } else {
                            h += `<td>—</td>`;
                        }
                    });
                    h += `</tr>`;
                });
                h += `</table></div></div>`;
            }
        }
        
        return h + '</div>';
    }
    
    _showLoading(block) {
        const d = document.createElement('div');
        d.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted);';
        d.innerHTML = '<em>Running analysis...</em>';
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

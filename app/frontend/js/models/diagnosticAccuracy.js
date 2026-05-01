// js/models/diagnosticAccuracy.js - Diagnostic Accuracy Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class DiagnosticAccuracyModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'diagnostic_accuracy';
        this.templatePrefix = 'diag_acc';
    }
    
    createCard() {
        const template = document.getElementById('diagAccCardTemplate');
        if (!template) {
            console.error('Diagnostic Accuracy card template not found');
            return null;
        }
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `diagacc_${Date.now()}`;
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        return card;
    }
    
    async run(card) {
        const params = this._getParameters(card);
        if (!params.target_col) { this.ui.modals.showAlert('Select reference variable'); return; }
        if (params.test_cols.length === 0) { this.ui.modals.showAlert('Select at least one index test'); return; }
        const block = this.createResultsBlock(card, 'Diagnostic Accuracy');
        block.querySelector('.results-stats')?.remove();
        const loadingDiv = this._showLoading(block);
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: this.templateName, params })
            });
            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            loadingDiv.remove();
            this.renderResults(block, result);
            await this.displayPlots(block, 'diag_acc');
        } catch (e) {
            loadingDiv.remove();
            this._showError(block, e.message);
        }
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        const testCols = vars.predictors ? Array.from(vars.predictors) : [];
        return { target_col: vars.target || '', test_cols: testCols };
    }
    
    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const metrics = result.metrics || {};
        
        // Create tabs
        const wrapper = document.createElement('div');
        container.parentNode.insertBefore(wrapper, container);
        const panes = this.ui.tabs.createResultTabs(wrapper, [
            { label: 'Test Metrics' },
            { label: 'Comparison' },
            { label: 'Contingency Tables' }
        ]);
        const [metricsPane, compPane, contPane] = panes;
        metricsPane.appendChild(container);
        
        this._setupHeaderButtons(block);
        
        // Render
        this._renderMetrics(container, metrics);
        compPane.innerHTML = this._renderComparison(metrics);
        contPane.innerHTML = this._renderContingency(metrics);
    }
    
    _renderMetrics(container, metrics) {
        const results = metrics.results || [];
        if (results.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No metrics available</div>';
            return;
        }
        
        let html = '<div style="display:flex;flex-direction:column;gap:16px;">';
        
        results.forEach(res => {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">${res.test} (n = ${res.n})</h3>`;
            html += `<div class="diagnostic-card-content">`;
            
            // Performance metrics grid
            const metricsList = [
                { name: 'Sensitivity', value: res.sensitivity, ci_low: res.sensitivity_ci_low, ci_high: res.sensitivity_ci_high },
                { name: 'Specificity', value: res.specificity, ci_low: res.specificity_ci_low, ci_high: res.specificity_ci_high },
                { name: 'PPV', value: res.ppv, ci_low: res.ppv_ci_low, ci_high: res.ppv_ci_high },
                { name: 'NPV', value: res.npv, ci_low: res.npv_ci_low, ci_high: res.npv_ci_high },
                { name: 'Accuracy', value: res.accuracy, ci_low: res.accuracy_ci_low, ci_high: res.accuracy_ci_high },
            ];
            
            html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:4px;">';
            metricsList.forEach(m => {
                const valColor = m.value > 0.8 ? 'var(--accent-green)' : m.value > 0.65 ? 'var(--accent-blue)' : 'var(--accent-orange)';
                html += `<div class="diagnostic-item" style="text-align:center;display:flex;flex-direction:column;">`;
                html += `<span style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${m.name}</span>`;
                html += `<span style="font-size:22px;font-weight:700;color:${valColor};">${(m.value * 100).toFixed(1)}%</span>`;
                if (m.ci_low != null) {
                    html += `<span style="font-size:11px;color:var(--text-muted);margin-top:2px;">95% CI: ${(m.ci_low*100).toFixed(1)}–${(m.ci_high*100).toFixed(1)}%</span>`;
                }
                html += `</div>`;
            });
            html += '</div>';
            
            // Likelihood ratios
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border-primary);">';
            if (!isNaN(res.lr_pos) && !isInfinite(res.lr_pos)) {
                const lrPosInt = this._interpretLRplus(res.lr_pos);
                html += `<div class="diagnostic-item"><span style="font-size:11px;color:var(--text-muted);">LR+</span> <strong>${res.lr_pos.toFixed(2)}</strong> <span style="font-size:12px;color:var(--accent-green);">${lrPosInt}</span></div>`;
            }
            if (!isNaN(res.lr_neg) && !isInfinite(res.lr_neg)) {
                const lrNegInt = this._interpretLRneg(res.lr_neg);
                html += `<div class="diagnostic-item"><span style="font-size:11px;color:var(--text-muted);">LR−</span> <strong>${res.lr_neg.toFixed(2)}</strong> <span style="font-size:12px;color:var(--accent-orange);">${lrNegInt}</span></div>`;
            }
            html += `<div class="diagnostic-item"><span style="font-size:11px;color:var(--text-muted);">Diagnostic Odds Ratio</span> <strong>${!isInfinite(res.dor) ? res.dor.toFixed(2) : '∞'}</strong></div>`;
            html += '</div>';
            
            html += `</div></div>`;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    _renderComparison(metrics) {
        const pairwise = metrics.pairwise_tests || [];
        const ref = metrics.reference || 'reference';
        
        if (pairwise.length === 0) {
            return '<div style="padding:20px;text-align:center;color:var(--text-muted);">Need 2+ tests for pairwise comparison (McNemar test)</div>';
        }
        
        let html = '<div style="padding:16px;display:flex;flex-direction:column;gap:16px;">';
        html += '<div class="diagnostic-card"><h3 class="diagnostic-card-title">Paired Comparison (McNemar Test)</h3><div class="diagnostic-card-content">';
        
        html += '<table class="results-table"><thead><tr>';
        html += '<th>Comparison</th><th>Sensitivity p-value</th><th>Specificity p-value</th>';
        html += '</tr></thead><tbody>';
        
        pairwise.forEach(pt => {
            const sensSig = pt.sens_p < 0.05;
            const specSig = pt.spec_p < 0.05;
            
            html += '<tr>';
            html += `<td><strong>${pt.test1}</strong> vs <strong>${pt.test2}</strong></td>`;
            html += `<td style="color:${sensSig ? 'var(--accent-green)' : 'var(--text-muted)'};font-weight:${sensSig ? 600 : 400};">${pt.sens_p.toFixed(4)}${sensSig ? ' **' : ''}</td>`;
            html += `<td style="color:${specSig ? 'var(--accent-green)' : 'var(--text-muted)'};font-weight:${specSig ? 600 : 400};">${pt.spec_p.toFixed(4)}${specSig ? ' **' : ''}</td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        html += '</div></div></div>';
        return html;
    }
    
    _renderContingency(metrics) {
        const results = metrics.results || [];
        if (results.length === 0) return '';
        
        let html = '<div style="padding:16px;display:flex;flex-direction:column;gap:16px;">';
        
        results.forEach(res => {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">${res.test}</h3>`;
            html += `<div class="diagnostic-card-content">`;
            html += '<table class="results-table"><tbody>';
            html += `<tr><td></td><td style="font-weight:600;text-align:center;">Reference +</td><td style="font-weight:600;text-align:center;">Reference −</td><td style="font-weight:600;text-align:center;">Total</td></tr>`;
            html += `<tr><td style="font-weight:600;">Test +</td>`;
            html += `<td style="text-align:center;color:var(--accent-green);">${res.tp} (TP)</td>`;
            html += `<td style="text-align:center;color:var(--accent-red);">${res.fp} (FP)</td>`;
            html += `<td style="text-align:center;font-weight:600;">${res.tp + res.fp}</td></tr>`;
            html += `<tr><td style="font-weight:600;">Test −</td>`;
            html += `<td style="text-align:center;color:var(--accent-red);">${res.fn} (FN)</td>`;
            html += `<td style="text-align:center;color:var(--accent-green);">${res.tn} (TN)</td>`;
            html += `<td style="text-align:center;font-weight:600;">${res.fn + res.tn}</td></tr>`;
            html += `<tr><td style="font-weight:600;">Total</td>`;
            html += `<td style="text-align:center;font-weight:600;">${res.tp + res.fn}</td>`;
            html += `<td style="text-align:center;font-weight:600;">${res.fp + res.tn}</td>`;
            html += `<td style="text-align:center;font-weight:600;">${res.n}</td></tr>`;
            html += '</tbody></table>';
            html += `</div></div>`;
        });
        
        html += '</div>';
        return html;
    }
    
    _interpretLRplus(lr) {
        if (isNaN(lr) || isInfinite(lr)) return '';
        if (lr > 10) return '↑↑ Large increase in post-test probability';
        if (lr > 5) return '↑ Moderate increase';
        if (lr > 2) return '→ Small increase';
        if (lr > 1) return '→ Minimal change';
        return '→ No diagnostic value';
    }
    
    _interpretLRneg(lr) {
        if (isNaN(lr) || isInfinite(lr)) return '';
        if (lr < 0.1) return '↓↓ Large decrease in post-test probability';
        if (lr < 0.2) return '↓ Moderate decrease';
        if (lr < 0.5) return '→ Small decrease';
        if (lr < 1) return '��� Minimal change';
        return '→ No diagnostic value';
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
    
    _showLoading(block) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted);'; d.innerHTML = '<em>Running analysis...</em>'; block.appendChild(d); return d; }
    _showError(block, msg) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;color:var(--accent-red);'; d.innerHTML = `Error: ${msg}`; block.appendChild(d); }
}

function isInfinite(val) {
    return val === Infinity || val === -Infinity || (typeof val === 'number' && !isFinite(val));
}
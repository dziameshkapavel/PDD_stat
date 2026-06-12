// js/models/anova.js - ANOVA Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class ANOVAModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'anova';
        this.templatePrefix = 'anova';
    }
    
    createCard() {
        const template = document.getElementById('anovaCardTemplate');
        if (!template) return null;
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `anova_${Date.now()}`;
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        return card;
    }
    
    async run(card) {
        const params = this._getParameters(card);
        if (!params.value_col) { this.ui.modals.showAlert('Select value variable'); return; }
        if (!params.group_col) { this.ui.modals.showAlert('Select group variable'); return; }
        const block = this.createResultsBlock(card, 'ANOVA');
        (block.querySelector('.results-stats') == null ? void 0 : block.querySelector('.results-stats').remove());
        const loadingDiv = this._showLoading(block);
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: this.templateName, params })
            });
            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            loadingDiv.remove();
            this.renderResults(block, result);
            await this.displayPlots(block, 'anova');
        } catch (e) {
            loadingDiv.remove();
            this._showError(block, e.message);
        }
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        return { value_col: vars.value || '', group_col: vars.group || '' };
    }
    
    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        const metrics = result.metrics || {};
        const wrapper = document.createElement('div');
        container.parentNode.insertBefore(wrapper, container);
        const panes = this.ui.tabs.createResultTabs(wrapper, [
            { label: 'Statistics' }, { label: 'Post-hoc' }, { label: 'Diagnostics' }
        ]);
        const [statPane, posthocPane, diagPane] = panes;
        statPane.appendChild(container);
        this._setupHeaderButtons(block);
        this._renderStats(container, metrics);
        posthocPane.innerHTML = this._renderPosthoc(metrics);
        diagPane.innerHTML = this._renderDiagnostics(metrics);
    }
    
    _renderStats(container, metrics) {
        let html = '<div style="display:flex;flex-direction:column;gap:16px;">';
        
        html += '<div class="diagnostic-card"><h3 class="diagnostic-card-title">Group Summary</h3><div class="diagnostic-card-content">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>';
        html += '<th style="padding:8px;text-align:left;border-bottom:2px solid var(--border-primary);">Group</th>';
        html += '<th style="padding:8px;text-align:center;border-bottom:2px solid var(--border-primary);">n</th>';
        html += '<th style="padding:8px;text-align:center;border-bottom:2px solid var(--border-primary);">Mean</th>';
        html += '<th style="padding:8px;text-align:center;border-bottom:2px solid var(--border-primary);">SD</th>';
        html += '<th style="padding:8px;text-align:center;border-bottom:2px solid var(--border-primary);">Median</th>';
        html += '<th style="padding:8px;text-align:center;border-bottom:2px solid var(--border-primary);">IQR</th>';
        html += '</tr></thead><tbody>';
        
        (metrics.descriptive || []).forEach(d => {
            const label = (metrics.group_labels && metrics.group_labels[d.group]) ? metrics.group_labels[d.group] : d.group;
            const iqr = (d.q3 - d.q1).toFixed(1);
            html += `<tr>
                <td style="padding:8px;font-weight:600;">${label}</td>
                <td style="padding:8px;text-align:center;">${d.n}</td>
                <td style="padding:8px;text-align:center;font-family:monospace;">${d.mean.toFixed(2)}</td>
                <td style="padding:8px;text-align:center;font-family:monospace;">${d.sd.toFixed(2)}</td>
                <td style="padding:8px;text-align:center;font-family:monospace;">${d.median.toFixed(1)}</td>
                <td style="padding:8px;text-align:center;font-family:monospace;">${iqr}</td>
            </tr>`;
        });
        
        html += '</tbody></table></div></div>';
        
        html += `<div class="diagnostic-card"><h3 class="diagnostic-card-title">${metrics.test_name || 'Test'}</h3><div class="diagnostic-card-content">`;
        if (metrics.F_stat) {
            const pVal = metrics.p_value || 1;
            html += `<div class="diagnostic-item">F = ${metrics.F_stat.toFixed(2)}, p = ${pVal.toFixed(4)} ${metrics.significant ? '**' : ''}</div>`;
        }
        if (metrics.H_stat) {
            const pVal = metrics.p_value || 1;
            html += `<div class="diagnostic-item">H = ${metrics.H_stat.toFixed(2)}, p = ${pVal.toFixed(4)} ${metrics.significant ? '**' : ''}</div>`;
        }
        if (metrics.eta_sq != null) html += `<div class="diagnostic-item">η² = ${metrics.eta_sq.toFixed(4)}</div>`;
        if (metrics.omega_sq != null) html += `<div class="diagnostic-item">ω² = ${metrics.omega_sq.toFixed(4)}</div>`;
        if (metrics.epsilon_sq != null) html += `<div class="diagnostic-item">ε² = ${metrics.epsilon_sq.toFixed(4)}</div>`;
        html += '</div></div>';
        
        if (metrics.trend_test) {
            const tt = metrics.trend_test;
            html += `<div class="diagnostic-card"><h3 class="diagnostic-card-title">Trend Test</h3><div class="diagnostic-card-content">`;
            html += `<div class="diagnostic-item">${tt.name}: p = ${tt.p_value.toFixed(4)} ${tt.significant ? '**' : ''}</div>`;
            html += '</div></div>';
        }
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    _renderPosthoc(metrics) {
        const posthoc = metrics.posthoc || [];
        if (posthoc.length === 0) return '<div style="padding:20px;text-align:center;color:var(--text-muted);">Post-hoc tests not available (overall test not significant or only 2 groups)</div>';
        let html = '<div style="padding:16px;"><div class="diagnostic-card"><h3 class="diagnostic-card-title">Pairwise Comparisons</h3><div class="diagnostic-card-content">';
        html += '<table class="results-table"><thead><tr><th>Comparison</th><th>Mean Diff</th><th>p-value</th><th>Significant</th></tr></thead><tbody>';
        posthoc.forEach(p => {
            const sig = p.significant;
            html += '<tr>';
            html += `<td>${p.group1} vs ${p.group2}</td>`;
            html += `<td>${p.mean_diff != null ? p.mean_diff.toFixed(2) : '—'}</td>`;
            html += `<td style="color:${sig ? 'var(--accent-green)' : 'var(--text-muted)'};font-weight:${sig ? 600 : 400};">${p.p_value.toFixed(4)}</td>`;
            html += `<td style="color:${sig ? 'var(--accent-green)' : 'var(--text-muted)'};">${sig ? 'Yes **' : 'No'}</td>`;
            html += '</tr>';
        });
        html += '</tbody></table></div></div></div>';
        return html;
    }
    
    _renderDiagnostics(metrics) {
        let html = '<div style="padding:16px;display:flex;flex-direction:column;gap:16px;">';
        html += `<div class="diagnostic-card"><h3 class="diagnostic-card-title">Assumptions</h3><div class="diagnostic-card-content">`;
        html += `<div class="diagnostic-item">Normality: ${metrics.all_normal ? '✓ Satisfied' : '⚠️ Violated'}</div>`;
        html += `<div class="diagnostic-item">Equal variances: ${metrics.equal_var ? '✓ Satisfied' : '⚠️ Violated'}</div>`;
        html += `<div class="diagnostic-item">Test selected: <strong>${metrics.test_name}</strong></div>`;
        html += '</div></div>';
        html += `<div class="diagnostic-card"><h3 class="diagnostic-card-title">Dataset</h3><div class="diagnostic-card-content">`;
        html += `<div class="diagnostic-item">Groups: ${metrics.n_groups} (${(metrics.groups||[]).join(', ')})</div>`;
        html += `<div class="diagnostic-item">Total observations: ${metrics.n_total}</div>`;
        html += '</div></div></div>';
        return html;
    }
    
    _setupHeaderButtons(block) {
        const toggleBtn = block.querySelector('.charts-toggle-btn');
        if (toggleBtn) toggleBtn.onclick = () => {
            const plotsDiv = block.querySelector('.results-plots');
            if (plotsDiv) { plotsDiv.classList.toggle('hidden'); toggleBtn.textContent = plotsDiv.classList.contains('hidden') ? 'Show Charts' : 'Hide Charts'; }
        };
    }
    _showLoading(block) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted);'; d.innerHTML = '<em>Running...</em>'; block.appendChild(d); return d; }
    _showError(block, msg) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;color:var(--accent-red);'; d.innerHTML = `Error: ${msg}`; block.appendChild(d); }
}

// js/models/agreementCategorical.js
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class AgreementCategoricalModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'agreement_categorical';
        this.templatePrefix = 'agreement';
    }
    
    createCard() {
        const template = document.getElementById('agreementCardTemplate');
        if (!template) return null;
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `agreement_${Date.now()}`;
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        this._setupButtons(card);
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        return card;
    }
    
    _setupButtons(card) {
        const nomBtn = card.querySelector('.btn-nominal');
        const ordBtn = card.querySelector('.btn-ordinal');
        nomBtn?.addEventListener('click', () => { nomBtn.classList.add('active'); ordBtn?.classList.remove('active'); card.dataset.scaleType = 'nominal'; });
        ordBtn?.addEventListener('click', () => { ordBtn.classList.add('active'); nomBtn?.classList.remove('active'); card.dataset.scaleType = 'ordinal'; });
    }
    
    async run(card) {
        const scaleType = card.dataset.scaleType;
        if (!scaleType) { this.ui.modals.showAlert('Select category type first:\n• Nominal — for unordered categories\n• Ordinal — for ordered (e.g., stage I-IV)'); return; }
        const params = this._getParameters(card, scaleType);
        if (params.raters.length < 2) { this.ui.modals.showAlert('Select at least 2 rater columns'); return; }
        const block = this.createResultsBlock(card, 'Agreement Analysis');
        block.querySelector('.results-stats')?.remove();
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
            if (params.raters.length === 2) await this.displayPlots(block, 'agreement');
        } catch (e) { loadingDiv.remove(); this._showError(block, e.message); }
    }
    
    _getParameters(card, scaleType) {
        const vars = this.state.getCardVariables(card.id);
        const weightBtn = card.querySelector('.btn-weight.active');
        return {
            raters: vars.predictors ? Array.from(vars.predictors) : [],
            scale_type: scaleType || 'nominal',
            weight_type: weightBtn ? weightBtn.dataset.weight : 'linear'
        };
    }
    
    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        const metrics = result.metrics || {};
        const wrapper = document.createElement('div');
        container.parentNode.insertBefore(wrapper, container);
        const panes = this.ui.tabs.createResultTabs(wrapper, [
            { label: 'Result' }, { label: 'Cross-tabulation' }
        ]);
        panes[0].appendChild(container);
        this._renderResult(container, metrics);
        if (metrics.n_raters === 2) this._renderCrossTab(panes[1], result.output || '');
        else panes[1].innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Cross-tabulation available for 2 raters</div>';
        this._setupHeaderButtons(block);
    }
    
    _renderResult(container, metrics) {
        const kappa = metrics.kappa;
        const ci_low = metrics.ci_low;
        const ci_high = metrics.ci_high;
        const p_val = metrics.p_value;
        const interp = metrics.interpretation;
        const colorMap = { 'Poor': 'var(--accent-red)', 'Slight': 'var(--accent-orange)', 'Fair': 'var(--accent-orange)', 'Moderate': 'var(--accent-yellow)', 'Substantial': 'var(--accent-green)', 'Almost perfect': 'var(--accent-green)' };
        const color = colorMap[interp] || 'var(--text-primary)';
        let html = '<div style="display:flex;flex-direction:column;gap:16px;">';
        html += '<div class="diagnostic-card"><h3 class="diagnostic-card-title">Kappa Coefficient</h3><div class="diagnostic-card-content">';
        html += `<div style="text-align:center;padding:20px 0;">`;
        html += `<div style="font-size:48px;font-weight:700;color:${color};">${kappa?.toFixed(4)}</div>`;
        html += `<div style="font-size:18px;font-weight:600;color:${color};margin-top:4px;">${interp || ''}</div>`;
        html += `<div style="font-size:13px;color:var(--text-muted);margin-top:8px;">95% CI: ${ci_low?.toFixed(4)} – ${ci_high?.toFixed(4)} | p = ${p_val?.toFixed(4)}</div>`;
        html += `</div></div></div>`;
        html += `<div class="diagnostic-card"><h3 class="diagnostic-card-title">Details</h3><div class="diagnostic-card-content">`;
        html += `<div class="diagnostic-item">Raters: ${(metrics.raters||[]).join(', ')} (${metrics.n_raters})</div>`;
        html += `<div class="diagnostic-item">Subjects: ${metrics.n_subjects}</div>`;
        html += `<div class="diagnostic-item">Scale type: ${metrics.scale_type === 'ordinal' ? `Ordinal (${metrics.weight_type} weights)` : 'Nominal'}</div>`;
        html += `<div class="diagnostic-item">Percent agreement: ${(metrics.percent_agreement||0).toFixed(1)}%</div>`;
        html += '</div></div></div>';
        container.innerHTML = html;
    }
    
    _renderCrossTab(pane, output) {
        const start = output.indexOf('### Cross-tabulation');
        const end = output.indexOf('###', start + 5);
        const section = output.substring(start, end > start ? end : output.length);
        const lines = section.split('\n');
        let tableRows = [];
        let inTable = false;
        for (const line of lines) {
            if (line.trim().startsWith('|') && !line.includes('---')) {
                tableRows.push(line.split('|').filter(c => c.trim()));
            }
        }
        if (tableRows.length > 1) {
            let h = '<div style="padding:16px;"><table class="results-table"><thead><tr>';
            tableRows[0].forEach(c => h += `<th>${c}</th>`);
            h += '</tr></thead><tbody>';
            for (let i = 1; i < tableRows.length; i++) {
                h += '<tr>';
                tableRows[i].forEach((c, j) => {
                    const val = parseInt(c);
                    const isDiag = !isNaN(val) && j > 0 && tableRows[0][j]?.trim() === tableRows[i][0]?.trim();
                    h += `<td style="${isDiag ? 'background:var(--accent-blue-light);font-weight:600;' : ''}">${c}</td>`;
                });
                h += '</tr>';
            }
            h += '</tbody></table></div>';
            pane.innerHTML = h;
        } else {
            pane.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No cross-tabulation data</div>';
        }
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

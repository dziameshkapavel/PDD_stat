// js/models/descriptiveStats.js - Descriptive Statistics
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class DescriptiveStatsModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'descriptive_stats';
        this.templatePrefix = 'desc_stats';
    }
    
    createCard() {
        const template = document.getElementById('descriptiveStatsCardTemplate');
        if (!template) return null;
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `desc_${Date.now()}`;
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        return card;
    }
    
    async run(card) {
        const vars = this.state.getCardVariables(card.id);
        const plotsCheck = card.querySelector('.plots-check');
        const varList = vars.covariates ? Array.from(vars.covariates) : [];
        const params = { variables: varList, include_plots: plotsCheck?.checked || false };
        
        const block = this.createResultsBlock(card, 'Descriptive Statistics');
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
            if (params.include_plots) await this.displayPlots(block, 'desc_stats');
        } catch (e) {
            loadingDiv.remove();
            this._showError(block, e.message);
        }
    }
    
    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const output = result.output || '';
        const lines = output.split('\n');
        
        // Извлекаем таблицу Summary Statistics
        let summaryRows = [];
        let inSummary = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('| Variable | N | Mean |') && trimmed.includes('Std |')) {
                inSummary = true;
                continue;
            }
            if (inSummary) {
                if (trimmed.includes('|---')) continue;
                if (trimmed.startsWith('|') && trimmed.includes('|')) {
                    const cells = trimmed.split('|').filter(c => c.trim() !== '');
                    if (cells.length >= 5) {
                        // Clean variable name and trim all cells
                        cells[0] = cells[0].replace(/`/g, '').trim();
                        summaryRows.push(cells.map(c => c.trim()));
                    }
                } else if (summaryRows.length > 0 && !trimmed.startsWith('|')) {
                    break;
                }
            }
        }
        
        // Извлекаем таблицу Normality
        let normRows = [];
        let inNorm = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('| Variable | N | W-statistic |') && trimmed.includes('Normal? |')) {
                inNorm = true;
                continue;
            }
            if (inNorm) {
                if (trimmed.includes('|---')) continue;
                if (trimmed.startsWith('|') && trimmed.includes('|')) {
                    const cells = trimmed.split('|').filter(c => c.trim() !== '');
                    if (cells.length >= 4) {
                        cells[0] = cells[0].replace(/`/g, '').trim();
                        normRows.push(cells.map(c => c.trim()));
                    }
                } else if (normRows.length > 0 && !trimmed.startsWith('|')) {
                    break;
                }
            }
        }
        
        // Извлекаем заголовок
        let vars = '', obs = '';
        for (const line of lines) {
            if (line.startsWith('**Variables:**')) vars = line.replace(/\*\*/g, '').replace(/`/g, '');
            if (line.startsWith('**Observations:**')) obs = line.replace(/\*\*/g, '');
        }
        
        let html = '';
        
        // Заголовок
        html += '<div class="diagnostic-card" style="margin-bottom:16px;">';
        html += '<div class="diagnostic-card-content">';
        if (vars) html += `<div class="diagnostic-item">${vars}</div>`;
        if (obs) html += `<div class="diagnostic-item">${obs}</div>`;
        html += '</div></div>';
        
        // Summary Statistics
        if (summaryRows.length > 0) {
            html += '<div class="diagnostic-card" style="margin-bottom:16px;">';
            html += '<h3 class="diagnostic-card-title">Summary Statistics</h3>';
            html += '<div class="diagnostic-card-content" style="overflow-x:auto;">';
            html += '<table class="results-table" style="font-size:12px;"><thead><tr>';
            
            // Используем заголовки из первой строки
            const headers = summaryRows[0];
            html += '<th>Variable</th><th>N</th><th>Mean</th><th>Median</th><th>Std</th><th>Min</th><th>Max</th><th>Q1</th><th>Q3</th><th>Skew</th><th>Kurt</th><th>Missing</th><th>Outliers</th>';
            
            html += '</tr></thead><tbody>';
            
            for (let i = 0; i < summaryRows.length; i++) {
                html += '<tr>';
                summaryRows[i].forEach((cell, j) => {
                    const val = parseFloat(cell);
                    let style = '';
                    if (j === 9 && !isNaN(val)) { // Skew
                        if (Math.abs(val) > 1) style = 'color:var(--accent-red);font-weight:500;';
                        else if (Math.abs(val) > 0.5) style = 'color:var(--accent-orange);font-weight:500;';
                    }
                    if (j === 12 && !isNaN(val) && val > 0) { // Outliers
                        style = 'color:var(--accent-orange);font-weight:500;';
                    }
                    html += `<td style="${style}">${cell}</td>`;
                });
                html += '</tr>';
            }
            html += '</tbody></table></div></div>';
        }
        
        // Normality Tests
        if (normRows.length > 0) {
            html += '<div class="diagnostic-card">';
            html += '<h3 class="diagnostic-card-title">Normality Tests (Shapiro-Wilk)</h3>';
            html += '<div class="diagnostic-card-content" style="overflow-x:auto;">';
            html += '<table class="results-table" style="font-size:12px;"><thead><tr>';
            html += '<th>Variable</th><th>N</th><th>W-statistic</th><th>p-value</th><th>Normal?</th>';
            html += '</tr></thead><tbody>';
            
            for (let i = 0; i < normRows.length; i++) {
                html += '<tr>';
                normRows[i].forEach((cell, j) => {
                    const isNormal = cell === 'Yes';
                    const isNotNormal = cell === 'No';
                    let style = '';
                    if (isNormal) style = 'color:var(--accent-green);font-weight:500;';
                    else if (isNotNormal) style = 'color:var(--accent-red);font-weight:500;';
                    html += `<td style="${style}">${cell}</td>`;
                });
                html += '</tr>';
            }
            html += '</tbody></table></div></div>';
        }
        
container.innerHTML = html || '<p style="padding:16px;color:var(--text-muted);">No data</p>';
        this._setupHeaderButtons(block);
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
    
    _showLoading(block) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted);'; d.innerHTML = '<em>Running...</em>'; block.appendChild(d); return d; }
    _showError(block, msg) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;color:var(--accent-red);'; d.innerHTML = `Error: ${msg}`; block.appendChild(d); }
}

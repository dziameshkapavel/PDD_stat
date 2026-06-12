// js/models/violinPlot.js - Violin Plots
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class ViolinPlotModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'violin_plot';
        this.templatePrefix = 'violin';
    }
    
    createCard() {
        const template = document.getElementById('violinPlotCardTemplate');
        if (!template) return null;
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `violin_${Date.now()}`;
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
        
        const block = this.createResultsBlock(card, `Violin Plot: ${params.value_col} by ${params.group_col}`);
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
            
            const container = block.querySelector('.results-table-container');
            if (container) {
                this.renderResults(block, result);
            }
            await this.displayPlots(block, 'violin');
        } catch (e) {
            loadingDiv.remove();
            this._showError(block, e.message);
        }
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        
        return {
            value_col: vars.value || '',
            group_col: vars.group || '',
            show_box: true,
            show_points: false
        };
    }
    
    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const output = result.output || '';
        const lines = output.split('\n');
        
        // Извлекаем таблицу Group Statistics
        let statRows = [];
        let inStat = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('| Group | N | Mean | Median | Std |')) {
                inStat = true;
                continue;
            }
            if (inStat) {
                if (trimmed.includes('|---')) continue;
                if (trimmed.startsWith('|') && !trimmed.includes('###') && !trimmed.includes('**')) {
                    const cells = trimmed.split('|').filter(c => c.trim() !== '');
                    if (cells.length >= 6) statRows.push(cells.map(c => c.trim()));
                } else if (statRows.length > 0 && !trimmed.startsWith('|')) {
                    break;
                }
            }
        }
        
        // Извлекаем тест
        let testLine = '';
        for (const line of lines) {
            if (line.includes('**Mann-Whitney') || line.includes('**Kruskal-Wallis')) {
                testLine = line;
            }
        }
        
        // Извлекаем заголовок
        let variable = '', group = '';
        for (const line of lines) {
            if (line.startsWith('**Variable:**')) variable = line.replace(/\*\*/g, '');
            if (line.startsWith('**Group by:**')) group = line.replace(/\*\*/g, '');
        }
        
        let html = '';
        
        // Заголовок
        html += '<div class="diagnostic-card" style="margin-bottom:16px;">';
        html += '<div class="diagnostic-card-content">';
        if (variable) html += `<div class="diagnostic-item">${variable}</div>`;
        if (group) html += `<div class="diagnostic-item">${group}</div>`;
        html += '</div></div>';
        
        // Таблица
        if (statRows.length > 0) {
            html += '<div class="diagnostic-card" style="margin-bottom:16px;">';
            html += '<h3 class="diagnostic-card-title">Group Statistics</h3>';
            html += '<div class="diagnostic-card-content" style="overflow-x:auto;">';
            html += '<table class="results-table" style="font-size:13px;"><thead><tr>';
            html += '<th>Group</th><th>N</th><th>Mean</th><th>Median</th><th>Std</th><th>Q1</th><th>Q3</th><th>IQR</th>';
            html += '</tr></thead><tbody>';
            
            for (const row of statRows) {
                html += '<tr>';
                row.forEach((cell, j) => {
                    if (j === 0) html += `<td style="font-weight:500;">${cell}</td>`;
                    else html += `<td>${cell}</td>`;
                });
                html += '</tr>';
            }
            html += '</tbody></table></div></div>';
        }
        
        // Тест
        if (testLine) {
            const isSig = testLine.includes('**');
            html += '<div class="diagnostic-card">';
            html += '<div class="diagnostic-card-content">';
            html += `<div class="diagnostic-item ${isSig ? 'diagnostic-good' : ''}">${testLine.replace(/\*\*/g, '')}</div>`;
            html += '</div></div>';
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

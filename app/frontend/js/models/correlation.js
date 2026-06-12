// js/models/correlation.js - Correlation Analysis
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class CorrelationModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'correlation_analysis';
        this.templatePrefix = 'correlation';
    }
    
    createCard() {
        const template = document.getElementById('correlationCardTemplate');
        if (!template) {
            console.error('Correlation card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `corr_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        return card;
    }
    
    async run(card) {
        const params = this._getParameters(card);
        
        if (params.variables.length < 2) {
            this.ui.modals.showAlert('Select at least 2 variables');
            return;
        }
        
        const title = `Correlation Analysis (${params.method}, |r| > ${params.threshold})`;
        const block = this.createResultsBlock(card, title);
        (block.querySelector('.results-stats') == null ? void 0 : block.querySelector('.results-stats').remove());
        
        const loadingDiv = this._showLoading(block);
        
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: this.templateName, params })
            });
            
            if (!response.ok) throw new Error(await response.text() || 'Analysis failed');
            
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Analysis failed');
            
            loadingDiv.remove();
            this.renderResults(block, result);
            await this.displayPlots(block, 'correlation');
            
        } catch (error) {
            loadingDiv.remove();
            this._showError(block, error.message);
        }
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        const methodSelect = card.querySelector('.method-select');
        const thresholdInput = card.querySelector('.threshold-input');
        
        let varList = [];
        if (vars.predictors && vars.predictors.size > 0) {
            varList = Array.from(vars.predictors);
        } else if (vars.covariates && vars.covariates.size > 0) {
            varList = Array.from(vars.covariates);
        }
        
        return {
            variables: varList,
            method: methodSelect ? methodSelect.value : 'pearson',
            threshold: thresholdInput ? parseFloat(thresholdInput.value) || 0.5 : 0.5
        };
    }
    
    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const output = result.output || '';
        const lines = output.split('\n');
        
        // Извлекаем полную корреляционную матрицу
        let matrixRows = [];
        let inMatrix = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('### Correlation Matrix')) {
                inMatrix = true;
                continue;
            }
            if (inMatrix) {
                if (trimmed.includes('### Strong Correlations')) break;
                if (trimmed.includes('|---')) continue;
                if (trimmed.startsWith('|')) {
                    const cells = trimmed.split('|').filter(c => c.trim() !== '');
                    if (cells.length >= 2) matrixRows.push(cells.map(c => c.trim()));
                }
            }
        }
        
        // Извлекаем таблицу Strong Correlations
        let tableRows = [];
        let inTable = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('| Variable 1 | Variable 2 | r | p-value | Significant |')) {
                inTable = true;
                continue;
            }
            if (inTable) {
                if (trimmed.includes('|---')) continue;
                if (trimmed.startsWith('|')) {
                    const cells = trimmed.split('|').filter(c => c.trim() !== '');
                    if (cells.length >= 5) tableRows.push(cells.map(c => c.trim()));
                } else if (tableRows.length > 0 && !trimmed.startsWith('|')) {
                    break;
                }
            }
        }
        
        // Извлекаем Summary
        let summary = '', strongest = '';
        for (const line of lines) {
            if (line.startsWith('**Summary:**')) summary = line.replace(/\*\*/g, '');
            if (line.startsWith('**Strongest correlation:**')) strongest = line.replace(/\*\*/g, '');
        }
        
        let html = '';
        
        // Полная матрица
        if (matrixRows.length > 1) {
            html += '<div class="diagnostic-card" style="margin-bottom:16px;">';
            html += '<h3 class="diagnostic-card-title">Correlation Matrix</h3>';
            html += '<div class="diagnostic-card-content" style="overflow-x:auto;">';
            html += '<table class="results-table" style="font-size:11px;"><thead><tr>';
            matrixRows[0].forEach(h => html += `<th>${h}</th>`);
            html += '</tr></thead><tbody>';
            
            for (let i = 1; i < matrixRows.length; i++) {
                html += '<tr>';
                matrixRows[i].forEach((cell, j) => {
                    const val = parseFloat(cell);
                    let style = '';
                    if (!isNaN(val) && j > 0) {
                        if (val === 1.0) style = 'color:var(--text-muted);';
                        else if (Math.abs(val) > 0.7) style = 'font-weight:600;color:var(--accent-red);';
                        else if (Math.abs(val) > 0.5) style = 'font-weight:600;color:var(--accent-orange);';
                    }
                    html += `<td style="${style}">${cell}</td>`;
                });
                html += '</tr>';
            }
            
            html += '</tbody></table></div></div>';
        }
        
        // Таблица Strong Correlations
        if (tableRows.length > 0) {
            html += '<div class="diagnostic-card" style="margin-bottom:16px;">';
            html += '<h3 class="diagnostic-card-title">Strong Correlations</h3>';
            html += '<div class="diagnostic-card-content">';
            html += '<table class="results-table"><thead><tr>';
            html += '<th>Variable 1</th><th>Variable 2</th><th>r</th><th>p-value</th><th>Significant</th>';
            html += '</tr></thead><tbody>';
            
            tableRows.forEach(row => {
                const rVal = parseFloat(row[2]);
                const isSig = row[4].includes('Yes');
                let color = 'var(--text-muted)';
                if (Math.abs(rVal) > 0.7) color = 'var(--accent-red)';
                else if (Math.abs(rVal) > 0.5) color = 'var(--accent-orange)';
                
                html += '<tr>';
                html += `<td>${row[0]}</td>`;
                html += `<td>${row[1]}</td>`;
                html += `<td style="font-weight:600;color:${color};">${row[2]}</td>`;
                html += `<td>${row[3]}</td>`;
                html += `<td style="color:${isSig ? 'var(--accent-green)' : 'var(--text-muted)'};">${row[4]}</td>`;
                html += '</tr>';
            });
            
            html += '</tbody></table></div></div>';
        }
        
        // Summary
        html += '<div class="diagnostic-card">';
        html += '<div class="diagnostic-card-content">';
        if (summary) html += `<div class="diagnostic-item">${summary}</div>`;
        if (strongest) html += `<div class="diagnostic-item diagnostic-good">${strongest}</div>`;
        html += '</div></div>';
        
        container.innerHTML = html;
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

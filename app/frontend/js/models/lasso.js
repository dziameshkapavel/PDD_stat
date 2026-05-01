// js/models/lasso.js - LASSO Regression Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class LassoModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'lasso_regression';
        this.templatePrefix = 'lasso';
    }
    
    createCard() {
        const template = document.getElementById('lassoCardTemplate');
        if (!template) {
            console.error('LASSO card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `lasso_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        return card;
    }
    
    async run(card) {
        const params = this._getParameters(card);
        
        if (!params.target_col) {
            this.ui.modals.showAlert('Select target variable');
            return;
        }
        
        const title = params.auto_select_alpha ? 
            'LASSO Regression (auto α)' : 
            `LASSO Regression (α=${params.alpha})`;
        
        const block = this.createResultsBlock(card, title);
        block.querySelector('.results-stats')?.remove();
        
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
            await this.displayPlots(block, 'lasso');
            
        } catch (error) {
            loadingDiv.remove();
            this._showError(block, error.message);
        }
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        const autoCheck = card.querySelector('.auto-c-check');
        
        return {
            target_col: vars.target || '',
            covariates: vars.covariates ? Array.from(vars.covariates) : [],
            auto_select_C: autoCheck ? autoCheck.checked : true,
            C_value: 1.0
        };
    }
    
    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const output = result.output || '';
        
        // Создаём табы
        const wrapper = document.createElement('div');
        container.parentNode.insertBefore(wrapper, container);
        
        const panes = this.ui.tabs.createResultTabs(wrapper, [
            { label: 'Results' },
            { label: 'Selected Features' },
            { label: 'All Features' }
        ]);
        
        // Results tab
        panes[0].appendChild(container);
        this._renderSummary(container, output);
        
        // Selected Features tab
        this._renderSelectedFeatures(panes[1], output);
        
        // All Features tab
        this._renderAllFeatures(panes[2], output);
        
        this._setupHeaderButtons(block);
    }
    
    _renderSummary(container, output) {
        // Показываем только ключевые метрики, без каши
        const lines = output.split('\n');
        let html = '<div style="display:flex;flex-direction:column;gap:16px;">';
        
        // Метрики
        html += '<div class="diagnostic-card">';
        html += '<h3 class="diagnostic-card-title">Model Performance</h3>';
        html += '<div class="diagnostic-card-content">';
        
        for (const line of lines) {
            if (line.startsWith('**AUC:**') || line.startsWith('**Accuracy:**') || line.startsWith('**Intercept:**') ||
                line.startsWith('**Features selected:**') || line.startsWith('**Features zeroed') ||
                line.startsWith('**Best C') || line.startsWith('**Observations:') || line.startsWith('**Events')) {
                html += `<div class="diagnostic-item">${line.replace(/\*\*/g, '')}</div>`;
            }
        }
        
        html += '</div></div></div>';
        container.innerHTML = html;
    }
    
    _renderSelectedFeatures(pane, output) {
        const tableData = this._parseTable(output, '### Selected Features');
        
        if (tableData.length > 1) {
            let html = '<div style="padding:16px;">';
            html += '<table class="results-table"><thead><tr>';
            tableData[0].forEach(h => html += `<th>${h}</th>`);
            html += '</tr></thead><tbody>';
            
            for (let i = 1; i < tableData.length; i++) {
                html += '<tr>';
                tableData[i].forEach((cell, j) => {
                    const isCoef = j === 2;
                    const val = parseFloat(cell);
                    let style = '';
                    if (isCoef && !isNaN(val)) {
                        style = val > 0 ? 'color:var(--accent-blue);font-weight:600;' : 'color:var(--accent-red);font-weight:600;';
                    }
                    html += `<td style="${style}">${cell}</td>`;
                });
                html += '</tr>';
            }
            
            html += '</tbody></table></div>';
            pane.innerHTML = html;
        } else {
            pane.innerHTML = '<p style="padding:16px;color:var(--text-muted);">No features selected</p>';
        }
    }
    
    _renderAllFeatures(pane, output) {
        // Извлекаем информацию о zeroed features
        const lines = output.split('\n');
        let zeroedFeatures = [];
        let inZeroed = false;
        
        for (const line of lines) {
            if (line.includes('### Features Removed by LASSO')) {
                inZeroed = true;
                continue;
            }
            if (inZeroed) {
                // Ищем строку "Removed (N): `var1`, `var2`"
                const match = line.match(/Removed\s*\(\d+\):\s*(.+)/);
                if (match) {
                    const vars = match[1];
                    // Извлекаем все `var` в кавычках
                    const varMatches = vars.match(/`([^`]+)`/g);
                    if (varMatches) {
                        zeroedFeatures = varMatches.map(m => m.replace(/`/g, ''));
                    }
                    break;
                }
            }
        }
        
        if (zeroedFeatures.length > 0) {
            let html = '<div style="padding:16px;">';
            html += '<div class="diagnostic-card">';
            html += '<h3 class="diagnostic-card-title">Features Removed by LASSO</h3>';
            html += '<div class="diagnostic-card-content">';
            html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">`;
            zeroedFeatures.forEach(f => {
                html += `<span style="padding:6px 12px;background:var(--bg-tertiary);border-radius:16px;font-size:13px;color:var(--text-muted);text-decoration:line-through;">${f}</span>`;
            });
            html += `</div>`;
            html += `<div style="margin-top:12px;font-size:12px;color:var(--text-muted);">These ${zeroedFeatures.length} features have coefficients of exactly 0 and were removed from the model.</div>`;
            html += `</div></div></div>`;
            pane.innerHTML = html;
        } else {
            pane.innerHTML = '<div style="padding:16px;"><div class="diagnostic-card"><div class="diagnostic-card-content" style="text-align:center;color:var(--text-muted);">All features selected (none zeroed).<br>Try decreasing C (increasing regularization) to zero out more features.</div></div></div>';
        }
    }
    
    _parseTable(output, sectionMarker) {
        const lines = output.split('\n');
        const tableData = [];
        let inSection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.includes(sectionMarker)) {
                inSection = true;
                continue;
            }
            
            if (inSection) {
                if (line.startsWith('|') && !line.includes('---')) {
                    const cells = line.split('|').filter(c => c.trim() !== '');
                    if (cells.length > 0) {
                        tableData.push(cells.map(c => c.trim()));
                    }
                } else if (tableData.length > 0 && !line.startsWith('|') && line !== '') {
                    break;
                }
            }
        }
        
        return tableData;
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

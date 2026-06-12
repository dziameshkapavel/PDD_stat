// js/models/rf.js - Random Forest Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class RandomForestModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'random_forest';
        this.templatePrefix = 'rf';
        this.shapPrefix = 'rf_shap';
        this.lastParams = null;
        this.lastShapEnabled = false;
    }
    
    createCard() {
        const template = document.getElementById('rfCardTemplate');
        if (!template) {
            console.error('RF card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `rf_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        
        const runBtn = card.querySelector('.run-btn');
        const closeBtn = card.querySelector('.card-close-btn');
        
        if (runBtn) {
            runBtn.addEventListener('click', () => this.run(card));
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.removeCard(card));
        }
        
        console.log('Random Forest card created:', card.id);
        return card;
    }
    
    _getParameters(card) {
        const targetInput = card.querySelector('.target-input');
        const exclusionsInput = card.querySelector('.exclusions-input');
        const topSelect = card.querySelector('.top-features-select');
        const shapCheck = card.querySelector('.shap-check');
        
        const target = targetInput && targetInput.value && targetInput.value.trim() || '';
        const exclusions = exclusionsInput && exclusionsInput.value && exclusionsInput.value.trim() || '';
        const topN = topSelect ? parseInt(topSelect.value) : 15;
        const calculateShap = shapCheck && shapCheck.checked || false;
        
        return {
            target_col: target,
            exclusions: exclusions || 'none',
            top_n: topN,
            calculate_shap: calculateShap
        };
    }
    
    async run(card) {
        console.log('Running Random Forest analysis...');
        const params = this._getParameters(card);
        this.lastParams = params;
        this.lastShapEnabled = params.calculate_shap || false;
        
        if (!params.target_col) {
            this.ui.modals.showAlert('Specify target variable');
            return;
        }
        
        const block = this.createResultsBlock(card, 'Random Forest');
        
        const statsDiv = block.querySelector('.results-stats');
        if (statsDiv) statsDiv.remove();
        
        const loadingDiv = document.createElement('div');
        loadingDiv.style.padding = '16px';
        loadingDiv.style.textAlign = 'center';
        loadingDiv.style.color = 'var(--text-muted)';
        loadingDiv.innerHTML = '<em>Running analysis...</em>';
        block.appendChild(loadingDiv);
        
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template: this.templateName,
                    params
                })
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Analysis failed');
            }
            
            const result = await response.json();
            console.log('Analysis result:', result);
            
            if (!result.success) {
                throw new Error(result.error || 'Analysis failed');
            }
            
            loadingDiv.remove();
            this.renderResults(block, result, card);
            
            // RF plots (importance, calibration, permutation, SHAP)
            await this.displayPlots(block, 'rf_');
            
        } catch (error) {
            loadingDiv.remove();
            const errorDiv = document.createElement('div');
            errorDiv.style.padding = '16px';
            errorDiv.style.color = 'var(--accent-red)';
            errorDiv.textContent = 'Error: ' + error.message;
            block.appendChild(errorDiv);
        }
    }
    
    
    renderResults(block, result, card) {
        console.log('Rendering RF results...');
        
        const tableContainer = block.querySelector('.results-table-container');
        if (!tableContainer) {
            console.error('Table container not found');
            return;
        }
        
        const tabsWrapper = document.createElement('div');
        tableContainer.parentNode.insertBefore(tabsWrapper, tableContainer);
        
        const metrics = result.metrics || {};
        
        const tabList = [
            { label: 'Table' },
            { label: 'Diagnostics' }
        ];
        if (metrics.shap_features && metrics.shap_features.length > 0) {
            tabList.push({ label: 'SHAP' });
        }
        const panes = this.ui.tabs.createResultTabs(tabsWrapper, tabList);
        const [tablePane, diagnosticsPane, shapPane] = panes;
        
        tablePane.appendChild(tableContainer);
        
        this._setupHeaderButtons(block, card);
        
        const output = result.output || '';
        const tableData = this._parseMarkdownTable(output);
        
        if (tableData.length > 0) {
            let html = '<table class="results-table"><thead><tr>';
            html += '<th>#</th><th>Variable</th><th>Importance</th>';
            html += '</tr></thead><tbody>';
            
            tableData.forEach(row => {
                html += '<tr>';
                row.forEach(cell => html += `<td>${cell}</td>`);
                html += '</tr>';
            });
            
            html += '</tbody></table>';
            tableContainer.innerHTML = html;
        } else {
            tableContainer.innerHTML = '<p style="padding: 16px; color: var(--text-muted);">No table data</p>';
        }
        
        if (Object.keys(metrics).length > 0) {
            diagnosticsPane.innerHTML = this._renderDiagnostics(metrics);
        }
        
        if (shapPane && metrics.shap_features && metrics.shap_features.length > 0) {
            let shapHtml = '<table class="results-table"><thead><tr><th>#</th><th>Feature</th><th>SHAP Importance</th></tr></thead><tbody>';
            metrics.shap_features.forEach((f, i) => {
                shapHtml += `<tr><td>${i + 1}</td><td>${f.feature}</td><td>${f.importance.toFixed(4)}</td></tr>`;
            });
            shapHtml += '</tbody></table>';
            shapPane.innerHTML = shapHtml;
        }
    }
    
    _parseMarkdownTable(output) {
        const lines = output.split('\n');
        const tableData = [];
        let inTable = false;
        
        for (let line of lines) {
            line = line.trim();
            
            if (line.includes('| # | Variable | Importance |')) {
                inTable = true;
                continue;
            }
            
            if (inTable && line.includes('|---')) continue;
            if (inTable && !line.startsWith('|')) { inTable = false; continue; }
            
            if (inTable && line.startsWith('|')) {
                const cells = line.split('|').filter(c => c.trim() !== '');
                if (cells.length >= 3) {
                    tableData.push(cells.map(c => c.trim()));
                }
            }
        }
        
        return tableData;
    }
    
    _renderDiagnostics(metrics) {
        let html = '<div style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">';
        
        html += `<div class="diagnostic-card">`;
        html += `<h3 class="diagnostic-card-title">Model Performance</h3>`;
        html += `<div class="diagnostic-card-content">`;
        
        if (typeof metrics.auc === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">AUC:</span> <span class="diagnostic-value" style="font-size: 24px;">${metrics.auc.toFixed(4)}</span></div>`;
        }
        if (typeof metrics.oob_score === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">OOB Score:</span> ${(metrics.oob_score * 100).toFixed(1)}%</div>`;
        }
        if (typeof metrics.accuracy === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">Accuracy:</span> ${(metrics.accuracy * 100).toFixed(1)}%</div>`;
        }
        if (typeof metrics.precision === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">Precision:</span> ${(metrics.precision * 100).toFixed(1)}%</div>`;
        }
        if (typeof metrics.recall === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">Recall:</span> ${(metrics.recall * 100).toFixed(1)}%</div>`;
        }
        if (typeof metrics.f1 === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">F1-score:</span> ${(metrics.f1 * 100).toFixed(1)}%</div>`;
        }
        
        html += `</div></div>`;
        
        html += `<div class="diagnostic-card">`;
        html += `<h3 class="diagnostic-card-title">Dataset</h3>`;
        html += `<div class="diagnostic-card-content">`;
        
        if (typeof metrics.n_samples === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">Samples:</span> ${metrics.n_samples}</div>`;
        }
        if (typeof metrics.n_features === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">Features:</span> ${metrics.n_features}</div>`;
        }
        
        html += `</div></div></div>`;
        return html;
    }
    
    _setupHeaderButtons(block, card) {
        const headerDiv = block.querySelector('.results-header');
        if (!headerDiv) return;
        
        const titleSpan = headerDiv.querySelector('.results-title');
        
        const toggleBtn = block.querySelector('.charts-toggle-btn');
        if (toggleBtn) {
            toggleBtn.classList.add('btn-secondary');
            toggleBtn.onclick = () => {
                const plotsDiv = block.querySelector('.results-plots');
                if (plotsDiv) {
                    plotsDiv.classList.toggle('hidden');
                    toggleBtn.textContent = plotsDiv.classList.contains('hidden') ? 'Show Charts' : 'Hide Charts';
                }
            };
        }
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-proba-btn';
        saveBtn.textContent = 'Save Probabilities';
        saveBtn.style.cssText = `
            margin-right: 8px;
            padding: 6px 14px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            border: 1px solid var(--border-primary);
            border-radius: 30px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
        `;
        
        saveBtn.onclick = (e) => {
            e.stopPropagation();
            this.savePredictions(card);
        };
        
        const saveModelBtn = document.createElement('button');
        saveModelBtn.className = 'save-model-btn';
        saveModelBtn.textContent = 'Save Model';
        saveModelBtn.style.cssText = `
            margin-right: 8px;
            padding: 6px 14px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            border: 1px solid var(--border-primary);
            border-radius: 30px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
        `;
        
        saveModelBtn.onclick = (e) => {
            e.stopPropagation();
            this._saveModel(card);
        };
        
        if (titleSpan) {
            if (toggleBtn) titleSpan.insertAdjacentElement('afterend', toggleBtn);
            if (toggleBtn) toggleBtn.insertAdjacentElement('afterend', saveModelBtn);
            saveModelBtn.insertAdjacentElement('afterend', saveBtn);
        }
    }
    
    async savePredictions(card) {
        const params = this._getParameters(card);
        if (!params.target_col) {
            this.ui.modals.showAlert('Specify target variable first');
            return;
        }
        
        const columnName = prompt('Enter column name:', 'rf_prob');
        if (!columnName) return;
        
        const saveBtn = card.querySelector('.save-proba-btn');
        if (saveBtn) {
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
        }
        
        try {
            const response = await fetch(`${API_BASE}/analysis/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template: this.templateName,
                    params: params,
                    column_name: columnName
                })
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Save failed');
            }
            
            const result = await response.json();
            
            if (result.success) {
                await this._refreshVariableList();
                this.ui.modals.showAlert(`Saved to "${columnName}"`);
            }
        } catch (error) {
            console.error('Save error:', error);
            this.ui.modals.showAlert('Failed: ' + error.message);
        } finally {
            if (saveBtn) {
                saveBtn.textContent = 'Save Probabilities';
                saveBtn.disabled = false;
            }
        }
    }
    
    async _refreshVariableList() {
        try {
            const data = await fetch(`${API_BASE}/projects/columns`).then(r => r.json());
            this.state.setVariableList(data.columns);
        } catch (error) {
            console.error('Failed to refresh:', error);
        }
    }
    
    async _saveModel(card) {
        const params = this._getParameters(card);
        params.save_model = "True";
        params.calculate_shap = false;

        const block = this.createResultsBlock(card, 'Saving Model...');
        const resultsStats = block.querySelector('.results-stats');
        if (resultsStats) resultsStats.remove();
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'padding:16px;color:var(--text-muted);';
        loadingDiv.textContent = 'Saving...';
        block.appendChild(loadingDiv);

        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: this.templateName, params })
            });
            const result = await response.json();
            loadingDiv.remove();
            if (result.success && result.metrics && metrics.model_path) {
                block.innerHTML = `<div style="padding:16px;color:var(--accent-green);">Model saved: ${result.metrics.model_path.split('/').pop()}</div>`;
            } else {
                block.innerHTML = `<div style="padding:16px;color:var(--accent-red);">Failed to save model</div>`;
            }
        } catch (e) {
            loadingDiv.remove();
            block.innerHTML = `<div style="padding:16px;color:var(--accent-red);">Error: ${e.message}</div>`;
        }
    }
}
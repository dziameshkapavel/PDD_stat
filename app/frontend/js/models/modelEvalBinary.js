// js/models/modelEvalBinary.js - Model Evaluation Binary
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class ModelEvalBinaryModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'model_evaluation_binary';
        this.templatePrefix = 'binary_eval';
    }
    
    createCard() {
        const template = document.getElementById('modelEvalBinaryCardTemplate');
        if (!template) {
            console.error('Model Eval Binary card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `modeleval_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        return card;
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        const bootstrapInput = card.querySelector('.bootstrap-input');
        const dcaCheck = card.querySelector('.dca-check');
        const calibCheck = card.querySelector('.calib-check');
        const autoInvertCheck = card.querySelector('.auto-invert-check');
        const seedInput = card.querySelector('.bootstrap-seed-input');
        
        let preds = [];
        if (vars.predictors instanceof Set) {
            preds = Array.from(vars.predictors);
        } else if (Array.isArray(vars.predictors)) {
            preds = vars.predictors;
        }
        
        return {
            target_col: vars.target || '',
            pred_cols: preds,
            n_bootstrap: bootstrapInput ? parseInt(bootstrapInput.value) || 1000 : 1000,
            run_dca: dcaCheck ? dcaCheck.checked : true,
            run_calibration: calibCheck ? calibCheck.checked : true,
            auto_invert: autoInvertCheck ? autoInvertCheck.checked : false,
            bootstrap_seed: seedInput ? parseInt(seedInput.value) || 42 : 42
        };
    }
    
    async run(card) {
        const params = this._getParameters(card);
        console.log('ModelEval params:', params);
        
        if (!params.target_col) {
            this.ui.modals.showAlert('Select target variable');
            return;
        }
        if (!params.pred_cols || params.pred_cols.length === 0) {
            this.ui.modals.showAlert('Select at least one prediction column');
            return;
        }
        
        const title = 'Model Evaluation: Binary Classification';
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
            console.log('ModelEval result:', result);
            
            if (!result.success) throw new Error(result.error || 'Analysis failed');
            
            loadingDiv.remove();
            this.renderResults(block, result, params);
            
            // Загружаем оба графика
            await this._loadAllPlots(block);
            
        } catch (error) {
            console.error('ModelEval error:', error);
            loadingDiv.remove();
            this._showError(block, error.message);
        }
    }
    
    async _loadAllPlots(block) {
        try {
            const response = await fetch(`${API_BASE}/analysis/charts`);
            const data = await response.json();
            const charts = data.charts || [];
            
            const plotsDiv = block.querySelector('.results-plots');
            if (!plotsDiv) return;
            
            plotsDiv.innerHTML = '';
            plotsDiv.style.marginTop = '16px';
            plotsDiv.style.width = '100%';
            
            // Ищем DCA и Calibration графики
            const dcaCharts = charts.filter(c => c.startsWith('binary_eval_dca_')).sort().reverse();
            const calibCharts = charts.filter(c => c.startsWith('binary_eval_calibration_')).sort().reverse();
            
            console.log('DCA charts:', dcaCharts);
            console.log('Calibration charts:', calibCharts);
            
            // DCA plot
            if (dcaCharts.length > 0) {
                const img = document.createElement('img');
                img.src = `/plots/${dcaCharts[0]}`;
                img.style.width = '100%';
                img.style.height = 'auto';
                img.style.borderRadius = '8px';
                img.style.border = '1px solid var(--border-primary)';
                img.style.cursor = 'pointer';
                img.onclick = () => window.open(`/plots/${dcaCharts[0]}`);
                plotsDiv.appendChild(img);
            }
            
            // Calibration plot
            if (calibCharts.length > 0) {
                const img = document.createElement('img');
                img.src = `/plots/${calibCharts[0]}`;
                img.style.width = '100%';
                img.style.height = 'auto';
                img.style.marginTop = '16px';
                img.style.borderRadius = '8px';
                img.style.border = '1px solid var(--border-primary)';
                img.style.cursor = 'pointer';
                img.onclick = () => window.open(`/plots/${calibCharts[0]}`);
                plotsDiv.appendChild(img);
            }
            
            this._setupPlotControls(block, plotsDiv);
            
        } catch (e) {
            console.error('Failed to load plots:', e);
        }
    }
    
    _setupPlotControls(block, plotsDiv) {
        const toggleBtn = block.querySelector('.charts-toggle-btn');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                plotsDiv.classList.toggle('hidden');
                toggleBtn.textContent = plotsDiv.classList.contains('hidden') ? 'Show Charts' : 'Hide Charts';
            };
        }
    }
    
    renderResults(block, result, params) {
        console.log('ModelEvalBinary.renderResults called!');
        
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const output = result.output || '';
        
        const wrapper = document.createElement('div');
        container.parentNode.insertBefore(wrapper, container);
        
        const tabs = [{ label: 'Metrics' }];
        if (params.run_dca) tabs.push({ label: 'DCA' });
        tabs.push({ label: 'Summary' });
        
        const panes = this.ui.tabs.createResultTabs(wrapper, tabs);
        
        // Metrics tab
        panes[0].appendChild(container);
        this._renderMetricsTable(container, output);
        
        let paneIdx = 1;
        
        // DCA tab
        if (params.run_dca) {
            this._renderDCATable(panes[paneIdx], output);
            paneIdx++;
        }
        
        // Summary tab
        this._renderSummary(panes[paneIdx], output);
    }
    
    _parseTable(output, startMarker) {
        const lines = output.split('\n');
        const tableData = [];
        let inTable = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.includes(startMarker)) {
                inTable = true;
                const cells = line.split('|').filter(c => c.trim() !== '');
                if (cells.length > 0) tableData.push(cells.map(c => c.trim()));
                continue;
            }
            
            if (inTable) {
                if (line.includes('|---')) continue;
                if (line.startsWith('|')) {
                    const cells = line.split('|').filter(c => c.trim() !== '');
                    if (cells.length > 0) tableData.push(cells.map(c => c.trim()));
                } else if (tableData.length > 1 && line !== '') {
                    break;
                }
            }
        }
        
        return tableData;
    }
    
    _renderMetricsTable(container, output) {
        let tableData = this._parseTable(output, '| Model | AUC |');
        if (tableData.length === 0) tableData = this._parseTable(output, '| Model |');
        if (tableData.length === 0) tableData = this._parseTable(output, '|-------|');
        
        console.log('Metrics table rows:', tableData.length);
        
        if (tableData.length > 1) {
            let html = '<table class="results-table"><thead><tr>';
            tableData[0].forEach(h => html += `<th>${h}</th>`);
            html += '</tr></thead><tbody>';
            
            for (let i = 1; i < tableData.length; i++) {
                html += '<tr>';
                tableData[i].forEach((cell, j) => {
                    const header = tableData[0][j] || '';
                    const isAuc = header.includes('AUC');
                    html += `<td style="${isAuc ? 'font-weight:600;color:var(--accent-blue);' : ''}">${cell}</td>`;
                });
                html += '</tr>';
            }
            
            html += '</tbody></table>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="padding:16px;color:var(--text-muted);">No metrics table found</p>';
        }
    }
    
    _renderDCATable(dcaPane, output) {
        const lines = output.split('\n');
        let html = '<div style="padding:16px;display:flex;flex-direction:column;gap:16px;">';
        let currentModel = null;
        let tableRows = [];
        let inDCA = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.includes('### Decision Curve Analysis')) {
                inDCA = true;
                continue;
            }
            
            if (inDCA) {
                if (trimmed.startsWith('**') && trimmed.endsWith(':**')) {
                    if (currentModel && tableRows.length > 0) {
                        html += this._buildDCACard(currentModel, tableRows);
                        tableRows = [];
                    }
                    currentModel = trimmed.replace(/\*\*/g, '').replace(':', '');
                }
                
                if (trimmed.startsWith('|') && !trimmed.includes('---')) {
                    const cells = trimmed.split('|').filter(c => c.trim() !== '');
                    if (cells.length >= 4) tableRows.push(cells.map(c => c.trim()));
                }
                
                if (trimmed.includes('![DCA Curves]') || trimmed.includes('![Calibration')) {
                    if (currentModel && tableRows.length > 0) {
                        html += this._buildDCACard(currentModel, tableRows);
                    }
                    break;
                }
            }
        }
        
        html += '</div>';
        dcaPane.innerHTML = html || '<p style="padding:16px;color:var(--text-muted);">DCA table not available</p>';
    }
    
    _buildDCACard(modelName, rows) {
        if (rows.length < 2) return '';
        
        let html = `<div class="diagnostic-card">`;
        html += `<h3 class="diagnostic-card-title">${modelName}</h3>`;
        html += `<div class="diagnostic-card-content">`;
        html += '<table class="results-table"><thead><tr>';
        rows[0].forEach(h => html += `<th>${h}</th>`);
        html += '</tr></thead><tbody>';
        
        for (let i = 1; i < rows.length; i++) {
            html += '<tr>';
            rows[i].forEach((cell, j) => {
                const val = parseFloat(cell);
                const isGain = j === 4;
                let style = '';
                if (isGain && val > 0) style = 'color:var(--accent-green);font-weight:600;';
                else if (isGain && val < 0) style = 'color:var(--accent-red);';
                html += `<td style="${style}">${cell}</td>`;
            });
            html += '</tr>';
        }
        
        html += '</tbody></table></div></div>';
        return html;
    }
    
    _renderSummary(summaryPane, output) {
        const lines = output.split('\n');
        let html = '<div style="padding:16px;display:flex;flex-direction:column;gap:16px;">';
        let inSummary = false;
        let currentModel = null;
        let items = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.includes('### Summary')) {
                inSummary = true;
                continue;
            }
            
            if (inSummary) {
                // Модель: **logistic_prob:**
                if (trimmed.startsWith('**') && trimmed.endsWith(':**')) {
                    if (currentModel && items.length > 0) {
                        html += this._buildSummaryCard(currentModel, items);
                        items = [];
                    }
                    currentModel = trimmed.replace(/\*\*/g, '').replace(':', '');
                }
                // Пункты:   - AUC = 0.802: Good discrimination
                else if (trimmed.startsWith('- ')) {
                    items.push(trimmed.replace('- ', ''));
                }
                // Конец
                else if (trimmed === '---' || trimmed.includes('**Model Evaluation complete**')) {
                    if (currentModel && items.length > 0) {
                        html += this._buildSummaryCard(currentModel, items);
                        items = [];
                        currentModel = null;
                    }
                    break;
                }
            }
        }
        
        // Последняя модель
        if (currentModel && items.length > 0) {
            html += this._buildSummaryCard(currentModel, items);
        }
        
        html += '</div>';
        summaryPane.innerHTML = html || '<p style="padding:16px;color:var(--text-muted);">Summary not available</p>';
    }
    
    _buildSummaryCard(modelName, items) {
        let html = `<div class="diagnostic-card">`;
        html += `<h3 class="diagnostic-card-title">${modelName}</h3>`;
        html += `<div class="diagnostic-card-content">`;
        
        items.forEach(item => {
            let cls = 'diagnostic-item';
            if (item.includes('Excellent')) cls += ' diagnostic-good';
            else if (item.includes('Good')) cls += ' diagnostic-good';
            else if (item.includes('Limited')) cls += ' diagnostic-bad';
            else if (item.includes('Poor')) cls += ' diagnostic-bad';
            else if (item.includes('Moderate')) cls += ' diagnostic-moderate';
            
            html += `<div class="${cls}">${item}</div>`;
        });
        
        html += `</div></div>`;
        return html;
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

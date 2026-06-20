// js/models/roc.js - ROC Analysis Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class ROCModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'roc_analysis';
        this.templatePrefix = 'roc';
        this.lastParams = null;
    }
    
    createCard() {
        const template = document.getElementById('rocCardTemplate');
        if (!template) {
            console.error('ROC card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `roc_${Date.now()}`;
        
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
        
        console.log('ROC card created:', card.id);
        return card;
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        const eventSelect = card.querySelector('.event-value-select');
        
        return {
            target_col: vars.target || '',
            predictors: vars.predictors ? Array.from(vars.predictors) : [],
            event_value: eventSelect ? parseInt(eventSelect.value) : 1
        };
    }
    
    async run(card) {
        console.log('Running ROC analysis...');
        const params = this._getParameters(card);
        this.lastParams = params;
        
        if (!params.target_col) {
            this.ui.modals.showAlert('Specify target variable');
            return;
        }
        
        if (!params.predictors || params.predictors.length === 0) {
            this.ui.modals.showAlert('Specify at least one predictor');
            return;
        }
        
        const block = this.createResultsBlock(card, 'ROC Analysis');
        
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
                throw new Error(await response.text() || 'Analysis failed');
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Analysis failed');
            }
            
            loadingDiv.remove();
            this.renderResults(block, result, card);
            await this.displayPlots(block, 'roc_multiple');
            
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
        const tableContainer = block.querySelector('.results-table-container');
        if (!tableContainer) return;
        
        const tabsWrapper = document.createElement('div');
        tableContainer.parentNode.insertBefore(tabsWrapper, tableContainer);
        
        const panes = this.ui.tabs.createResultTabs(tabsWrapper, [
            { label: 'ROC Results' },
            { label: 'Comparison' }
        ]);
        
        const [rocPane, compPane] = panes;
        rocPane.appendChild(tableContainer);
        this._setupHeaderButtons(block, card);
        
        const output = result.output || '';
        
        // Main table
        const tableData = this._parseTable(output, 'ROC Results');
        if (tableData.length > 0) {
            let html = '<table class="results-table"><thead><tr>';
            html += '<th>Predictor</th><th>AUC</th><th>95% CI</th><th>Threshold</th><th>Sens.</th><th>Spec.</th><th>PPV</th><th>NPV</th>';
            html += '</tr></thead><tbody>';
            tableData.forEach(row => {
                html += '<tr>';
                row.forEach(cell => html += `<td>${cell}</td>`);
                html += '</tr>';
            });
            html += '</tbody></table>';
            tableContainer.innerHTML = html;
        } else {
            tableContainer.innerHTML = '<p style="padding:16px;color:var(--text-muted);">No data</p>';
        }
        
        // Comparison table
        const compData = this._parseTable(output, 'Comparison');
        if (compData.length > 0) {
            let html = '<table class="results-table"><thead><tr>';
            html += '<th>Comparison</th><th>Delta AUC</th><th>Z-score</th><th>p-value</th>';
            html += '</tr></thead><tbody>';
            compData.forEach(row => {
                html += '<tr>';
                row.forEach(cell => {
                    const isSig = cell.includes('**');
                    html += `<td${isSig ? ' style="font-weight:bold;color:var(--accent-blue);"' : ''}>${cell.replace('**', '')}</td>`;
                });
                html += '</tr>';
            });
            html += '</tbody></table>';
            compPane.innerHTML = html;
        } else {
            compPane.innerHTML = '<p style="padding:16px;color:var(--text-muted);">Need 2+ predictors for comparison</p>';
        }
    }
    
    _parseTable(output, section) {
        const lines = output.split('\n');
        const tableData = [];
        let inTable = false;
        const target = section === 'ROC Results' ? '| Predictor | AUC |' : '| Comparison |';
        
        for (let line of lines) {
            line = line.trim();
            if (line.includes(target)) {
                inTable = true;
                continue;
            }
            if (inTable && line.includes('|---')) continue;
            if (inTable && !line.startsWith('|')) { inTable = false; continue; }
            if (inTable && line.startsWith('|')) {
                const cells = line.split('|').filter(c => c.trim() !== '');
                if (cells.length >= 2) {
                    tableData.push(cells.map(c => c.trim()));
                }
            }
        }
        return tableData;
    }
    
    _setupHeaderButtons(block, card) {
        const headerDiv = block.querySelector('.results-header');
        if (!headerDiv) return;
        
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
    }
}
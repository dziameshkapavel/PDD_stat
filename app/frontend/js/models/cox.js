// js/models/cox.js - Cox Regression Model
import { BaseModel } from './base.js';
import { API_BASE, APIClient } from '../core/api.js';

export class CoxModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'cox_ph';
        this.templatePrefix = 'cox_ph';
        this.lastParams = null;
    }
    
    createCard() {
        const template = document.getElementById('coxCardTemplate');
        if (!template) {
            console.error('Cox card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `cox_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        this.setupTypeButtons(card);
        
        const runBtn = card.querySelector('.run-btn');
        const closeBtn = card.querySelector('.card-close-btn');
        
        if (runBtn) {
            runBtn.addEventListener('click', () => this.run(card));
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.removeCard(card));
        }
        
        console.log('Cox card created:', card.id);
        return card;
    }
    
    async run(card) {
        console.log('Running Cox analysis...');
        const params = this._getParameters(card);
        this.lastParams = params;
        
        console.log('Parameters:', params);
        
        if (!params.time_col || !params.event_col) {
            this.ui.modals.showAlert('Specify time and event variables');
            return;
        }
        
        const title = `Cox regression (${params.regression_type === 'uni' ? 'univariate' : 
                      params.regression_type === 'forward' ? 'forward selection' :
                      params.regression_type === 'backward' ? 'backward elimination' : 'multivariate'})`;
        
        const block = this.createResultsBlock(card, title);
        
        // Удаляем results-stats (серая полоса)
        const statsDiv = block.querySelector('.results-stats');
        if (statsDiv) statsDiv.remove();
        
        // Показываем индикатор загрузки
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
            
            // Удаляем индикатор загрузки
            loadingDiv.remove();
            
            this.renderResults(block, result, card);
            await this.displayPlots(block);
            
        } catch (error) {
            console.error('Cox analysis error:', error);
            loadingDiv.remove();
            const errorDiv = document.createElement('div');
            errorDiv.style.padding = '16px';
            errorDiv.style.color = 'var(--accent-red)';
            errorDiv.innerHTML = `Error: ${error.message}`;
            block.appendChild(errorDiv);
        }
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        
        const typeBtn = card.querySelector('.analysis-type.active');
        const analysisType = typeBtn ? typeBtn.dataset.type : 'univariate';
        const methodBtn = card.querySelector('.method-btn.active');
        const method = methodBtn ? methodBtn.dataset.method : 'enter';
        
        let regressionType = analysisType === 'univariate' ? 'uni' : method;
        
        if (analysisType === 'multivariate' && method === 'enter') {
            regressionType = 'multi';
        }
        
        return {
            time_col: vars.time || '',
            event_col: vars.event || '',
            covariates: vars.covariates ? Array.from(vars.covariates) : [],
            regression_type: regressionType
        };
    }
    
    renderResults(block, result, card) {
        console.log('Rendering results...');
        
        const tableContainer = block.querySelector('.results-table-container');
        if (!tableContainer) {
            console.error('Table container not found');
            return;
        }
        
        // Создаём контейнер для табов
        const tabsWrapper = document.createElement('div');
        tableContainer.parentNode.insertBefore(tabsWrapper, tableContainer);
        
        // Создаём табы
        const panes = this.ui.tabs.createResultTabs(
            tabsWrapper,
            [
                { label: 'Table' },
                { label: 'Diagnostics' },
                { label: 'Steps' }
            ]
        );
        
        const [tablePane, diagnosticsPane, stepsPane] = panes;
        
        // Перемещаем таблицу в первый таб
        tablePane.appendChild(tableContainer);
        
        // Настраиваем кнопки в header
        this._setupHeaderButtons(block, card);
        
        // Заполняем контент
        if (result.metrics && Object.keys(result.metrics).length > 0) {
            console.log('Using structured results');
            this._renderStructuredResults(result, tablePane, diagnosticsPane, stepsPane);
        } else {
            console.log('Using legacy results');
            this._renderLegacyResults(result, tableContainer, diagnosticsPane, stepsPane);
        }
    }
    
    _setupHeaderButtons(block, card) {
        const headerDiv = block.querySelector('.results-header');
        if (!headerDiv) return;
        
        const titleSpan = headerDiv.querySelector('.results-title');
        
        // Кнопка Save Risk
        let saveBtn = headerDiv.querySelector('.save-risk-btn');
        if (!saveBtn) {
            saveBtn = document.createElement('button');
            saveBtn.className = 'save-risk-btn';
        }
        
        saveBtn.textContent = 'Save Risk';
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
            transition: all 0.2s ease;
        `;
        
        saveBtn.addEventListener('mouseenter', () => {
            if (!saveBtn.disabled) {
                saveBtn.style.background = 'var(--bg-hover)';
            }
        });
        
        saveBtn.addEventListener('mouseleave', () => {
            if (!saveBtn.disabled) {
                saveBtn.style.background = 'var(--bg-secondary)';
            }
        });
        
        saveBtn.onclick = (e) => {
            e.stopPropagation();
            this.savePredictions(card);
        };
        
        // Перемещаем кнопку Save Risk в header перед closeBtn
        if (titleSpan) {
            titleSpan.insertAdjacentElement('afterend', saveBtn);
        }
    }
    
    async savePredictions(card) {
        if (!this.lastParams) {
            this.ui.modals.showAlert('No model parameters available. Run analysis first.');
            return;
        }
        
        const columnName = prompt('Enter name for predicted risk column:', 'cox_risk');
        if (!columnName) return;
        
        const saveBtn = document.querySelector('.save-risk-btn');
        if (saveBtn) {
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
            saveBtn.style.background = 'var(--accent-blue)';
            saveBtn.style.color = 'white';
            saveBtn.style.border = 'none';
        }
        
        try {
            const response = await fetch(`${API_BASE}/analysis/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template: this.templateName,
                    params: this.lastParams,
                    column_name: columnName
                })
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Prediction failed');
            }
            
            const result = await response.json();
            
            if (result.success) {
                await this._refreshVariableList();
                
                this.ui.modals.showAlert(
                    `Risk scores saved!\n\n` +
                    `Column: "${columnName}"\n` +
                    `Also created: "${columnName}_norm" (normalized 0-1)\n\n` +
                    `Check the "Columns" panel to use it in future analyses.`
                );
            }
        } catch (error) {
            console.error('Save predictions error:', error);
            this.ui.modals.showAlert('Failed to save predictions: ' + error.message);
        } finally {
            if (saveBtn) {
                saveBtn.textContent = 'Save Risk';
                saveBtn.disabled = false;
                saveBtn.style.background = 'var(--bg-secondary)';
                saveBtn.style.color = 'var(--text-primary)';
                saveBtn.style.border = '1px solid var(--border-primary)';
            }
        }
    }
    
    async _refreshVariableList() {
        try {
            const data = await APIClient.call("/projects/columns");
            this.state.setVariableList(data.columns);
            console.log('Variable list refreshed, new columns loaded');
        } catch (error) {
            console.error('Failed to refresh variable list:', error);
            setTimeout(async () => {
                try {
                    const data = await APIClient.call("/projects/columns");
                    this.state.setVariableList(data.columns);
                } catch (e) {
                    console.error('Retry failed:', e);
                }
            }, 1000);
        }
    }
    
    _renderStructuredResults(result, tablePane, diagnosticsPane, stepsPane) {
        const metrics = result.metrics;
        
        // Таблица (без baseline)
        if (result.table && result.table.length > 0) {
            const filteredTable = result.table.filter(row => 
                !row.variable.includes('(baseline)')
            );
            
            if (filteredTable.length > 0) {
                let html = '<table class="results-table"><thead><tr>';
                html += '<th>Variable</th><th>HR</th><th>95% CI</th><th>p-value</th>';
                html += '</tr></thead><tbody>';
                
                filteredTable.forEach(row => {
                    html += `<tr>
                        <td>${row.variable || ''}</td>
                        <td>${row.hr || ''}</td>
                        <td>${row.ci || ''}</td>
                        <td>${row.p_value || ''}</td>
                    </tr>`;
                });
                
                html += '</tbody></table>';
                tablePane.innerHTML = html;
            } else {
                tablePane.innerHTML = '<p style="padding: 16px; color: var(--text-muted);">No significant variables</p>';
            }
        } else {
            tablePane.innerHTML = '<p style="padding: 16px; color: var(--text-muted);">No table data available</p>';
        }
        
        // Диагностика
        diagnosticsPane.innerHTML = this._renderDiagnostics(metrics);
        
        // Шаги отбора
        stepsPane.innerHTML = this._renderSteps(metrics);
    }
    
    _renderDiagnostics(metrics) {
        let html = '<div style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">';
        
        // C-index
        if (typeof metrics.c_index === 'number') {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">Model Performance</h3>`;
            html += `<div class="diagnostic-card-content">`;
            html += `<span class="diagnostic-label">C-index:</span>`;
            html += `<span class="diagnostic-value">${metrics.c_index.toFixed(4)}</span>`;
            
            if (metrics.c_index > 0.7) {
                html += `<div class="diagnostic-good">Good predictive ability</div>`;
            } else if (metrics.c_index > 0.6) {
                html += `<div class="diagnostic-moderate">Moderate predictive ability</div>`;
            } else {
                html += `<div class="diagnostic-poor">Poor predictive ability</div>`;
            }
            
            html += `</div></div>`;
        }
        
        // Schoenfeld test
        if (metrics.schoenfeld_test && Object.keys(metrics.schoenfeld_test).length > 0) {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">Proportional Hazards (Schoenfeld)</h3>`;
            html += `<div class="diagnostic-card-content">`;
            
            let hasViolations = false;
            
            for (const [varName, test] of Object.entries(metrics.schoenfeld_test)) {
                if (test && typeof test === 'object' && typeof test.p_value === 'number') {
                    const violated = test.violated;
                    const pValue = test.p_value;
                    
                    if (violated) hasViolations = true;
                    
                    html += `<div class="diagnostic-item">`;
                    html += `<span class="diagnostic-item-label">${varName}:</span> `;
                    html += `<span class="${violated ? 'diagnostic-bad' : 'diagnostic-good'}">`;
                    html += `p = ${pValue.toFixed(4)}`;
                    if (violated) html += ` (violated)`;
                    html += `</span></div>`;
                }
            }
            
            if (!hasViolations) {
                html += `<div class="diagnostic-good" style="margin-top: 8px;">All variables satisfy PH assumption</div>`;
            }
            
            html += `</div></div>`;
        }
        
        // VIF
        if (metrics.vif && Object.keys(metrics.vif).length > 0) {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">Multicollinearity (VIF)</h3>`;
            html += `<div class="diagnostic-card-content">`;
            
            for (const [varName, vif] of Object.entries(metrics.vif)) {
                if (vif && typeof vif === 'object' && typeof vif.value === 'number') {
                    const value = vif.value;
                    const isHigh = vif.high;
                    const isModerate = vif.moderate;
                    let cls = 'diagnostic-good';
                    
                    if (isHigh) {
                        cls = 'diagnostic-bad';
                    } else if (isModerate) {
                        cls = 'diagnostic-moderate';
                    }
                    
                    html += `<div class="diagnostic-item">`;
                    html += `<span class="diagnostic-item-label">${varName}:</span> `;
                    html += `<span class="${cls}">VIF = ${value.toFixed(2)}</span>`;
                    
                    if (isHigh) {
                        html += ` <span class="diagnostic-bad">(high)</span>`;
                    } else if (isModerate) {
                        html += ` <span class="diagnostic-moderate">(moderate)</span>`;
                    }
                    
                    html += `</div>`;
                }
            }
            html += `</div></div>`;
        }
        
        // Warnings
        if (metrics.warnings && metrics.warnings.length > 0) {
            html += `<div class="diagnostic-card" style="border-left: 3px solid var(--accent-orange);">`;
            html += `<h3 class="diagnostic-card-title" style="color: var(--accent-orange);">Warnings</h3>`;
            html += `<div class="diagnostic-card-content">`;
            metrics.warnings.forEach(w => {
                html += `<div class="diagnostic-item" style="color: var(--accent-orange);">${w}</div>`;
            });
            html += `</div></div>`;
        }
        
        html += '</div>';
        return html;
    }
    
    _renderSteps(metrics) {
        if (metrics.model_steps && metrics.model_steps.length > 0) {
            let html = '<div style="padding: 16px;">';
            html += '<div class="diagnostic-card">';
            html += '<h3 class="diagnostic-card-title">Variable Selection Steps</h3>';
            html += '<div class="diagnostic-card-content">';
            
            metrics.model_steps.forEach(step => {
                const action = step.action === 'added' ? 'Added' : 'Removed';
                const actionClass = step.action === 'added' ? 'diagnostic-good' : 'diagnostic-bad';
                const pValue = typeof step.p_value === 'number' ? step.p_value.toFixed(4) : '-';
                
                html += `<div class="diagnostic-item" style="padding: 8px 0;">`;
                html += `<span class="diagnostic-item-label">Step ${step.step}:</span> `;
                html += `<span class="${actionClass}">${action}</span> `;
                html += `<span style="font-family: monospace;">${step.variable}</span> `;
                html += `<span style="color: var(--text-muted);">(p = ${pValue})</span>`;
                html += `</div>`;
            });
            
            html += '</div></div></div>';
            return html;
        } else {
            return '<div style="padding: 16px;"><div class="diagnostic-card"><div class="diagnostic-card-content" style="text-align: center; color: var(--text-muted);">No stepwise selection performed</div></div></div>';
        }
    }
    
    _renderLegacyResults(result, tableContainer, diagnosticsPane, stepsPane) {
        const output = result.output || '';
        const lines = output.split('\n');
        let tableHtml = '';
        let headerHtml = '';
        let bodyHtml = '';
        let inTable = false;
        
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('| Variable | HR |')) {
                inTable = true;
                const cells = line.split('|').filter(c => c.trim());
                headerHtml = '<tr>' + cells.map(c => `<th>${c.trim()}</th>`).join('') + '</tr>';
            } else if (inTable && line.startsWith('|') && !line.includes('---')) {
                if (line.includes('(baseline)')) continue;
                
                const cells = line.split('|').filter(c => c.trim());
                if (cells.length >= 4) {
                    bodyHtml += '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
                }
            } else if (inTable && !line.startsWith('|')) {
                inTable = false;
            }
        }
        
        tableHtml = headerHtml ? 
            '<table class="results-table">' + headerHtml + bodyHtml + '</table>' : 
            '<p>No results table found</p>';
        tableContainer.innerHTML = tableHtml;
        
        diagnosticsPane.innerHTML = '<div style="padding: 16px;"><div class="diagnostic-card"><div class="diagnostic-card-content" style="text-align: center; color: var(--text-muted);">Diagnostics not available in legacy mode</div></div></div>';
        stepsPane.innerHTML = '<div style="padding: 16px;"><div class="diagnostic-card"><div class="diagnostic-card-content" style="text-align: center; color: var(--text-muted);">Steps not available in legacy mode</div></div></div>';
    }
}

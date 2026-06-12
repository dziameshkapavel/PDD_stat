// js/models/logistic.js - Logistic Regression Model
import { BaseModel } from './base.js';
import { API_BASE, APIClient } from '../core/api.js';

export class LogisticModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'logistic';
        this.templatePrefix = 'logistic';
        this.lastParams = null;
    }
    
    createCard() {
        const template = document.getElementById('logisticCardTemplate');
        if (!template) {
            console.error('Logistic card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `logistic_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        this.setupTypeButtons(card);
        this.setupValidationButtons(card);
        this.setupCustomListeners(card);
        
        const runBtn = card.querySelector('.run-btn');
        const closeBtn = card.querySelector('.card-close-btn');
        
        if (runBtn) {
            runBtn.addEventListener('click', () => this.run(card));
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.removeCard(card));
        }
        
        console.log('Logistic card created:', card.id);
        return card;
    }
    
    async run(card) {
        console.log('Running Logistic analysis...');
        const params = this._getParameters(card);
        card.lastParams = params;
        
        console.log('Parameters:', params);
        
        if (!params.target_col) {
            this.ui.modals.showAlert('Specify target variable');
            return;
        }
        
        if (!params.predictors || params.predictors.length === 0) {
            this.ui.modals.showAlert('Specify at least one predictor');
            return;
        }
        
        const valLabel = params.validation === 'split' ? ' [train/test]' : params.validation === 'cv' ? ' [CV]' : '';
        const title = `Logistic regression (${params.regression_type === 'uni' ? 'univariate' : 
                      params.regression_type === 'forward' ? 'forward selection' :
                      params.regression_type === 'backward' ? 'backward elimination' : 'multivariate'})${valLabel}`;
        
        const block = this.createResultsBlock(card, title);
        
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
            
            const plotFiles = (result.metrics && result.metrics.plots) ? result.metrics.plots : null;
            
            await this.displayPlots(block, null, plotFiles);
            
        } catch (error) {
            console.error('Logistic analysis error:', error);
            loadingDiv.remove();
            const errorDiv = document.createElement('div');
            errorDiv.style.padding = '16px';
            errorDiv.style.color = 'var(--accent-red)';
            errorDiv.innerHTML = `Error: ${error.message}`;
            block.appendChild(errorDiv);
        }
    }
    
    setupValidationButtons(card) {
        const validationBtns = card.querySelectorAll('.validation-btn');
        validationBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                validationBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    setupCustomListeners(card) {
        card.covariateTypes = {};
        this.state.on('card:variables:updated', (data) => {
            if (data.cardId === card.id) {
                this.updateReferenceGroups(card);
            }
        });
    }
    
    updateReferenceGroups(card) {
        const vars = this.state.getCardVariables(card.id);
        const predictors = vars.predictors ? Array.from(vars.predictors) : [];
        const variablesList = this.state.getVariableList();
        
        card.covariateTypes = card.covariateTypes || {};
        
        const typesWrapper = card.querySelector('.covariate-types-wrapper');
        const typesContainer = card.querySelector('.covariate-types-container');
        const refWrapper = card.querySelector('.reference-groups-wrapper');
        const refContainer = card.querySelector('.reference-groups-container');
        if (!typesWrapper || !typesContainer || !refWrapper || !refContainer) return;
        
        const currentSelections = {};
        refContainer.querySelectorAll('.ref-group-item').forEach(item => {
            const vName = item.dataset.var;
            const sel = item.querySelector('.ref-group-select');
            if (sel) currentSelections[vName] = sel.value;
        });
        
        typesContainer.innerHTML = '';
        refContainer.innerHTML = '';
        let hasCategorical = false;
        
        if (predictors.length === 0) {
            typesWrapper.classList.add('hidden');
            refWrapper.classList.add('hidden');
            return;
        }
        
        predictors.forEach(predName => {
            const varInfo = variablesList.find(v => v.name === predName);
            if (!varInfo) return;
            
            if (!card.covariateTypes[predName]) {
                card.covariateTypes[predName] = (varInfo.type === 'categorical' || varInfo.type === 'binary') ? 'categorical' : 'numeric';
            }
            
            const currentType = card.covariateTypes[predName];
            
            const tagBtn = document.createElement('button');
            tagBtn.className = currentType === 'categorical' ? 'btn-primary' : 'btn-secondary';
            tagBtn.textContent = `${predName} (${currentType === 'categorical' ? 'Cat' : 'Cont'})`;
            tagBtn.style.cssText = 'padding: 4px 10px; font-size: 12px; border-radius: 20px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; border: 1px solid var(--border-primary); margin-bottom: 2px;';
            tagBtn.type = 'button';
            tagBtn.onclick = (e) => {
                e.preventDefault();
                card.covariateTypes[predName] = currentType === 'categorical' ? 'numeric' : 'categorical';
                this.updateReferenceGroups(card);
            };
            typesContainer.appendChild(tagBtn);
            
            if (currentType === 'categorical') {
                hasCategorical = true;
                const uniqueValues = varInfo.unique_values || ['0', '1'];
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'ref-group-item';
                itemDiv.dataset.var = predName;
                itemDiv.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom: 4px;';
                
                const label = document.createElement('span');
                label.style.cssText = 'font-size: 13px; color: var(--text-primary); font-weight: 500;';
                label.textContent = `${predName}:`;
                
                const select = document.createElement('select');
                select.className = 'form-input ref-group-select';
                select.style.cssText = 'width:150px; padding: 4px 8px; font-size:12px; height: auto; margin-bottom: 0;';
                
                uniqueValues.forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    if (currentSelections[predName] === String(val)) {
                        opt.selected = true;
                    }
                    select.appendChild(opt);
                });
                
                itemDiv.appendChild(label);
                itemDiv.appendChild(select);
                refContainer.appendChild(itemDiv);
            }
        });
        
        typesWrapper.classList.remove('hidden');
        refWrapper.classList.toggle('hidden', !hasCategorical);
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
        
        const validationBtn = card.querySelector('.validation-btn.active');
        const validation = validationBtn ? validationBtn.dataset.validation : 'none';
        
        const predictors = vars.predictors ? Array.from(vars.predictors) : [];
        const covariate_types = card.covariateTypes || {};
        const eventSelect = card.querySelector('.event-value-select');
        
        const reference_groups = {};
        card.querySelectorAll('.ref-group-item').forEach(item => {
            const varName = item.dataset.var;
            const select = item.querySelector('.ref-group-select');
            if (select) {
                reference_groups[varName] = select.value;
            }
        });
        
        console.log('Logistic parameters:', {
            target: vars.target,
            predictors: predictors,
            regression_type: regressionType,
            validation: validation
        });
        
        return {
            target_col: vars.target || '',
            predictors: predictors,
            regression_type: regressionType,
            validation: validation,
            covariate_types,
            reference_groups,
            event_value: eventSelect ? parseInt(eventSelect.value) : 1,
            show_roc_plot: !!(card.querySelector('.plot-roc-check') && card.querySelector('.plot-roc-check').checked),
            show_dca_plot: !!(card.querySelector('.plot-dca-check') && card.querySelector('.plot-dca-check').checked),
            show_cal_plot: !!(card.querySelector('.plot-cal-check') && card.querySelector('.plot-cal-check').checked)
        };
    }
    
    renderResults(block, result, card) {
        console.log('Rendering results...');
        
        const tableContainer = block.querySelector('.results-table-container');
        if (!tableContainer) {
            console.error('Table container not found');
            return;
        }
        
        const tabsWrapper = document.createElement('div');
        tableContainer.parentNode.insertBefore(tabsWrapper, tableContainer);
        
        const panes = this.ui.tabs.createResultTabs(
            tabsWrapper,
            [
                { label: 'Table' },
                { label: 'Diagnostics' },
                { label: 'Steps' }
            ]
        );
        
        const [tablePane, diagnosticsPane, stepsPane] = panes;
        tablePane.appendChild(tableContainer);
        
        this._setupHeaderButtons(block, card);
        
        // Парсим таблицу из output
        const tableData = this._parseMarkdownTable(result.output || '');
        
        if (tableData.length > 0) {
            let html = '<table class="results-table"><thead><tr>';
            html += '<th>Variable</th><th>β (coef)</th><th>OR</th><th>95% CI</th><th>p-value</th>';
            html += '</tr></thead><tbody>';
            
            tableData.forEach(row => {
                html += '<tr>';
                row.forEach(cell => html += `<td>${cell}</td>`);
                html += '</tr>';
            });
            
            html += '</tbody></table>';
            tableContainer.innerHTML = html;
        } else {
            tableContainer.innerHTML = '<p style="padding: 16px; color: var(--text-muted);">No table data available</p>';
        }
        
        if (result.metrics && Object.keys(result.metrics).length > 0) {
            diagnosticsPane.innerHTML = this._renderDiagnostics(result.metrics);
            stepsPane.innerHTML = this._renderSteps(result.metrics);
        } else {
            diagnosticsPane.innerHTML = '<div style="padding: 16px;"><div class="diagnostic-card"><div class="diagnostic-card-content" style="text-align: center; color: var(--text-muted);">No diagnostics available</div></div></div>';
            stepsPane.innerHTML = '<div style="padding: 16px;"><div class="diagnostic-card"><div class="diagnostic-card-content" style="text-align: center; color: var(--text-muted);">No steps available</div></div></div>';
        }
    }
    
    _parseMarkdownTable(output) {
        const lines = output.split('\n');
        const tableData = [];
        let inTable = false;
        
        for (let line of lines) {
            line = line.trim();
            
            if ((line.includes('| Variable | β') || line.includes('| Predictor | OR')) && line.includes('|')) {
                inTable = true;
                continue;
            }
            
            if (inTable && line.includes('|---')) {
                continue;
            }
            
            if (inTable && !line.startsWith('|')) {
                inTable = false;
                continue;
            }
            
            if (inTable && line.startsWith('|')) {
                const cells = line.split('|').filter(c => c.trim() !== '');
                if (cells.length >= 3) {
                    tableData.push(cells.map(c => c.trim()));
                }
            }
        }
        
        return tableData;
    }
    
    _setupHeaderButtons(block, card) {
        const headerDiv = block.querySelector('.results-header');
        if (!headerDiv) return;
        
        const titleSpan = headerDiv.querySelector('.results-title');
        
        const toggleBtn = block.querySelector('.charts-toggle-btn');
        if (toggleBtn) {
            toggleBtn.classList.add('btn-secondary');
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                const plotsDiv = block.querySelector('.results-plots');
                if (plotsDiv) {
                    plotsDiv.classList.toggle('hidden');
                    toggleBtn.textContent = plotsDiv.classList.contains('hidden') ? 'Show Charts' : 'Hide Charts';
                }
            };
        }
        
        let saveBtn = headerDiv.querySelector('.save-risk-btn');
        if (!saveBtn) {
            saveBtn = document.createElement('button');
            saveBtn.className = 'save-risk-btn';
        }
        
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
        
        if (titleSpan) {
            titleSpan.insertAdjacentElement('afterend', toggleBtn);
            toggleBtn.insertAdjacentElement('afterend', saveBtn);
        }
    }
    
    async savePredictions(card) {
        if (!card.lastParams) {
            this.ui.modals.showAlert('No model parameters available. Run analysis first.');
            return;
        }
        
        const columnName = prompt('Enter name for predicted probability column:', 'logistic_prob');
        if (!columnName) return;
        
        const saveBtn = card.querySelector('.save-risk-btn');
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
                    params: card.lastParams,
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
                this.ui.modals.showAlert(`Probabilities saved to column "${columnName}"`);
            }
        } catch (error) {
            console.error('Save predictions error:', error);
            this.ui.modals.showAlert('Failed to save predictions: ' + error.message);
        } finally {
            if (saveBtn) {
                saveBtn.textContent = 'Save Probabilities';
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
            console.log('Variable list refreshed');
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
    
    _renderDiagnostics(metrics) {
        let html = '<div style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">';
        
        if (metrics.equation_html) {
            html += `<div class="equation-box" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); padding: 16px; border-radius: var(--radius-md); text-align: center; margin-bottom: 0; font-family: 'Outfit', 'Inter', monospace; font-size: 14px; box-shadow: var(--shadow-sm);">`;
            html += `<div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">Model Equation</div>`;
            html += `<div style="color: var(--text-primary); font-weight: 500; font-size: 15px; word-break: break-all;">${metrics.equation_html}</div>`;
            html += `</div>`;
        }
        
        html += `<div class="diagnostic-card">`;
        html += `<h3 class="diagnostic-card-title">Model Performance</h3>`;
        html += `<div class="diagnostic-card-content">`;
        
        if (typeof metrics.auc === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">AUC:</span> <span class="diagnostic-value" style="font-size: 24px;">${metrics.auc.toFixed(4)}</span></div>`;
        }
        if (typeof metrics.accuracy === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">Accuracy:</span> ${(metrics.accuracy * 100).toFixed(1)}%</div>`;
        }
        if (typeof metrics.sensitivity === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">Sensitivity:</span> ${(metrics.sensitivity * 100).toFixed(1)}%</div>`;
        }
        if (typeof metrics.specificity === 'number') {
            html += `<div class="diagnostic-item"><span class="diagnostic-item-label">Specificity:</span> ${(metrics.specificity * 100).toFixed(1)}%</div>`;
        }
        
        html += `</div></div>`;

        if (metrics.univariate_results && metrics.univariate_results.length > 0) {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">Predictor Comparison</h3>`;
            html += `<div class="diagnostic-card-content">`;
            html += `<table style="width:100%; border-collapse:collapse; font-size:13px;">`;
            html += `<thead><tr style="border-bottom:2px solid var(--border-primary);">`;
            html += `<th style="text-align:left;padding:6px 8px;">Predictor</th>`;
            html += `<th style="text-align:right;padding:6px 8px;">OR</th>`;
            html += `<th style="text-align:right;padding:6px 8px;">95% CI</th>`;
            html += `<th style="text-align:right;padding:6px 8px;">p-value</th>`;
            html += `<th style="text-align:right;padding:6px 8px;">AUC</th>`;
            html += `</tr></thead><tbody>`;
            metrics.univariate_results.forEach(r => {
                const orVal = r.or != null ? r.or.toFixed(3) : '—';
                const ci = (r.ci_lower != null && r.ci_upper != null) ? `${r.ci_lower.toFixed(3)}–${r.ci_upper.toFixed(3)}` : '—';
                const p = r.p_value != null ? (r.p_value < 0.0001 ? '<0.0001' : r.p_value.toFixed(4)) : '—';
                const aucVal = r.auc != null ? r.auc.toFixed(4) : '—';
                const sig = (r.p_value != null && r.p_value < 0.05) ? 'font-weight:600;' : '';
                const best = (metrics.best_predictor === r.predictor) ? 'background:var(--bg-secondary);' : '';
                html += `<tr style="border-bottom:1px solid var(--border-primary);${best}">`;
                html += `<td style="padding:6px 8px;${sig}">${r.predictor}</td>`;
                html += `<td style="text-align:right;padding:6px 8px;">${orVal}</td>`;
                html += `<td style="text-align:right;padding:6px 8px;">${ci}</td>`;
                html += `<td style="text-align:right;padding:6px 8px;">${p}</td>`;
                html += `<td style="text-align:right;padding:6px 8px;${sig}">${aucVal}</td>`;
                html += `</tr>`;
            });
            html += `</tbody></table>`;
            html += `</div></div>`;
        }
        if (metrics.hosmer_lemeshow && typeof metrics.hosmer_lemeshow.p_value === 'number') {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">Goodness of Fit (Hosmer-Lemeshow)</h3>`;
            html += `<div class="diagnostic-card-content">`;
            
            const pValue = metrics.hosmer_lemeshow.p_value;
            const isGood = pValue >= 0.05;
            html += `<div class="diagnostic-item ${isGood ? 'diagnostic-good' : 'diagnostic-bad'}">`;
            html += `p = ${pValue.toFixed(4)} ${isGood ? '✓ Good calibration' : '⚠️ Poor calibration'}`;
            html += `</div>`;
            
            html += `</div></div>`;
        }
        
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
                    
                    if (isHigh) cls = 'diagnostic-bad';
                    else if (isModerate) cls = 'diagnostic-moderate';
                    
                    html += `<div class="diagnostic-item">`;
                    html += `<span class="diagnostic-item-label">${varName}:</span> `;
                    html += `<span class="${cls}">VIF = ${value.toFixed(2)}</span>`;
                    if (isHigh) html += ` <span class="diagnostic-bad">(high)</span>`;
                    else if (isModerate) html += ` <span class="diagnostic-moderate">(moderate)</span>`;
                    html += `</div>`;
                }
            }
            html += `</div></div>`;
        }
        
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
}

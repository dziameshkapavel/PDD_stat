// js/models/cox.js - Cox Regression Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

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
        this.setupCustomListeners(card);
        
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
    
    setupCustomListeners(card) {
        const typeBtns = card.querySelectorAll('.analysis-type');
        const methodBtns = card.querySelectorAll('.method-btn');
        const stepwisePGroup = card.querySelector('.stepwise-p-group');
        const stepwisePLabel = card.querySelector('.stepwise-p-label');
        const stepwisePInput = card.querySelector('.stepwise-p-input');
        
        card.covariateTypes = {};
        
        // Listen to changes in variables to update reference groups
        this.state.on('card:variables:updated', (data) => {
            if (data.cardId === card.id) {
                this.updateReferenceGroups(card);
            }
        });
        
        const updateStepwiseVis = () => {
            const activeType = (card.querySelector('.analysis-type.active') == null ? void 0 : card.querySelector('.analysis-type.active').dataset).type;
            const activeMethod = (card.querySelector('.method-btn.active') == null ? void 0 : card.querySelector('.method-btn.active').dataset).method;
            
            if (activeType === 'multivariate' && (activeMethod === 'forward' || activeMethod === 'backward')) {
                stepwisePGroup.classList.remove('hidden');
                if (activeMethod === 'forward') {
                    stepwisePLabel.textContent = 'P-value to enter';
                    stepwisePInput.value = '0.05';
                } else {
                    stepwisePLabel.textContent = 'P-value to remove';
                    stepwisePInput.value = '0.10';
                }
            } else {
                stepwisePGroup.classList.add('hidden');
            }
        };
        
        typeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                setTimeout(updateStepwiseVis, 50);
            });
        });
        
        methodBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                setTimeout(updateStepwiseVis, 50);
            });
        });
    }
    
    updateReferenceGroups(card) {
        const vars = this.state.getCardVariables(card.id);
        const covariates = vars.covariates ? Array.from(vars.covariates) : [];
        const variablesList = this.state.getVariableList();
        
        card.covariateTypes = card.covariateTypes || {};
        
        const typesWrapper = card.querySelector('.covariate-types-wrapper');
        const typesContainer = card.querySelector('.covariate-types-container');
        const refWrapper = card.querySelector('.reference-groups-wrapper');
        const refContainer = card.querySelector('.reference-groups-container');
        const adjustSelect = card.querySelector('.plot-adjust-select');
        
        // Save current selections to avoid resetting them
        const currentSelections = {};
        refContainer.querySelectorAll('.ref-group-item').forEach(item => {
            const vName = item.dataset.var;
            const sel = item.querySelector('.ref-group-select');
            if (sel) currentSelections[vName] = sel.value;
        });
        
        const currentAdjustSelection = adjustSelect ? adjustSelect.value : '';
        
        typesContainer.innerHTML = '';
        refContainer.innerHTML = '';
        let hasCategorical = false;
        
        if (adjustSelect) {
            adjustSelect.innerHTML = '<option value="">-- Baseline Only --</option>';
        }
        
        covariates.forEach(covName => {
            const varInfo = variablesList.find(v => v.name === covName);
            if (!varInfo) return;
            
            // Initialize type mapping if not set
            if (!card.covariateTypes[covName]) {
                card.covariateTypes[covName] = (varInfo.type === 'categorical' || varInfo.type === 'binary') ? 'categorical' : 'numeric';
            }
            
            const currentType = card.covariateTypes[covName];
            
            // Render type toggle button
            const tagBtn = document.createElement('button');
            tagBtn.className = currentType === 'categorical' ? 'btn-primary' : 'btn-secondary';
            tagBtn.textContent = `${covName} (${currentType === 'categorical' ? 'Cat' : 'Cont'})`;
            tagBtn.style.cssText = 'padding: 4px 10px; font-size: 12px; border-radius: 20px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; border: 1px solid var(--border-primary); margin-bottom: 2px;';
            tagBtn.type = 'button';
            tagBtn.onclick = (e) => {
                e.preventDefault();
                card.covariateTypes[covName] = (currentType === 'categorical' ? 'numeric' : 'categorical');
                this.updateReferenceGroups(card);
            };
            typesContainer.appendChild(tagBtn);
            
            // Add to adjusted plot select dropdown
            if (adjustSelect) {
                const opt = document.createElement('option');
                opt.value = covName;
                opt.textContent = covName;
                if (covName === currentAdjustSelection) opt.selected = true;
                adjustSelect.appendChild(opt);
            }
            
            // Render reference group selector if categorical
            if (currentType === 'categorical') {
                hasCategorical = true;
                const uniqueValues = varInfo.unique_values || ['0', '1'];
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'ref-group-item';
                itemDiv.dataset.var = covName;
                itemDiv.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom: 4px;';
                
                const label = document.createElement('span');
                label.style.cssText = 'font-size: 13px; color: var(--text-primary); font-weight: 500;';
                label.textContent = `${covName}:`;
                
                const select = document.createElement('select');
                select.className = 'form-input ref-group-select';
                select.style.cssText = 'width:150px; padding: 4px 8px; font-size:12px; height: auto; margin-bottom: 0;';
                
                uniqueValues.forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    if (currentSelections[covName] === String(val)) {
                        opt.selected = true;
                    }
                    select.appendChild(opt);
                });
                
                itemDiv.appendChild(label);
                itemDiv.appendChild(select);
                refContainer.appendChild(itemDiv);
            }
        });
        
        // Show/hide types wrapper
        if (covariates.length > 0) {
            typesWrapper.classList.remove('hidden');
        } else {
            typesWrapper.classList.add('hidden');
        }
        
        // Show/hide reference groups wrapper
        if (hasCategorical) {
            refWrapper.classList.remove('hidden');
        } else {
            refWrapper.classList.add('hidden');
        }
    }
    
    async run(card) {
        console.log('Running Cox analysis...');
        const params = this._getParameters(card);
        card.lastParams = params;
        
        console.log('Parameters:', params);
        
        if (!params.time_col || !params.event_col) {
            this.ui.modals.showAlert('Specify time and event variables');
            return;
        }
        
        const title = `Cox regression (${params.regression_type === 'uni' ? 'univariate' : 
                      params.regression_type === 'forward' ? 'forward selection' :
                      params.regression_type === 'backward' ? 'backward elimination' : 'multivariate'})`;
        
        const block = this.createResultsBlock(card, title);
        
        // Remove results-stats
        const statsDiv = block.querySelector('.results-stats');
        if (statsDiv) statsDiv.remove();
        
        // Show loading indicator
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
        
        // Collect reference groups
        const reference_groups = {};
        card.querySelectorAll('.ref-group-item').forEach(item => {
            const varName = item.dataset.var;
            const select = item.querySelector('.ref-group-select');
            if (select) {
                reference_groups[varName] = select.value;
            }
        });
        
        // Collect stepwise thresholds
        const pInput = card.querySelector('.stepwise-p-input');
        const pValue = pInput ? parseFloat(pInput.value) : 0.05;
        
        const plotAdjustSelect = card.querySelector('.plot-adjust-select');
        const plotAdjustVar = plotAdjustSelect ? plotAdjustSelect.value : '';
        
        const covariate_types = card.covariateTypes || {};
        
        return {
            time_col: vars.time || '',
            event_col: vars.event || '',
            covariates: vars.covariates ? Array.from(vars.covariates) : [],
            regression_type: regressionType,
            reference_groups,
            covariate_types,
            p_enter: regressionType === 'forward' ? pValue : 0.05,
            p_remove: regressionType === 'backward' ? pValue : 0.10,
            plot_adjust_var: plotAdjustVar,
            show_forest_plot: !!(card.querySelector('.plot-forest-check') && card.querySelector('.plot-forest-check').checked),
            show_survival_plot: !!(card.querySelector('.plot-survival-check') && card.querySelector('.plot-survival-check').checked),
            show_residuals_plot: !!(card.querySelector('.plot-residuals-check') && card.querySelector('.plot-residuals-check').checked)
        };
    }
    
    renderResults(block, result, card) {
        console.log('Rendering results...');
        
        const tableContainer = block.querySelector('.results-table-container');
        if (!tableContainer) {
            console.error('Table container not found');
            return;
        }
        
        // Create tabs
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
        
        if (titleSpan) {
            titleSpan.insertAdjacentElement('afterend', saveBtn);
        }
    }
    
    async savePredictions(card) {
        if (!card.lastParams) {
            this.ui.modals.showAlert('No model parameters available. Run analysis first.');
            return;
        }
        
        const columnName = prompt('Enter name for predicted risk column:', 'cox_risk');
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
                throw new Error(error || 'Failed to save predictions');
            }
            
            const data = await response.json();
            this.ui.modals.showAlert(`Predicted risk saved to column: ${columnName}\nNormalized risk saved to column: ${columnName}_norm`);
            
            if (data.columns) {
                this.state.setVariableList(data.columns);
            }
        } catch (error) {
            console.error('Failed to save predictions:', error);
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
    
    _renderStructuredResults(result, tablePane, diagnosticsPane, stepsPane) {
        const metrics = result.metrics;
        let html = '';
        
        // Render Formula Box
        if (metrics.equation_html) {
            html += `<div class="equation-box" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); padding: 16px; border-radius: var(--radius-md); text-align: center; margin-bottom: 20px; font-family: 'Outfit', 'Inter', monospace; font-size: 14px; box-shadow: var(--shadow-sm);">`;
            html += `<div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">Model Equation</div>`;
            html += `<div style="color: var(--text-primary); font-weight: 500; font-size: 15px; word-break: break-all;">${metrics.equation_html}</div>`;
            html += `</div>`;
        }
        
        if (result.table && result.table.length > 0) {
            html += '<table class="results-table"><thead><tr>';
            html += '<th>Variable</th><th>Beta</th><th>SE</th><th>z</th><th>HR</th><th>95% CI</th><th>p-value</th>';
            html += '</tr></thead><tbody>';
            
            result.table.forEach(row => {
                const isRef = row.is_reference;
                const rowStyle = isRef ? 'style="color: var(--text-muted); font-style: italic; background: rgba(0,0,0,0.01);"' : '';
                
                const betaVal = row.beta !== null ? row.beta.toFixed(3) : '';
                const seVal = row.se !== null ? row.se.toFixed(3) : '—';
                const zVal = row.z !== null ? row.z.toFixed(2) : '—';
                const hrVal = isRef ? '1.0' : (row.hr ? row.hr.toFixed(3) : '');
                const ciVal = isRef ? '—' : (row.ci || '');
                const pVal = isRef ? '—' : (row.p_value !== null ? row.p_value.toFixed(4) : '—');
                
                html += `<tr ${rowStyle}>
                    <td>${row.variable || ''}</td>
                    <td>${betaVal}</td>
                    <td>${seVal}</td>
                    <td>${zVal}</td>
                    <td><strong>${hrVal}</strong></td>
                    <td>${ciVal}</td>
                    <td>${pVal}</td>
                </tr>`;
            });
            
            html += '</tbody></table>';
        } else {
            html += '<p style="padding: 16px; color: var(--text-muted);">No table data available</p>';
        }
        
        tablePane.innerHTML = html;
        diagnosticsPane.innerHTML = this._renderDiagnostics(metrics);
        stepsPane.innerHTML = this._renderSteps(metrics);
    }
    
    _renderDiagnostics(metrics) {
        let html = '<div style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">';
        
        // Model Fit Card
        if (typeof metrics.aic === 'number') {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">Model Fit Metrics</h3>`;
            html += `<div class="diagnostic-card-content" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">`;
            html += `<div><span class="diagnostic-label" style="font-weight: 500; color: var(--text-secondary);">AIC:</span> <span class="diagnostic-value" style="font-weight: 600;">${metrics.aic.toFixed(2)}</span></div>`;
            html += `<div><span class="diagnostic-label" style="font-weight: 500; color: var(--text-secondary);">BIC:</span> <span class="diagnostic-value" style="font-weight: 600;">${metrics.bic.toFixed(2)}</span></div>`;
            html += `<div><span class="diagnostic-label" style="font-weight: 500; color: var(--text-secondary);">Log-Likelihood:</span> <span class="diagnostic-value" style="font-weight: 600;">${metrics.log_likelihood.toFixed(2)}</span></div>`;
            
            if (typeof metrics.global_p_value === 'number') {
                const sigCls = metrics.global_p_value < 0.05 ? 'diagnostic-good' : 'diagnostic-bad';
                const sigText = metrics.global_p_value < 0.05 ? 'Significant' : 'Not Significant';
                html += `<div><span class="diagnostic-label" style="font-weight: 500; color: var(--text-secondary);">Global LRT:</span> <span class="diagnostic-value ${sigCls}" style="font-weight: 600;">p = ${metrics.global_p_value.toFixed(4)}</span> <small class="${sigCls}">(${sigText})</small></div>`;
            }
            
            html += `</div></div>`;
        }
        
        // C-index
        if (typeof metrics.c_index === 'number') {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">Model Discrimination</h3>`;
            html += `<div class="diagnostic-card-content" style="margin-top: 8px;">`;
            html += `<span class="diagnostic-label" style="font-weight: 500; color: var(--text-secondary);">Concordance Index (C-index):</span> `;
            html += `<span class="diagnostic-value" style="font-weight: 600; font-size: 16px; margin-left: 5px;">${metrics.c_index.toFixed(4)}</span>`;
            
            if (metrics.c_index > 0.7) {
                html += `<div class="diagnostic-good" style="margin-top: 6px; font-weight: 500;">✓ Good predictive ability</div>`;
            } else if (metrics.c_index > 0.6) {
                html += `<div class="diagnostic-moderate" style="margin-top: 6px; font-weight: 500;">⚠ Moderate predictive ability</div>`;
            } else {
                html += `<div class="diagnostic-poor" style="margin-top: 6px; font-weight: 500; color: var(--accent-red);">⚠ Poor predictive ability</div>`;
            }
            
            html += `</div></div>`;
        }
        
        // Schoenfeld test
        if (metrics.schoenfeld_test && Object.keys(metrics.schoenfeld_test).length > 0) {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">Proportional Hazards Assumption (Schoenfeld)</h3>`;
            html += `<div class="diagnostic-card-content" style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">`;
            
            const globalTest = metrics.schoenfeld_test.GLOBAL;
            let hasViolations = false;
            
            if (globalTest) {
                const violated = globalTest.violated;
                if (violated) hasViolations = true;
                html += `<div class="diagnostic-item" style="border-bottom: 1px solid var(--border-primary); padding-bottom: 6px; margin-bottom: 4px; font-weight: 600; display: flex; justify-content: space-between;">`;
                html += `<span class="diagnostic-item-label">Global Model Test:</span>`;
                html += `<span class="${violated ? 'diagnostic-bad' : 'diagnostic-good'}">p = ${globalTest.p_value.toFixed(4)} ${violated ? '(violated)' : '(satisfied)'}</span>`;
                html += `</div>`;
            }
            
            for (const [varName, test] of Object.entries(metrics.schoenfeld_test)) {
                if (varName === 'GLOBAL') continue;
                if (test && typeof test === 'object' && typeof test.p_value === 'number') {
                    const violated = test.violated;
                    const pValue = test.p_value;
                    if (violated) hasViolations = true;
                    
                    html += `<div class="diagnostic-item" style="display: flex; justify-content: space-between; font-size: 13px;">`;
                    html += `<span class="diagnostic-item-label">${varName}:</span>`;
                    html += `<span class="${violated ? 'diagnostic-bad' : 'diagnostic-good'}">p = ${pValue.toFixed(4)}${violated ? ' (violated)' : ''}</span>`;
                    html += `</div>`;
                }
            }
            
            if (!hasViolations) {
                html += `<div class="diagnostic-good" style="margin-top: 8px; font-weight: 500;">✓ Proportional hazards assumption holds for all variables.</div>`;
            } else {
                html += `<div class="diagnostic-bad" style="margin-top: 8px; font-weight: 500;">⚠ Hazard proportionality violated. Consider stratifying or using time-varying coefficients.</div>`;
            }
            
            html += `</div></div>`;
        }
        
        // VIF
        if (metrics.vif && Object.keys(metrics.vif).length > 0) {
            html += `<div class="diagnostic-card">`;
            html += `<h3 class="diagnostic-card-title">Multicollinearity (VIF)</h3>`;
            html += `<div class="diagnostic-card-content" style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">`;
            
            let highMulticollinearity = false;
            
            for (const [varName, vif] of Object.entries(metrics.vif)) {
                if (vif && typeof vif === 'object' && typeof vif.value === 'number') {
                    const value = vif.value;
                    const isHigh = vif.high;
                    const isModerate = vif.moderate;
                    let cls = 'diagnostic-good';
                    
                    if (isHigh) {
                        cls = 'diagnostic-bad';
                        highMulticollinearity = true;
                    } else if (isModerate) {
                        cls = 'diagnostic-moderate';
                    }
                    
                    html += `<div class="diagnostic-item" style="display: flex; justify-content: space-between; font-size: 13px;">`;
                    html += `<span class="diagnostic-item-label">${varName}:</span>`;
                    html += `<span class="${cls}">VIF = ${value.toFixed(2)} ${isHigh ? '(high)' : (isModerate ? '(moderate)' : '')}</span>`;
                    html += `</div>`;
                }
            }
            
            if (highMulticollinearity) {
                html += `<div class="diagnostic-bad" style="margin-top: 8px; font-weight: 500;">⚠ High multicollinearity detected. Consider removing highly correlated predictors.</div>`;
            } else {
                html += `<div class="diagnostic-good" style="margin-top: 8px; font-weight: 500;">✓ No significant multicollinearity issues.</div>`;
            }
            
            html += `</div></div>`;
        }
        
        // Warnings
        if (metrics.warnings && metrics.warnings.length > 0) {
            html += `<div class="diagnostic-card" style="border-left: 3px solid var(--accent-orange);">`;
            html += `<h3 class="diagnostic-card-title" style="color: var(--accent-orange);">Warnings</h3>`;
            html += `<div class="diagnostic-card-content" style="margin-top: 8px;">`;
            metrics.warnings.forEach(w => {
                html += `<div class="diagnostic-item" style="color: var(--accent-orange); font-size: 13px; margin-bottom: 4px;">⚠ ${w}</div>`;
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
            html += '<h3 class="diagnostic-card-title">Stepwise Selection History</h3>';
            html += '<div class="diagnostic-card-content" style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">';
            
            metrics.model_steps.forEach(step => {
                const action = step.action === 'added' ? 'Added' : 'Removed';
                const actionClass = step.action === 'added' ? 'diagnostic-good' : 'diagnostic-bad';
                const pValue = typeof step.p_value === 'number' ? step.p_value.toFixed(4) : '-';
                
                html += `<div class="diagnostic-item" style="padding: 8px 0; border-bottom: 1px dashed var(--border-primary); display: flex; justify-content: space-between; font-size: 13px;">`;
                html += `<span><strong>Step ${step.step}:</strong> <span class="${actionClass}">${action}</span> <span style="font-family: monospace; background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px;">${step.variable}</span></span>`;
                html += `<span style="color: var(--text-muted);">LRT p = ${pValue}</span>`;
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
            if (line.startsWith('| Variable |') || line.startsWith('| Переменная |')) {
                inTable = true;
                const cells = line.split('|').filter(c => c.trim());
                headerHtml = '<tr>' + cells.map(c => `<th>${c.trim()}</th>`).join('') + '</tr>';
            } else if (inTable && line.startsWith('|') && !line.includes('---')) {
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

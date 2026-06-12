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
        this.setupCustomListeners(card);
        
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        const autoCheck = card.querySelector('.auto-c-check');
        const cInputRow = card.querySelector('.c-value-row');
        if (autoCheck && cInputRow) {
            const toggleCInput = () => cInputRow.style.display = autoCheck.checked ? 'none' : 'flex';
            autoCheck.addEventListener('change', toggleCInput);
            toggleCInput();
        }
        
        return card;
    }
    
    async run(card) {
        const params = this._getParameters(card);
        
        if (!params.target_col) {
            this.ui.modals.showAlert('Select target variable');
            return;
        }
        
        const title = params.auto_select_C ? 
            'LASSO Regression (auto C)' : 
            `LASSO Regression (C=${params.C_value})`;
        
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
            await this.displayPlots(block, 'lasso');
            
        } catch (error) {
            loadingDiv.remove();
            this._showError(block, error.message);
        }
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
        const covariates = vars.covariates ? Array.from(vars.covariates) : [];
        const variablesList = this.state.getVariableList();
        
        card.covariateTypes = card.covariateTypes || {};
        
        const typesWrapper = card.querySelector('.covariate-types-wrapper');
        const typesContainer = card.querySelector('.covariate-types-container');
        const refWrapper = card.querySelector('.reference-groups-wrapper');
        const refContainer = card.querySelector('.reference-groups-container');
        if (!typesWrapper || !typesContainer || !refWrapper || !refContainer) return;
        
        // Save current reference selections
        const currentSelections = {};
        refContainer.querySelectorAll('.ref-group-item').forEach(item => {
            const vName = item.dataset.var;
            const sel = item.querySelector('.ref-group-select');
            if (sel) currentSelections[vName] = sel.value;
        });
        
        typesContainer.innerHTML = '';
        refContainer.innerHTML = '';
        let hasCategorical = false;
        
        if (covariates.length === 0) {
            typesWrapper.classList.add('hidden');
            refWrapper.classList.add('hidden');
            return;
        }
        
        covariates.forEach(covName => {
            const varInfo = variablesList.find(v => v.name === covName);
            if (!varInfo) return;
            
            if (!card.covariateTypes[covName]) {
                card.covariateTypes[covName] = (varInfo.type === 'categorical' || varInfo.type === 'binary') ? 'categorical' : 'numeric';
            }
            
            const currentType = card.covariateTypes[covName];
            
            // Type toggle button
            const tagBtn = document.createElement('button');
            tagBtn.className = currentType === 'categorical' ? 'btn-primary' : 'btn-secondary';
            tagBtn.textContent = `${covName} (${currentType === 'categorical' ? 'Cat' : 'Cont'})`;
            tagBtn.style.cssText = 'padding: 4px 10px; font-size: 12px; border-radius: 20px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; border: 1px solid var(--border-primary); margin-bottom: 2px;';
            tagBtn.type = 'button';
            tagBtn.onclick = (e) => {
                e.preventDefault();
                card.covariateTypes[covName] = currentType === 'categorical' ? 'numeric' : 'categorical';
                this.updateReferenceGroups(card);
            };
            typesContainer.appendChild(tagBtn);
            
            // Reference group selector if categorical
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
        
        typesWrapper.classList.remove('hidden');
        refWrapper.classList.toggle('hidden', !hasCategorical);
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        const autoCheck = card.querySelector('.auto-c-check');
        const cInput = card.querySelector('.c-value-input');
        const covariate_types = card.covariateTypes || {};
        
        const plotCoef = card.querySelector('.plot-coef-check');
        const plotCv = card.querySelector('.plot-cv-check');
        const plotDca = card.querySelector('.plot-dca-check');
        const plotCal = card.querySelector('.plot-cal-check');
        
        // Collect reference groups
        const reference_groups = {};
        card.querySelectorAll('.ref-group-item').forEach(item => {
            const varName = item.dataset.var;
            const select = item.querySelector('.ref-group-select');
            if (select) {
                reference_groups[varName] = select.value;
            }
        });
        
        return {
            target_col: vars.target || '',
            covariates: vars.covariates ? Array.from(vars.covariates) : [],
            auto_select_C: autoCheck ? autoCheck.checked : true,
            C_value: cInput ? parseFloat(cInput.value) || 1.0 : 1.0,
            covariate_types,
            reference_groups,
            show_coef_plot: plotCoef ? plotCoef.checked : false,
            show_cv_plot: plotCv ? plotCv.checked : false,
            show_dca_plot: plotDca ? plotDca.checked : false,
            show_cal_plot: plotCal ? plotCal.checked : false
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

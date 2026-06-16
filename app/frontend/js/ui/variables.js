// js/ui/variables.js - Отображение списка переменных
export class VariablesPanel {
    constructor(state, onShowTable) {
        this.state = state;
        this.container = document.getElementById('variablesList');
        this.showTableBtn = document.getElementById('showTableBtn');
        this.onShowTable = onShowTable;
    }
    
    init() {
        this.setupListeners();
        this.state.on('variables:updated', () => this.render());
        this.state.on('field:activated', () => this.render());
        this.state.on('card:variables:updated', () => this.render());
    }
    
    setupListeners() {
        if (this.showTableBtn && this.onShowTable) {
            this.showTableBtn.addEventListener('click', () => this.onShowTable());
        }
    }
    
    render() {
        const variables = this.state.getVariableList();
        
        const activeField = this.state.getActiveField();
        console.log('=== VariablesPanel render ===');
        console.log('activeField:', activeField);
        console.log('vars count:', variables.length);
        
        let selectedVars = { target: null, time: null, covariates: new Set(), event: null, group: null, stratify: null };
        
        if (activeField && activeField.card) {
            selectedVars = this.state.getCardVariables(activeField.card.id);
        }
        
        this.container.innerHTML = variables.map(v => {
            let cls = 'variable-item';
            if (selectedVars.target === v.name) cls += ' target-selected';
            if (selectedVars.time === v.name) cls += ' time-selected';
            if (selectedVars.event === v.name) cls += ' event-selected';
            if (selectedVars.group === v.name) cls += ' group-selected';
            if (selectedVars.stratify === v.name) cls += ' stratify-selected';
            if (selectedVars.covariates && selectedVars.covariates.has(v.name)) cls += ' selected';
            
            const typeShort = v.type === 'numeric' ? 'num' : 
                            v.type === 'categorical' ? 'cat' : 
                            v.type === 'binary' ? 'bin' : 'str';
                            
            return `<div class="${cls}" data-var="${v.name}">
                <span class="var-type-badge">${typeShort}</span>
                <span class="var-name">${v.name}</span>
                <button class="var-label-btn" data-action="label" title="Chart labels">⚙</button>
                <button class="var-rename-btn" data-action="rename" title="Rename">✎</button>
                <button class="var-delete-btn" data-action="delete" title="Delete">✕</button>
            </div>`;
        }).join('');
        
        this.container.querySelectorAll('.variable-item').forEach(el => {
            el.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    const varName = el.dataset.var;
                    if (action === 'rename') {
                        const newName = prompt('Enter new name for variable:', varName);
                        if (newName && newName !== varName) {
                            this.state.renameVariable(varName, newName);
                        }
                    } else if (action === 'delete') {
                        if (confirm(`Delete variable "${varName}"?`)) {
                            this.state.deleteVariable(varName);
                        }
                    } else if (action === 'label') {
                        this._openLabelModal(varName);
                    }
                });
            });
            el.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                this.handleVariableClick(el.dataset.var); 
            });
        });
    }
    
    handleVariableClick(varName) {
        const activeField = this.state.getActiveField();
        
        console.log('=== handleVariableClick ===');
        console.log('varName:', varName);
        console.log('activeField:', activeField);
        console.log('activeField.field:', activeField ? activeField.field : null);
        
        if (!activeField) { 
            alert('First click on a field'); 
            return; 
        }
        
        const input = activeField.element;
        const field = activeField.field;
        const cardId = activeField.card.id;
        const vars = this.state.getCardVariables(cardId);
        
        if (field === 'covariates' || field === 'predictors' || field === 'exclusions') {
            if (vars[field].has(varName)) {
                vars[field].delete(varName);
            } else {
                vars[field].add(varName);
            }
            input.value = Array.from(vars[field]).join(', ');
        } else {
            if (vars[field] === varName) {
                vars[field] = null;
                input.value = '';
            } else {
                vars[field] = varName;
                input.value = varName;
            }
        }
        
        this.state.updateCardVariable(cardId, field, vars[field]);
    }
    
    async _openLabelModal(varName) {
        let labels = {};
        try {
            const resp = await fetch(`${window.API_BASE || 'http://127.0.0.1:8000/api'}/projects/labels`);
            const data = await resp.json();
            labels = data.labels[varName] || {};
        } catch (e) {}
        
        const chartName = labels.chart_name || '';
        const valueLabels = labels.value_labels || {};
        
        let uniqueValues = [];
        try {
            const response = await fetch(`${window.API_BASE || 'http://127.0.0.1:8000/api'}/projects/columns`);
            const data = await response.json();
            const varInfo = data.columns.find(c => c.name === varName);
            if (varInfo && varInfo.unique_values) {
                uniqueValues = varInfo.unique_values;
            }
        } catch (e) {
            uniqueValues = ['0', '1'];
        }
        
        if (!uniqueValues || uniqueValues.length === 0) {
            uniqueValues = ['0', '1'];
        }
        
        let valueInputs = '';
        valueInputs = `
            <div class="form-group">
                <label class="form-label">Value labels</label>
                ${uniqueValues.map(val => {
                    const strVal = String(val);
                    const savedLabel = valueLabels[strVal] || '';
                    return `
                        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                            <span style="min-width:40px;font-size:13px;">${strVal}:</span>
                            <input type="text" class="form-input label-val" data-val="${strVal}" 
                                   value="${savedLabel}" placeholder="Label for ${strVal}" style="flex:1;">
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'labelModal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px;">
                <div class="modal-header">
                    <h3>Variable Settings: ${varName}</h3>
                    <button class="modal-close" id="labelModalClose">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Original name</label>
                        <input type="text" class="form-input" value="${varName}" disabled style="width:100%;opacity:0.7;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Chart name</label>
                        <input type="text" class="form-input chart-name" value="${chartName}" placeholder="" style="width:100%;">
                    </div>
                    ${valueInputs}
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="labelModalCancel">Cancel</button>
                    <button class="btn-primary" id="labelModalSave">Save</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('#labelModalClose').addEventListener('click', () => modal.remove());
        modal.querySelector('#labelModalCancel').addEventListener('click', () => modal.remove());
        modal.querySelector('#labelModalSave').addEventListener('click', async () => {
            const newChartName = (modal.querySelector('.chart-name') == null ? void 0 : modal.querySelector('.chart-name').value) || '';
            const newValueLabels = {};
            
            modal.querySelectorAll('.label-val').forEach(input => {
                const val = input.dataset.val;
                const label = input.value;
                if (label) newValueLabels[val] = label;
            });
            
            try {
                await fetch(`${window.API_BASE || 'http://127.0.0.1:8000/api'}/projects/labels/${varName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chart_name: newChartName,
                        value_labels: newValueLabels
                    })
                });
            } catch (e) {
                console.error('Failed to save label:', e);
            }
            
            modal.remove();
        });
    }
}

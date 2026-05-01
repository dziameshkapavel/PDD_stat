// js/models/externalValidation.js - External Model Validation
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class ExternalValidationModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'external_validation';
        this.templatePrefix = 'extval';
        this.modelInfo = null;
    }
    
    createCard() {
        const template = document.getElementById('extValCardTemplate');
        if (!template) {
            console.error('External Validation card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `extval_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        
        const fileInput = card.querySelector('.model-file-input');
        const uploadBtn = card.querySelector('.upload-btn');
        
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => fileInput?.click());
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this._loadModelInfo(e, card));
        }
        
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        return card;
    }
    
    _loadModelInfo(event, card) {
        const file = event.target.files[0];
        if (!file) return;
        
        const container = card.querySelector('.mapping-container');
        if (container) {
            container.innerHTML = '<p style="margin:8px 0;">Loading model...</p>';
        }
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            fetch(`${API_BASE}/analysis/model/upload`, {
                method: 'POST',
                body: formData
            }).then(resp => resp.json()).then(data => {
                if (data.success) {
                    this.modelInfo = data.info;
                    this._renderMapping(card, data.info);
                } else {
                    if (container) {
                        container.innerHTML = '<p style="color:var(--accent-red);">Failed to load model</p>';
                    }
                }
            });
        } catch (e) {
            if (container) {
                container.innerHTML = '<p style="color:var(--accent-red);">Error: ' + e.message + '</p>';
            }
        }
    }
    
    _renderMapping(card, modelInfo) {
        const container = card.querySelector('.mapping-container');
        if (!container) return;
        
        const requiredFeatures = modelInfo.features || [];
        const existingFeatures = this.state.getVariableList();
        
        let html = '<div class="form-group" style="margin-top:12px;">';
        html += '<label class="form-label">Feature Mapping</label>';
        
        requiredFeatures.forEach(feat => {
            const matchingCols = existingFeatures.filter(c => 
                c.name && (c.name.toLowerCase() === feat.toLowerCase() ||
                c.name.toLowerCase().replace(/_/g, '') === feat.toLowerCase().replace(/_/g, ''))
            );
            const defaultVal = matchingCols[0]?.name || '';
            const enc = modelInfo.encodings?.[feat];
            
            html += `<div style="margin:4px 0;">`;
            html += `<div style="display:flex;align-items:center;gap:8px;">`;
            html += `<span style="min-width:120px;font-size:13px;">${feat}</span>`;
            html += `<select class="form-input feature-mapping" data-feature="${feat}" style="flex:1;">`;
            html += `<option value="">-- Select column --</option>`;
            existingFeatures.forEach(col => {
                const colName = col.name || col;
                const selected = colName === defaultVal ? 'selected' : '';
                html += `<option value="${colName}" ${selected}>${colName}</option>`;
            });
            html += `</select>`;
            html += `</div>`;
            
            if (enc) {
                const vals = Object.values(enc);
                const uniqVals = [...new Set(vals)];
                html += `<div style="font-size:11px;color:var(--text-muted);margin-left:128px;margin-top:4px;">`;
                html += `In model: ${uniqVals.join(', ')}`;
                html += `</div>`;
                for (const v of uniqVals) {
                    html += `<div style="display:flex;align-items:center;gap:8px;margin-left:128px;margin-top:2px;">`;
                    html += `<span style="min-width:30px;font-size:11px;">${v}</span>`;
                    html += `<span>=</span>`;
                    html += `<input type="text" class="form-input cat-map" data-orig="${feat}" data-model-key="${v}" placeholder="new data value" style="width:100px;font-size:11px;padding:3px 6px;">`;
                    html += `</div>`;
                }
            }
            
            html += `</div>`;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    async run(card) {
        if (!this.modelInfo) {
            this.ui.modals.showAlert('Load a model file first');
            return;
        }
        
        const targetCol = card.querySelector('.target-input')?.value?.trim();
        if (!targetCol) {
            this.ui.modals.showAlert('Select Target column');
            return;
        }
        
        const params = {
            target_col: targetCol,
            event_value: parseInt(card.querySelector('.event-value-select')?.value || 1),
            feature_map: {},
            category_mappings: {},
            model_path: this.modelInfo.model_path || ''
        };

        const container = card.querySelector('.mapping-container');
        if (container) {
            container.querySelectorAll('.feature-mapping').forEach(select => {
                if (select.dataset.feature && select.value) {
                    params.feature_map[select.dataset.feature] = select.value;
                }
            });
            
            container.querySelectorAll('.cat-map').forEach(input => {
                const feat = input.dataset.orig;
                const modelKey = input.dataset.modelKey;
                const newVal = input.value.trim();
                if (feat && modelKey && newVal) {
                    if (!params.category_mappings[feat]) params.category_mappings[feat] = {};
                    params.category_mappings[feat][modelKey] = newVal;
                }
            });
        }

        const block = this.createResultsBlock(card, 'External Validation');
        const resultsStats = block.querySelector('.results-stats');
        if (resultsStats) resultsStats.remove();
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'padding:16px;color:var(--text-muted);';
        loadingDiv.textContent = 'Validating...';
        block.appendChild(loadingDiv);

        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: this.templateName, params })
            });
            const result = await response.json();
            if (!result.success) {
                const errMsg = result.error || result.output || 'Unknown error';
                throw new Error(errMsg);
            }
            loadingDiv.remove();
            
            this.renderResults(block, result);
            await this.displayPlots(block, 'ext_val');
        } catch (e) {
            loadingDiv.remove();
            console.error('Validation error:', e);
            block.innerHTML = `<div style="padding:16px;color:var(--accent-red);">Error: ${e.message}</div>`;
        }
    }
    
    renderResults(block, result) {
        const tableContainer = block.querySelector('.results-table-container');
        if (!tableContainer) return;
        
        const output = result.output || '';
        
        const trainingMetrics = {};
        const trainSection = output.match(/### Training Metrics\s*\n([\s\S]*?)(?=###|$)/);
        if (trainSection) {
            trainSection[1].split('\n').forEach(line => {
                const match = /- ([^:]+):\s*([\d.]+)/.exec(line.trim());
                if (match) trainingMetrics[match[1].trim()] = parseFloat(match[2]);
            });
        }
        
        const valMetrics = result.metrics?.validation_metrics || {};
        
        const metricsToCompare = [
            ['Accuracy', 'accuracy'],
            ['Precision', 'precision'],
            ['Recall', 'recall'],
            ['F1', 'f1'],
            ['AUC', 'auc']
        ];
        
        let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:16px;">';
        
        html += '<div>';
        html += '<h4 style="margin:0 0 12px;">Training Metrics</h4>';
        html += '<table class="results-table"><tbody>';
        for (const [label, key] of metricsToCompare) {
            const val = trainingMetrics[key];
            if (val !== undefined) {
                html += `<tr><td>${label}</td><td style="font-weight:500;">${val.toFixed(4)}</td></tr>`;
            }
        }
        if (trainingMetrics.sensitivity !== undefined) {
            html += `<tr><td>Sensitivity</td><td style="font-weight:500;">${trainingMetrics.sensitivity.toFixed(4)}</td></tr>`;
        }
        if (trainingMetrics.specificity !== undefined) {
            html += `<tr><td>Specificity</td><td style="font-weight:500;">${trainingMetrics.specificity.toFixed(4)}</td></tr>`;
        }
        if (trainingMetrics.oob_score !== undefined) {
            html += `<tr><td>OOB Score</td><td style="font-weight:500;">${trainingMetrics.oob_score.toFixed(4)}</td></tr>`;
        }
        html += '</tbody></table></div>';
        
        html += '<div>';
        html += '<h4 style="margin:0 0 12px;">Validation Metrics</h4>';
        html += '<table class="results-table"><tbody>';
        for (const [label, key] of metricsToCompare) {
            const val = valMetrics[key];
            if (val !== undefined) {
                html += `<tr><td>${label}</td><td style="font-weight:500;color:var(--accent-green);">${val.toFixed(4)}</td></tr>`;
            }
        }
        if (valMetrics.brier !== undefined) {
            html += `<tr><td>Brier Score</td><td style="font-weight:500;">${valMetrics.brier.toFixed(4)}</td></tr>`;
        }
        if (valMetrics.n_samples !== undefined) {
            html += `<tr><td>Samples</td><td style="font-weight:500;">${valMetrics.n_samples}</td></tr>`;
        }
        html += '</tbody></table></div>';
        html += '</div>';
        
        if (valMetrics.tp !== undefined) {
            html += '<div style="padding:16px;border-top:1px solid var(--border-secondary);">';
            html += '<h4 style="margin:0 0 12px;">Confusion Matrix</h4>';
            html += '<table class="results-table" style="display:inline-block;"><tbody>';
            html += `<tr><td></td><td>Predicted 0</td><td>Predicted 1</td></tr>`;
            html += `<tr><td>Actual 0</td><td>TN: ${valMetrics.tn}</td><td>FP: ${valMetrics.fp}</td></tr>`;
            html += `<tr><td>Actual 1</td><td>FN: ${valMetrics.fn}</td><td>TP: ${valMetrics.tp}</td></tr>`;
            html += '</tbody></table></div>';
        }
        
        tableContainer.innerHTML = html;
        
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
}
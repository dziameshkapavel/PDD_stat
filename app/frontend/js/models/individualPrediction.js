// js/models/individualPrediction.js
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class IndividualPredictionModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'individual_prediction';
        this.templatePrefix = 'shap_waterfall';
        this.modelInfo = null;
    }

    createCard() {
        const template = document.getElementById('indPredCardTemplate');
        if (!template) return null;
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `indpred_${Date.now()}`;
        this.ui.panels.addCard(card);

        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));

        const fileInput = card.querySelector('.model-file-input');
        const uploadBtn = card.querySelector('.upload-btn');
        
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => fileInput?.click());
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this._loadModel(e, card));
        }
        
        return card;
    }

    async _loadModel(event, card) {
        const file = event.target.files[0];
        if (!file) return;
        
        const container = card.querySelector('.patient-form');
        if (container) container.innerHTML = '<p style="margin:8px;">Loading model...</p>';
        
        const formData = new FormData();
        formData.append('file', file);
        try {
            const resp = await fetch(`${API_BASE}/analysis/model/upload`, { method: 'POST', body: formData });
            const data = await resp.json();
            if (data.success) {
                this.modelInfo = data.info;
                this._renderPatientForm(card, data.info);
            } else {
                if (container) container.innerHTML = '<p style="color:var(--accent-red);">Failed to load model</p>';
            }
        } catch (e) {
            console.error(e);
            if (container) container.innerHTML = `<p style="color:var(--accent-red);">Error: ${e.message}</p>`;
        }
    }

    _renderPatientForm(card, modelInfo) {
        const container = card.querySelector('.patient-form');
        if (!container) return;
        const features = modelInfo.features || [];
        const encodings = modelInfo.encodings || {};
        let html = '';
        features.forEach(feat => {
            const enc = encodings[feat];
            html += `<div class="form-group">`;
            html += `<label class="form-label">${feat}</label>`;
            if (enc) {
                const vals = Object.values(enc);
                const uniqVals = [...new Set(vals)];
                html += `<div style="display:flex;gap:8px;flex-wrap:wrap;">`;
                uniqVals.forEach((v, i) => {
                    html += `<label style="font-size:13px;"><input type="radio" name="feat_${feat}" value="${v}" ${i===0?'checked':''}> ${v}</label>`;
                });
                html += `</div>`;
            } else {
                html += `<input type="number" class="form-input patient-val" data-feat="${feat}" placeholder="Enter value" style="width:100%;">`;
            }
            html += `</div>`;
        });
        container.innerHTML = html;
    }

    async run(card) {
        if (!this.modelInfo) { this.ui.modals.showAlert('Load a model file first'); return; }

        const patientData = {};
        card.querySelectorAll('.patient-val').forEach(input => {
            if (input.value) patientData[input.dataset.feat] = input.value;
        });
        card.querySelectorAll('input[type=radio]:checked').forEach(radio => {
            const feat = radio.name.replace('feat_', '');
            patientData[feat] = radio.value;
        });

        const params = {
            model_path: this.modelInfo.model_path || '',
            patient_data: patientData
        };

        const block = this.createResultsBlock(card, 'Individual Prediction');
        block.querySelector('.results-stats')?.remove();
        const loadingDiv = this._showLoading(block);
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: this.templateName, params })
            });
            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            loadingDiv.remove();
            this.renderResults(block, result);
            await this.displayPlots(block, 'shap_waterfall');
        } catch (e) { loadingDiv.remove(); this._showError(block, e.message); }
    }

    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        const m = result.metrics || {};
        const predClass = m.prediction === 1 ? 'POSITIVE' : 'NEGATIVE';
        const prob = (m.probability * 100).toFixed(1);
        container.innerHTML = `
            <div style="padding:16px;display:flex;flex-direction:column;gap:16px;">
                <div class="diagnostic-card">
                    <h3 class="diagnostic-card-title">Prediction</h3>
                    <div class="diagnostic-card-content" style="text-align:center;">
                        <div style="font-size:48px;font-weight:700;color:var(--accent-blue);">${prob}%</div>
                        <div style="font-size:16px;color:var(--text-muted);">${predClass}</div>
                    </div>
                </div>
            </div>`;
        this._setupHeaderButtons(block);
    }

    _setupHeaderButtons(block) {
        const toggleBtn = block.querySelector('.charts-toggle-btn');
        if (toggleBtn) toggleBtn.onclick = () => {
            const plotsDiv = block.querySelector('.results-plots');
            if (plotsDiv) { plotsDiv.classList.toggle('hidden'); toggleBtn.textContent = plotsDiv.classList.contains('hidden') ? 'Show Charts' : 'Hide Charts'; }
        };
    }
    _showLoading(block) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted);'; d.innerHTML = '<em>Predicting...</em>'; block.appendChild(d); return d; }
    _showError(block, msg) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;color:var(--accent-red);'; d.innerHTML = `Error: ${msg}`; block.appendChild(d); }
}

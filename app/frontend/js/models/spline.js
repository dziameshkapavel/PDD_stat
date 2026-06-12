// js/models/spline.js - Spline Analysis
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class SplineModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'spline_analysis';
        this.templatePrefix = 'spline';
    }
    
    createCard() {
        const template = document.getElementById('splineCardTemplate');
        if (!template) {
            console.error('Spline card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `spline_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        this._setupRadioButtons(card);
        
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        return card;
    }
    
    _setupRadioButtons(card) {
        const binaryRadio = card.querySelector('.outcome-binary');
        const survivalRadio = card.querySelector('.outcome-survival');
        const binaryInputs = card.querySelector('.binary-inputs');
        const survivalInputs = card.querySelector('.survival-inputs');
        
        binaryRadio && binaryRadio.addEventListener('change', () => {
            binaryInputs.style.display = 'block';
            survivalInputs.style.display = 'none';
        });
        
        survivalRadio && survivalRadio.addEventListener('change', () => {
            binaryInputs.style.display = 'none';
            survivalInputs.style.display = 'block';
        });
    }
    
    async run(card) {
        const params = this._getParameters(card);
        
        if (!params.variable) {
            this.ui.modals.showAlert('Select variable of interest');
            return;
        }
        
        const isSurvival = params.time_col && params.event_col;
        const isBinary = params.target_col;
        
        if (!isSurvival && !isBinary) {
            this.ui.modals.showAlert('Specify either binary target or time+event');
            return;
        }
        
        const title = `Spline Analysis (${params.knot_type})`;
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
            await this.displayPlots(block, 'spline');
            
        } catch (error) {
            loadingDiv.remove();
            this._showError(block, error.message);
        }
    }
    
    renderResults(block, result) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const output = result.output || '';
        const lines = output.split('\n');
        
        // Извлекаем таблицу
        let tableRows = [];
        let inTable = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('| Segment | Knot | HR |') || trimmed.includes('| Segment | Knot | OR |')) {
                inTable = true;
                continue;
            }
            if (inTable) {
                if (trimmed.includes('|---')) continue;
                if (trimmed.startsWith('|')) {
                    const cells = trimmed.split('|').filter(c => c.trim() !== '');
                    if (cells.length >= 3) tableRows.push(cells.map(c => c.trim()));
                } else if (tableRows.length > 0 && !trimmed.startsWith('|')) {
                    break;
                }
            }
        }
        
        // Извлекаем ключевую информацию
        let model = '', variable = '', outcome = '', knots = '';
        let adjusted = '';
        let nonlinTest = '', nonlinConclusion = '';
        
        for (const line of lines) {
            if (line.startsWith('**Variable:**')) variable = line;
            if (line.startsWith('**Model:**')) model = line;
            if (line.startsWith('**Outcome:**')) outcome = line;
            if (line.startsWith('**Knots:**')) knots = line;
            if (line.startsWith('**Adjusted for:**')) adjusted = line;
            if (line.startsWith('**Non-linearity test:**')) nonlinTest = line;
            if (line.startsWith('**Conclusion:**')) nonlinConclusion = line;
        }
        
        let html = '';
        
        // Info card
        html += '<div class="diagnostic-card" style="margin-bottom:16px;">';
        html += '<div class="diagnostic-card-content">';
        if (variable) html += `<div class="diagnostic-item">${variable.replace(/\*\*/g, '')}</div>`;
        if (model) html += `<div class="diagnostic-item">${model.replace(/\*\*/g, '')}</div>`;
        if (outcome) html += `<div class="diagnostic-item">${outcome.replace(/\*\*/g, '')}</div>`;
        if (knots) html += `<div class="diagnostic-item">${knots.replace(/\*\*/g, '')}</div>`;
        if (adjusted) html += `<div class="diagnostic-item">${adjusted.replace(/\*\*/g, '')}</div>`;
        html += '</div></div>';
        
        // Table
        if (tableRows.length > 0) {
            html += '<div class="diagnostic-card" style="margin-bottom:16px;">';
            html += '<h3 class="diagnostic-card-title">Spline Segments</h3>';
            html += '<div class="diagnostic-card-content">';
            html += '<table class="results-table"><thead><tr>';
            tableRows[0].forEach(h => html += `<th>${h}</th>`);
            html += '</tr></thead><tbody>';
            
            for (let i = 1; i < tableRows.length; i++) {
                html += '<tr>';
                tableRows[i].forEach(cell => html += `<td>${cell}</td>`);
                html += '</tr>';
            }
            
            html += '</tbody></table></div></div>';
        }
        
        // Non-linearity test
        html += '<div class="diagnostic-card">';
        html += '<div class="diagnostic-card-content">';
        if (nonlinTest) {
            const isSig = nonlinTest.includes('**');
            html += `<div class="diagnostic-item ${isSig ? 'diagnostic-good' : ''}">${nonlinTest.replace(/\*\*/g, '')}</div>`;
        }
        if (nonlinConclusion) {
            html += `<div class="diagnostic-item">${nonlinConclusion.replace(/\*\*/g, '')}</div>`;
        }
        html += '</div></div>';
        
        container.innerHTML = html;
        this._setupHeaderButtons(block);
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
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        const isSurvival = (card.querySelector('.outcome-survival') == null ? void 0 : card.querySelector('.outcome-survival').checked);
        const knotRadios = card.querySelectorAll('.knot-radio');
        let knotType = 'median';
        knotRadios.forEach(r => { if (r.checked) knotType = r.value; });
        const customInput = card.querySelector('.custom-knot');
        
        return {
            variable: vars.variable || '',
            target_col: isSurvival ? '' : (vars.target || ''),
            time_col: isSurvival ? (vars.time || '') : '',
            event_col: isSurvival ? (vars.event || '') : '',
            covariates: vars.covariates ? Array.from(vars.covariates) : [],
            knot_type: knotType,
            custom_knot: knotType === 'custom' ? parseFloat(customInput && customInput.value) || 0 : 0
        };
    }
    
    _showLoading(block) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted);'; d.innerHTML = '<em>Running...</em>'; block.appendChild(d); return d; }
    _showError(block, msg) { const d = document.createElement('div'); d.style.cssText = 'padding:16px;color:var(--accent-red);'; d.innerHTML = `Error: ${msg}`; block.appendChild(d); }
}

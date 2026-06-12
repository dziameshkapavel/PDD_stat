// js/models/chartBuilder.js - Chart Builder Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class ChartBuilderModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'chart_builder';
        this.templatePrefix = 'chart_builder';
    }
    
    createCard() {
        const template = document.getElementById('chartBuilderCardTemplate');
        if (!template) return null;
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `chartbuilder_${Date.now()}`;
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        
        // Chart type change
        const typeSelect = card.querySelector('.chart-type-select');
        const yGroup = card.querySelector('.y-group');
        const groupGroup = card.querySelector('.group-group');
        const histParams = card.querySelector('.hist-params');
        const scatterParams = card.querySelector('.scatter-params');
        
        const updateFields = () => {
            const type = typeSelect && typeSelect.value || 'histogram';
            yGroup.style.display = (type === 'scatter') ? 'block' : 'none';
            groupGroup.style.display = (type === 'histogram') ? 'none' : 'block';
            histParams.style.display = (type === 'histogram') ? 'block' : 'none';
            scatterParams.style.display = (type === 'scatter') ? 'block' : 'none';
        };
        
        typeSelect && typeSelect.addEventListener('change', updateFields);
        updateFields();
        
        // Chart Axes toggle
        const chartAxesBtn = card.querySelector('.chart-axes-btn');
        const axesRow = card.querySelector('.chart-axes-row');
        if (chartAxesBtn && axesRow) {
            axesRow.style.display = 'none';
            chartAxesBtn.classList.remove('active');
            chartAxesBtn.addEventListener('click', () => {
                chartAxesBtn.classList.toggle('active');
                axesRow.style.display = chartAxesBtn.classList.contains('active') ? 'flex' : 'none';
            });
        }
        
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        return card;
    }
    
    async run(card) {
        const params = this._getParameters(card);
        
        if (!params.x_col) {
            this.ui.modals.showAlert('Select X variable');
            return;
        }
        if (params.chart_type === 'scatter' && !params.y_col) {
            this.ui.modals.showAlert('Select Y variable for scatter plot');
            return;
        }
        
        const block = this.createResultsBlock(card, `Chart: ${params.chart_type}`);
        (block.querySelector('.results-stats') == null ? void 0 : block.querySelector('.results-stats').remove());
        const loadingDiv = this._showLoading(block);
        
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: this.templateName, params })
            });
            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            loadingDiv.remove();
            await this.displayPlots(block, 'chart_builder');
        } catch (e) {
            loadingDiv.remove();
            this._showError(block, e.message);
        }
    }
    
    _getParameters(card) {
        const vars = this.state.getCardVariables(card.id);
        const chartType = (card.querySelector('.chart-type-select') == null ? void 0 : card.querySelector('.chart-type-select').value) || 'histogram';
        
        const axesRow = card.querySelector('.chart-axes-row');
        let title = '', xLabel = '', yLabel = '';
        if (axesRow && axesRow.style.display !== 'none') {
            title = (card.querySelector('.title-input') == null ? void 0 : card.querySelector('.title-input').value) || '';
            xLabel = (card.querySelector('.x-label-input') == null ? void 0 : card.querySelector('.x-label-input').value) || '';
            yLabel = (card.querySelector('.y-label-input') == null ? void 0 : card.querySelector('.y-label-input').value) || '';
        }
        
        return {
            chart_type: chartType,
            x_col: vars.x || '',
            y_col: vars.y || '',
            group_col: vars.group || '',
            bins: parseInt((card.querySelector('.bins-input') == null ? void 0 : card.querySelector('.bins-input').value)) || 20,
            show_kde: (card.querySelector('.kde-check') == null ? void 0 : card.querySelector('.kde-check').checked) || false,
            show_regline: (card.querySelector('.regline-check') == null ? void 0 : card.querySelector('.regline-check').checked) || false,
            title: title,
            x_label: xLabel,
            y_label: yLabel,
        };
    }
    
    _showLoading(block) {
        const d = document.createElement('div');
        d.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted);';
        d.innerHTML = '<em>Building chart...</em>';
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

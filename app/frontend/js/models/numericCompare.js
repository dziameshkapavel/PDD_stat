// js/models/numericCompare.js - Numeric Comparison Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class NumericCompareModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'numeric';
        this.templatePrefix = 'numericCompare';
    }
    
    createCard() {
        const template = document.getElementById('numericCompareCardTemplate');
        if (!template) {
            console.error('Numeric compare card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `numeric_${Date.now()}`;
        
        this.ui.panels.addCard(card);
        this.setupFieldListeners(card);
        
        card.querySelector('.run-btn').addEventListener('click', () => this.run(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));
        
        return card;
    }
    
    async run(card) {
        if (!card || !card.id) {
            this.ui.modals.showAlert('Card error');
            return;
        }
        
        const vars = this.state.getCardVariables(card.id);
        
        if (!vars.value) {
            this.ui.modals.showAlert('Select value variable first');
            return;
        }
        if (!vars.group) {
            this.ui.modals.showAlert('Select group variable first');
            return;
        }
        
        const title = `Numeric comparison (${vars.value} by ${vars.group})`;
        const block = this.createResultsBlock(card, title);
        
        const loadingDiv = this._showLoading(block);
        
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    template: 'numeric_compare',
                    params: { value: vars.value, group: vars.group }
                })
            });
            
            if (!response.ok) throw new Error(await response.text() || 'Analysis failed');
            
            const result = await response.json();
            loadingDiv.remove();
            
            if (!result.success) {
                this._showError(block, result.error || 'Analysis failed');
                return;
            }
            
            this.renderResults(block, result, vars.value, vars.group);
            await this.displayPlots(block);
            
        } catch (error) {
            loadingDiv.remove();
            this._showError(block, error.message);
        }
    }
    
    renderResults(block, result, valueName, groupName) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const output = result.output || '';
        container.innerHTML = this._parseOutput(output, valueName, groupName);
    }
    
    _parseOutput(output, valueName, groupName) {
        const lines = output.split('\n');
        let html = '';
        let inSection = '';
        let tableRows = [];
        let inTable = false;
        let tableAlign = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('### ')) {
                if (inSection && tableRows.length > 0) {
                    html += this._renderSimpleTable(tableRows, inSection);
                    tableRows = [];
                }
                inSection = line.replace('### ', '').trim();
                inTable = false;
                
                if (inSection === 'Descriptive Statistics') {
                    html += '<div class="diagnostic-card"><h3 class="diagnostic-card-title">Descriptive Statistics</h3>';
                } else if (inSection === 'Statistical Tests') {
                    html += '</div><div class="diagnostic-card"><h3 class="diagnostic-card-title">Statistical Tests</h3>';
                } else if (inSection === 'Normality Tests') {
                    html += '</div><div class="diagnostic-card"><h3 class="diagnostic-card-title">Normality Tests</h3>';
                } else if (inSection === 'Homogeneity of Variances') {
                    html += '</div><div class="diagnostic-card"><h3 class="diagnostic-card-title">Homogeneity of Variances</h3>';
                } else {
                    html += '</div><div class="diagnostic-card"><h3 class="diagnostic-card-title">' + inSection + '</h3>';
                }
            } else if (line.startsWith('**')) {
                const isSignificant = line.includes('significant') || line.includes('p < 0.05');
                const cls = isSignificant ? 'diagnostic-item diagnostic-good' : 'diagnostic-item';
                html += `<div class="${cls}">${this._mdToHtml(line)}</div>`;
            } else if (line.startsWith('|') && !line.includes('---')) {
                const cells = line.split('|').filter(c => c.trim());
                if (cells.length > 0) {
                    tableRows.push({ cells });
                }
            } else if (line.includes('---')) {
                if (tableRows.length > 0) {
                    html += this._renderSimpleTable(tableRows, inSection);
                    tableRows = [];
                }
            } else if (line.trim() === '') {
                if (tableRows.length > 0) {
                    html += this._renderSimpleTable(tableRows, inSection);
                    tableRows = [];
                }
                inTable = false;
            }
        }
        
        if (tableRows.length > 0) {
            html += this._renderSimpleTable(tableRows, inSection);
        }
        
        return html;
    }
    
    _renderSimpleTable(rows, sectionName) {
        if (rows.length === 0) return '';
        
        let h = `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;">`;
        h += '<thead><tr>';
        
        rows[0].cells.forEach((cell) => {
            h += `<th style="padding:8px;text-align:center;border-bottom:2px solid var(--border-primary);">${cell.trim()}</th>`;
        });
        h += '</tr></thead><tbody>';
        
        for (let idx = 1; idx < rows.length; idx++) {
            const row = rows[idx].cells;
            h += '<tr>';
            row.forEach((cell) => {
                h += `<td style="padding:8px;text-align:center;">${cell.trim()}</td>`;
            });
            h += '</tr>';
        }
        
        h += '</tbody></table>';
        return h;
    }
    
    async displayPlots(block) {
        try {
            const response = await fetch(`${API_BASE}/analysis/charts`);
            const data = await response.json();
            
            const matching = data.charts
                .filter(c => c.startsWith(this.templatePrefix))
                .sort()
                .reverse();
            
            if (matching.length > 0) {
                const plotsDiv = block.querySelector('.results-plots');
                if (plotsDiv) {
                    plotsDiv.innerHTML = '';
                    const chartFile = matching[0];
                    const img = document.createElement('img');
                    img.src = `/plots/${chartFile}`;
                    img.style.width = '100%';
                    img.style.height = 'auto';
                    img.style.borderRadius = '8px';
                    img.style.border = '1px solid var(--border-primary)';
                    plotsDiv.appendChild(img);
                    
                    const toggleBtn = block.querySelector('.charts-toggle-btn');
                    if (toggleBtn) {
                        toggleBtn.style.display = 'inline-block';
                        toggleBtn.onclick = () => {
                            plotsDiv.classList.toggle('hidden');
                            toggleBtn.textContent = plotsDiv.classList.contains('hidden') ? 'Show Charts' : 'Hide Charts';
                        };
                    }
                }
            }
        } catch (e) {
            console.log('No plots for numeric comparison');
        }
    }
    
    _mdToHtml(md) {
        return md
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.*?)`/g, '<code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;">$1</code>');
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
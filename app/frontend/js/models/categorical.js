// js/models/categorical.js - Categorical Comparison Model
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class CategoricalModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'categorical';
        this.templatePrefix = 'categorical';
    }
    
    createCard() {
        const template = document.getElementById('categoricalCardTemplate');
        if (!template) {
            console.error('Categorical card template not found');
            return null;
        }
        
        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `categorical_${Date.now()}`;
        
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
        
        if (!vars.col1) {
            this.ui.modals.showAlert('Select first variable first');
            return;
        }
        if (!vars.col2) {
            this.ui.modals.showAlert('Select second variable first');
            return;
        }
        
        const title = `Categorical comparison (${vars.col1} vs ${vars.col2})`;
        const block = this.createResultsBlock(card, title);
        (block.querySelector('.results-stats') == null ? void 0 : block.querySelector('.results-stats').remove());
        
        const loadingDiv = this._showLoading(block);
        
        try {
            const response = await fetch(`${API_BASE}/analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    template: 'categorical',
                    params: { col1: vars.col1, col2: vars.col2 }
                })
            });
            
            if (!response.ok) throw new Error(await response.text() || 'Analysis failed');
            
            const result = await response.json();
            loadingDiv.remove();
            
            if (!result.success) {
                this._showError(block, result.error || 'Analysis failed');
                return;
            }
            
            this.renderResults(block, result, vars.col1, vars.col2);
            await this.displayPlots(block);
            
        } catch (error) {
            loadingDiv.remove();
            this._showError(block, error.message);
        }
    }
    
    renderResults(block, result, col1Name, col2Name) {
        const container = block.querySelector('.results-table-container');
        if (!container) return;
        
        const output = result.output || '';
        container.innerHTML = this._parseOutput(output, col1Name, col2Name);
    }
    
    _parseOutput(output, col1Name, col2Name) {
        const lines = output.split('\n');
        let html = '';
        let contingencyRows = [];
        let tableAlign = [];
        let inTable = false;
        let skipSection = false;
        let inCard = false;
        let testHtml = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('### ')) {
                const section = line.replace('### ', '').trim();
                if (section === 'Expected Frequencies (%)' || section === 'Expected Frequencies') {
                    skipSection = true;
                    continue;
                }
                skipSection = false;
                inTable = false;
                tableAlign = [];
                
                if (section === 'Contingency Table') {
                    if (inCard) html += '</div>';
                    inCard = true;
                    html += '<div class="diagnostic-card"><h3 class="diagnostic-card-title">Contingency Table</h3>';
                } else {
                    if (inCard) html += '</div>';
                    inCard = true;
                    testHtml += '<div class="diagnostic-card"><h3 class="diagnostic-card-title">Test Results</h3>';
                }
            } else if (line.startsWith('**Test selected:**') || line.startsWith('**Chi') || line.startsWith('**Odds') || line.startsWith('**Result:**') || line.startsWith('**Conclusion:**') || line.startsWith('**Total observations:**') || line.startsWith('**Table size:**') || line.startsWith('**Minimum expected')) {
                const cls = line.startsWith('**Conclusion:**') && output.includes('Statistically significant') ? 'diagnostic-item diagnostic-good' : 'diagnostic-item';
                testHtml += `<div class="${cls}">${this._mdToHtml(line)}</div>`;
            } else if (line.startsWith('|') && !skipSection) {
                const cells = line.split('|').filter(c => c.trim());
                if (line.includes('---')) {
                    tableAlign = cells.map(c => c.trim().startsWith(':') ? 'left' : 'right');
                    inTable = true;
                } else if (tableAlign.length === 0) {
                    contingencyRows.push({ cells });
                } else {
                    contingencyRows.push({ cells });
                }
            } else if (line.trim() === '' && inTable) {
                if (contingencyRows.length > 0) {
                    html += this._renderSimpleTable(contingencyRows, col1Name, col2Name);
                    contingencyRows = [];
                }
                inTable = false;
            } else if (line.startsWith('**Odds Ratio')) {
                testHtml += `<div class="diagnostic-item" style="margin-left:16px;">${this._mdToHtml(line)}</div>`;
            } else if (line.includes('---') && !line.startsWith('|') && !skipSection) {
                if (inCard) {
                    html += '</div>';
                    testHtml += '</div>';
                    inCard = false;
                }
            }
        }
        
        return html + testHtml;
    }
    
    _renderSimpleTable(rows, col1Name, col2Name) {
        if (rows.length === 0) return '';
        
        const headerCols = rows[0].cells;
        
        let h = `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;">`;
        h += '<thead><tr>';
        h += `<th style="padding:8px;border-bottom:2px solid var(--border-primary);">${col1Name}</th>`;
        headerCols.slice(1).forEach((cell) => {
            h += `<th style="padding:8px;text-align:center;border-bottom:2px solid var(--border-primary);">${col2Name} = ${cell.trim()}</th>`;
        });
        h += '</tr></thead><tbody>';
        
        for (let idx = 1; idx < rows.length; idx++) {
            const row = rows[idx].cells;
            h += '<tr>';
            h += `<td style="padding:8px;font-weight:500;">${row[0].trim()}</td>`;
            row.slice(1).forEach((cell) => {
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
                .sort();
            
            if (matching.length > 0) {
                const plotsDiv = block.querySelector('.results-plots');
                if (plotsDiv) {
                    plotsDiv.innerHTML = '';
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:16px;';
                    matching.forEach(chartFile => {
                        const img = document.createElement('img');
                        img.src = `/plots/${chartFile}`;
                        img.style.width = '100%';
                        img.style.height = 'auto';
                        img.style.borderRadius = '8px';
                        img.style.border = '1px solid var(--border-primary)';
                        wrapper.appendChild(img);
                    });
                    plotsDiv.appendChild(wrapper);
                    
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
            console.log('No plots for categorical');
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
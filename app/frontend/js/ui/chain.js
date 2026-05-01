// js/ui/chain.js - Chain tab for analysis history

import { API_BASE } from '../core/api.js';

export class ChainPanel {
    constructor() {
        this.container = null;
        this.chainItems = [];
        this.scrollPosition = 0;
    }

    init() {
        const chainTab = document.querySelector('[data-tab="chain"]');
        if (!chainTab) return;

        chainTab.addEventListener('click', () => {
            this._loadHistory();
        });

        const chainPanel = document.getElementById('tabChain');
        if (!chainPanel) return;

        this.container = chainPanel;
        this._buildUI();
        this._loadHistory();
    }

    _buildUI() {
        this.container.innerHTML = `
            <div style="display:flex;flex-direction:column;height:100%;">
                <div class="chain-list" id="chainList" style="flex:1;overflow-y:auto;padding:8px 0;"></div>
            </div>
        `;
    }

    async _loadHistory() {
        try {
            const response = await fetch(`${API_BASE}/analysis/history?limit=200`);
            const data = await response.json();
            const history = (data.history || []).filter(h => h.template !== 'ai_chat');
            
            this.chainItems = history.reverse();
            this._render();
        } catch (e) {
            console.error('Failed to load chain:', e);
        }
    }

    _render() {
        const list = this.container?.querySelector('#chainList');
        if (!list) return;

        list.innerHTML = '';

        if (this.chainItems.length === 0) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">No analyses yet</div>';
            return;
        }

        this.chainItems.forEach((item, index) => {
            const el = this._createChainItem(item, index);
            list.appendChild(el);
        });

        list.scrollTop = list.scrollHeight;
    }

    _createChainItem(item, index) {
        const el = document.createElement('div');
        el.className = 'chain-item';
        el.style.cssText = `
            display:flex;align-items:center;padding:10px 16px;cursor:pointer;
            border-bottom:1px solid var(--border-primary);
            transition:background 0.15s ease;
        `;

        const typeColor = this._getTypeColor(item.template);

        const dot = document.createElement('span');
        dot.style.cssText = `
            width:8px;height:8px;border-radius:50%;background:${typeColor};
            margin-right:12px;flex-shrink:0;
        `;
        el.appendChild(dot);

        const text = document.createElement('div');
        text.style.cssText = 'flex:1;min-width:0;';
        
        const title = document.createElement('div');
        title.style.cssText = 'font-size:13px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        title.textContent = item.title || item.template;
        text.appendChild(title);

        const time = document.createElement('div');
        time.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:2px;';
        const ts = (item.timestamp || '').substring(11, 16);
        time.textContent = ts;
        text.appendChild(time);

        el.appendChild(text);

        el.addEventListener('mouseenter', () => { el.style.background = 'var(--bg-hover)'; });
        el.addEventListener('mouseleave', () => { el.style.background = 'transparent'; });
        el.addEventListener('click', () => this._restoreItem(item));

        return el;
    }

    _getTypeColor(template) {
        const colors = {
            cox_ph: '#3b82f6',
            logistic: '#3b82f6',
            lasso_regression: '#3b82f6',
            kaplan_meier: '#22c55e',
            roc_analysis: '#f59e0b',
            model_evaluation_binary: '#f59e0b',
            diagnostic_accuracy: '#f59e0b',
            agreement_categorical: '#f59e0b',
            categorical: '#6b7280',
            numeric_compare: '#6b7280',
            correlation_analysis: '#6b7280',
            anova: '#6b7280',
            descriptive_stats: '#6b7280',
            violin_plot: '#6b7280',
            spline_analysis: '#6b7280',
            random_forest: '#8b5cf6'
        };
        return colors[template] || '#6b7280';
    }

    _restoreItem(item) {
        const existingCard = document.querySelector(`.analysis-card[data-run-id="${item.id}"]`);
        if (existingCard) {
            existingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const card = document.createElement('div');
        card.className = 'analysis-card';
        card.setAttribute('data-run-id', item.id);
        card.setAttribute('data-template', item.template);
        
        const workspace = document.getElementById('analysisCards');
        if (!workspace) return;

        workspace.appendChild(card);
        
        card.innerHTML = `
            <div class="card-header">
                <span class="card-title">${item.title || item.template}</span>
                <div class="card-actions">
                    <button class="card-close-btn" title="Remove">✕</button>
                </div>
            </div>
            <div class="card-results-container" style="padding:16px;">
                <div class="results-block">
                    <div class="results-header">
                        <span class="results-title">Results: ${item.title || item.template} — ${(item.timestamp||'').substring(11,19)}</span>
                    </div>
                    <div class="results-table-container" style="max-height:500px;overflow-y:auto;">
                        ${this._formatOutput(item.output_preview || '')}
                    </div>
                </div>
            </div>
        `;

        card.querySelector('.card-close-btn').addEventListener('click', () => card.remove());
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        document.getElementById('emptyState')?.classList.add('hidden');
    }

    _formatOutput(text) {
        if (!text) return '<p style="color:var(--text-muted);">No output available</p>';
        
        // Remove JSON metrics block
        const jsonStart = text.indexOf('<!-- JSON_METRICS_START -->');
        if (jsonStart !== -1) {
            text = text.substring(0, jsonStart);
        }
        
        let html = '';
        const lines = text.split('\n');
        let tableRows = [];
        let inTable = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                if (tableRows.length > 0) {
                    html += this._buildTable(tableRows);
                    tableRows = [];
                }
                inTable = false;
                continue;
            }
            
            // Image
            if (line.startsWith('![')) {
                const match = line.match(/!\[.*\]\((\/plots\/[^)]+)\)/);
                if (match) {
                    html += `<img src="${match[1]}" style="max-width:100%;border-radius:8px;border:1px solid var(--border-primary);margin:8px 0;" />`;
                }
                continue;
            }
            
            // JSON block
            if (line.startsWith('<!--')) continue;
            if (line.startsWith('{"model_type"')) continue;
            if (line.startsWith('---')) continue;
            
            // Headers
            if (line.startsWith('## ')) {
                html += `<h2 style="font-size:16px;font-weight:600;margin:16px 0 8px 0;">${line.replace('## ', '')}</h2>`;
                continue;
            }
            if (line.startsWith('### ')) {
                html += `<h3 style="font-size:14px;font-weight:600;margin:12px 0 6px 0;">${line.replace('### ', '')}</h3>`;
                continue;
            }
            if (line.startsWith('#### ')) {
                html += `<h4 style="font-size:13px;font-weight:600;margin:10px 0 4px 0;">${line.replace('#### ', '')}</h4>`;
                continue;
            }
            
            // Tables
            if (line.startsWith('|')) {
                if (line.includes('---')) continue;
                const cells = line.split('|').filter(c => c.trim() !== '');
                if (cells.length > 0) {
                    tableRows.push(cells.map(c => c.trim()));
                }
                inTable = true;
                continue;
            }
            
            // Regular text
            if (tableRows.length > 0) {
                html += this._buildTable(tableRows);
                tableRows = [];
                inTable = false;
            }
            
            let formattedLine = line;
            formattedLine = formattedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            formattedLine = formattedLine.replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:1px 6px;border-radius:3px;font-size:12px;">$1</code>');
            html += `<p style="margin:2px 0;">${formattedLine}</p>`;
        }
        
        if (tableRows.length > 0) {
            html += this._buildTable(tableRows);
        }
        
        return html || '<p style="color:var(--text-muted);">No output available</p>';
    }

    _buildTable(rows) {
        if (rows.length === 0) return '';
        let h = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0;"><thead><tr>';
        rows[0].forEach(c => h += `<th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-primary);font-weight:600;">${c}</th>`);
        h += '</tr></thead><tbody>';
        for (let i = 1; i < rows.length; i++) {
            h += '<tr>';
            rows[i].forEach(c => h += `<td style="padding:8px 12px;border-bottom:1px solid var(--border-primary);">${c}</td>`);
            h += '</tr>';
        }
        h += '</tbody></table>';
        return h;
    }

    addItem(item) {
        this.chainItems.push(item);
        const list = this.container?.querySelector('#chainList');
        if (list) {
            const el = this._createChainItem(item, this.chainItems.length - 1);
            list.appendChild(el);
            list.scrollTop = list.scrollHeight;
        }
    }

    clear() {
        this.chainItems = [];
        const list = this.container?.querySelector('#chainList');
        if (list) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">No analyses yet</div>';
        }
    }
}

// js/ui/reports.js - Reports tab
import { API_BASE } from '../core/api.js';

export class ReportsPanel {
    constructor() {
        this.container = null;
        this.history = [];
    }
    
    init() {
        const reportsTab = document.querySelector('[data-tab="table"]');
        if (reportsTab) {
            reportsTab.textContent = 'Reports';
            reportsTab.addEventListener('click', () => {
                this._loadHistory();
            });
        }
        
        const reportsPanel = document.getElementById('tabTable');
        if (reportsPanel) {
            this.container = reportsPanel;
            this._buildUI();
            this._loadHistory();
        }
    }
    
    _buildUI() {
        this.container.innerHTML = `
            <div style="padding:16px;display:flex;flex-direction:column;gap:16px;">
                <h3 style="font-size:16px;font-weight:600;color:var(--text-primary);">Generate DOCX Report</h3>
                
                <div class="form-group">
                    <label class="form-label">Analyses to include</label>
                    <div style="margin:8px 0;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
                            <input type="radio" name="reportMode" class="report-mode" value="all" checked>
                            <span>All analyses</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                            <input type="radio" name="reportMode" class="report-mode" value="selected">
                            <span>Selected:</span>
                        </label>
                    </div>
                    <div class="analyses-list" style="display:none;max-height:300px;overflow-y:auto;margin-top:8px;">
                        <div id="analysesCheckboxes"></div>
                        <div style="margin-top:8px;display:flex;gap:8px;">
                            <button class="btn-secondary" id="selectAllBtn" style="font-size:11px;padding:4px 8px;">Select All</button>
                            <button class="btn-secondary" id="deselectAllBtn" style="font-size:11px;padding:4px 8px;">Deselect All</button>
                        </div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Report sections to include</label>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                            <input type="checkbox" class="section-check" value="overview" checked>
                            <span>Dataset overview (rows, columns, events)</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                            <input type="checkbox" class="section-check" value="tables" checked>
                            <span>Results tables (HR, OR, coefficients)</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                            <input type="checkbox" class="section-check" value="metrics" checked>
                            <span>Key metrics (AUC, C-index, p-values)</span>
                        </label>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Report title</label>
                    <input type="text" class="form-input report-title" value="Analysis Report" style="width:100%;">
                </div>
                
                <button class="btn-primary" id="generateReportBtn" style="width:100%;">Generate DOCX</button>
                
                <button class="btn-primary" id="generateAIReportBtn" style="width:100%;margin-top:8px;background:var(--accent-green);">Generate AI Report</button>
                
                <hr style="border:0;border-top:1px solid var(--border-primary);margin:12px 0;">
                
                <h3 style="font-size:16px;font-weight:600;color:var(--text-primary);">Generate Scientific Draft</h3>
                
                <div class="form-group">
                    <label class="form-label">Draft title</label>
                    <input type="text" class="form-input draft-title" value="Scientific Article Draft" style="width:100%;">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Section to write</label>
                    <select class="form-input draft-section" style="width:100%;">
                        <option value="all">Full Draft (Methods + Results + Discussion)</option>
                        <option value="methods">Methods only</option>
                        <option value="results">Results only</option>
                        <option value="discussion">Discussion only</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Draft language</label>
                    <select class="form-input draft-language" style="width:100%;">
                        <option value="Russian">Russian (Русский)</option>
                        <option value="English">English</option>
                    </select>
                </div>
                
                <button class="btn-primary" id="generateDraftBtn" style="width:100%;background:var(--accent-purple);">Generate Article Draft</button>
                
                <div id="reportStatus" style="font-size:13px;color:var(--text-muted);text-align:center;margin-top:12px;"></div>
            </div>
        `;
        
        this._setupListeners();
    }
    
    _setupListeners() {
        const modeRadios = this.container.querySelectorAll('.report-mode');
        const listDiv = this.container.querySelector('.analyses-list');
        
        modeRadios.forEach(r => {
            r.addEventListener('change', () => {
                listDiv.style.display = r.value === 'selected' ? 'block' : 'none';
            });
        });
        
        this.container.querySelector('#selectAllBtn').addEventListener('click', () => {
            this.container.querySelectorAll('.analysis-check').forEach(c => c.checked = true);
        });
        
        this.container.querySelector('#deselectAllBtn').addEventListener('click', () => {
            this.container.querySelectorAll('.analysis-check').forEach(c => c.checked = false);
        });
        
        this.container.querySelector('#generateReportBtn').addEventListener('click', () => this._generateReport());
        this.container.querySelector('#generateAIReportBtn').addEventListener('click', () => this._generateAIReport());
        this.container.querySelector('#generateDraftBtn').addEventListener('click', () => this._generateDraft());
    }
    
    async _loadHistory() {
        try {
            const response = await fetch(`${API_BASE}/analysis/history`);
            const data = await response.json();
            this.history = (data.history || []).filter(h => h.template !== 'ai_chat');
            this._renderAnalysesList();
        } catch (e) {
            console.error('Failed to load history:', e);
        }
    }
    
    _renderAnalysesList() {
        const container = this.container.querySelector('#analysesCheckboxes');
        if (!container) return;
        
        if (this.history.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">No analyses yet.</div>';
            return;
        }
        
        container.innerHTML = this.history.map(item => {
            const ts = (item.timestamp || '').substring(0, 16).replace('T', ' ');
            let metricInfo = '';
            const m = item.metrics || {};
            if (m.c_index) metricInfo = `C-index=${m.c_index.toFixed(2)}`;
            else if (m.auc) metricInfo = `AUC=${m.auc.toFixed(2)}`;
            else if (m.logrank_overall) metricInfo = `p=${m.logrank_overall.toFixed(4)}`;
            else if (m.p_value) metricInfo = `p=${m.p_value.toFixed(4)}`;
            
            return `
                <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;border-bottom:1px solid var(--border-primary);font-size:13px;">
                    <input type="checkbox" class="analysis-check" value="${item.id}" checked>
                    <span style="flex:1;">
                        <span style="font-weight:500;">${item.title || item.template}</span>
                        <span style="color:var(--text-muted);margin-left:8px;">${ts}</span>
                        ${metricInfo ? `<span style="color:var(--accent-blue);margin-left:8px;">${metricInfo}</span>` : ''}
                    </span>
                </label>
            `;
        }).join('');
    }
    
    async _generateReport() {
        const modeRadio = this.container.querySelector('.report-mode:checked');
        const mode = modeRadio ? modeRadio.value : 'all';
        
        const selectedIds = [];
        if (mode === 'selected') {
            this.container.querySelectorAll('.analysis-check:checked').forEach(cb => {
                selectedIds.push(cb.value);
            });
        }
        
        const sections = [];
        this.container.querySelectorAll('.section-check:checked').forEach(cb => {
            sections.push(cb.value);
        });
        
        const title = this.container.querySelector('.report-title')?.value || 'Analysis Report';
        
        const statusDiv = this.container.querySelector('#reportStatus');
        const generateBtn = this.container.querySelector('#generateReportBtn');
        
        statusDiv.textContent = 'Generating...';
        statusDiv.style.color = 'var(--text-muted)';
        generateBtn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/analysis/report/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    analyses: mode,
                    selected_ids: selectedIds,
                    include_sections: sections,
                    include_ai: false
                })
            });
            
            if (!response.ok) throw new Error(await response.text());
            
            const result = await response.json();
            
            if (result.status === 'generated') {
                statusDiv.innerHTML = `Report generated: <a href="${API_BASE}/analysis/report/download/${result.filename}" style="color:var(--accent-blue);">${result.filename}</a>`;
                statusDiv.style.color = 'var(--accent-green)';
            }
        } catch (e) {
            statusDiv.textContent = `Error: ${e.message}`;
            statusDiv.style.color = 'var(--accent-red)';
        } finally {
            generateBtn.disabled = false;
        }
    }
    
    async _generateAIReport() {
        const language = prompt('Set report language:', 'English');
        if (language === null) return;
        const lang = language.trim() || 'English';
        
        const modeRadio = this.container.querySelector('.report-mode:checked');
        const mode = modeRadio ? modeRadio.value : 'all';
        
        const selectedIds = [];
        if (mode === 'selected') {
            this.container.querySelectorAll('.analysis-check:checked').forEach(cb => {
                selectedIds.push(cb.value);
            });
        }
        
        const title = this.container.querySelector('.report-title')?.value || 'Analysis Report';
        
        const statusDiv = this.container.querySelector('#reportStatus');
        const generateBtn = this.container.querySelector('#generateAIReportBtn');
        
        statusDiv.textContent = 'Checking AI configuration...';
        statusDiv.style.color = 'var(--text-muted)';
        generateBtn.disabled = true;
        
        try {
            const configResp = await fetch(`${API_BASE}/ai/config`);
            if (!configResp.ok) throw new Error('Failed to check AI configuration');
            const configData = await configResp.json();
            const cfg = configData.config || {};
            const provider = cfg.provider || '';
            if (provider === 'groq' && (!cfg.groq || !cfg.groq.api_key)) {
                throw new Error('AI not configured. Configure AI in Chat Settings (Groq API key missing).');
            }
            if (provider === 'ollama' && (!cfg.ollama || !cfg.ollama.url)) {
                throw new Error('AI not configured. Configure AI in Chat Settings (Ollama URL missing).');
            }
            if (!provider) {
                throw new Error('AI not configured. Please configure AI in Chat Settings.');
            }
            
            statusDiv.textContent = 'Report is being generated...';
            
            const response = await fetch(`${API_BASE}/analysis/report/ai-generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    analyses: mode,
                    selected_ids: selectedIds,
                    language: lang
                })
            });
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `HTTP ${response.status}: ${await response.text().catch(() => '')}`);
            }
            
            const result = await response.json();
            
            if (result.status === 'generated') {
                statusDiv.innerHTML = `AI Report generated: <a href="${API_BASE}/analysis/report/download/${result.filename}" style="color:var(--accent-blue);">${result.filename}</a>`;
                statusDiv.style.color = 'var(--accent-green)';
            }
        } catch (e) {
            statusDiv.textContent = `Error: ${e.message}`;
            statusDiv.style.color = 'var(--accent-red)';
        } finally {
            generateBtn.disabled = false;
        }
    }

    async _generateDraft() {
        const modeRadio = this.container.querySelector('.report-mode:checked');
        const mode = modeRadio ? modeRadio.value : 'all';
        
        const selectedIds = [];
        if (mode === 'selected') {
            this.container.querySelectorAll('.analysis-check:checked').forEach(cb => {
                selectedIds.push(cb.value);
            });
            if (selectedIds.length === 0) {
                const statusDiv = this.container.querySelector('#reportStatus');
                statusDiv.textContent = 'Error: Please select at least one analysis.';
                statusDiv.style.color = 'var(--accent-red)';
                return;
            }
        }
        
        const title = this.container.querySelector('.draft-title')?.value || 'Scientific Article Draft';
        const section = this.container.querySelector('.draft-section')?.value || 'all';
        const language = this.container.querySelector('.draft-language')?.value || 'Russian';
        
        const statusDiv = this.container.querySelector('#reportStatus');
        const generateBtn = this.container.querySelector('#generateDraftBtn');
        
        statusDiv.textContent = 'Checking AI configuration...';
        statusDiv.style.color = 'var(--text-muted)';
        generateBtn.disabled = true;
        
        try {
            const configResp = await fetch(`${API_BASE}/ai/config`);
            if (!configResp.ok) throw new Error('Failed to check AI configuration');
            const configData = await configResp.json();
            const cfg = configData.config || {};
            const provider = cfg.provider || '';
            if (provider === 'groq' && (!cfg.groq || !cfg.groq.api_key)) {
                throw new Error('AI not configured. Configure AI in Chat Settings (Groq API key missing).');
            }
            if (provider === 'ollama' && (!cfg.ollama || !cfg.ollama.url)) {
                throw new Error('AI not configured. Configure AI in Chat Settings (Ollama URL missing).');
            }
            if (!provider) {
                throw new Error('AI not configured. Please configure AI in Chat Settings.');
            }
            
            statusDiv.textContent = 'Draft is being generated...';
            
            const response = await fetch(`${API_BASE}/analysis/report/draft-article`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    analyses: mode,
                    selected_ids: selectedIds,
                    language: language,
                    section: section
                })
            });
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `HTTP ${response.status}: ${await response.text().catch(() => '')}`);
            }
            
            const result = await response.json();
            
            if (result.status === 'generated') {
                const checkNotice = result.validation_passed ? 
                    '<span style="color:var(--accent-green); font-size:12px; display:block; margin-top:4px;">✓ Verified by ResponseValidator</span>' : 
                    '<span style="color:var(--accent-orange); font-size:12px; display:block; margin-top:4px;">⚠ Some metrics could not be verified automatically</span>';
                statusDiv.innerHTML = `Draft generated: <a href="${API_BASE}/analysis/report/download/${result.filename}" style="color:var(--accent-blue);">${result.filename}</a>${checkNotice}`;
                statusDiv.style.color = 'var(--accent-green)';
            }
        } catch (e) {
            statusDiv.textContent = `Error: ${e.message}`;
            statusDiv.style.color = 'var(--accent-red)';
        } finally {
            generateBtn.disabled = false;
        }
    }
}

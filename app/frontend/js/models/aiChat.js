// js/models/aiChat.js - AI Chat logic provider
import { API_BASE } from '../core/api.js';

export class AIChatModel {
    constructor() {
        this.messages = [];
        this.config = null;
        this.coderMode = false;
        this.chatPanel = null;
        this._configPromise = null;
    }

    async loadConfig() {
        if (this._configPromise) return this._configPromise;
        this._configPromise = this._fetchConfig();
        try {
            await this._configPromise;
        } finally {
            this._configPromise = null;
        }
    }

    async _fetchConfig() {
        try {
            const response = await fetch(`${API_BASE}/ai/config`);
            const data = await response.json();
            this.config = data.config;
        } catch (e) {
            console.warn('AI config fetch failed, using defaults:', e);
            this.config = { provider: 'ollama', last_used_model: 'llama3:8b', temperature: 0.7, max_tokens: 2000 };
        }
    }

    _getSystemPrompt() {
        return `You are PDD_STAT Coder. Your ONLY job is to write executable Python code.
RULES (follow strictly):
- Return ONLY Python code. No explanations. No markdown.
- Use df['column'] for DataFrame columns.
- Globals available: df, pd, np, plt, save_plot(name, fig), CoxVariableSelector.
- NEVER read files (pd.read_csv, pd.read_excel, open). Use df directly.
- NEVER use plt.show(). Use save_plot('descriptive_name') to save plots.
- Print results with print() for calculations.
- BEFORE .loc or .iloc, verify values: print(df['col'].unique()).
- If column has float values (1.0, 2.0), convert keys: type_keys = [int(k) for k in df['col'].dropna().unique()].
- PREFER .iloc over .loc when indexing by position.
- For Kaplan-Meier with add_at_risk_counts: create SEPARATE KaplanMeierFitter per group, pass fitted fitters (NOT lists) to add_at_risk_counts(fitter1, fitter2, ..., ax=ax).
- AFTER executing code: if error occurs, automatically fix and retry up to 3 times.
- If still failing after 3 attempts, print the error for the user.`;
    }

    _getModel() {
        return (this.config && this.config.last_used_model) || 'llama3:8b';
    }

    _getTemperature() {
        return this.coderMode ? 0 : (this.config && this.config.temperature || 0.7);
    }

    _getMaxTokens() {
        return this.coderMode ? 4000 : (this.config && this.config.max_tokens || 2000);
    }

    async sendMessage() {
        const text = this.chatPanel.getText();
        if (!text) return;

        this.addMessage('user', text);
        this.chatPanel.clearInput();
        this.messages.push({ role: 'user', content: text });

        this.chatPanel.expand();
        const typingDiv = this.chatPanel.addTypingIndicator();

        try {
            const model = this._getModel();

            const fullMessages = [];
            if (this.coderMode) {
                fullMessages.push({ role: 'system', content: this._getSystemPrompt() });
            }
            fullMessages.push(...this.messages.slice(-20));

            const response = await fetch(`${API_BASE}/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: fullMessages,
                    model,
                    temperature: this._getTemperature(),
                    max_tokens: this._getMaxTokens(),
                    coder_mode: this.coderMode
                })
            });

            const result = await response.json();
            this.chatPanel.removeTypingIndicator(typingDiv);

            if (result.success) {
                this.addMessage('assistant', result.content);
                this.messages.push({ role: 'assistant', content: result.content });

                if (this.coderMode) {
                    const pythonBlocks = result.content.match(/```python\n([\s\S]*?)```/g) || [];
                    for (const block of pythonBlocks) {
                        const code = block.replace(/```python\n?/, '').replace(/```/, '').trim();
                        if (code) {
                            await this._executeCode(code);
                        }
                    }
                }
            } else {
                const errMsg = result.error || 'Unknown error';
                this.addMessage('assistant', `Error (${model}): ${errMsg}`);
            }
        } catch (e) {
            this.chatPanel.removeTypingIndicator(typingDiv);
            this.addMessage('assistant', `Error: ${e.message}`);
        }

        this.saveDialog();
    }

    addMessage(role, text) {
        text = text.replace(/\\text\{([^}]+)\}/g, '$1');
        text = text.replace(/\$\$([^$]+)\$\$/g, '$1');
        text = text.replace(/\$([^$]+)\$/g, '$1');

        let html;
        if (role === 'system') {
            const imgPl = [];
            let t = text.replace(/!\[([^\]]*)\]\(\/plots\/([^)]+)\)/g, (m, a, s) => {
                imgPl.push(`<img src="/plots/${s}" style="max-width:100%;border-radius:8px;border:1px solid var(--border-primary);margin:8px 0;" />`);
                return `\x00IMG${imgPl.length - 1}\x00`;
            });
            html = this._renderMarkdown(t);
            for (let i = 0; i < imgPl.length; i++) {
                html = html.replace(`\x00IMG${i}\x00`, imgPl[i]);
            }
        } else if (this.coderMode && role === 'assistant') {
            const escaped = this._escapeHtml(text);
            html = `<details style="margin:4px 0;">
<summary style="cursor:pointer;font-size:12px;padding:6px 10px;border:1px solid var(--border-primary);border-radius:6px;background:var(--bg-tertiary);color:var(--text-secondary);user-select:none;">
📄 Python код
</summary>
<pre style="background:var(--bg-tertiary);padding:12px;border-radius:0 0 6px 6px;overflow-x:auto;font-size:12px;margin:0;border:1px solid var(--border-primary);border-top:none;"><code>${escaped}</code></pre>
</details>`;
        } else {
            html = this._renderMarkdown(text);
        }
        this.chatPanel.appendMessage(role, html);
    }

    _escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async _executeCode(code) {
        try {
            const execRes = await fetch(`${API_BASE}/analysis/code/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const execData = await execRes.json();

            if (execData.success) {
                const output = (execData.output || '').trim();
                if (output) {
                    const coderResult = `[CODER OUTPUT — use these exact numbers]\n${output}`;
                    this.addMessage('system', coderResult);
                    this.messages.push({ role: 'user', content: `[SYSTEM] The following is the output from the last executed code. Use only these numbers in your analysis:\n${output}` });
                } else {
                    this.addMessage('system', '> [Code executed]');
                }

                const createdPlots = execData.created_plots || [];
                for (const plot of createdPlots) {
                    this.addMessage('system', `![${plot}](/plots/${plot})`);
                }
            } else {
                this.addMessage('system', `Error: ${execData.error}`);
            }
        } catch (e) {
            this.addMessage('system', `Execution error: ${e.message}`);
        }
    }

    _renderMarkdown(text) {
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // 1. Markdown tables — produce raw HTML with escaped content
        let html = text.replace(
            /^\|(.+)\|\n\|([-:| ]+)\|\n((?:\|.+\|\n?)*)/gm,
            (match, headerRow, sepRow, bodyRows) => {
                const headers = headerRow.split('|').map(h => esc(h.trim())).filter(h => h);
                const lines = bodyRows.trim().split('\n');
                let table = '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px;">';
                table += '<thead><tr>' + headers.map(h =>
                    `<th style="border:1px solid var(--border-primary);padding:6px 8px;text-align:left;background:var(--bg-tertiary);">${h}</th>`
                ).join('') + '</tr></thead><tbody>';
                for (const line of lines) {
                    const cells = line.split('|').map(c => c.trim());
                    const rowCells = cells.filter((_, i) => i > 0 && i < cells.length - 1);
                    table += '<tr>' + headers.map((_, i) =>
                        `<td style="border:1px solid var(--border-primary);padding:4px 8px;">${esc(rowCells[i] || '')}</td>`
                    ).join('') + '</tr>';
                }
                table += '</tbody></table>';
                return table;
            }
        );

        // 2. Plain-text tables (crosstab, print(df)) — multi-space aligned
        const lines = html.split('\n');
        const tblStyle = 'border-collapse:collapse;width:100%;margin:8px 0;font-size:13px;';
        const cellStyle = 'border:1px solid var(--border-primary);padding:4px 8px;';
        const thStyle = cellStyle + 'text-align:left;background:var(--bg-tertiary);';
        const resultLines = [];
        let i = 0;
        while (i < lines.length) {
            const colCount = lines[i].split(/\s{2,}/).filter(c => c.trim()).length;
            if (colCount >= 2) {
                let tblRows = [];
                let j = i;
                while (j < lines.length) {
                    const parts = lines[j].split(/\s{2,}/).map(c => c.trim());
                    if (parts.length < 2) break;
                    tblRows.push(parts);
                    j++;
                }
                if (tblRows.length >= 2) {
                    const base = Math.max(...tblRows.map(r => r.length));
                    let tbl = `<table style="${tblStyle}">`;
                    tbl += '<thead><tr>' + tblRows[0].slice(0, base).map(h =>
                        `<th style="${thStyle}">${esc(h)}</th>`
                    ).join('') + '</tr></thead><tbody>';
                    for (let ri = 1; ri < tblRows.length; ri++) {
                        const cells = tblRows[ri];
                        tbl += '<tr>' +
                            Array.from({length: base}, (_, ci) =>
                                `<td style="${cellStyle}">${esc(cells[ci] || '')}</td>`
                            ).join('') + '</tr>';
                    }
                    tbl += '</tbody></table>';
                    resultLines.push(tbl);
                    i = j;
                    continue;
                }
            }
            resultLines.push(lines[i]);
            i++;
        }
        html = resultLines.join('\n');

        // 3. Inline formatting — escape content, keep HTML tags
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
            (m, lang, code) => `<pre style="background:var(--bg-tertiary);padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;"><code>${esc(code)}</code></pre>`);
        html = html.replace(/`([^`]+)`/g,
            (m, code) => `<code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:12px;">${esc(code)}</code>`);
        html = html.replace(/^### (.+)$/gm,
            (m, t) => `<h4 style="margin:12px 0 4px 0;font-size:14px;">${esc(t)}</h4>`);
        html = html.replace(/^## (.+)$/gm,
            (m, t) => `<h3 style="margin:16px 0 6px 0;font-size:15px;">${esc(t)}</h3>`);
        html = html.replace(/\*\*(.+?)\*\*/g,
            (m, t) => `<strong>${esc(t)}</strong>`);
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    async saveDialog() {
        try {
            await fetch(`${API_BASE}/analysis/history/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `${this.coderMode ? 'AI Coder' : 'AI Chat'}: ${((this.messages.find(m => m.role === 'user') || {}).content || '').slice(0, 50) || 'Chat'}`,
                    model: this.config && this.config.last_used_model || 'unknown',
                    provider: this.config && this.config.provider || 'unknown',
                    messages: this.messages
                })
            });
        } catch (e) {
            console.error('Failed to save dialog:', e);
        }
    }
}

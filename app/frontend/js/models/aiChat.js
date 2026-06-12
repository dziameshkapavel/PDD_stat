// js/models/aiChat.js - AI Chat Card
import { BaseModel } from './base.js';
import { API_BASE } from '../core/api.js';

export class AIChatModel extends BaseModel {
    constructor(state, ui) {
        super(state, ui);
        this.templateName = 'ai_chat';
        this.templatePrefix = 'ai_chat';
        this.messages = [];
        this.config = null;
        this.coderMode = false;
    }

    createCard() {
        const template = document.getElementById('aiChatCardTemplate');
        if (!template) return null;

        const card = template.content.cloneNode(true).querySelector('.analysis-card');
        card.id = `aichat_${Date.now()}`;

        this.ui.panels.addCard(card);
        this._addCoderButton(card);
        this._loadConfig().then(() => this._updateHeader(card));

        card.querySelector('.send-btn').addEventListener('click', () => this._sendMessage(card));
        card.querySelector('.card-close-btn').addEventListener('click', () => this.removeCard(card));

        const input = card.querySelector('.chat-input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._sendMessage(card);
            }
        });

        this.messages = [];
        return card;
    }

    async _loadConfig() {
        try {
            const response = await fetch(`${API_BASE}/ai/config`);
            const data = await response.json();
            this.config = data.config;
        } catch (e) {
            this.config = { provider: 'ollama', last_used_model: 'llama3:8b', temperature: 0.7, max_tokens: 2000 };
        }
    }

    _addCoderButton(card) {
        const header = card.querySelector('.card-header');
        const cardActions = card.querySelector('.card-actions');

        if (!header || !cardActions) return;

        const coderBtn = document.createElement('button');
        coderBtn.className = 'coder-btn';
        coderBtn.textContent = 'Coder';
        coderBtn.style.cssText = `
            font-size: 12px;
            padding: 6px 12px;
            background: rgba(255, 255, 255, 0.3);
            border: 1px solid rgba(0, 0, 0, 0.05);
            border-radius: 30px;
            color: var(--text-primary);
            cursor: pointer;
            transition: all 0.2s ease;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            font-weight: 500;
            margin-right: 6px;
        `;

        coderBtn.addEventListener('click', () => {
            this.coderMode = !this.coderMode;
            if (this.coderMode) {
                coderBtn.style.background = 'rgba(255, 59, 48, 0.15)';
                coderBtn.style.color = 'var(--accent-red)';
                coderBtn.style.borderColor = 'var(--accent-red)';
            } else {
                coderBtn.style.background = '';
                coderBtn.style.color = '';
                coderBtn.style.borderColor = '';
            }
            this._updateHeader(card);
        });

        const closeBtn = cardActions.querySelector('.card-close-btn');
        cardActions.insertBefore(coderBtn, closeBtn);
    }

    _updateHeader(card) {
        const label = card.querySelector('.model-label');
        if (!label || !this.config) return;

        const prefix = this.coderMode ? 'AI Coder' : 'AI Assistant';
        const provider = this.config.provider === 'ollama' ? 'local' : 'cloud';
        const model = this.config.last_used_model || 'llama3:8b';
        label.textContent = `${prefix} ${model} (${provider})`;

        const title = card.querySelector('.card-title');
        if (this.coderMode) {
            card.style.borderLeft = '3px solid var(--accent-red)';
        } else {
            card.style.borderLeft = '';
        }
    }

    _getSystemPrompt() {
        if (this.coderMode) {
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
- AFTER executing code: if error occurs, automatically fix and retry up to 3 times.
- If still failing after 3 attempts, print the error for the user.`;
        }
        return '';
    }

    async _sendMessage(card) {
        const input = card.querySelector('.chat-input');
        const text = input.value.trim();
        if (!text) return;

        const container = card.querySelector('.chat-messages');
        this._addMessage(container, 'user', text);
        input.value = '';
        input.focus();

        this.messages.push({ role: 'user', content: text });

        const typingDiv = this._addTypingIndicator(container);
        container.scrollTop = container.scrollHeight;

        try {
            const model = this.config && config.last_used_model || 'llama3:8b';
            const temperature = this.coderMode ? 0 : (this.config && config.temperature || 0.7);
            const maxTokens = this.coderMode ? 4000 : (this.config && config.max_tokens || 2000);

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
                    model: model,
                    temperature: temperature,
                    max_tokens: maxTokens,
                    coder_mode: this.coderMode
                })
            });

            const result = await response.json();
            clearInterval(typingDiv._timerInterval);
            typingDiv.remove();

            if (result.success) {
                this._addMessage(container, 'assistant', result.content);
                this.messages.push({ role: 'assistant', content: result.content });

                if (this.coderMode) {
                    const pythonBlocks = result.content.match(/```python\n([\s\S]*?)```/g) || [];
                    for (const block of pythonBlocks) {
                        const code = block.replace(/```python\n?/, '').replace(/```/, '').trim();
                        if (code) {
                            await this._executeCode(code, container);
                        }
                    }
                }
            } else {
                this._addMessage(container, 'assistant', `Error: ${result.error || 'Unknown error'}`);
            }

        } catch (e) {
            clearInterval(typingDiv._timerInterval);
            typingDiv.remove();
            this._addMessage(container, 'assistant', `Error: ${e.message}`);
        }

        container.scrollTop = container.scrollHeight;
        this._saveDialog();
    }

    _addMessage(container, role, text) {
        const msg = document.createElement('div');
        msg.className = `chat-message ${role}`;

        text = text.replace(/\\text\{([^}]+)\}/g, '$1');
        text = text.replace(/\$\$([^$]+)\$\$/g, '$1');
        text = text.replace(/\$([^$]+)\$/g, '$1');

        let formatted;
        if (role === 'system') {
            formatted = text.replace(/!\[([^\]]*)\]\(\/plots\/([^)]+)\)/g,
                '<img src="/plots/$2" style="max-width:100%;border-radius:8px;border:1px solid var(--border-primary);margin:8px 0;" />');
        } else if (this.coderMode && role === 'assistant') {
            formatted = `<pre style="background:var(--bg-tertiary);padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;margin:0;"><code>${text}</code></pre>`;
        } else {
            formatted = this._renderMarkdown(text);
        }

        msg.innerHTML = `<div class="chat-bubble">${formatted}</div>`;
        container.appendChild(msg);
    }

    _escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async _executeCode(code, container) {
        try {
            const execRes = await fetch(`${API_BASE}/analysis/code/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code })
            });
            const execData = await execRes.json();

            if (execData.success) {
                const output = (execData.output || '').trim();
                if (output) {
                    const coderResult = `[CODER OUTPUT — use these exact numbers]\n${output}`;
                    this._addMessage(container, 'system', coderResult);
                    this.messages.push({ role: 'user', content: `[SYSTEM] The following is the output from the last executed code. Use only these numbers in your analysis:\n${output}` });
                } else {
                    this._addMessage(container, 'system', `> [Code executed]`);
                }

                await this._showRecentPlots(container);
            } else {
                this._addMessage(container, 'system', `Error: ${execData.error}`);
            }
        } catch (e) {
            this._addMessage(container, 'system', `Execution error: ${e.message}`);
        }
    }

    async _showRecentPlots(container) {
        try {
            const res = await fetch(`${API_BASE}/analysis/charts`);
            const data = await res.json();
            const plots = (data.charts || []).sort().reverse().slice(0, 5);

            for (const plot of plots) {
                this._addMessage(container, 'system', `![${plot}](/plots/${plot})`);
            }
        } catch (e) {
            console.error('Failed to load plots:', e);
        }
    }

    _renderMarkdown(text) {
        let html = text;
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
            '<pre style="background:var(--bg-tertiary);padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;"><code>$2</code></pre>');
        html = html.replace(/`([^`]+)`/g,
            '<code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:12px;">$1</code>');
        html = html.replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 4px 0;font-size:14px;">$1</h4>');
        html = html.replace(/^## (.+)$/gm, '<h3 style="margin:16px 0 6px 0;font-size:15px;">$1</h3>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    _addTypingIndicator(container) {
        const div = document.createElement('div');
        div.className = 'chat-message assistant';
        const startTime = Date.now();
        div.innerHTML = `
            <div class="chat-bubble" style="display:flex;align-items:center;gap:8px;padding:12px 16px;">
                <span style="display:flex;gap:3px;">
                    <span class="typing-dot">\u25CF</span>
                    <span class="typing-dot" style="animation-delay:0.2s">\u25CF</span>
                    <span class="typing-dot" style="animation-delay:0.4s">\u25CF</span>
                </span>
                <span class="typing-timer" style="font-size:11px;color:var(--text-secondary);opacity:0.7;">0s</span>
            </div>`;
        container.appendChild(div);

        const timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const timerEl = div.querySelector('.typing-timer');
            if (timerEl) {
                if (elapsed < 60) {
                    timerEl.textContent = `${elapsed}s`;
                } else {
                    const min = Math.floor(elapsed / 60);
                    const sec = elapsed % 60;
                    timerEl.textContent = `${min}m ${sec}s`;
                }
            }
        }, 1000);

        div._timerInterval = timerInterval;
        return div;
    }

    async _saveDialog() {
        try {
            await fetch(`${API_BASE}/analysis/history/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `${this.coderMode ? 'AI Coder' : 'AI Chat'}: ${((this.messages.find(m => m.role === 'user') || {}).content || '').slice(0, 50) || 'Chat'}`,
                    model: this.config && config.last_used_model || 'unknown',
                    provider: this.config && config.provider || 'unknown',
                    messages: this.messages
                })
            });
        } catch (e) {
            console.error('Failed to save dialog:', e);
        }
    }

    removeCard(card) {
        this._saveDialog();
        super.removeCard(card);
    }
}

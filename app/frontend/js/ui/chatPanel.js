// js/ui/chatPanel.js - Floating chat bar component
import { API_BASE } from '../core/api.js';
import { AIChatModel } from '../models/aiChat.js';

export class ChatPanel {
    constructor() {
        this.model = new AIChatModel();
        this.model.chatPanel = this;

        this.panel = document.getElementById('chatPanel');
        this.messagesEl = document.getElementById('chatMessages');
        this.input = document.getElementById('chatField');
        this.sendBtn = document.getElementById('chatSendBtn');
        this.coderBtn = document.getElementById('coderToggle');
        this.collapseBtn = document.getElementById('chatCollapseBtn');
        this.closeBtn = document.getElementById('chatCloseBtn');
        this.header = document.getElementById('chatPanelHeader');
        this.modelLabel = document.getElementById('chatModelLabel');
        this.aiChatBtn = document.getElementById('aiChatBtn');

        this.isVisible = false;
        this.isExpanded = false;

        this._bindEvents();
    }

    _bindEvents() {
        this.sendBtn.addEventListener('click', () => this.model.sendMessage());

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.model.sendMessage();
            }
        });

        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
        });

        this.coderBtn.addEventListener('click', () => this._toggleCoder());
        this.collapseBtn.addEventListener('click', () => this._toggleExpand());
        this.closeBtn.addEventListener('click', () => this.hide());
        this.panel.addEventListener('click', (e) => {
            if (!this.isExpanded && !e.target.closest('.send-btn, .chat-coder-btn, .chat-collapse-btn, .chat-close-btn')) {
                this.expand();
            }
        });
    }

    toggle() {
        if (this.isVisible) this.hide();
        else this.show();
    }

    async show() {
        this.isVisible = true;
        this.panel.classList.add('active');
        if (this.aiChatBtn) this.aiChatBtn.classList.add('chat-visible');

        await this.model.loadConfig();
        this._updateHeader();

        this.model.messages = [];
        this.clearMessages();
        await this._loadLastChat();
        this.input.focus();
    }

    async _loadLastChat() {
        try {
            const resp = await fetch(`${API_BASE}/analysis/history?limit=50`);
            const data = await resp.json();
            const history = data.history || [];
            const lastChat = history.find(r => r.template === 'ai_chat');
            if (lastChat && lastChat.messages) {
                const msgs = lastChat.messages;
                this.model.messages = msgs;
                for (const m of msgs) {
                    this.model.addMessage(m.role, m.content);
                }
                if (msgs.length > 0) {
                    this.expand();
                }
            }
        } catch (e) {
            console.warn('Failed to load last chat:', e);
        }
    }

    hide() {
        this.model.saveDialog();
        this.isVisible = false;
        this.isExpanded = false;
        this.panel.classList.remove('active', 'expanded', 'coder-mode');
        if (this.aiChatBtn) this.aiChatBtn.classList.remove('chat-visible');
        this.header.hidden = true;
        this.messagesEl.style.maxHeight = '0';
        this.messagesEl.innerHTML = '';
        this.coderBtn.classList.remove('active');
        this.model.coderMode = false;
        this.input.value = '';
    }

    expand() {
        if (this.isExpanded) return;
        this.isExpanded = true;
        this.panel.classList.add('expanded');
        this.messagesEl.style.maxHeight = '400px';
        this.header.hidden = false;
        this._scrollToBottom();
    }

    _toggleExpand() {
        if (this.isExpanded) {
            this.collapse();
        } else {
            this.expand();
        }
    }

    collapse() {
        this.isExpanded = false;
        this.panel.classList.remove('expanded');
        this.messagesEl.style.maxHeight = '0';
        this.header.hidden = true;
    }

    _toggleCoder() {
        this.model.coderMode = !this.model.coderMode;
        this.panel.classList.toggle('coder-mode', this.model.coderMode);
        this.coderBtn.classList.toggle('active', this.model.coderMode);
        this._updateHeader();
    }

    _updateHeader() {
        if (!this.modelLabel) return;
        const prefix = this.model.coderMode ? 'AI Coder' : 'AI Assistant';
        const model = (this.model.config && this.model.config.last_used_model) || 'llama3:8b';
        const provider = (this.model.config && this.model.config.provider === 'ollama') ? 'local' : 'cloud';
        this.modelLabel.textContent = `${prefix} ${model} (${provider})`;
    }

    appendMessage(role, html) {
        const msg = document.createElement('div');
        msg.className = `chat-message ${role}`;
        msg.innerHTML = `<div class="chat-bubble">${html}</div>`;
        this.messagesEl.appendChild(msg);
        this._scrollToBottom();
    }

    clearMessages() {
        this.messagesEl.innerHTML = '';
    }

    getText() {
        return this.input.value.trim();
    }

    clearInput() {
        this.input.value = '';
        this.input.style.height = 'auto';
    }

    _scrollToBottom() {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    addTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'chat-message assistant';
        const startTime = Date.now();
        div.innerHTML = `
            <div class="chat-bubble" style="display:flex;align-items:center;gap:8px;padding:12px 16px;">
                <span style="display:flex;gap:3px;">
                    <span class="typing-dot">●</span>
                    <span class="typing-dot" style="animation-delay:0.2s">●</span>
                    <span class="typing-dot" style="animation-delay:0.4s">●</span>
                </span>
                <span class="typing-timer" style="font-size:11px;color:var(--text-secondary);opacity:0.7;">0s</span>
            </div>`;
        this.messagesEl.appendChild(div);
        this._scrollToBottom();

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

    removeTypingIndicator(typingDiv) {
        clearInterval(typingDiv._timerInterval);
        typingDiv.remove();
    }
}

// js/ui/aiSettings.js - Модальное окно настроек AI
import { API_BASE } from '../core/api.js';

export class AISettings {
    constructor() {
        this.modal = null;
        this.config = null;
    }
    
    async open() {
        // Загружаем конфигурацию
        try {
            const response = await fetch(`${API_BASE}/ai/config`);
            const data = await response.json();
            this.config = data.config;
        } catch (e) {
            console.error('Failed to load AI config:', e);
            this.config = this._getDefaultConfig();
        }
        
        this._showModal();
    }
    
    _getDefaultConfig() {
        return {
            provider: 'ollama',
            ollama: { url: 'http://localhost:11434', default_model: 'llama3:8b', temperature: 0.7, max_tokens: 2000 },
            groq: { api_key: '', default_model: 'llama3-70b-8192', temperature: 0.7, max_tokens: 2000 },
            system_prompt: 'You are PDD_STAT Assistant...',
            temperature: 0.7,
            max_tokens: 2000
        };
    }
    
    _showModal() {
        // Удаляем старый модал если есть
        const old = document.getElementById('aiSettingsModal');
        if (old) old.remove();
        
        const modal = document.createElement('div');
        modal.id = 'aiSettingsModal';
        modal.className = 'modal active';
        modal.innerHTML = this._buildHTML();
        
        document.body.appendChild(modal);
        this.modal = modal;
        
        this._setupListeners();
    }
    
    _buildHTML() {
        const c = this.config;
        const isOllama = c.provider === 'ollama';
        const isGroq = c.provider === 'groq';
        
        return `
            <div class="modal-content" style="max-width:600px;">
                <div class="modal-header">
                    <h3>AI Settings</h3>
                    <button class="modal-close" id="aiSettingsClose">&times;</button>
                </div>
                <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
                    <div class="form-group">
                        <label class="form-label">Provider</label>
                        <div class="button-group">
                            <button class="btn-secondary provider-btn ${isOllama ? 'active' : ''}" data-provider="ollama">
                                Ollama (Local)
                            </button>
                            <button class="btn-secondary provider-btn ${isGroq ? 'active' : ''}" data-provider="groq">
                                Groq (Cloud)
                            </button>
                        </div>
                    </div>
                    
                    <div id="ollamaSettings" style="display:${isOllama ? 'block' : 'none'};">
                        <div class="form-group">
                            <label class="form-label">Ollama URL</label>
                            <input type="text" class="form-input" id="ollamaUrl" value="${c.ollama.url}" style="width:100%;">
                        </div>
                        <div class="form-group">
                            <button class="btn-secondary" id="testOllamaBtn">Test Connection</button>
                            <button class="btn-secondary" id="connectOllamaBtn" style="margin-left:4px;">Connect</button>
                            <span id="ollamaStatus" style="margin-left:8px;font-size:13px;"></span>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Default Model</label>
                            <select class="form-input" id="ollamaModel" style="width:100%;">
                                <option value="${c.ollama.default_model}">${c.ollama.default_model}</option>
                            </select>
                        </div>
                    </div>
                    
                    <div id="groqSettings" style="display:${isGroq ? 'block' : 'none'};">
                        <div class="form-group">
                            <label class="form-label">API Key</label>
                            <input type="password" class="form-input" id="groqApiKey" 
                                   value="${c.groq.api_key || ''}" 
                                   placeholder="gsk_..." style="width:100%;">
                        </div>
                        <div class="form-group">
                            <button class="btn-secondary" id="testGroqBtn">Test Connection & Load Models</button>
                            <button class="btn-secondary" id="connectGroqBtn" style="margin-left:4px;">Connect</button>
                            <span id="groqStatus" style="margin-left:8px;font-size:13px;"></span>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Default Model</label>
                            <select class="form-input" id="groqModel" style="width:100%;">
                                <option value="${c.groq.default_model}">${c.groq.default_model}</option>
                            </select>
                            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
                                Click "Test Connection" to load all available models
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Temperature: <span id="tempValue">${c.temperature || 0.7}</span></label>
                        <input type="range" id="temperature" min="0" max="1" step="0.1" 
                               value="${c.temperature || 0.7}" style="width:100%;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Max Tokens</label>
                        <input type="number" class="form-input" id="maxTokens" 
                               value="${c.max_tokens || 2000}" min="100" max="8000" style="width:100%;">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">System Prompt</label>
                        <textarea class="form-input" id="systemPrompt" rows="6" 
                                  style="width:100%;font-size:12px;font-family:monospace;">${c.system_prompt || ''}</textarea>
                        <button class="btn-secondary" id="resetPromptBtn" style="margin-top:4px;font-size:11px;">Reset to default</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="aiSettingsCancel">Cancel</button>
                    <button class="btn-primary" id="aiSettingsSave">Save</button>
                </div>
            </div>
        `;
    }
    
    _setConnected(btn, state) {
        if (!btn) return;
        if (state) {
            btn.style.background = 'var(--accent-green)';
            btn.style.color = 'white';
            btn.style.borderColor = 'var(--accent-green)';
        } else {
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
        }
    }
    
    _setupListeners() {
        // Update header button based on connection status
        const updateHeaderButton = (connected) => {
            const aiChatBtn = document.getElementById('aiChatBtn');
            if (aiChatBtn) {
                if (connected) {
                    aiChatBtn.style.background = 'rgba(52, 199, 89, 0.15)';
                    aiChatBtn.style.color = 'var(--accent-green)';
                    aiChatBtn.style.borderColor = 'var(--accent-green)';
                } else {
                    aiChatBtn.style.background = '';
                    aiChatBtn.style.color = '';
                    aiChatBtn.style.borderColor = '';
                }
            }
        };
        
        // Sync Connect button states on open
        const activeProvider = localStorage.getItem('pddstat_ai_provider');
        const ollamaConnect = this.modal.querySelector('#connectOllamaBtn');
        const groqConnect = this.modal.querySelector('#connectGroqBtn');
        
        if (activeProvider === 'ollama') {
            this._setConnected(ollamaConnect, true);
            this._setConnected(groqConnect, false);
        } else if (activeProvider === 'groq') {
            this._setConnected(groqConnect, true);
            this._setConnected(ollamaConnect, false);
        } else {
            this._setConnected(ollamaConnect, false);
            this._setConnected(groqConnect, false);
        }
        
        // Connect Ollama
        if (ollamaConnect) {
            ollamaConnect.addEventListener('click', () => {
                const current = localStorage.getItem('pddstat_ai_provider');
                if (current === 'ollama') {
                    localStorage.removeItem('pddstat_ai_provider');
                    this._setConnected(ollamaConnect, false);
                } else {
                    localStorage.setItem('pddstat_ai_provider', 'ollama');
                    this._setConnected(ollamaConnect, true);
                    this._setConnected(groqConnect, false);
                }
            });
        }
        
        // Connect Groq
        if (groqConnect) {
            groqConnect.addEventListener('click', () => {
                const current = localStorage.getItem('pddstat_ai_provider');
                if (current === 'groq') {
                    localStorage.removeItem('pddstat_ai_provider');
                    this._setConnected(groqConnect, false);
                } else {
                    localStorage.setItem('pddstat_ai_provider', 'groq');
                    this._setConnected(groqConnect, true);
                    this._setConnected(ollamaConnect, false);
                }
            });
        }
        
        // Закрытие
        this.modal.querySelector('#aiSettingsClose').addEventListener('click', () => this.close());
        this.modal.querySelector('#aiSettingsCancel').addEventListener('click', () => this.close());
        
        // Переключение провайдера
        this.modal.querySelectorAll('.provider-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.modal.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const provider = btn.dataset.provider;
                this.modal.querySelector('#ollamaSettings').style.display = provider === 'ollama' ? 'block' : 'none';
                this.modal.querySelector('#groqSettings').style.display = provider === 'groq' ? 'block' : 'none';
            });
        });
        
        // Temperature slider
        const tempSlider = this.modal.querySelector('#temperature');
        tempSlider.addEventListener('input', () => {
            this.modal.querySelector('#tempValue').textContent = tempSlider.value;
        });
        
        // Test Ollama
        this.modal.querySelector('#testOllamaBtn').addEventListener('click', async () => {
            const status = this.modal.querySelector('#ollamaStatus');
            status.textContent = 'Testing...';
            status.style.color = 'var(--text-muted)';
            
            try {
                const url = this.modal.querySelector('#ollamaUrl').value;
                const response = await fetch(`${API_BASE}/ai/test`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        provider: 'ollama',
                        ollama_url: url || 'http://localhost:11434'
                    })
                });
                const result = await response.json();
                
                if (result.status === 'connected') {
                    status.textContent = `Connected — ${result.count} models`;
                    status.style.color = 'var(--accent-green)';
                    
                    localStorage.setItem('pddstat_ai_connected', 'true');
                    updateHeaderButton(true);
                    
                    // Обновляем список моделей в select
                    if (result.models && result.models.length > 0) {
                        const select = this.modal.querySelector('#ollamaModel');
                        if (select) {
                            select.innerHTML = result.models
                                .map(m => `<option value="${m}">${m}</option>`)
                                .join('');
                            // Выбираем первый если текущий не в списке
                            if (!result.models.includes(select.value)) {
                                select.value = result.models[0];
                            }
                        }
                    }
                } else {
                    status.textContent = `${result.message}`;
                    status.style.color = 'var(--accent-red)';
                    updateHeaderButton(false);
                    localStorage.setItem('pddstat_ai_connected', 'false');
                }
            } catch (e) {
                status.textContent = `${e.message}`;
                status.style.color = 'var(--accent-red)';
                updateHeaderButton(false);
                localStorage.setItem('pddstat_ai_connected', 'false');
            }
        });
        
        // Test Groq
        this.modal.querySelector('#testGroqBtn').addEventListener('click', async () => {
            const status = this.modal.querySelector('#groqStatus');
            const select = this.modal.querySelector('#groqModel');
            status.textContent = 'Testing...';
            status.style.color = 'var(--text-muted)';
            
            try {
                const apiKey = this.modal.querySelector('#groqApiKey').value;
                
                // Сохраняем API ключ временно для теста
                const response = await fetch(`${API_BASE}/ai/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: 'groq',
                        groq_api_key: apiKey,
                        groq_model: select.value || 'llama3-70b-8192',
                        temperature: 0.7,
                        max_tokens: 2000
                    })
                });
                await response.json();
                
                // Тестируем соединение
                const testResponse = await fetch(`${API_BASE}/ai/test`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        provider: 'groq',
                        groq_api_key: apiKey
                    })
                });
                const result = await testResponse.json();
                
                if (result.status === 'connected') {
                    status.textContent = `Connected — ${result.count} models`;
                    status.style.color = 'var(--accent-green)';
                    
                    localStorage.setItem('pddstat_ai_connected', 'true');
                    updateHeaderButton(true);
                    
                    // Обновляем список ВСЕХ моделей из Groq без фильтрации
                    if (result.models && result.models.length > 0) {
                        const allModels = [...result.models].sort((a, b) => {
                            const isNonChat = (m) => m.includes('whisper') || m.includes('tts') || m.includes('embedding');
                            const aNonChat = isNonChat(a);
                            const bNonChat = isNonChat(b);
                            
                            if (aNonChat && !bNonChat) return 1;
                            if (!aNonChat && bNonChat) return -1;
                            
                            const priority = ['llama-3.3', 'llama-3.1', 'deepseek', 'qwen', 'mixtral', 'gemma'];
                            const aPriority = priority.findIndex(p => a.toLowerCase().includes(p));
                            const bPriority = priority.findIndex(p => b.toLowerCase().includes(p));
                            
                            if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
                            if (aPriority !== -1) return -1;
                            if (bPriority !== -1) return 1;
                            
                            return a.localeCompare(b);
                        });
                        
                        select.innerHTML = allModels
                            .map(m => `<option value="${m}">${m}</option>`)
                            .join('');
                    }
                } else {
                    status.textContent = `${result.message}`;
                    status.style.color = 'var(--accent-red)';
                    updateHeaderButton(false);
                    localStorage.setItem('pddstat_ai_connected', 'false');
                }
            } catch (e) {
                status.textContent = `${e.message}`;
                status.style.color = 'var(--accent-red)';
                updateHeaderButton(false);
                localStorage.setItem('pddstat_ai_connected', 'false');
            }
        });
        
        // Reset prompt
        this.modal.querySelector('#resetPromptBtn').addEventListener('click', () => {
            const defaultPrompt = 'You are PDD_STAT Assistant, a biostatistics AI for clinical researchers. You have access to the dataset and analysis history. Be concise, cite specific numbers, and explain statistical concepts clearly.';
            this.modal.querySelector('#systemPrompt').value = defaultPrompt;
        });
        
        // Save
        this.modal.querySelector('#aiSettingsSave').addEventListener('click', () => this._save());
    }
    
    async _save() {
        const provider = this.modal.querySelector('.provider-btn.active')?.dataset.provider || 'ollama';
        
        const config = {
            provider: provider,
            ollama_url: this.modal.querySelector('#ollamaUrl').value,
            ollama_model: this.modal.querySelector('#ollamaModel').value,
            groq_api_key: this.modal.querySelector('#groqApiKey').value,
            groq_model: this.modal.querySelector('#groqModel').value,
            temperature: parseFloat(this.modal.querySelector('#temperature').value),
            max_tokens: parseInt(this.modal.querySelector('#maxTokens').value),
            system_prompt: this.modal.querySelector('#systemPrompt').value
        };
        
        try {
            const response = await fetch(`${API_BASE}/ai/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            if (response.ok) {
                this.close();
                alert('AI settings saved!');
            } else {
                alert('Failed to save settings');
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }
    
    close() {
        if (this.modal) {
            this.modal.classList.remove('active');
            setTimeout(() => this.modal.remove(), 300);
        }
    }
}

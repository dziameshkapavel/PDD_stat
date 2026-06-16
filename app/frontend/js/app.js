// js/app.js - Главный файл приложения PDD_STAT
import { AppState } from './core/state.js';
import { ThemeManager } from './core/theme.js';
import { PanelManager } from './ui/panels.js';
import { VariablesPanel } from './ui/variables.js';
import { TabManager } from './ui/tabs.js';
import { ModalManager } from './ui/modals.js';
import { ProjectManager } from './projects/manager.js';
import { ModelFactory } from './models/base.js';
import { CoxModel } from './models/cox.js';
import { LogisticModel } from './models/logistic.js';
import { KaplanMeierModel } from './models/km.js';
import { CategoricalModel } from './models/categorical.js';
import { RandomForestModel } from './models/rf.js';
import { ROCModel } from './models/roc.js';
import { ModelEvalBinaryModel } from './models/modelEvalBinary.js';
import { NumericCompareModel } from './models/numericCompare.js';
import { LassoModel } from './models/lasso.js';
import { AISettings } from './ui/aiSettings.js';
import { ChatPanel } from './ui/chatPanel.js';
import { ReportsPanel } from './ui/reports.js';
import { CorrelationModel } from './models/correlation.js';
import { SplineModel } from './models/spline.js';
import { DescriptiveStatsModel } from './models/descriptiveStats.js';
import { ViolinPlotModel } from './models/violinPlot.js';
import { DiagnosticAccuracyModel } from './models/diagnosticAccuracy.js';
import { ANOVAModel } from './models/anova.js';
import { AgreementCategoricalModel } from './models/agreementCategorical.js';
import { IndividualPredictionModel } from './models/individualPrediction.js';
import { SurvivalEvaluationModel } from './models/survivalEvaluation.js';
import { ChartBuilderModel } from './models/chartBuilder.js';
import { ChainPanel } from './ui/chain.js';
import { PubMedSearchPanel } from './ui/pubmedSearch.js';

class App {
    constructor() {
        // Инициализация ядра
        this.state = new AppState();
        this.theme = new ThemeManager();
        
        // Инициализация UI
        this.ui = {
            panels: new PanelManager(),
            tabs: new TabManager(),
            modals: new ModalManager(this.state)
        };
        
        // Инициализация менеджеров
        this.projects = new ProjectManager(this.state, this.ui.modals);
        
        this.variables = new VariablesPanel(this.state, () => this.projects.openDataPreview());
        
        // AI компоненты
        this.aiSettings = new AISettings();
        this.chatPanel = new ChatPanel();
        this.reports = new ReportsPanel();
        this.chain = new ChainPanel();
        this.chain.init();
        this.pubmedSearch = new PubMedSearchPanel();
        
        // Регистрация моделей
        this._registerModels();
        
        // DOM элементы
        this.codeModeBtn = document.getElementById('codeModeBtn');
        this.codeEditorContainer = document.getElementById('codeEditorContainer');
        this.exitCodeModeBtn = document.getElementById('exitCodeModeBtn');
        this.runCodeBtn = document.getElementById('runCodeBtn');
        this.codeEditor = document.getElementById('codeEditor');
        this.codeResultsContainer = document.getElementById('codeResultsContainer');
    }
    
    _registerModels() {
        ModelFactory.register('cox', CoxModel);
        ModelFactory.register('logistic', LogisticModel);
        ModelFactory.register('km', KaplanMeierModel);
        ModelFactory.register('categorical', CategoricalModel);
        ModelFactory.register('rf', RandomForestModel);
        ModelFactory.register('roc', ROCModel);
        ModelFactory.register('modeleval', ModelEvalBinaryModel);
        ModelFactory.register('numeric', NumericCompareModel);
        ModelFactory.register('lasso', LassoModel);
        console.log('Registered models:', ModelFactory.getAvailableModels());
        ModelFactory.register('correlation', CorrelationModel);
        ModelFactory.register('spline', SplineModel);
        ModelFactory.register('descriptive', DescriptiveStatsModel);
        ModelFactory.register('violin', ViolinPlotModel);
        ModelFactory.register('diagacc', DiagnosticAccuracyModel);
        ModelFactory.register('anova', ANOVAModel);
        ModelFactory.register('agreement', AgreementCategoricalModel);
        ModelFactory.register('indpred', IndividualPredictionModel);
        ModelFactory.register('surveval', SurvivalEvaluationModel);
        ModelFactory.register('chartbuilder', ChartBuilderModel);
    }
    
    async init() {
        // Инициализация UI компонентов
        this.theme.init();
        this.ui.panels.init();
        this.ui.tabs.init();
        this.ui.modals.init();
        this.variables.init();
        this.projects.init();
        
        // Инициализация AI
        
        this.reports.init();
        
        // Настройка слушателей событий
        this._setupEventListeners();
        
        // Подписка на события
        this.state.on('variables:updated', () => this.variables.render());
        this.state.on('field:activated', () => this.variables.render());
        this.state.on('card:variables:updated', () => this.variables.render());
        
        console.log('PDD_STAT ready');
        console.log('Available models:', ModelFactory.getAvailableModels());
    }
    
    _setupEventListeners() {
        // Меню шаблонов - открытие по кнопке
        document.querySelectorAll('.dropdown-toggle[data-menu]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menuId = btn.dataset.menu + 'Menu';
                const menu = document.getElementById(menuId);
                if (menu) {
                    document.querySelectorAll('.dropdown-menu').forEach(m => {
                        if (m !== menu) m.classList.remove('show');
                    });
                    menu.classList.toggle('show');
                }
            });
        });
        
        // Закрытие меню по клику вне
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) {
                document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
            }
        });
        
        // AI Chat button
        const aiChatBtn = document.getElementById('aiChatBtn');
        if (aiChatBtn) {
            aiChatBtn.addEventListener('click', () => {
                this.chatPanel.toggle();
            });
        }
        
        // PubMed Search button
        const pubmedBtn = document.getElementById('pubmedSearchBtn');
        if (pubmedBtn) {
            pubmedBtn.addEventListener('click', () => {
                this.pubmedSearch.open();
            });
        }

        // AI Settings button
        const aiSettingsBtn = document.getElementById('aiSettingsBtn');
        if (aiSettingsBtn) {
            aiSettingsBtn.addEventListener('click', () => {
                this.aiSettings.open();
            });
        }
        
        // Клик по рабочей области - сброс активного поля
        const workspace = document.querySelector('.main-workspace');
        if (workspace) {
            workspace.addEventListener('click', (e) => {
                if (!e.target.closest('.form-input') && !e.target.closest('.variable-item')) {
                    document.querySelectorAll('.form-input').forEach(i => i.classList.remove('active-field'));
                    this.state.setActiveField(null);
                }
            });
        }
        
        // Выбор шаблона из любого меню
        document.querySelectorAll('.dropdown-item[data-template]').forEach(item => {
            item.addEventListener('click', () => {
                const template = item.dataset.template;
                this._selectTemplate(template);
            });
        });
        
        // Code mode
        if (this.codeModeBtn) {
            this.codeModeBtn.addEventListener('click', () => this._toggleCodeMode(true));
        }
        
        if (this.exitCodeModeBtn) {
            this.exitCodeModeBtn.addEventListener('click', () => this._toggleCodeMode(false));
        }
        
        if (this.runCodeBtn) {
            this.runCodeBtn.addEventListener('click', () => this._runCode());
        }
        
        const clearCodeBtn = document.getElementById('clearCodeBtn');
        if (clearCodeBtn) {
            clearCodeBtn.addEventListener('click', () => {
                if (this.codeEditor) this.codeEditor.value = '';
                if (this.codeResultsContainer) this.codeResultsContainer.innerHTML = '';
            });
        }
        
        const clearHistoryBtn = document.getElementById('clearHistoryBtn');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', async () => {
                if (!confirm('Delete ALL analysis history and plots for this project? This cannot be undone.')) return;
                
                try {
                    await fetch('http://127.0.0.1:8000/api/analysis/history', { method: 'DELETE' });
                    await fetch('http://127.0.0.1:8000/api/analysis/plots', { method: 'DELETE' });
                    
                    if (this.codeResultsContainer) {
                        this.codeResultsContainer.innerHTML = '<em style="color: var(--accent-green);">History and plots cleared.</em>';
                    }
                } catch (e) {
                    if (this.codeResultsContainer) {
                        this.codeResultsContainer.innerHTML = `<pre style="color: var(--accent-red);">Error: ${e.message}</pre>`;
                    }
                }
            });
        }
    }
    
    _selectTemplate(name) {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
        
        try {
            const model = ModelFactory.create(name, this.state, this.ui);
            model.createCard();
        } catch (error) {
            console.error(`Failed to create model "${name}":`, error);
            this.ui.modals.showAlert(`Template "${name}" not available yet`);
        }
    }
    
    _toggleCodeMode(show) {
        if (show) {
            this.ui.panels.hideEmptyState();
            (document.getElementById('analysisCards') == null ? void 0 : document.getElementById('analysisCards').classList).add('hidden');
            this.codeEditorContainer && this.codeEditorContainer.classList.remove('hidden');
        } else {
            this.codeEditorContainer && this.codeEditorContainer.classList.add('hidden');
            (document.getElementById('analysisCards') == null ? void 0 : document.getElementById('analysisCards').classList).remove('hidden');
            
            const analysisCards = document.getElementById('analysisCards');
            if (analysisCards && analysisCards.children.length === 0) {
                this.ui.panels.showEmptyState();
            }
        }
    }
    
    async _runCode() {
        const code = this.codeEditor && this.codeEditor.value;
        if (!code || !code.trim()) {
            this.ui.modals.showAlert('Enter some code first');
            return;
        }
        
        if (this.codeResultsContainer) {
            this.codeResultsContainer.innerHTML = '<em>Running...</em>';
        }
        
        try {
            const response = await fetch('http://127.0.0.1:8000/api/analysis/code/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            
            const result = await response.json();
            
            if (this.codeResultsContainer) {
                if (result.success) {
                    let html = '';
                    
                    if (result.output) {
                        html += `<pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">${result.output}</pre>`;
                    } else {
                        html += '<em>Done.</em>';
                    }
                    
                    const imgs = (result.output || '').match(/!\[.*?\]\(\/plots\/([^)]+)\)/g);
                    if (imgs) {
                        imgs.forEach(m => {
                            const f = m.match(/\/plots\/([^)]+)\)/)[1];
                            html += `<img src="/plots/${f}" style="width:100%;margin-top:8px;border-radius:8px;border:1px solid var(--border-primary);">`;
                        });
                    }
                    
                    this.codeResultsContainer.innerHTML = html;
                } else {
                    this.codeResultsContainer.innerHTML = `<pre style="color: var(--accent-red);">${result.error}</pre>`;
                }
            }
        } catch (error) {
            if (this.codeResultsContainer) {
                this.codeResultsContainer.innerHTML = `<pre style="color: var(--accent-red);">${error.message}</pre>`;
            }
        }
    }
}

// Запуск приложения
const app = new App();
app.init();

export { app };

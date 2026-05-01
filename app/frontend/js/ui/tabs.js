// js/ui/tabs.js - Управление табами в интерфейсе
export class TabManager {
    constructor() {
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabPanels = document.querySelectorAll('.tab-panel');
    }
    
    init() {
        this.setupListeners();
    }
    
    setupListeners() {
        this.tabBtns.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }
    
    switchTab(tabName) {
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        this.tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
        });
    }
    
    createResultTabs(container, tabs) {
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'results-tabs';
        
        const contentContainer = document.createElement('div');
        contentContainer.className = 'results-tab-content';
        
        const tabElements = [];
        const contentElements = [];
        
        tabs.forEach((tab, index) => {
            const tabBtn = this._createTabButton(tab.label, index === 0);
            const contentPane = this._createContentPane(index === 0);
            
            tabBtn.addEventListener('click', () => {
                // Убираем активный класс со всех табов
                tabElements.forEach(btn => {
                    btn.classList.remove('active-tab');
                    btn.style.background = 'transparent';
                    btn.style.color = 'var(--text-secondary)';
                });
                
                // Активируем текущий таб
                tabBtn.classList.add('active-tab');
                tabBtn.style.background = 'var(--accent-blue)';
                tabBtn.style.color = 'white';
                
                // Показываем соответствующий контент
                contentElements.forEach((pane, i) => {
                    pane.style.display = i === index ? 'block' : 'none';
                });
            });
            
            // Ховер эффект
            tabBtn.addEventListener('mouseenter', () => {
                if (!tabBtn.classList.contains('active-tab')) {
                    tabBtn.style.background = 'var(--bg-hover)';
                    tabBtn.style.color = 'var(--text-primary)';
                }
            });
            
            tabBtn.addEventListener('mouseleave', () => {
                if (!tabBtn.classList.contains('active-tab')) {
                    tabBtn.style.background = 'transparent';
                    tabBtn.style.color = 'var(--text-secondary)';
                }
            });
            
            tabsContainer.appendChild(tabBtn);
            contentContainer.appendChild(contentPane);
            
            tabElements.push(tabBtn);
            contentElements.push(contentPane);
        });
        
        container.appendChild(tabsContainer);
        container.appendChild(contentContainer);
        
        return contentElements;
    }
    
    _createTabButton(label, isActive) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.className = isActive ? 'active-tab' : '';
        btn.style.cssText = `
            padding: 8px 16px;
            background: ${isActive ? 'var(--accent-blue)' : 'transparent'};
            color: ${isActive ? 'white' : 'var(--text-secondary)'};
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
        `;
        
        return btn;
    }
    
    _createContentPane(isActive) {
        const pane = document.createElement('div');
        pane.className = 'tab-pane';
        pane.style.display = isActive ? 'block' : 'none';
        return pane;
    }
}

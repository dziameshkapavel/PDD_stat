// js/ui/panels.js - Управление панелями интерфейса
export class PanelManager {
    constructor() {
        this.leftPanel = document.getElementById('leftPanel');
        this.rightPanel = document.getElementById('rightPanel');
        this.collapseLeftBtn = document.getElementById('collapseLeftBtn');
        this.collapseRightBtn = document.getElementById('collapseRightBtn');
        this.emptyState = document.getElementById('emptyState');
        this.analysisCards = document.getElementById('analysisCards');
    }
    
    init() {
        this.setupListeners();
    }
    
    setupListeners() {
        if (this.collapseLeftBtn) {
            this.collapseLeftBtn.addEventListener('click', () => {
                this.leftPanel.classList.toggle('collapsed');
            });
        }
        
        if (this.collapseRightBtn) {
            this.collapseRightBtn.addEventListener('click', () => {
                this.rightPanel.classList.toggle('collapsed');
            });
        }
    }
    
    showEmptyState() {
        if (this.emptyState) {
            this.emptyState.classList.remove('hidden');
        }
    }
    
    hideEmptyState() {
        if (this.emptyState) {
            this.emptyState.classList.add('hidden');
        }
    }
    
    addCard(cardElement) {
        this.hideEmptyState();
        this.analysisCards.appendChild(cardElement);
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    removeCard(cardElement) {
        cardElement.remove();
        if (this.analysisCards.children.length === 0) {
            this.showEmptyState();
        }
    }
}

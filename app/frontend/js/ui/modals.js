// js/ui/modals.js - Управление модальными окнами
export class ModalManager {
    constructor(state) {
        this.state = state;
        this.cleaningModal = document.getElementById('cleaningModal');
        this.cleaningModalBody = document.getElementById('cleaningModalBody');
        this.applyCleaningBtn = document.getElementById('applyCleaningBtn');
        this.skipCleaningBtn = document.getElementById('skipCleaningBtn');
        this.cleaningModalClose = document.getElementById('cleaningModalClose');
    }
    
    init() {
        this.setupListeners();
    }
    
    setupListeners() {
        if (this.cleaningModalClose) {
            this.cleaningModalClose.addEventListener('click', () => this.hideCleaningModal());
        }
        
        if (this.applyCleaningBtn) {
            this.applyCleaningBtn.addEventListener('click', async () => {
                const callback = this.cleaningModal._onApply;
                this.hideCleaningModal();
                if (callback) await callback();
            });
        }
        
        if (this.skipCleaningBtn) {
            this.skipCleaningBtn.addEventListener('click', async () => {
                const callback = this.cleaningModal._onSkip;
                this.hideCleaningModal();
                if (callback) await callback();
            });
        }
    }
    
    showCleaningModal(data, onApply, onSkip) {
        this.cleaningModalBody.innerHTML = data.html;
        this.cleaningModal.dataset.cleaningPlan = JSON.stringify(data.plan);
        this.cleaningModal._onApply = onApply;
        this.cleaningModal._onSkip = onSkip;
        
        this.cleaningModal.classList.remove('hidden');
        this.cleaningModal.classList.add('active');
    }
    
    hideCleaningModal() {
        this.cleaningModal.classList.remove('active');
        setTimeout(() => this.cleaningModal.classList.add('hidden'), 300);
    }
    
    getCleaningPlan() {
        try {
            return JSON.parse(this.cleaningModal.dataset.cleaningPlan || '{}');
        } catch {
            return {};
        }
    }
    
    showAlert(message, type = 'info') {
        alert(message); // В будущем можно заменить на кастомный тост
    }
    
    showConfirm(message) {
        return confirm(message);
    }
    
    showPrompt(message, defaultValue = '') {
        return prompt(message, defaultValue);
    }
}

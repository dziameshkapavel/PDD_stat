// js/ui/modals.js - Управление модальными окнами
export class ModalManager {
    constructor(state) {
        this.state = state;
        this.cleaningModal = document.getElementById('cleaningModal');
        this.cleaningModalBody = document.getElementById('cleaningModalBody');
        this.applyCleaningBtn = document.getElementById('applyCleaningBtn');
        this.skipCleaningBtn = document.getElementById('skipCleaningBtn');
        this.cleaningModalClose = document.getElementById('cleaningModalClose');
        
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmModalMessage = document.getElementById('confirmModalMessage');
        this.confirmOkBtn = document.getElementById('confirmOkBtn');
        this.confirmCancelBtn = document.getElementById('confirmCancelBtn');
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
        alert(message);
    }
    
    showConfirm(message) {
        return new Promise((resolve) => {
            if (!this.confirmModal || !this.confirmModalMessage) {
                resolve(confirm(message));
                return;
            }
            
            this.confirmModalMessage.textContent = message;
            
            const okHandler = () => {
                this._hideConfirmModal();
                resolve(true);
            };
            const cancelHandler = () => {
                this._hideConfirmModal();
                resolve(false);
            };
            const closeHandler = (e) => {
                if (e.target === this.confirmModal) {
                    this._hideConfirmModal();
                    resolve(false);
                }
            };
            
            this.confirmOkBtn.addEventListener('click', okHandler, { once: true });
            this.confirmCancelBtn.addEventListener('click', cancelHandler, { once: true });
            this.confirmModal.addEventListener('click', closeHandler, { once: true });
            
            this.confirmModal.classList.remove('hidden');
            this.confirmModal.classList.add('active');
        });
    }
    
    _hideConfirmModal() {
        this.confirmModal.classList.remove('active');
        setTimeout(() => this.confirmModal.classList.add('hidden'), 300);
    }
    
    showPrompt(message, defaultValue = '') {
        return prompt(message, defaultValue);
    }
}

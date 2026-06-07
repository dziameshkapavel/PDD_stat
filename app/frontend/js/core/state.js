// js/core/state.js - Глобальное состояние приложения
export class AppState {
    constructor() {
        this.variableList = [];
        this.activeInputField = null;
        this.cardVariables = new Map();
        this.currentProject = null;
        this.listeners = new Map();
    }
    
    // Подписка на изменения
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    // Оповещение подписчиков
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data));
        }
    }
    
    // Работа с переменными
    setVariableList(list) {
        this.variableList = list;
        this.emit('variables:updated', list);
    }
    
    getVariableList() {
        return this.variableList;
    }
    
    async renameVariable(oldName, newName) {
        const response = await fetch(`${window.API_BASE || 'http://127.0.0.1:8000/api'}/projects/columns/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_name: oldName, new_name: newName })
        });
        if (response.ok) {
            const data = await response.json();
            this.setVariableList(data.columns);
        }
    }
    
    async deleteVariable(varName) {
        const response = await fetch(`${window.API_BASE || 'http://127.0.0.1:8000/api'}/projects/columns/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: varName })
        });
        if (response.ok) {
            const data = await response.json();
            this.setVariableList(data.columns);
        }
    }
    
    // Работа с активным полем ввода
    setActiveField(field) {
        this.activeInputField = field;
        this.emit('field:activated', field);
    }
    
    getActiveField() {
        return this.activeInputField;
    }
    
    // Работа с переменными карточек
    getCardVariables(cardId) {
        console.log('getCardVariables called with:', cardId);
        if (!this.cardVariables.has(cardId)) {
            console.log('Creating new cardVariables for:', cardId);
            this.cardVariables.set(cardId, {
                target: null,
                time: null,
                covariates: new Set(),
                event: null,
                group: null,
                stratify: null,
                predictors: new Set(),
                exclusions: new Set()
            });
        }
        const result = this.cardVariables.get(cardId);
        console.log('getCardVariables result:', JSON.stringify(result));
        return result;
    }
    
    updateCardVariable(cardId, field, value) {
        console.log('updateCardVariable:', cardId, field, value);
        const vars = this.getCardVariables(cardId);
        vars[field] = value;
        this.cardVariables.set(cardId, vars);
        this.emit('card:variables:updated', { cardId, field, value });
    }
    
    // Проект
    setCurrentProject(project) {
        this.currentProject = project;
        this.emit('project:changed', project);
    }
    
    getCurrentProject() {
        return this.currentProject;
    }
}

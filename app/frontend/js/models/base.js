// js/models/base.js - Базовый класс для всех статистических моделей
import { API_BASE } from '../core/api.js';

export class BaseModel {
    constructor(state, ui) {
        this.state = state;
        this.ui = ui;
        this.templateName = '';
        this.templatePrefix = '';
    }
    
    createCard() {
        throw new Error('createCard() must be implemented by subclass');
    }
    
    async run(card) {
        throw new Error('run() must be implemented by subclass');
    }
    
    renderResults(card, results) {
        throw new Error('renderResults() must be implemented by subclass');
    }
    
    createResultsBlock(card, title) {
        const template = document.getElementById('resultsBlockTemplate');
        const clone = template.content.cloneNode(true);
        const block = clone.querySelector('.results-block');
        block.querySelector('.results-title').textContent = 
            `Results: ${title} — ${new Date().toLocaleTimeString()}`;
        
        block.querySelector('.results-close-btn').addEventListener('click', () => block.remove());
        card.querySelector('.card-results-container').appendChild(block);
        block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        return block;
    }
    
    async displayPlots(block, exactPrefix = null, plotFiles = null) {
        try {
            let matching;
            const prefix = exactPrefix || this.templatePrefix;

            if (plotFiles !== null) {
                matching = plotFiles.slice();
                console.log(`Using exact plot list from metrics:`, matching);
            } else {
                const response = await fetch(`${API_BASE}/analysis/charts`);
                const data = await response.json();

                console.log(`Looking for plots with prefix: ${prefix}`);

                matching = data.charts
                    .filter(c => c.startsWith(prefix))
                    .sort();
                console.log(`Found ${matching.length} matching plots:`, matching);
            }
            
            console.log(`Found ${matching.length} matching plots:`, matching);
            
            if (matching.length > 0) {
                const plotsDiv = block.querySelector('.results-plots');
                if (!plotsDiv) return;
                
                plotsDiv.innerHTML = '';
                plotsDiv.style.marginTop = '16px';
                plotsDiv.style.width = '100%';
                
                // Показываем все подходящие графики
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:16px;';
                
                matching.forEach(chartFile => {
                    const img = document.createElement('img');
                    img.src = `/plots/${chartFile}`;
                    img.style.width = '100%';
                    img.style.height = 'auto';
                    img.style.borderRadius = '8px';
                    img.style.border = '1px solid var(--border-primary)';
                    img.style.cursor = 'pointer';
                    img.onclick = () => window.open(`/plots/${chartFile}`);
                    wrapper.appendChild(img);
                });
                
                plotsDiv.appendChild(wrapper);
                this._setupPlotControls(block, plotsDiv);
            } else {
                console.warn(`No plots found with prefix: ${prefix}`);
            }
        } catch (e) {
            console.error('Failed to load plots:', e);
        }
    }
    
    _setupPlotControls(block, plotsDiv) {
        let controlsDiv = block.querySelector('.results-controls');
        if (!controlsDiv) {
            controlsDiv = document.createElement('div');
            controlsDiv.className = 'results-controls';
            controlsDiv.style.marginTop = '12px';
            controlsDiv.style.display = 'flex';
            controlsDiv.style.justifyContent = 'flex-end';
            
            const container = plotsDiv.parentNode;
            container.insertBefore(controlsDiv, plotsDiv.nextSibling);
        }
        
        const toggleBtn = block.querySelector('.charts-toggle-btn');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                plotsDiv.classList.toggle('hidden');
                toggleBtn.textContent = plotsDiv.classList.contains('hidden') ? 'Show Charts' : 'Hide Charts';
            };
        }
    }
    
    setupFieldListeners(card) {
        const inputs = card.querySelectorAll('.form-input');
        console.log('Setting upFieldListeners, inputs count:', inputs.length);
        
        inputs.forEach((input, idx) => {
            console.log(`Input ${idx}: class="${input.className}", data-field="${input.dataset.field}"`);
            
            input.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const fieldName = input.dataset.field;
                console.log('=== FIELD CLICKED ===');
                console.log('input class:', input.className);
                console.log('fieldName:', fieldName);
                console.log('card.id:', card.id);
                console.log('=====================');
                
                document.querySelectorAll('.form-input').forEach(i => i.classList.remove('active-field'));
                input.classList.add('active-field');
                
                this.state.setActiveField({
                    element: input,
                    field: fieldName,
                    card
                });
                
                console.log('Active field set, activeField:', this.state.getActiveField());
                
                (document.querySelector('.tab-btn[data-tab="columns"]') == null ? void 0 : document.querySelector('.tab-btn[data-tab="columns"]').click());
            });
        });
    }
    
    setupTypeButtons(card) {
        const typeBtns = card.querySelectorAll('.analysis-type');
        const methodGroup = card.querySelector('.method-group');
        const methodBtns = card.querySelectorAll('.method-btn');
        
        typeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                typeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const isMulti = btn.dataset.type === 'multivariate';
                if (methodGroup) {
                    methodGroup.classList.toggle('hidden', !isMulti);
                }
                
                if (!isMulti) {
                    methodBtns.forEach(b => b.classList.remove('active'));
                } else {
                    const enterBtn = card.querySelector('.method-btn[data-method="enter"]');
                    if (enterBtn) enterBtn.classList.add('active');
                }
            });
        });
        
        methodBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                methodBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }
    
    removeCard(card) {
        this.ui.panels.removeCard(card);
    }
}

// Фабрика моделей
export class ModelFactory {
    static models = new Map();
    
    static register(name, modelClass) {
        this.models.set(name, modelClass);
    }
    
    static create(name, state, ui) {
        const ModelClass = this.models.get(name);
        if (!ModelClass) {
            throw new Error(`Model "${name}" not registered`);
        }
        return new ModelClass(state, ui);
    }
    
    static getAvailableModels() {
        return Array.from(this.models.keys());
    }
}

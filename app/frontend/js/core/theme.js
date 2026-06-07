// js/core/theme.js - Управление темой
export class ThemeManager {
    constructor() {
        this.body = document.body;
        this.currentTheme = 'light';
        this.toggleBtn = document.getElementById('themeToggle');
    }
    
    init() {
        this.loadTheme();
        this.setupListeners();
    }
    
    loadTheme() {
        const saved = localStorage.getItem('pddstat_theme') || 'light';
        this.setTheme(saved);
    }
    
    setTheme(theme) {
        this.currentTheme = theme;
        this.body.setAttribute('data-theme', theme);
        localStorage.setItem('pddstat_theme', theme);
    }
    
    toggle() {
        this.setTheme(this.currentTheme === 'light' ? 'dark' : 'light');
    }
    
    setupListeners() {
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggle());
        }
    }
}

// js/projects/manager.js - Управление проектами
import { APIClient } from '../core/api.js';
import { API_BASE } from '../core/api.js';

export class ProjectManager {
    constructor(state, modals) {
        this.state = state;
        this.modals = modals;
        this.projectsList = document.getElementById('projectsList');
        this.createProjectBtn = document.getElementById('createProjectBtn');
        this.fileInput = document.getElementById('fileInput');
        
        // Create project modal elements
        this.createProjectModal = document.getElementById('createProjectModal');
        this.newProjectNameInput = document.getElementById('newProjectName');
        this.newProjectFileInput = document.getElementById('newProjectFile');
        this.confirmCreateBtn = document.getElementById('confirmCreateProject');
        this.cancelCreateBtn = document.getElementById('cancelCreateProject');
        this.createProjectModalClose = document.getElementById('createProjectModalClose');
    }
    
    init() {
        this.setupListeners();
        this.loadProjectsList();
    }
    
    setupListeners() {
        if (this.createProjectBtn) {
            this.createProjectBtn.addEventListener('click', () => this.showCreateProjectModal());
        }
        
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }
        
        // Create project modal listeners
        if (this.confirmCreateBtn) {
            this.confirmCreateBtn.addEventListener('click', () => this.handleCreateProject());
        }
        
        if (this.cancelCreateBtn) {
            this.cancelCreateBtn.addEventListener('click', () => this.hideCreateProjectModal());
        }
        
        if (this.createProjectModalClose) {
            this.createProjectModalClose.addEventListener('click', () => this.hideCreateProjectModal());
        }
        
        if (this.createProjectModal) {
            this.createProjectModal.addEventListener('click', (e) => {
                if (e.target === this.createProjectModal) {
                    this.hideCreateProjectModal();
                }
            });
        }
    }
    
    showCreateProjectModal() {
        if (this.newProjectNameInput) {
            this.newProjectNameInput.value = '';
        }
        if (this.newProjectFileInput) {
            this.newProjectFileInput.value = '';
            const fileNameEl = document.getElementById('newProjectFileName');
            if (fileNameEl) fileNameEl.textContent = '📂 Choose file...';
            
            this.newProjectFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file && fileNameEl) {
                    fileNameEl.textContent = '📄 ' + file.name;
                }
            }, { once: true });
        }
        this.createProjectModal.classList.remove('hidden');
        this.createProjectModal.classList.add('active');
        if (this.newProjectNameInput) {
            this.newProjectNameInput.focus();
        }
    }
    
    hideCreateProjectModal() {
        this.createProjectModal.classList.remove('active');
        setTimeout(() => this.createProjectModal.classList.add('hidden'), 300);
    }
    
    async handleCreateProject() {
        const name = this.newProjectNameInput && this.newProjectNameInput.value && this.newProjectNameInput.value.trim();
        const file = this.newProjectFileInput && this.newProjectFileInput.files[0];
        
        if (!name) {
            this.modals.showAlert('Please enter a project name');
            return;
        }
        
        if (!file) {
            this.modals.showAlert('Please select a data file');
            return;
        }
        
        try {
            // 1. Create project
            await APIClient.call(`/projects/create?name=${encodeURIComponent(name)}`, { method: 'POST' });
            
            // 2. Upload file
            const formData = new FormData();
            formData.append('file', file);
            const data = await APIClient.uploadFile('/projects/upload', formData);
            
            // 3. Show cleaning modal
            const plan = data.cleaning_plan;
            let html = `<p><strong>File:</strong> ${data.filename}</p>`;
            html += `<p><strong>Rows:</strong> ${data.audit.shape.rows}, <strong>Columns:</strong> ${data.audit.shape.columns}</p>`;
            
            if (plan.drop_columns && plan.drop_columns.length) {
                html += `<p><strong>Recommended to drop:</strong> ${plan.drop_columns.join(", ")}</p>`;
            }
            if (plan.to_impute && plan.to_impute.length) {
                html += `<p><strong>Will impute:</strong> ${plan.to_impute.map(i => i.column).join(", ")}</p>`;
            }
            
            // Close create modal first
            this.hideCreateProjectModal();
            
            // Then show cleaning modal
            this.modals.showCleaningModal(
                { html, plan },
                async () => {
                    await APIClient.call('/projects/clean?apply=true', { method: 'POST' });
                    await this.loadProjectsList();
                    await this.openProject(name);
                },
                async () => {
                    await APIClient.call('/projects/clean?apply=false', { method: 'POST' });
                    await this.loadProjectsList();
                    await this.openProject(name);
                }
            );
            
        } catch (error) {
            this.modals.showAlert('Failed to create project: ' + error.message);
        }
    }
    
    async loadProjectsList() {
        const header = this.projectsList.querySelector('.projects-header');
        
        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const data = await APIClient.call("/projects/");
                const projects = data.projects || [];
                
                this.projectsList.innerHTML = '';
                if (header) this.projectsList.appendChild(header);
                
                projects.forEach(proj => {
                    const item = this._createProjectItem(proj);
                    this.projectsList.appendChild(item);
                });
                return;
            } catch (error) {
                console.error('Failed to load projects (attempt', attempt + 1, '):', error);
                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }
        
        this.projectsList.innerHTML = '';
        if (header) this.projectsList.appendChild(header);
        const msg = document.createElement('div');
        msg.className = 'placeholder-text';
        msg.textContent = '⚠ Could not load project list. Is the backend running?';
        this.projectsList.appendChild(msg);
    }
    
    _createProjectItem(projectName) {
        const item = document.createElement('div');
        item.className = 'project-item';
        item.dataset.projectId = projectName;
        const safeName = projectName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        item.innerHTML = `
            <span class="project-name">${safeName}</span>
            <button class="data-preview-btn" title="View data">⊞</button>
            <button class="context-project-btn" title="Project context">✎</button>
            <button class="delete-project-btn" title="Delete project">✕</button>
        `;
        
        const dataBtn = item.querySelector('.data-preview-btn');
        dataBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openDataPreview(projectName);
        });
        
        const deleteBtn = item.querySelector('.delete-project-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteProject(projectName);
        });
        
        const contextBtn = item.querySelector('.context-project-btn');
        contextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openContextModal(projectName);
        });
        
        item.addEventListener('click', async () => {
            await this.openProject(projectName);
        });
        
        return item;
    }
    
    async openProject(name) {
        try {
            await APIClient.call(`/projects/open?name=${encodeURIComponent(name)}`, { method: 'POST' });
            
            document.querySelectorAll('.project-item').forEach(p => p.classList.remove('active'));
            const activeItem = Array.from(document.querySelectorAll('.project-item'))
                .find(el => el.dataset.projectId === name);
            if (activeItem) activeItem.classList.add('active');
            
            this.state.setCurrentProject(name);
            await this.loadColumns();
        } catch (error) {
            this.modals.showAlert('Failed to open project: ' + error.message);
        }
    }
    
    async deleteProject(name) {
        const confirmed = await this.modals.showConfirm(`Delete project "${name}"?`);
        if (!confirmed) return;
        
        try {
            await APIClient.call(`/projects/${encodeURIComponent(name)}`, { method: 'DELETE' });
            await this.loadProjectsList();
        } catch (error) {
            this.modals.showAlert('Failed to delete project: ' + error.message);
        }
    }
    
    async loadColumns() {
        try {
            const data = await APIClient.call("/projects/columns");
            this.state.setVariableList(data.columns);
            console.log("Columns loaded:", data.columns.length);
        } catch (error) {
            console.error("Failed to load columns:", error);
            this.state.setVariableList([]);
        }
    }
    
    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // Check if project is open
        if (!this.state.currentProject) {
            this.modals.showAlert('Please open a project first');
            this.fileInput.value = '';
            return;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const data = await APIClient.uploadFile('/projects/upload', formData);
            
            const plan = data.cleaning_plan;
            let html = `<p><strong>File:</strong> ${data.filename}</p>`;
            html += `<p><strong>Rows:</strong> ${data.audit.shape.rows}, <strong>Columns:</strong> ${data.audit.shape.columns}</p>`;
            
            if (plan.drop_columns && plan.drop_columns.length) {
                html += `<p><strong>Recommended to drop:</strong> ${plan.drop_columns.join(", ")}</p>`;
            }
            if (plan.to_impute && plan.to_impute.length) {
                html += `<p><strong>Will impute:</strong> ${plan.to_impute.map(i => i.column).join(", ")}</p>`;
            }
            
            this.modals.showCleaningModal(
                { html, plan },
                async () => {
                    await APIClient.call('/projects/clean?apply=true', { method: 'POST' });
                    await this.loadColumns();
                },
                async () => {
                    await APIClient.call('/projects/clean?apply=false', { method: 'POST' });
                    await this.loadColumns();
                }
            );
        } catch (error) {
            this.modals.showAlert('Upload error: ' + error.message);
        }
        
        this.fileInput.value = '';
    }
    
    async _openContextModal(projectName) {
        let context = { description: '', aim: '', notes: '' };
        try {
            const response = await fetch(`${API_BASE}/ai/context`);
            const data = await response.json();
            context = data.context || context;
        } catch (e) {}

        const old = document.getElementById('contextModal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'contextModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px;">
                <div class="modal-header">
                    <h3>Project Context: ${projectName}</h3>
                    <button class="modal-close" id="contextModalClose">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Description</label>
                        <textarea class="form-input" id="ctxDescription" rows="3" style="width:100%;">${this._escape(context.description || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Research Aim</label>
                        <textarea class="form-input" id="ctxAim" rows="3" style="width:100%;">${this._escape(context.aim || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Notes</label>
                        <textarea class="form-input" id="ctxNotes" rows="2" style="width:100%;">${this._escape(context.notes || '')}</textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="contextModalCancel">Cancel</button>
                    <button class="btn-primary" id="contextModalSave">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#contextModalClose').addEventListener('click', () => modal.remove());
        modal.querySelector('#contextModalCancel').addEventListener('click', () => modal.remove());
        modal.querySelector('#contextModalSave').addEventListener('click', async () => {
            const description = modal.querySelector('#ctxDescription').value;
            const aim = modal.querySelector('#ctxAim').value;
            const notes = modal.querySelector('#ctxNotes').value;

            try {
                await fetch(`${API_BASE}/ai/context`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description, aim, notes })
                });
            } catch (e) {
                console.error('Failed to save context:', e);
            }
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    _escape(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async _openDataPreview(projectName) {
        if (this.state.currentProject !== projectName) {
            try {
                await this.openProject(projectName);
            } catch (error) {
                this.modals.showAlert('Failed to open project: ' + error.message);
                return;
            }
        }
        await this._showDataModal();
    }

    async _showDataModal() {
        const old = document.getElementById('dataModal');
        if (old) old.remove();

        let edits = {};
        let editMode = false;
        let currentPage = 0;
        const PAGE_SIZE = 200;

        const modal = document.createElement('div');
        modal.id = 'dataModal';
        modal.className = 'modal active data-modal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Data Table</h3>
                    <button class="modal-close" id="dataModalClose">&times;</button>
                </div>
                <div class="modal-body data-modal-body"></div>
                <div class="modal-footer" style="justify-content:space-between;">
                    <div>
                        <span class="editing-indicator" style="font-size:12px;"></span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="btn-secondary" id="dataEditToggleBtn">Edit</button>
                        <button class="btn-primary" id="dataSaveBtn" style="display:none;">Save</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const body = modal.querySelector('.data-modal-body');
        const editToggleBtn = modal.querySelector('#dataEditToggleBtn');
        const saveBtn = modal.querySelector('#dataSaveBtn');
        const indicator = modal.querySelector('.editing-indicator');

        const renderPage = async (page) => {
            const offset = page * PAGE_SIZE;
            let data;
            try {
                const resp = await fetch(`${API_BASE}/projects/data?offset=${offset}&limit=${PAGE_SIZE}`);
                if (!resp.ok) throw new Error(await resp.text());
                data = await resp.json();
            } catch (err) {
                body.innerHTML = `<div class="placeholder-text" style="padding:40px;text-align:center;color:var(--accent-red);">Error: ${this._escape(err.message)}</div>`;
                return;
            }

            currentPage = page;

            if (!data.columns.length) {
                body.innerHTML = '<div class="placeholder-text" style="padding:40px;text-align:center;">Project has no data</div>';
                return;
            }

            const wrap = document.createElement('div');
            wrap.className = 'data-table-wrap';

            const table = document.createElement('table');
            table.className = 'data-table';

            const thead = document.createElement('thead');
            const hr = document.createElement('tr');
            const th0 = document.createElement('th');
            th0.textContent = '#';
            hr.appendChild(th0);
            data.columns.forEach(c => {
                const th = document.createElement('th');
                th.textContent = c;
                hr.appendChild(th);
            });
            thead.appendChild(hr);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            data.rows.forEach((row, i) => {
                const absRow = offset + i;
                const tr = document.createElement('tr');

                const td0 = document.createElement('td');
                td0.textContent = absRow + 1;
                tr.appendChild(td0);

                row.forEach((val, j) => {
                    const col = data.columns[j];
                    const key = `${absRow}:${col}`;
                    const displayVal = edits.hasOwnProperty(key) ? edits[key] : val;
                    const td = document.createElement('td');

                    if (displayVal === null || displayVal === undefined) {
                        td.textContent = '—';
                        td.className = 'cell-null';
                    } else {
                        td.textContent = String(displayVal);
                    }

                    if (editMode) {
                        td.className = 'cell-edit';
                        td.addEventListener('click', () => {
                            if (td.querySelector('input')) return;
                            const input = document.createElement('input');
                            const curr = edits.hasOwnProperty(key) ? edits[key] : val;
                            input.value = curr === null || curr === undefined ? '' : String(curr);
                            td.textContent = '';
                            td.appendChild(input);
                            input.focus();

                            const commit = () => {
                                const v = input.value;
                                edits[key] = v === '' ? null : v;
                                td.textContent = edits[key] === null ? '—' : edits[key];
                                td.className = 'cell-edit';
                                const count = Object.keys(edits).length;
                                indicator.textContent = count ? `✎ ${count} cell(s) edited` : '';
                                indicator.style.color = count ? 'var(--accent-red)' : '';
                            };

                            input.addEventListener('blur', commit);
                            input.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                                if (e.key === 'Escape') {
                                    delete edits[key];
                                    td.textContent = val === null || val === undefined ? '—' : String(val);
                                    td.className = 'cell-edit';
                                }
                            });
                        });
                    }

                    tr.appendChild(td);
                });

                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            wrap.appendChild(table);
            body.innerHTML = '';
            body.appendChild(wrap);

            const totalPages = Math.ceil(data.total / PAGE_SIZE);
            const pagination = modal.querySelector('.data-pagination');
            if (pagination) pagination.remove();

            const pg = document.createElement('div');
            pg.className = 'data-pagination';

            const prevBtn = document.createElement('button');
            prevBtn.className = 'page-btn';
            prevBtn.textContent = '◀ Prev';
            prevBtn.disabled = page === 0;
            prevBtn.addEventListener('click', () => {
                if (editMode && Object.keys(edits).length && !confirm('Unsaved edits will be lost. Continue?')) return;
                edits = {}; indicator.textContent = '';
                renderPage(page - 1);
            });
            pg.appendChild(prevBtn);

            const info = document.createElement('span');
            info.className = 'page-info';
            info.textContent = `Page ${page + 1} / ${totalPages} (${data.total} rows)`;
            pg.appendChild(info);

            const nextBtn = document.createElement('button');
            nextBtn.className = 'page-btn';
            nextBtn.textContent = 'Next ▶';
            nextBtn.disabled = page >= totalPages - 1;
            nextBtn.addEventListener('click', () => {
                if (editMode && Object.keys(edits).length && !confirm('Unsaved edits will be lost. Continue?')) return;
                edits = {}; indicator.textContent = '';
                renderPage(page + 1);
            });
            pg.appendChild(nextBtn);

            const footer = modal.querySelector('.modal-footer');
            footer.insertBefore(pg, footer.firstChild);
        };

        editToggleBtn.addEventListener('click', () => {
            editMode = !editMode;
            editToggleBtn.textContent = editMode ? 'Cancel Edit' : 'Edit';
            editToggleBtn.className = editMode ? 'btn-primary' : 'btn-secondary';
            saveBtn.style.display = editMode ? 'inline-block' : 'none';
            if (!editMode) { edits = {}; indicator.textContent = ''; }
            renderPage(currentPage);
        });

        saveBtn.addEventListener('click', async () => {
            const changes = Object.entries(edits).map(([key, value]) => {
                const [row, col] = key.split(':');
                return { row: parseInt(row), col, value: value === null ? null : String(value) };
            });
            if (!changes.length) { this.modals.showAlert('No changes'); return; }
            try {
                const resp = await fetch(`${API_BASE}/projects/data/edit`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ changes })
                });
                if (!resp.ok) throw new Error(await resp.text());
                edits = {};
                editMode = false;
                editToggleBtn.textContent = 'Edit';
                editToggleBtn.className = 'btn-secondary';
                saveBtn.style.display = 'none';
                indicator.textContent = '✓ Saved';
                indicator.style.color = 'var(--accent-green)';
                setTimeout(() => { indicator.textContent = ''; indicator.style.color = ''; }, 2000);
                await renderPage(currentPage);
            } catch (err) {
                this.modals.showAlert('Save failed: ' + err.message);
            }
        });

        modal.querySelector('#dataModalClose').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (editMode && Object.keys(edits).length && !confirm('Unsaved edits will be lost. Close?')) return;
                modal.remove();
            }
        });

        await renderPage(0);
    }
}

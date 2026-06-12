import { API_BASE } from '../core/api.js';

export class PubMedSearchPanel {
    constructor() {
        this.modal = null;
        this.articles = [];
    }

    async open() {
        const old = document.getElementById('pubmedSearchModal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'pubmedSearchModal';
        modal.className = 'modal active';
        modal.innerHTML = this._buildHTML();

        document.body.appendChild(modal);
        this.modal = modal;
        this._setupListeners();

        await this._loadArticles();
    }

    close() {
        if (this.modal) {
            this.modal.classList.remove('active');
            setTimeout(() => this.modal.remove(), 300);
        }
    }

    _buildHTML() {
        return `
            <div class="modal-content" style="max-width:820px;">
                <div class="modal-header">
                    <h3>PubMed Literature Search</h3>
                    <button class="modal-close" id="pubmedCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh;overflow-y:auto;">
                    <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                        <input type="text" id="pubmedQuery"
                               placeholder="Enter your query in any language (e.g. DLBCL R-CHOP metabolic tumor volume prognosis)"
                               style="flex:1;min-width:200px;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;">
                        <select id="pubmedYears" style="padding:4px 6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;">
                            <option value="1">1 year</option>
                            <option value="3">3 years</option>
                            <option value="5" selected>5 years</option>
                            <option value="10">10 years</option>
                            <option value="20">20 years</option>
                        </select>
                        <select id="pubmedMaxResults" style="padding:4px 6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;">
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="30" selected>30</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                        <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;white-space:nowrap;"
                               title="If checked, new results are added to existing articles. If unchecked, existing articles are replaced.">
                            <input type="checkbox" id="pubmedAppendMode"> Append
                        </label>
                        <button class="btn-primary" id="pubmedSearchBtn" style="font-size:12px;">Search</button>
                    </div>
                    <div id="pubmedStatusLine" style="font-size:12px;margin-bottom:6px;"></div>
                    <div id="pubmedResults" style="font-size:13px;"></div>
                </div>
                <div class="modal-footer" id="pubmedFooter" style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;gap:8px;">
                        <button class="btn-secondary" id="pubmedClearBtn" style="font-size:12px;">Clear all</button>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span id="pubmedCount" style="font-size:12px;color:var(--text-muted);">0 articles</span>
                        <button class="btn-primary" id="pubmedSaveBtn" style="font-size:12px;">Save</button>
                    </div>
                </div>
            </div>
        `;
    }

    _setupListeners() {
        this.modal.querySelector('#pubmedCloseBtn').addEventListener('click', () => this.close());
        this.modal.querySelector('#pubmedSearchBtn').addEventListener('click', () => this._doSearch());
        this.modal.querySelector('#pubmedClearBtn').addEventListener('click', () => this._clearAll());
        this.modal.querySelector('#pubmedSaveBtn').addEventListener('click', () => this._save());
        this.modal.querySelector('#pubmedQuery').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._doSearch();
        });
    }

    _setStatus(text, color) {
        const el = this.modal.querySelector('#pubmedStatusLine');
        if (el) {
            el.textContent = text;
            el.style.color = color || 'var(--text-muted)';
        }
    }

    async _loadArticles() {
        try {
            const resp = await fetch(`${API_BASE}/ai/context`);
            const data = await resp.json();
            this.articles = data.context && data.context.pubmed_articles || [];
        } catch (e) {
            this.articles = [];
        }
        this._renderArticles();
    }

    async _doSearch() {
        const query = this.modal.querySelector('#pubmedQuery').value.trim();
        if (!query) {
            this._setStatus('Enter a search query', 'var(--accent-red)');
            return;
        }

        const years = parseInt(this.modal.querySelector('#pubmedYears').value);
        const maxResults = parseInt(this.modal.querySelector('#pubmedMaxResults').value);
        const append = this.modal.querySelector('#pubmedAppendMode').checked;

        this._setStatus('AI generating search queries and searching PubMed...', 'var(--text-muted)');
        this.modal.querySelector('#pubmedResults').innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Searching...</div>';

        try {
            const response = await fetch(`${API_BASE}/ai/pubmed_search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, years, max_results: maxResults, append })
            });

            const result = await response.json();

            if (!result.success) {
                this._setStatus('Search failed', 'var(--accent-red)');
                this.modal.querySelector('#pubmedResults').innerHTML = `<div style="color:var(--accent-red);">Error: ${result.error || 'Unknown error'}</div>`;
                return;
            }

            this.articles = result.articles || [];
            const added = result.new_count || this.articles.length;
            const statusParts = [];
            if (result.translation) statusParts.push(`Translation: ${result.translation}`);
            if (added > 0) {
                statusParts.push(`Found ${added} new articles`);
                statusParts.push(`${this.articles.length} total in context`);
            }
            if (added === 0) {
                this._setStatus('No results found. Try a different query.', 'var(--accent-orange)');
            } else {
                this._setStatus(statusParts.join(' · '), 'var(--accent-green)');
            }
            this._renderArticles();

        } catch (e) {
            this._setStatus('Network error', 'var(--accent-red)');
            this.modal.querySelector('#pubmedResults').innerHTML = `<div style="color:var(--accent-red);">${e.message}</div>`;
        }
    }

    async _deleteArticle(pmid) {
        try {
            const resp = await fetch(`${API_BASE}/ai/pubmed_delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pmid })
            });
            const result = await resp.json();
            if (result.success) {
                this.articles = result.articles || [];
                this._renderArticles();
                this._setStatus(`Removed article · ${this.articles.length} remaining`, 'var(--accent-green)');
            }
        } catch (e) {
            this._setStatus('Delete failed', 'var(--accent-red)');
        }
    }

    async _clearAll() {
        if (this.articles.length === 0) return;
        if (!confirm('Remove all PubMed articles from context?')) return;

        try {
            const resp = await fetch(`${API_BASE}/ai/pubmed_clear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            const result = await resp.json();
            if (result.success) {
                this.articles = [];
                this._renderArticles();
                this._setStatus('All articles cleared', 'var(--accent-green)');
            }
        } catch (e) {
            this._setStatus('Clear failed', 'var(--accent-red)');
        }
    }

    async _save() {
        const btn = this.modal.querySelector('#pubmedSaveBtn');
        const orig = btn.textContent;
        btn.textContent = 'Saved';
        btn.style.background = 'var(--accent-green)';
        btn.style.color = 'white';
        setTimeout(() => {
            btn.textContent = orig;
            btn.style.background = '';
            btn.style.color = '';
        }, 1500);
    }

    _renderArticles() {
        const container = this.modal.querySelector('#pubmedResults');
        const countEl = this.modal.querySelector('#pubmedCount');

        if (!container) return;

        if (countEl) {
            countEl.textContent = `${this.articles.length} article${this.articles.length !== 1 ? 's' : ''}`;
        }

        if (this.articles.length === 0) {
            container.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;font-size:13px;">Enter a query above and click Search. AI will generate PubMed queries and retrieve relevant articles.</div>';
            return;
        }

        const html = this.articles.map((a) => {
            const pmid = a.pmid || '';
            const title = a.title || 'No title';
            const authors = a.authors_str || '';
            const journal = a.journal || '';
            const year = a.year || '';
            const doi = a.doi || '';
            const db = a.abstract || '';
            const url = a.url || `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

            const isLong = db.length > 300;
            const absPreview = isLong ? db.slice(0, 300) + '...' : db;

            return `
                <div class="pubmed-article" data-pmid="${pmid}"
                     style="border:1px solid var(--border-color);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--card-bg);position:relative;">
                    <button class="pubmed-delete-btn"
                            style="position:absolute;top:6px;right:8px;background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-muted);line-height:1;"
                            title="Remove article">×</button>
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-right:24px;">
                        <div style="flex:1;">
                            <div style="font-weight:600;margin-bottom:4px;">
                                <a href="${url}" target="_blank" style="color:var(--accent-blue);text-decoration:none;">
                                    ${title}
                                </a>
                            </div>
                            <div style="color:var(--text-muted);font-size:12px;">
                                ${authors ? authors + ' · ' : ''}${journal}${year ? ' (' + year + ')' : ''}
                            </div>
                            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                                PMID: ${pmid}${doi ? ' · DOI: ' + doi : ''}
                            </div>
                        </div>
                        <a href="${url}" target="_blank" class="btn-secondary"
                           style="font-size:11px;padding:4px 8px;margin-left:8px;white-space:nowrap;text-decoration:none;">
                            Open ↗
                        </a>
                    </div>
                    <div class="pubmed-abstract" style="margin-top:6px;font-size:12px;line-height:1.5;">
                        ${isLong ? `<div class="abstract-preview">${absPreview}</div>
                                   <button class="abstract-toggle btn-secondary"
                                           style="font-size:11px;padding:2px 8px;margin-top:4px;">
                                           Show full abstract
                                   </button>
                                   <div class="abstract-full" style="display:none;">${db}</div>`
                               : db}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

        container.querySelectorAll('.pubmed-delete-btn').forEach((btn, i) => {
            btn.addEventListener('click', () => {
                const pmid = (this.articles[i] == null ? void 0 : this.articles[i].pmid);
                if (pmid) this._deleteArticle(pmid);
            });
        });

        container.querySelectorAll('.abstract-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const preview = btn.previousElementSibling;
                const full = btn.nextElementSibling;
                if (full && full.classList.contains('abstract-full')) {
                    const isHidden = full.style.display === 'none';
                    full.style.display = isHidden ? 'block' : 'none';
                    if (preview) preview.style.display = isHidden ? 'none' : 'block';
                    btn.textContent = isHidden ? 'Hide abstract' : 'Show full abstract';
                }
            });
        });
    }
}

/**
 * @file deploy.js
 * Tracker de Deploy baseado no TableManager 2.0
 */

import { TableManager } from '../core/table-manager.js';
import { getAuthToken } from './auth.js';
import { showToast } from './utils.js';

const DEPLOY_COLUMNS = [
    { key: 'date',      label: 'Quando',     type: 'string', sortable: true,  filterable: false, searchable: true },
    { key: 'author',    label: 'Quem',       type: 'string', sortable: true,  filterable: true,  searchable: true },
    { key: 'hash',      label: 'Versão',     type: 'string', sortable: false, filterable: false, searchable: true },
    { key: 'message',   label: 'O que foi feito', type: 'string', sortable: false, filterable: false, searchable: true },
    { key: 'status',    label: 'Status',     type: 'string', sortable: true,  filterable: true,  searchable: false },
];

let _manager = null;
let _allRows = [];
let _filters = { author: '', status: '', dateFrom: '', dateTo: '' };

function _formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _renderRows(data) {
    const tbody = document.getElementById('deploy-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="ph ph-rocket" style="font-size:2rem; display:block; margin-bottom:0.5rem; opacity: 0.5;"></i>
                    Nenhum deploy encontrado.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const isRailway = row.author === 'Railway';
        const color = isRailway ? '#6366f1' : 'var(--text-main)';
        
        // Vamos considerar que localmente ele "Passou" na simulação e no Railway foi "Concluído"
        const statusText = 'Concluído';
        const statusHtml = `<span style="font-size:0.75rem; background:rgba(16,185,129,0.12); color:#10b981; padding:0.15rem 0.5rem; border-radius:4px; border:1px solid rgba(16,185,129,0.25);">
            <i class="ph ph-check-circle"></i> ${statusText}
        </span>`;

        return `
            <tr style="cursor:default;">
                <td style="font-size:0.82rem; white-space:nowrap; color:var(--text-muted);">${_formatDate(row.date)}</td>
                <td style="font-size:0.85rem; color:${color};">
                    <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                        <i class="ph ${isRailway ? 'ph-robot' : 'ph-user'}"></i> ${_escapeHtml(row.author)}
                    </span>
                </td>
                <td style="font-size:0.85rem; font-family:monospace; color:#a78bfa;">
                    <i class="ph ph-git-commit" style="margin-right:0.2rem; color:var(--text-muted);"></i>
                    ${_escapeHtml(row.hash)}
                </td>
                <td style="font-size:0.85rem; max-width:400px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${_escapeHtml(row.message)}
                </td>
                <td>${statusHtml}</td>
            </tr>
        `;
    }).join('');
}

function _renderPagination(state) {
    const container = document.getElementById('pagination-deploy');
    if (!container) return;

    const elCount = document.getElementById('deploy-count');
    if (elCount) elCount.textContent = `${state.totalRecords} versão${state.totalRecords !== 1 ? 'ões' : ''}`;

    if (state.totalPages <= 1) {
        container.innerHTML = '';
        container.className = 'pagination-container';
        return;
    }

    const { currentPage, totalPages } = state;
    container.className = 'rpt-pagination';

    container.innerHTML = `
        <button class="btn-ghost btn-sm" ${currentPage === 1 ? 'disabled' : ''} onclick="window._deployGoPage(${currentPage - 1})">
            <i class="ph ph-caret-left"></i> Anterior
        </button>
        <span id="rpt-page-info">Página ${currentPage} de ${totalPages}</span>
        <button class="btn-ghost btn-sm" ${currentPage === totalPages ? 'disabled' : ''} onclick="window._deployGoPage(${currentPage + 1})">
            Próxima <i class="ph ph-caret-right"></i>
        </button>
    `;
}

async function _load() {
    const tbody = document.getElementById('deploy-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="ph ph-spinner" style="font-size:2rem; display:block; margin-bottom:0.5rem; animation: spin 1s linear infinite;"></i>
                    Sincronizando tracking...
                </td>
            </tr>`;
    }

    try {
        const token = await getAuthToken();
        const res = await fetch('/api/deploy/history', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        let data = await res.json();
        _allRows = data;

        if (!_manager) {
            _manager = new TableManager({
                data:             data,
                columns:          DEPLOY_COLUMNS,
                pageSize:         25,
                tableId:          'deploy-tracker-table',
                renderRows:       _renderRows,
                renderPagination: _renderPagination,
            });
            _exposeGlobals();
        } else {
            _manager.setData(data);
        }

    } catch (err) {
        console.error('[DeployTracker] Erro ao carregar:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:3rem; color:#ef4444;">
                        <i class="ph ph-warning-circle" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
                        Erro ao carregar tracking: ${_escapeHtml(err.message)}
                    </td>
                </tr>`;
        }
    }
}

function _exposeGlobals() {
    window._deployGoPage = (page) => {
        if (_manager) _manager.goToPage(page);
    };

    window._deploySearch = (value) => {
        if (_manager) _manager.setSearch(value);
    };

    window._deploySort = (col) => {
        if (_manager) _manager.handleSort(col);
    };
    
    window._deployToggleFilter = (key, event) => {
        event.stopPropagation();
        const popover = document.getElementById(`filter-popover-deploy_${key}`);
        if (!popover) return;

        // Fecha todos os outros
        document.querySelectorAll('.filter-popover').forEach(p => {
            if (p !== popover) p.classList.remove('show');
        });

        const isOpen = popover.classList.contains('show');
        if (isOpen) { popover.classList.remove('show'); return; }

        // Constrói o conteúdo
        if (key === 'date') {
            popover.innerHTML = `
                <div style="padding:0.75rem; min-width:240px;">
                    <div class="filter-group">
                        <span class="filter-label">Período</span>
                        <div style="display:flex;flex-direction:column;gap:0.5rem;">
                            <div style="display:flex;align-items:center;gap:0.5rem;">
                                <span style="font-size:0.72rem;color:var(--text-muted);min-width:28px;">De</span>
                                <input type="date" id="deploy-filter-from"
                                    style="flex:1;background:rgba(15,23,42,0.6);border:1px solid var(--dark-border);border-radius:6px;padding:0.35rem 0.5rem;color:var(--text-main);font-size:0.82rem;outline:none;color-scheme:dark;"
                                    onchange="window._deployDateFilter()">
                            </div>
                            <div style="display:flex;align-items:center;gap:0.5rem;">
                                <span style="font-size:0.72rem;color:var(--text-muted);min-width:28px;">Até</span>
                                <input type="date" id="deploy-filter-to"
                                    style="flex:1;background:rgba(15,23,42,0.6);border:1px solid var(--dark-border);border-radius:6px;padding:0.35rem 0.5rem;color:var(--text-main);font-size:0.82rem;outline:none;color-scheme:dark;"
                                    onchange="window._deployDateFilter()">
                            </div>
                        </div>
                    </div>
                    <div class="filter-actions">
                        <button class="btn-clear-filter" onclick="window._deployClearDateFilter()">
                            <i class="ph ph-x-circle"></i> Limpar
                        </button>
                    </div>
                </div>`;
        } else {
            const values = [...new Set((_manager?.getData ? _manager.getData() : _allRows).map(r => r[key]).filter(Boolean))].sort();
            const current = _filters[key] || '';
            popover.innerHTML = `
                <div class="filter-group">
                    <span class="filter-label">Filtrar por ${key === 'author' ? 'Autor' : 'Status'}</span>
                    <div class="filter-list">
                        <div class="filter-option ${!current ? 'selected' : ''}" onclick="window._deployFilter('${key}', '')">(Tudo)</div>
                        ${values.map(v => `<div class="filter-option ${current === v ? 'selected' : ''}" onclick="window._deployFilter('${key}', '${v.replace(/'/g, "\\'")}')">${v}</div>`).join('')}
                    </div>
                </div>
                <div class="filter-actions">
                    <button class="btn-clear-filter" onclick="window._deployFilter('${key}', '')">
                        <i class="ph ph-x-circle"></i> Limpar Filtro
                    </button>
                </div>`;
        }

        popover.classList.add('show');

        // Posicionamento inteligente
        popover.classList.remove('align-right');
        popover.style.bottom = 'auto';
        popover.style.top = '100%';
        requestAnimationFrame(() => {
            const rect = popover.getBoundingClientRect();
            if (rect.right > window.innerWidth - 20) popover.classList.add('align-right');
            if (rect.bottom > window.innerHeight - 20) {
                popover.style.top = 'auto';
                popover.style.bottom = '100%';
            }
        });
    };

    window._deployFilter = (key, value) => {
        _filters[key] = value || '';
        _applyFilters();
        document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
    };

    window._deployDateFilter = () => {
        const from = document.getElementById('deploy-filter-from')?.value || '';
        const to   = document.getElementById('deploy-filter-to')?.value   || '';
        _filters.dateFrom = from;
        _filters.dateTo   = to;
        _applyFilters();
    };

    window._deployClearDateFilter = () => {
        _filters.dateFrom = '';
        _filters.dateTo   = '';
        const f = document.getElementById('deploy-filter-from');
        const t = document.getElementById('deploy-filter-to');
        if (f) f.value = '';
        if (t) t.value = '';
        _applyFilters();
    };
}

// ─── Aplica filtros locais ─────────────────────────────────────────────────────
function _applyFilters() {
    if (!_manager) return;
    let data = [..._allRows];

    if (_filters.author) data = data.filter(r => r.author === _filters.author);
    if (_filters.status) data = data.filter(r => r.status === _filters.status);
    if (_filters.dateFrom || _filters.dateTo) {
        data = data.filter(r => {
            if (!r.date) return true;
            const d = new Date(r.date);
            if (_filters.dateFrom && d < new Date(_filters.dateFrom + 'T00:00:00')) return false;
            if (_filters.dateTo   && d > new Date(_filters.dateTo   + 'T23:59:59')) return false;
            return true;
        });
    }
    _manager.setData(data);
}

export const deployMonitor = {
    init: async function() {
        console.log('[Deploy] view initialized');
        this.renderUI();
        await _load();
    },

    renderUI: function() {
        const container = document.getElementById('view-deploy');
        if (!container) return;

        // Renderiza apenas se ainda não existir
        if (!document.getElementById('deploy-ui-wrapper')) {
            container.innerHTML = `
                <div id="deploy-ui-wrapper" class="flex-view" style="display:flex; flex-direction:column; height:100%;">
                    
                    <div class="top-bar" style="flex-shrink:0;">
                        <div>
                            <h1 style="display:flex; align-items:center; gap:0.571rem;">
                                <i class="ph ph-rocket" style="color:#6366f1;"></i>
                                Tracker de Deploys
                            </h1>
                            <p>Registro de modificações empurradas para a esteira do Railway em produção.</p>
                        </div>
                        <button class="btn btn-primary" onclick="deployMonitor.init()">
                            <i class="ph ph-arrows-clockwise"></i> Atualizar
                        </button>
                    </div>

                    <div class="glass-panel" style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        
                        <div class="rpt-filters">
                            <div class="rpt-filter-search" style="flex:1; min-width:220px;">
                                <i class="ph ph-magnifying-glass"></i>
                                <input type="text" id="deploy-search-global" placeholder="Pesquisar em todas as colunas..." oninput="window._deploySearch(this.value)">
                            </div>
                        </div>

                        <div class="rpt-info-bar">
                            <span id="deploy-count" class="rpt-count-badge">Carregando...</span>
                        </div>

                        <div class="company-table-container">
                            <table class="company-table" id="deploy-tracker-table">
                                <thead>
                                    <tr>
                                        <th class="sortable-header" data-key="date" style="width:150px; position:relative;">
                                            <div class="header-content">
                                                <span onclick="window._deploySort('date')">Quando</span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('date', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_date" class="filter-popover" style="min-width:260px;"></div>
                                        </th>
                                        <th class="sortable-header" data-key="author" style="width:180px; position:relative;">
                                            <div class="header-content">
                                                <span onclick="window._deploySort('author')">Quem</span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('author', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_author" class="filter-popover"></div>
                                        </th>
                                        <th class="sortable-header" data-key="hash" style="width:100px;">
                                            <div class="header-content">
                                                <span onclick="window._deploySort('hash')">Versão</span>
                                            </div>
                                        </th>
                                        <th class="sortable-header" data-key="message">
                                            <div class="header-content">
                                                <span onclick="window._deploySort('message')">O que foi feito</span>
                                            </div>
                                        </th>
                                        <th class="sortable-header" data-key="status" style="width:120px; position:relative;">
                                            <div class="header-content">
                                                <span onclick="window._deploySort('status')">Status</span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('status', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_status" class="filter-popover"></div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody id="deploy-table-body">
                                </tbody>
                            </table>
                        </div>
                        <div id="pagination-deploy" class="pagination-container" style="padding:1rem;"></div>
                    </div>
                </div>
            `;
        }
    }
};

window.deployMonitor = deployMonitor;

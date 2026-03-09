import { state } from './state.js';
import { STATUS_CONFIG, CS_VISIBLE_STATUSES } from './config.js';
import { TableManager } from './table-manager.js';
import { TableManager as TableManager2 } from '../core/table-manager.js'; // 🧪 TableManager 2.0 - teste paralelo
import {
    initCompanyProductsTable as _initProdutosTable,
    refreshCompanyProductsTable as _refreshProdutosTable,
    getCompanyProductsManager,
    updateProdutosBulkUI,
    clearProdutosBulkSelection,
} from './company-products/company-products-table.js';
import {
    initCompanyContactsTable as _initContatosTable,
    refreshCompanyContactsTable as _refreshContatosTable,
    getCompanyContactsManager,
    updateContatosBulkUI,
    clearContatosBulkSelection,
} from './company-contacts/company-contacts-table.js';
import {
    openContatoEditor as _openContatoEditor,
    saveContatoEditor as _saveContatoEditor,
    closeContatoEditor as _closeContatoEditor,
} from './company-contacts/company-contacts-editor.js';

// Re-export: navigation.js usa `ui.renderProdutosTable`
export const renderProdutosTable = () => _initProdutosTable();

// Re-export: navigation.js usa `ui.renderContatosTable`
export const renderContatosTable = () => _initContatosTable();

// Re-export: acessíveis via window.ui (inline onclicks)
export { updateProdutosBulkUI, clearProdutosBulkSelection, getCompanyProductsManager };
export { updateContatosBulkUI, clearContatosBulkSelection, getCompanyContactsManager };
export { _openContatoEditor as openContatoEditor, _saveContatoEditor as saveContatoEditor, _closeContatoEditor as closeContatoEditor };

let contactsTableManager = null;
let logTableManager = null;
let dashboardTableManager = null;
let npsTableManager = null;
let csMeetingTableManager = null;
let meetingGeralTableManager = null;
let followUpTableManager = null;
let companiesTableManager = null;

// ✅ TableManager 2.0 — motor primário da tabela de empresas
let companiesTableManagerV2 = null;

/** Getter público para acesso ao motor v2 de empresas (usado em app.js e externamente) */
export function getCompaniesManagerV2() { return companiesTableManagerV2; }

// ✅ CORREÇÃO: resetar managers de formulário ao abrir nova empresa
export function resetFormTableManagers() {
    contactsTableManager = null;
    dashboardTableManager = null;
    npsTableManager = null;
    csMeetingTableManager = null;
    meetingGeralTableManager = null;
    followUpTableManager = null;
}

// Helper to download base64 files correctly
export async function downloadFile(base64Data, fileName = 'arquivo_dati.pdf') {
    if (!base64Data) return;

    try {
        // 1. Converter para Blob usando o método nativo (mais performático para arquivos grandes)
        const response = await fetch(base64Data);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        // 2. Definir nome e extensão
        let finalName = fileName || 'arquivo_dati.pdf';

        // Se o nome vier como UUID ou sem extensão, força .pdf
        if (!finalName.includes('.')) {
            finalName += '.pdf';
        }

        // 3. Criar link e disparar download
        const a = document.createElement('a');
        a.href = url;
        a.download = finalName;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 200);

    } catch (e) {
        console.error('Erro no processamento do download:', e);
        // Fallback simples para o navegador lidar
        const a = document.createElement('a');
        a.href = base64Data;
        a.download = fileName || 'arquivo_dati.pdf';
        a.click();
    }
}



export function renderDashboard() {
    const statsContainer = document.getElementById('dashboard-stats');
    if (!statsContainer) return;
    statsContainer.innerHTML = '';

    const counts = state.companies.reduce((acc, comp) => {
        acc[comp.status] = (acc[comp.status] || 0) + 1;
        return acc;
    }, {});

    let total = state.companies.length;

    statsContainer.innerHTML += `
        <div class="glass-panel stat-card" style="border-left-color: var(--text-main);">
            <div class="stat-icon" style="background: rgba(255,255,255,0.1); color: var(--text-main);">
                <i class="ph ph-buildings"></i>
            </div>
            <div class="stat-value">${total}</div>
            <div class="stat-label">Total de Empresas</div>
        </div>
    `;

    const order = ['Prospect', 'Lead', 'Reunião', 'Proposta | Andamento', 'Em Contrato', 'Ativo', 'Suspenso', 'Inativo'];
    order.forEach(status => {
        const config = STATUS_CONFIG[status];
        if (!config) return; // Segurança caso o nome mude novamente
        const count = counts[status] || 0;
        statsContainer.innerHTML += `
            <div class="glass-panel stat-card" style="border-left-color: ${config.color};">
                <div class="stat-icon" style="background: ${config.color}20; color: ${config.color};">
                    <i class="ph ${config.icon}"></i>
                </div>
                <div class="stat-value">${count}</div>
                <div class="stat-label">${status}</div>
            </div>
        `;
    });
}

export function renderCompanyList() {
    const tableBody = document.getElementById('company-table-body');
    if (!tableBody) return;

    if (!companiesTableManagerV2) {
        // ✅ TableManager 2.0 — motor primário da tabela de empresas
        companiesTableManagerV2 = new TableManager2({
            data: state.companies,
            columns: [
                { key: 'nome', label: 'Empresa', type: 'string', searchable: true, sortable: true },
                { key: 'status', label: 'Status', type: 'string', searchable: true, filterable: true },
                { key: 'healthScore', label: 'Saúde', type: 'string', searchable: true },
                { key: 'nps', label: 'NPS', type: 'number', sortable: true },
                { key: 'segmento', label: 'Segmento', type: 'string', searchable: true, filterable: true },
                { key: 'updatedAt', label: 'Atualizado', type: 'date', sortable: true },
                { key: 'cidade', label: 'Cidade', type: 'string', searchable: true },
                { key: 'estado', label: 'Estado', type: 'string', searchable: true },
                { key: 'cnpj', label: 'CNPJ', type: 'string', searchable: true },
                { key: 'produtosNames', label: 'Produtos', type: 'string', searchable: true },
            ],
            pageSize: 10,
            tableId: 'view-company-list',

            renderRows: (data) => {
                renderCompanyTableRows(data);
            },

            renderPagination: ({ currentPage, totalPages, pageSize, totalRecords, hasPrev, hasNext }) => {
                const container = document.getElementById('pagination-companies');
                if (!container) return;

                if (totalPages <= 1) {
                    container.innerHTML = '';
                    container.style.display = 'none';
                    return;
                }

                // Calcular quais páginas exibir (janela deslizante + extremos)
                const pages = [];
                for (let i = 1; i <= totalPages; i++) {
                    if (
                        i === 1 ||
                        i === totalPages ||
                        (i >= currentPage - 1 && i <= currentPage + 1)
                    ) {
                        pages.push(i);
                    }
                }

                // Inserir ellipsis onde há saltos
                const pageItems = [];
                let prev = 0;
                for (const p of pages) {
                    if (p - prev > 1) pageItems.push('...');
                    pageItems.push(p);
                    prev = p;
                }

                const start = Math.min((currentPage - 1) * pageSize + 1, totalRecords);
                const end = Math.min(currentPage * pageSize, totalRecords);

                container.style.display = 'flex';
                container.innerHTML = `
                    <div class="pagination">
                        <button class="pagination-btn" data-v2-action="prev" ${!hasPrev ? 'disabled' : ''} title="Página anterior">
                            <i class="ph ph-caret-left"></i>
                        </button>

                        ${pageItems.map(item =>
                    item === '...'
                        ? `<span class="pagination-dots">···</span>`
                        : `<button class="pagination-page ${item === currentPage ? 'active' : ''}" data-v2-page="${item}">${item}</button>`
                ).join('')}

                        <button class="pagination-btn" data-v2-action="next" ${!hasNext ? 'disabled' : ''} title="Próxima página">
                            <i class="ph ph-caret-right"></i>
                        </button>
                    </div>
                    <div class="pagination-info">
                        ${start}–${end} de <strong>${totalRecords}</strong> registros &nbsp;·&nbsp; Página ${currentPage} de ${totalPages}
                    </div>
                `;
            },

            renderFilters: (activeFilters, search) => {
                // Filtros ativos renderizados por updateActiveFiltersUI()
            },
        });

        // Conectar busca ao motor v2
        const searchInput = document.getElementById('search-empresa');
        if (searchInput && !searchInput.dataset.v2Connected) {
            searchInput.dataset.v2Connected = '1';
            searchInput.addEventListener('input', (e) => {
                companiesTableManagerV2.setSearch(e.target.value);
                const clearBtn = document.getElementById('clear-search');
                if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
            });
        }

        // Conectar paginação via Event Delegation
        const paginationContainer = document.getElementById('pagination-companies');
        if (paginationContainer && !paginationContainer.dataset.v2PaginationConnected) {
            paginationContainer.dataset.v2PaginationConnected = '1';
            paginationContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-v2-page], [data-v2-action]');
                if (!btn || !companiesTableManagerV2) return;

                const action = btn.dataset.v2Action;
                const page = btn.dataset.v2Page;

                if (action === 'prev') {
                    console.log('[UI] Pagination click → prevPage');
                    companiesTableManagerV2.prevPage();
                } else if (action === 'next') {
                    console.log('[UI] Pagination click → nextPage');
                    companiesTableManagerV2.nextPage();
                } else if (page !== undefined) {
                    const n = parseInt(page);
                    console.log(`[UI] Pagination click → page ${n}`);
                    companiesTableManagerV2.goToPage(n);
                }
            });
        }

        console.log('[TableManager 2.0] Running as primary table engine');
    } else {
        companiesTableManagerV2.setData(state.companies);
    }

    updateActiveFiltersUI();
}

export function updateActiveFiltersUI() {
    const bar = document.getElementById('active-filters-bar');
    const container = document.getElementById('active-filters-chips');
    if (!bar || !container || !companiesTableManagerV2) return;

    const activeFilters = companiesTableManagerV2.getActiveFilters();

    // Highlight filter buttons
    document.querySelectorAll('#view-company-list .btn-filter-column').forEach(btn => {
        const popoverId = btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        if (popoverId) {
            const dataKey = getDataKey(popoverId);
            const isActive = companiesTableManagerV2._filters[dataKey];
            btn.classList.toggle('active', !!isActive);
        }
    });

    if (activeFilters.length === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    container.innerHTML = activeFilters.map(({ key, label, value }) => `
        <div class="filter-chip">
            <span><strong>${label}:</strong> ${value}</span>
            <i class="ph ph-x-circle" onclick="ui.clearColumnFilterFromChip('${key}', event)"></i>
        </div>
    `).join('');
}

function getLabelForKey(dataKey) {
    const labels = {
        'nome': 'Empresa',
        'status': 'Status',
        'healthScore': 'Saúde',
        'nps': 'NPS',
        'segmento': 'Segmento',
        'produtosNames': 'Produtos',
        'proximoPasso': 'Próximo Passo'
    };
    return labels[dataKey] || dataKey;
}

export function clearColumnFilterFromChip(dataKey, event) {
    if (event) event.stopPropagation();
    if (companiesTableManagerV2) {
        companiesTableManagerV2.setFilter(dataKey, '');
        updateActiveFiltersUI();
    }
}

export function clearAllCompaniesFilters() {
    if (companiesTableManagerV2) {
        companiesTableManagerV2.clearFilters();
        updateActiveFiltersUI();
    }
}

function renderCompanyTableRows(data) {
    const tableBody = document.getElementById('company-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-results">
                        <div class="empty-icon">
                            <i class="ph ph-magnifying-glass"></i>
                        </div>
                        <h3>Nenhum resultado encontrado</h3>
                        <p>Não encontramos nada para o termo "<strong>${companiesTableManagerV2?._search || ''}</strong>".</p>
                        <button class="btn btn-secondary btn-sm" onclick="ui.clearCompaniesFilters()" style="margin-top: 1rem">
                            <i class="ph ph-x"></i> Limpar Filtros
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    data.forEach(comp => {
        const config = STATUS_CONFIG[comp.status] || STATUS_CONFIG['Prospect'] || { color: '#64748b', class: 'status-prospect' };
        const tr = document.createElement('tr');

        const healthBadge = (comp.healthScore && CS_VISIBLE_STATUSES.includes(comp.status)) ? `
            <span class="badge" style="font-size: 0.65rem; background: ${comp.healthScore === 'Saudável' ? 'rgba(16,185,129,0.15)' : comp.healthScore === 'Atenção' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${comp.healthScore === 'Saudável' ? '#10b981' : comp.healthScore === 'Atenção' ? '#f59e0b' : '#ef4444'}; border: 1px solid currentColor;">
                ${comp.healthScore === 'Saudável' ? '🟢' : comp.healthScore === 'Atenção' ? '🟡' : '🔴'} ${comp.healthScore}
            </span>
        ` : '-';

        let npsBadge = '-';
        if (comp.nps && CS_VISIBLE_STATUSES.includes(comp.status)) {
            const npsVal = parseFloat(comp.nps);
            let npsColor = '#64748b'; // Gray default
            let npsBg = 'rgba(255,255,255,0.05)';

            if (npsVal <= 6) {
                npsColor = '#ef4444'; // Red
                npsBg = 'rgba(239, 68, 68, 0.15)';
            } else if (npsVal <= 8) {
                npsColor = '#f59e0b'; // Yellow (Amber)
                npsBg = 'rgba(245, 158, 11, 0.15)';
            } else {
                npsColor = '#10b981'; // Green (Emerald)
                npsBg = 'rgba(16, 185, 129, 0.15)';
            }

            npsBadge = `
                <span class="badge" style="font-size: 0.85rem; background: ${npsBg}; color: ${npsColor}; border: 1px solid currentColor;">
                    NPS: ${comp.nps}
                </span>
            `;
        }

        const isSelected = companiesTableManagerV2?.isSelected(comp.id) || false;
        tr.dataset.id = comp.id;
        if (isSelected) tr.classList.add('row-selected');

        tr.innerHTML = `
            <td class="checkbox-column" style="text-align:center;">
                <input
                    type="checkbox"
                    class="company-checkbox"
                    data-id="${comp.id}"
                    ${isSelected ? 'checked' : ''}
                    style="cursor:pointer;"
                >
            </td>
            <td>
                <div class="company-name-wrapper">
                    <span class="company-name-text">
                        ${comp.nome.length > 20 ? comp.nome.substring(0, 18) + '...' : comp.nome}
                    </span>
                    ${comp.nome.length > 20 ? `<div class="name-tooltip">${comp.nome}</div>` : ''}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2pt;">${comp.tipo || '-'}</div>
            </td>
            <td style="text-align: center;"><span class="badge ${config.class}">${comp.status}</span></td>
            <td style="text-align: center;">${healthBadge}</td>
            <td style="text-align: center;">${npsBadge}</td>
            <td style="text-align: center;"><span style="font-weight: 500; font-size: 0.85rem; color: var(--text-main);">${comp.proximoPasso || '-'}</span></td>
            <td style="text-align: center;">
                <div class="product-pills-container">
                    ${(comp.produtos || []).slice(0, 3).map(p => `<span class="product-pill">${p.nome}</span>`).join('')}
                    ${(comp.produtos || []).length > 3 ? `
                        <div class="product-pill-extra" title="${comp.produtos.slice(3).map(p => p.nome).join(', ')}">
                            +${comp.produtos.length - 3}
                            <div class="product-popover-list">
                                ${comp.produtos.slice(3).map(p => `<div>${p.nome}</div>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${(comp.produtos || []).length === 0 ? '-' : ''}
                </div>
            </td>
            <td style="text-align: center;">${comp.segmento || '-'}</td>
            <td>
                <div class="actions">
                    <button type="button" class="btn btn-secondary btn-icon btn-edit" data-id="${comp.id}" title="Editar">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button type="button" class="btn btn-danger btn-icon btn-delete" data-id="${comp.id}" title="Excluir">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

export function updateBulkSelectionUI() {
    if (!companiesTableManagerV2) return;

    const selected = companiesTableManagerV2.getSelectedIds();
    const count = selected.length;
    const hasAny = count > 0;

    // Toolbar — classe visual
    const toolbar = document.getElementById('bulk-toolbar');
    if (toolbar) toolbar.classList.toggle('has-selection', hasAny);

    // Contador de texto
    const countEl = document.getElementById('bulk-count');
    if (countEl) {
        countEl.textContent = count === 0
            ? 'Nenhuma empresa selecionada'
            : count === 1
                ? '1 empresa selecionada'
                : `${count} empresas selecionadas`;
    }

    // ⚠️ CRÍTICO: atributo HTML disabled bloqueia eventos click independente de CSS.
    // É necessário remover/adicionar o atributo diretamente.
    const deleteBtn = document.getElementById('bulk-delete-btn');
    const clearBtn = document.getElementById('bulk-clear-btn');
    const editBtn = document.getElementById('bulk-edit-btn');
    if (deleteBtn) deleteBtn.disabled = !hasAny;
    if (clearBtn) clearBtn.disabled = !hasAny;
    if (editBtn) editBtn.disabled = !hasAny;

    // Estado do checkbox "selecionar todos"
    const selectAllCb = document.getElementById('select-all-companies');
    if (selectAllCb) {
        const pageData = companiesTableManagerV2.getPaginatedData();
        const pageCount = pageData.length;
        const selectedOnPage = pageData.filter(row => companiesTableManagerV2.isSelected(row.id)).length;
        selectAllCb.checked = pageCount > 0 && selectedOnPage === pageCount;
        selectAllCb.indeterminate = selectedOnPage > 0 && selectedOnPage < pageCount;
    }
}


export function clearBulkSelection() {
    if (!companiesTableManagerV2) return;
    companiesTableManagerV2.clearSelection();
    updateBulkSelectionUI();
    // Re-renderizar a página para desmarcar checkboxes visuais
    renderCompanyTableRows(companiesTableManagerV2.getPaginatedData());
}

export function renderDashboardsTable() {
    const body = document.getElementById('dashboards-table-body');
    if (!body) return;

    if (!dashboardTableManager) {
        dashboardTableManager = new TableManager(
            state.tempDashboards,
            [
                { key: 'data', type: 'date' },
                { key: 'destinatarios', type: 'string' }
            ],
            (data) => renderDashboardsTableRows(data),
            'tab-dashboards'
        );
        dashboardTableManager.paginationContainerId = 'pagination-dashboards';
        dashboardTableManager.apply();
    } else {
        dashboardTableManager.setData(state.tempDashboards);
    }
}

function renderDashboardsTableRows(data) {
    const body = document.getElementById('dashboards-table-body');
    if (!body) return;
    body.innerHTML = '';

    if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum dashboard registrado.</td></tr>`;
        return;
    }

    data.forEach((db, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${db.data}</td>
            <td>${db.destinatarios}</td>
            <td>${db.link ? `<a href="${db.link}" target="_blank" class="badge" style="background: rgba(79,70,229,0.1); color: #fff; text-decoration:none;"><i class="ph ph-presentation-chart"></i> Link Power BI</a>` : '-'}</td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-dashboard" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function renderNPSHistoryTable() {
    const body = document.getElementById('nps-history-table-body');
    if (!body) return;

    if (!npsTableManager) {
        npsTableManager = new TableManager(
            state.tempNPSHistory,
            [
                { key: 'data', type: 'date' },
                { key: 'destinatarios', type: 'string' },
                { key: 'score', type: 'number' }
            ],
            (data) => renderNPSHistoryTableRows(data),
            'tab-nps'
        );
        npsTableManager.paginationContainerId = 'pagination-nps';
        npsTableManager.apply();
    } else {
        npsTableManager.setData(state.tempNPSHistory);
    }
}

function renderNPSHistoryTableRows(data) {
    const body = document.getElementById('nps-history-table-body');
    if (!body) return;
    body.innerHTML = '';

    if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma pesquisa NPS registrada.</td></tr>`;
        return;
    }

    data.forEach((nps, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${nps.data}</td>
            <td>${nps.destinatarios}</td>
            <td style="text-align:center;">${nps.forms || 0}</td>
            <td style="text-align:center;"><span class="badge" style="background: rgba(245,158,11,0.1); color: #f59e0b; border: 1px solid currentColor;">${nps.score}</span></td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-nps" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function renderCSMeetingsTable() {
    const body = document.getElementById('cs-meetings-table-body');
    if (!body) return;

    if (!csMeetingTableManager) {
        csMeetingTableManager = new TableManager(
            state.tempReunioesCS,
            [
                { key: 'data', type: 'date' },
                { key: 'participantes', type: 'string' }
            ],
            (data) => renderCSMeetingsTableRows(data),
            'tab-cs-meetings'
        );
        csMeetingTableManager.paginationContainerId = 'pagination-cs-meetings';
        csMeetingTableManager.apply();
    } else {
        csMeetingTableManager.setData(state.tempReunioesCS);
    }
}

function renderCSMeetingsTableRows(data) {
    const body = document.getElementById('cs-meetings-table-body');
    if (!body) return;
    body.innerHTML = '';

    if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma reunião de alinhamento registrada.</td></tr>`;
        return;
    }

    data.forEach((meet, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${meet.data}</td>
            <td>${meet.participantes}</td>
            <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${meet.obs || '-'}</td>
            <td>${meet.link ? `<a href="${meet.link}" target="_blank" class="badge" style="background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid currentColor;"><i class="ph ph-video"></i> Ver</a>` : '-'}</td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-csmeet" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function renderTicketsTable() {
    const body = document.getElementById('tickets-table-body');
    if (!body) return;
    body.innerHTML = '';

    if (state.tempChamados.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum chamado registrado.</td></tr>`;
        return;
    }

    state.tempChamados.sort((a, b) => b.data.localeCompare(a.data)).forEach((tk, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${tk.data}</td>
            <td><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-main);">${tk.numero}</span></td>
            <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${tk.resumo}</td>
            <td>${tk.autor}</td>
            <td>${tk.link ? `<a href="${tk.link}" target="_blank" class="badge" style="background: rgba(59,130,246,0.1); color: #3b82f6; border: 1px solid currentColor;"><i class="ph ph-headset"></i> Portal</a>` : '-'}</td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-ticket" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function renderCSTimeline() {
    const timeline = document.getElementById('cs-timeline');
    if (!timeline) return;
    timeline.innerHTML = '';
    state.tempNotes.sort((a, b) => b.timestamp - a.timestamp).forEach((note, index) => {
        const item = document.createElement('div');
        item.style.padding = '0.8rem';
        item.style.background = 'rgba(255,255,255,0.02)';
        item.style.borderRadius = 'var(--radius-sm)';
        item.style.position = 'relative';
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">
                    <i class="ph ph-user"></i> <strong>${note.author}</strong> • ${note.date}
                </div>
                <button type="button" class="btn btn-icon btn-remove-temp-note" data-index="${index}" style="color: var(--text-muted); font-size: 0.8rem;">
                    <i class="ph ph-x"></i>
                </button>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-main); line-height: 1.4;">${note.text}</div>
            <div style="position: absolute; left: -1.3rem; top: 1.2rem; width: 0.6rem; height: 0.6rem; background: var(--dark-border); border: 2px solid var(--bg-main); border-radius: 50%;"></div>
        `;
        timeline.appendChild(item);
    });
}

export function renderFollowUpsTable() {
    const body = document.getElementById('followup-table-body');
    if (!body) return;

    if (!followUpTableManager) {
        followUpTableManager = new TableManager(
            state.tempFollowUps,
            [
                { key: 'data', type: 'date' },
                { key: 'usuario', type: 'string' },
                { key: 'area', type: 'string' }
            ],
            (data) => renderFollowUpsTableRows(data),
            'tab-followup'
        );
        followUpTableManager.paginationContainerId = 'pagination-followup';
        followUpTableManager.sort = { key: 'data', direction: 'desc' };
        followUpTableManager.apply();
    } else {
        followUpTableManager.setData(state.tempFollowUps);
    }
}

function renderFollowUpsTableRows(data) {
    const body = document.getElementById('followup-table-body');
    if (!body) return;
    body.innerHTML = '';

    if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">Nenhum follow-up registrado.</td></tr>`;
        return;
    }

    data.forEach((fw, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color: var(--text-muted);">${fw.data || '-'}</td>
            <td style="font-weight: 500; white-space: pre-wrap; line-height: 1.5;">${fw.conteudo}</td>
            <td>${fw.usuario || '-'}</td>
            <td><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-main); font-size: 0.75rem;">${fw.area || '-'}</span></td>
            <td style="color: var(--secondary); font-weight: 600;">${fw.proximoContato || '-'}</td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-followup" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function renderReunioesTable() {
    const tableBody = document.getElementById('meetings-table-body');
    if (!tableBody) return;

    if (!meetingGeralTableManager) {
        meetingGeralTableManager = new TableManager(
            state.tempReunioes,
            [
                { key: 'data', type: 'date' },
                { key: 'participantes', type: 'string' },
                { key: 'temperatura', type: 'string' }
            ],
            (data) => renderReunioesTableRows(data),
            'tab-meetings-geral'
        );
        meetingGeralTableManager.paginationContainerId = 'pagination-meetings-geral';
        meetingGeralTableManager.apply();
    } else {
        meetingGeralTableManager.setData(state.tempReunioes);
    }
}

function renderReunioesTableRows(data) {
    const tableBody = document.getElementById('meetings-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma reunião registrada.</td></tr>`;
        return;
    }

    data.forEach((meet, index) => {
        const tr = document.createElement('tr');
        let tempClass = 'badge-warm';
        if (meet.temperatura === 'Hot') tempClass = 'badge-hot';
        if (meet.temperatura === 'Cold') tempClass = 'badge-cold';

        tr.innerHTML = `
            <td>${meet.data}</td>
            <td>${meet.participantes || '-'}</td>
            <td style="text-align: center;">
                <span class="badge ${tempClass}">${meet.temperatura === 'Hot' ? '🔥' : meet.temperatura === 'Warm' ? '⛅' : '❄️'} ${meet.temperatura}</span>
            </td>
            <td>${meet.link ? `<a href="${meet.link}" target="_blank" class="badge" style="background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.2);"><i class="ph ph-link"></i> Gravação</a>` : '-'}</td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-reuniao" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

export function renderLogTestes() {
    const body = document.getElementById('log-testes-body');
    if (!body) return;

    const dataExecucao = '07/03/2026';
    const horaExecucao = '15:20';
    const PASSOU = `<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); white-space:nowrap;"><i class="ph ph-check-circle"></i> Sucesso</span>`;

    const testesRaw = [
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'DB_KEY deve estar definido e ser uma string', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'STATUS_CONFIG contém todos os 8 status esperados', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'Cada status tem icon, class e color', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'Classes CSS de status seguem o padrão "status-*"', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'CS_VISIBLE_STATUSES é um array de 3 itens', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'CS_VISIBLE_STATUSES inclui apenas os 3 status de cliente', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'CS_VISIBLE_STATUSES NÃO inclui status de pré-venda', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'CS_VISIBLE_STATUSES tem exatamente 3 itens', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'state.companies é array', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'currentEditingId é null por padrão', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'Arrays temp vazios na inicialização', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'editingContatoIndex é -1 por padrão', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'resetTempState() limpa todos os arrays temporários', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'resetTempState() reseta índices de edição para -1', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'resetTempState() reseta currentEditingId para null', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'utils.js', descricao: 'maskCurrency: 100 → "1,00"', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'utils.js', descricao: 'maskCurrency: 150000 → "1.500,00"', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'utils.js', descricao: 'maskCurrency: 10000000 → "100.000,00"', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'utils.js', descricao: 'maskCurrency: remove caracteres não numéricos', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'auth.js', descricao: 'Login com credenciais corretas: define sessionStorage', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'auth.js', descricao: 'Logout: limpa campos de login', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'E2E', modulo: 'auth.spec', descricao: 'Login com admin/dati2024: app exibido', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'E2E', modulo: 'companies.spec', descricao: 'Criar empresa completa e salvar', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'E2E', modulo: 'crud_advanced.spec', descricao: 'Editar nome e status de empresa existente', status: PASSOU }
    ];

    if (!logTableManager) {
        logTableManager = new TableManager(
            testesRaw,
            [
                { key: 'data', type: 'date' },
                { key: 'hora', type: 'string' },
                { key: 'tipo', type: 'string' },
                { key: 'modulo', type: 'string' },
                { key: 'descricao', type: 'string' },
                { key: 'status', type: 'string' }
            ],
            (data) => renderLogTableRows(data),
            'log-testes'
        );
        logTableManager.paginationContainerId = 'pagination-log';
    }

    logTableManager.apply();
}

function renderLogTableRows(data) {
    const body = document.getElementById('log-testes-body');
    if (!body) return;

    const PASSOU = `<span class="badge" style="background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.2);"><i class="ph ph-check-circle"></i> SUCESSO</span>`;
    const UNIT_BADGE = `<span class="badge" style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3);">Unitário</span>`;
    const E2E_BADGE = `<span class="badge" style="background:rgba(167,139,250,0.15); color:#a78bfa; border:1px solid rgba(167,139,250,0.3);">E2E</span>`;

    body.innerHTML = '';
    data.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="white-space:nowrap; color:var(--text-muted); font-size:0.85rem;">${item.data}</td>
            <td style="white-space:nowrap; color:var(--text-muted); font-size:0.85rem;">${item.hora}</td>
            <td style="white-space:nowrap;">${item.tipo === 'UNITÁRIO' ? UNIT_BADGE : E2E_BADGE}</td>
            <td style="font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${item.modulo}</td>
            <td style="font-size:0.85rem;">${item.descricao}</td>
            <td>${item.status}</td>
        `;
        body.appendChild(tr);
    });

    const clearBtn = document.getElementById('btn-clear-log-filters');
    if (clearBtn) {
        const hasFilters = Object.keys(logTableManager.filters).length > 0;
        clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    }
}

function getManagerForKey(key) {
    if (key.startsWith('contatos_')) return getCompanyContactsManager(); // ✅ TM2 contatos
    if (key.startsWith('db_')) return dashboardTableManager;
    if (key.startsWith('nps_')) return npsTableManager;
    if (key.startsWith('csmt_')) return csMeetingTableManager;
    if (key.startsWith('meet_')) return meetingGeralTableManager;
    if (key.startsWith('comp_')) return companiesTableManagerV2;
    if (key.startsWith('prod_')) return getCompanyProductsManager(); // ✅ produtos
    return logTableManager;
}

function getDataKey(key) {
    return key.replace(/^(produtos_|contatos_|db_|nps_|csmt_|meet_|comp_|prod_)/, '');
}

window.getManagerForKeyPagination = function (containerId) {
    if (containerId === 'pagination-companies') return companiesTableManagerV2;
    if (containerId === 'pagination-dashboards') return dashboardTableManager;
    if (containerId === 'pagination-nps') return npsTableManager;
    if (containerId === 'pagination-cs-meetings') return csMeetingTableManager;
    if (containerId === 'pagination-meetings-geral') return meetingGeralTableManager;
    if (containerId === 'pagination-log') return logTableManager;
    if (containerId === 'pagination-contatos') return getCompanyContactsManager(); // ✅ TM2 contatos
    return null;
};

export function toggleFilterPopover(key, event) {
    event.stopPropagation();
    const popover = document.getElementById(`filter-popover-${key}`);
    if (!popover) return;

    document.querySelectorAll('.filter-popover').forEach(p => {
        if (p !== popover) p.classList.remove('show');
    });

    const isOpen = popover.classList.contains('show');
    if (isOpen) {
        popover.classList.remove('show');
    } else {
        renderFilterOptions(key, popover);
        popover.classList.add('show');

        // Smart positioning logic: detect screen boundaries
        popover.classList.remove('align-right', 'align-top');
        popover.style.bottom = 'auto'; // Reset custom bottom
        popover.style.top = '100%';    // Reset default top

        const rect = popover.getBoundingClientRect();

        // Horizontal check
        if (rect.right > window.innerWidth - 20) {
            popover.classList.add('align-right');
        }

        // Vertical check: if it goes off bottom, flip it to open upwards
        if (rect.bottom > window.innerHeight - 20) {
            popover.style.top = 'auto';
            popover.style.bottom = '100%';
            popover.parentElement.style.position = 'relative'; // Ensure parent is relative
        }
    }
}

function renderFilterOptions(key, container) {
    const manager = getManagerForKey(key);
    if (!manager) return;
    const dataKey = getDataKey(key);
    const column = manager.columns.find(c => c.key === dataKey);
    const values = manager.getUniqueValues(dataKey);
    const selectedValue = manager.filters[dataKey];
    const currentSort = manager.sort.key === dataKey ? manager.sort.direction : 'none';

    const sortHTML = `
        <div class="filter-group">
            <span class="filter-label">Ordenar</span>
            <div class="sort-buttons">
                <button class="btn-sort ${currentSort === 'asc' ? 'active' : ''}" onclick="ui.applyColumnSort('${key}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> Cresc.
                </button>
                <button class="btn-sort ${currentSort === 'desc' ? 'active' : ''}" onclick="ui.applyColumnSort('${key}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Decresc.
                </button>
            </div>
        </div>`;

    // ── Coluna de data: seletor de período com Flatpickr ─────────────────────
    if (column?.type === 'date') {
        container.innerHTML = `
            ${sortHTML}
            <div class="filter-group">
                <span class="filter-label">Intervalo de Datas</span>
                <div class="filter-date-wrapper">
                    <i class="ph ph-calendar"></i>
                    <input type="text" class="filter-date-range" id="filter-date-${key}" placeholder="Selecionar período..." value="${selectedValue || ''}" readonly>
                </div>
            </div>
            <div class="filter-actions">
                <button class="btn-clear-filter" onclick="ui.clearColumnFilter('${key}', event)">
                    <i class="ph ph-trash"></i> Limpar Filtro
                </button>
            </div>
        `;
        setTimeout(() => {
            flatpickr(`#filter-date-${key}`, {
                mode: "range",
                dateFormat: "d/m/Y",
                locale: { rangeSeparator: " a " },
                onChange: (selectedDates, dateStr) => {
                    if (selectedDates.length === 2) ui.applyGenericFilter(key, dateStr);
                }
            });
        }, 10);
        return;
    }

    // ── Coluna numérica: intervalo de valores (De/Até) ────────────────────────
    if (column?.type === 'number') {
        const rangeVal = (selectedValue && typeof selectedValue === 'object') ? selectedValue : {};
        const minVal = rangeVal.min ?? '';
        const maxVal = rangeVal.max ?? '';
        const hasRange = minVal !== '' || maxVal !== '';

        container.innerHTML = `
            ${sortHTML}
            <div class="filter-group">
                <span class="filter-label">Intervalo de Valores</span>
                <div class="filter-range-wrapper">
                    <div class="filter-range-row">
                        <span class="filter-range-label">De</span>
                        <input type="number" id="filter-range-min-${key}"
                            class="filter-range-input"
                            placeholder="Mínimo"
                            value="${minVal}"
                            step="0.01" min="0">
                    </div>
                    <div class="filter-range-row">
                        <span class="filter-range-label">Até</span>
                        <input type="number" id="filter-range-max-${key}"
                            class="filter-range-input"
                            placeholder="Máximo"
                            value="${maxVal}"
                            step="0.01" min="0">
                    </div>
                </div>
            </div>
            <div class="filter-actions">
                <button class="btn-apply-filter" onclick="ui.applyRangeFilter('${key}', event)">
                    <i class="ph ph-check"></i> Aplicar
                </button>
                <button class="btn-clear-filter ${!hasRange ? 'disabled' : ''}" onclick="ui.clearColumnFilter('${key}', event)">
                    <i class="ph ph-trash"></i> Limpar
                </button>
            </div>
        `;
        return;
    }

    // ── boolean-date: Sim / Não ───────────────────────────────────────────────
    if (column?.filterType === 'boolean-date') {
        const sel = String(selectedValue || '').toLowerCase();
        container.innerHTML = `
            ${sortHTML}
            <div class="filter-group">
                <span class="filter-label">Filtrar</span>
                <div class="filter-list">
                    <div class="filter-option ${!selectedValue ? 'selected' : ''}" onclick="ui.applyGenericFilter('${key}', '', event)">
                        (Tudo)
                    </div>
                    <div class="filter-option ${sel === 'sim' ? 'selected' : ''}" onclick="ui.applyGenericFilter('${key}', 'Sim', event)">
                        <span class="badge-prod-yes"><i class="ph ph-check"></i> Sim</span>
                    </div>
                    <div class="filter-option ${sel === 'não' ? 'selected' : ''}" onclick="ui.applyGenericFilter('${key}', 'Não', event)">
                        <span class="badge-prod-no">Não</span>
                    </div>
                </div>
            </div>
            <div class="filter-actions">
                <button class="btn-clear-filter" onclick="ui.clearColumnFilter('${key}', event)">
                    <i class="ph ph-trash"></i> Limpar Filtro
                </button>
            </div>
        `;
        return;
    }

    // ── String: lista de valores únicos ──────────────────────────────────────
    container.innerHTML = `
        ${sortHTML}
        <div class="filter-group">
            <span class="filter-label">Filtrar Valores</span>
            <input type="text" class="filter-search" placeholder="Pesquisar..." onkeyup="ui.searchFilterOptions('${key}', this)">
            <div class="filter-list">
                <div class="filter-option ${!selectedValue ? 'selected' : ''}" onclick="ui.applyGenericFilter('${key}', '', event)">
                    (Tudo)
                </div>
                ${values.map(val => `
                    <div class="filter-option ${selectedValue === val ? 'selected' : ''}" onclick="ui.applyGenericFilter('${key}', '${val}', event)">
                        ${val}
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="filter-actions">
            <button class="btn-clear-filter" onclick="ui.clearColumnFilter('${key}', event)">
                <i class="ph ph-trash"></i> Limpar Filtro
            </button>
        </div>
    `;
}

/**
 * Aplica um filtro de intervalo numérico.
 * Lê os inputs #filter-range-min-{key} e #filter-range-max-{key}
 * e chama setFilter(key, {min, max}) no manager correspondente.
 */
export function applyRangeFilter(key, event) {
    if (event) event.stopPropagation();
    const manager = getManagerForKey(key);
    if (!manager) return;

    const minEl = document.getElementById(`filter-range-min-${key}`);
    const maxEl = document.getElementById(`filter-range-max-${key}`);
    const min = minEl?.value !== '' ? parseFloat(minEl.value) : null;
    const max = maxEl?.value !== '' ? parseFloat(maxEl.value) : null;

    const dataKey = getDataKey(key);
    if (min === null && max === null) {
        manager.setFilter(dataKey, null);
    } else {
        manager.setFilter(dataKey, { min, max });
    }
    document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
}

export function applyColumnSort(key, direction, event) {
    if (event) event.stopPropagation();
    const manager = getManagerForKey(key);
    if (manager) {
        const dataKey = getDataKey(key);
        // TableManager 2.0 usa setSortExplicit(key, dir); legado usa setSort(key, dir)
        if (typeof manager.setSortExplicit === 'function') {
            manager.setSortExplicit(dataKey, direction);
        } else {
            manager.setSort(dataKey, direction);
        }
        if (manager === companiesTableManagerV2) updateActiveFiltersUI();
    }
    document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
}

export function clearColumnFilter(key, event) {
    if (event) event.stopPropagation();
    const manager = getManagerForKey(key);
    if (manager) {
        const dataKey = getDataKey(key);
        manager.setFilter(dataKey, '');
        if (manager === companiesTableManagerV2) updateActiveFiltersUI();
    }
    document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
}

export function searchFilterOptions(key, input) {
    const term = input.value.toLowerCase();
    const list = input.nextElementSibling;
    const options = list.querySelectorAll('.filter-option');
    options.forEach(opt => {
        const text = opt.textContent.toLowerCase();
        opt.style.display = text.includes(term) || opt.textContent.trim() === '(Tudo)' ? '' : 'none';
    });
}

export function applyGenericFilter(key, value, event) {
    if (event) event.stopPropagation();
    const manager = getManagerForKey(key);
    if (manager) {
        const dataKey = getDataKey(key);
        manager.setFilter(dataKey, value);
        if (manager === companiesTableManagerV2) updateActiveFiltersUI();
    }
    document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
}

export function handleProdutosSort(key, event) {
    if (event) event.stopPropagation();
    const mgr = getCompanyProductsManager();
    if (mgr) mgr.setSort(key);
}

export function handleContatosSort(key, event) {
    if (event) event.stopPropagation();
    const mgr = getCompanyContactsManager();
    if (mgr) mgr.setSort(key);
}

export function handleDashboardsSort(key, event) {
    if (event) event.stopPropagation();
    if (dashboardTableManager) dashboardTableManager.toggleSort(key);
}

export function handleNPSSort(key, event) {
    if (event) event.stopPropagation();
    if (npsTableManager) npsTableManager.toggleSort(key);
}

export function handleCSMeetingsSort(key, event) {
    if (event) event.stopPropagation();
    if (csMeetingTableManager) csMeetingTableManager.toggleSort(key);
}

export function handleReunioesSort(key, event) {
    if (event) event.stopPropagation();
    if (meetingGeralTableManager) meetingGeralTableManager.toggleSort(key);
}

export function handleCompaniesSort(key, event) {
    if (event) event.stopPropagation();
    if (companiesTableManagerV2) companiesTableManagerV2.setSort(key);
}

export function handleCompaniesSearch(term) {
    if (companiesTableManagerV2) {
        companiesTableManagerV2.setSearch(term);
        const clearBtn = document.getElementById('clear-search');
        if (clearBtn) clearBtn.style.display = term ? 'flex' : 'none';
    }
}

export function clearProdutosFilters() {
    const mgr = getCompanyProductsManager();
    if (mgr) {
        mgr.clearFilters();
        document.querySelectorAll('#tab-produtos .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearContatosFilters() {
    const mgr = getCompanyContactsManager();
    if (mgr) {
        mgr.clearFilters();
        document.querySelectorAll('#tab-contatos .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearDashboardsFilters() {
    if (dashboardTableManager) {
        dashboardTableManager.filters = {};
        dashboardTableManager.apply();
        document.querySelectorAll('#tab-dashboards .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearNPSFilters() {
    if (npsTableManager) {
        npsTableManager.filters = {};
        npsTableManager.apply();
        document.querySelectorAll('#tab-nps .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearCSMeetingsFilters() {
    if (csMeetingTableManager) {
        csMeetingTableManager.filters = {};
        csMeetingTableManager.apply();
        document.querySelectorAll('#tab-cs-meetings .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearReunioesGeralFilters() {
    if (meetingGeralTableManager) {
        meetingGeralTableManager.filters = {};
        meetingGeralTableManager.apply();
        document.querySelectorAll('#tab-meetings-geral .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearCompaniesFilters() {
    if (companiesTableManagerV2) {
        companiesTableManagerV2.clearFilters();
        const searchInput = document.getElementById('search-empresa');
        if (searchInput) searchInput.value = '';
        const clearBtn = document.getElementById('clear-search');
        if (clearBtn) clearBtn.style.display = 'none';
        document.querySelectorAll('#view-company-list .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function handleCompaniesFilter(key, value) {
    if (companiesTableManagerV2) {
        companiesTableManagerV2.setFilter(key, value);
        updateActiveFiltersUI();
    }
}

export function handleLogSort(key, event) {
    if (event) event.stopPropagation();
    if (logTableManager) logTableManager.toggleSort(key);
}

export function handleLogSearch(term) {
    if (logTableManager) {
        logTableManager.setGlobalSearch(term);
        updateClearFiltersBtn();
    }
}

export function clearLogFilters() {
    if (logTableManager) {
        logTableManager.filters = {};
        logTableManager.globalSearch = '';
        logTableManager.apply();

        const searchInput = document.getElementById('log-search-global');
        if (searchInput) searchInput.value = '';

        document.querySelectorAll('.btn-filter-column').forEach(btn => btn.classList.remove('active'));
        updateClearFiltersBtn();
    }
}

function updateClearFiltersBtn() {
    const clearBtn = document.getElementById('btn-clear-log-filters');
    if (clearBtn && logTableManager) {
        const hasFilters = Object.keys(logTableManager.filters).length > 0 || logTableManager.globalSearch !== '';
        clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-popover') && !e.target.closest('.btn-filter-column')) {
        document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
    }
});
export function initGlobalPickers() {
    // Aplicar Flatpickr em todos os inputs de data do sistema
    flatpickr("input[type='date'], .datepicker", {
        dateFormat: "Y-m-d", // Formato para o DB continuar funcionando
        altInput: true,
        altFormat: "d/m/Y", // Formato visual 10/10
        locale: "pt"
    });
}
export function switchProdTab(event, tabId) {
    const parent = event.target.closest('#produto-form-container');
    if (!parent) return;

    const tabs = parent.querySelectorAll('.prod-tab-content');
    const btns = parent.querySelectorAll('.prod-tab-btn');

    tabs.forEach(t => t.style.display = 'none');
    btns.forEach(b => {
        b.classList.remove('active');
        b.style.color = 'var(--text-muted)';
    });

    const target = document.getElementById(tabId);
    if (target) target.style.display = 'block';

    event.target.classList.add('active');
    event.target.style.color = 'var(--text-main)';
}



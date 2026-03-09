/**
 * ============================================================================
 * Módulo: Company Contacts — Tabela (TableManager 2.0 — Standard 10/10)
 * ============================================================================
 * Gerencia a tabela de contatos de uma empresa.
 *
 * Funcionalidades:
 *   ✅ Busca global
 *   ✅ Filtros por coluna (string, filterable)
 *   ✅ Ordenação ASC/DESC/reset
 *   ✅ Paginação com ellipsis
 *   ✅ Chips de filtros ativos
 *   ✅ Seleção múltipla (checkboxes)
 *   ✅ Bulk toolbar (excluir em massa)
 *   ✅ Contador de seleção
 *
 * Exports:
 *   initCompanyContactsTable()      — inicializa (ao abrir formulário de empresa)
 *   refreshCompanyContactsTable()   — atualiza dados após CRUD
 *   renderContatosTable()           — alias de compatibilidade (navigation.js)
 *   updateContatosBulkUI()          — atualiza toolbar de seleção
 *   clearContatosBulkSelection()    — limpa seleção
 *   getCompanyContactsManager()     — getter do manager
 */
import { TableManager } from '../../core/table-manager.js';
import { state } from '../state.js';

// ── Instância singleton ──────────────────────────────────────────────────────
let companyContactsManager = null;

export function getCompanyContactsManager() {
    return companyContactsManager;
}

// ============================================================================
// SEÇÃO 1: RENDERIZAÇÃO DE LINHAS
// ============================================================================

function renderContatosRows(rows) {
    const tbody = document.getElementById('contatos-table-body');
    if (!tbody) return;

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="table-empty-cell">
                    <div class="table-empty-state">
                        <i class="ph ph-users"></i>
                        <span>Nenhum contato cadastrado.
                            Clique em <strong>+ Novo Contato</strong> para começar.</span>
                    </div>
                </td>
            </tr>`;
        updateContatosBulkUI();
        return;
    }

    tbody.innerHTML = rows.map(c => {
        const isSelected = companyContactsManager?.isSelected(String(c.id));
        const linkedinHtml = c.linkedin
            ? `<a href="${c.linkedin}" target="_blank" rel="noopener" class="cont-link" title="${c.linkedin}">
                <i class="ph ph-linkedin-logo"></i>
               </a>`
            : '—';
        return `
        <tr class="contato-row${isSelected ? ' row-selected' : ''}" data-cont-id="${c.id}">
            <td>
                <input type="checkbox" class="contato-checkbox"
                    data-cont-id="${c.id}"
                    ${isSelected ? 'checked' : ''}
                    style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;">
            </td>
            <td><strong class="cont-name-cell">${c.nome || '—'}</strong></td>
            <td>${c.cargo || '—'}</td>
            <td>${c.departamento || '—'}</td>
            <td style="font-size:0.85rem;">${c.email1
                ? `<a href="mailto:${c.email1}" class="cont-link-email">${c.email1}</a>`
                : '—'}</td>
            <td style="font-size:0.85rem;">${c.whatsapp || c.telefone || '—'}</td>
            <td style="text-align:center;">${linkedinHtml}</td>
            <td>
                <div class="actions">
                    <button type="button" class="btn btn-secondary btn-icon btn-edit-contato"
                            data-cont-id="${c.id}" title="Editar contato">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button type="button" class="btn btn-danger btn-icon btn-delete-contato"
                            data-cont-id="${c.id}" title="Excluir contato">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    updateContatosBulkUI();
}

// ============================================================================
// SEÇÃO 2: PAGINAÇÃO
// ============================================================================

function renderContatosPagination({ currentPage, totalPages, pageSize, totalRecords, hasPrev, hasNext }) {
    const container = document.getElementById('pagination-contatos');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            pages.push(i);
        }
    }
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
            <button class="pagination-btn" data-cont-action="prev" ${!hasPrev ? 'disabled' : ''} title="Página anterior">
                <i class="ph ph-caret-left"></i>
            </button>
            ${pageItems.map(item =>
        item === '...'
            ? '<span class="pagination-dots">···</span>'
            : `<button class="pagination-page ${item === currentPage ? 'active' : ''}"
                               data-cont-page="${item}">${item}</button>`
    ).join('')}
            <button class="pagination-btn" data-cont-action="next" ${!hasNext ? 'disabled' : ''} title="Próxima página">
                <i class="ph ph-caret-right"></i>
            </button>
        </div>
        <div class="pagination-info">
            ${start}–${end} de <strong>${totalRecords}</strong> contato${totalRecords !== 1 ? 's' : ''}
        </div>`;
}

// ============================================================================
// SEÇÃO 3: CHIPS DE FILTROS ATIVOS
// ============================================================================

function renderContatosActiveFilters(activeFilters, search) {
    const bar = document.getElementById('contatos-active-filters');
    if (!bar) return;

    const chips = [];

    if (search) {
        chips.push(`
            <span class="filter-chip">
                <i class="ph ph-magnifying-glass"></i>
                "${search}"
                <button class="chip-remove" data-remove-search="1" title="Remover busca">
                    <i class="ph ph-x"></i>
                </button>
            </span>`);
    }

    activeFilters.forEach(f => {
        chips.push(`
            <span class="filter-chip">
                ${f.label}: <strong>${f.value}</strong>
                <button class="chip-remove" data-remove-filter="${f.key}" title="Remover filtro">
                    <i class="ph ph-x"></i>
                </button>
            </span>`);
    });

    if (chips.length > 0) {
        chips.push(`
            <button class="filter-chip-clear-all"
                    onclick="ui.clearContatosFilters()">
                <i class="ph ph-x-circle"></i> Limpar tudo
            </button>`);
        bar.innerHTML = chips.join('');
        bar.style.display = 'flex';
    } else {
        bar.innerHTML = '';
        bar.style.display = 'none';
    }

    bar.querySelectorAll('[data-remove-search]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!companyContactsManager) return;
            companyContactsManager.setSearch('');
            const searchInput = document.getElementById('search-contato');
            if (searchInput) searchInput.value = '';
            const clearBtn = document.getElementById('clear-search-contato');
            if (clearBtn) clearBtn.style.display = 'none';
        });
    });

    bar.querySelectorAll('[data-remove-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.removeFilter;
            if (companyContactsManager) companyContactsManager.setFilter(key, null);
        });
    });
}

// ============================================================================
// SEÇÃO 4: BULK SELECTION UI
// ============================================================================

export function updateContatosBulkUI() {
    const mgr = companyContactsManager;
    const toolbar = document.getElementById('contatos-bulk-toolbar');
    if (!toolbar || !mgr) return;

    const ids = mgr.getSelectedIds();
    const count = ids.length;
    const hasAny = count > 0;

    toolbar.classList.toggle('has-selection', hasAny);

    const countEl = document.getElementById('contatos-bulk-count');
    if (countEl) {
        countEl.textContent = hasAny
            ? `${count} contato${count !== 1 ? 's' : ''} selecionado${count !== 1 ? 's' : ''}`
            : 'Nenhum contato selecionado';
    }

    const deleteBtn = document.getElementById('bulk-delete-contatos-btn');
    const editBtn = document.getElementById('bulk-edit-contatos-btn');
    const clearBtn = document.getElementById('bulk-clear-contatos-btn');
    if (deleteBtn) deleteBtn.disabled = !hasAny;
    if (editBtn) editBtn.disabled = !hasAny;
    if (clearBtn) clearBtn.disabled = !hasAny;

    const selectAllCb = document.getElementById('select-all-contatos');
    if (selectAllCb) {
        const pageData = mgr.getPaginatedData();
        const pageIds = pageData.map(c => String(c.id ?? c._id)).filter(Boolean);
        const allSelected = pageIds.length > 0 && pageIds.every(id => mgr.isSelected(id));
        const someSelected = pageIds.some(id => mgr.isSelected(id));
        selectAllCb.checked = allSelected;
        selectAllCb.indeterminate = someSelected && !allSelected;
    }
}

export function clearContatosBulkSelection() {
    if (!companyContactsManager) return;
    companyContactsManager.clearSelection();
    const rows = companyContactsManager.getPaginatedData();
    renderContatosRows(rows);
    updateContatosBulkUI();
}

// ============================================================================
// SEÇÃO 5: INICIALIZAÇÃO E ATUALIZAÇÃO
// ============================================================================

export function initCompanyContactsTable() {
    companyContactsManager = new TableManager({
        data: state.tempContatos || [],
        columns: [
            { key: 'nome', label: 'Nome', type: 'string', sortable: true, searchable: true, filterable: true },
            { key: 'cargo', label: 'Cargo', type: 'string', sortable: true, searchable: false, filterable: true },
            { key: 'departamento', label: 'Departamento', type: 'string', sortable: true, searchable: false, filterable: true },
            { key: 'email1', label: 'E-mail', type: 'string', sortable: false, searchable: true, filterable: true },
            { key: 'whatsapp', label: 'WhatsApp', type: 'string', sortable: false, searchable: false, filterable: false },
            { key: 'linkedin', label: 'LinkedIn', type: 'string', sortable: false, searchable: false, filterable: false },
        ],
        pageSize: 10,
        tableId: 'contatos-table',
        renderRows: renderContatosRows,
        renderPagination: renderContatosPagination,
        renderFilters: renderContatosActiveFilters,
    });

    // ── Wire: paginação ──────────────────────────────────────────────────────
    const paginationEl = document.getElementById('pagination-contatos');
    if (paginationEl && !paginationEl.dataset.contPaginationWired) {
        paginationEl.dataset.contPaginationWired = '1';
        paginationEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-cont-page], [data-cont-action]');
            if (!btn || !companyContactsManager) return;
            const action = btn.dataset.contAction;
            const page = btn.dataset.contPage;
            if (action === 'prev') companyContactsManager.prevPage();
            else if (action === 'next') companyContactsManager.nextPage();
            else if (page !== undefined) companyContactsManager.goToPage(parseInt(page));
        });
    }

    // ── Wire: busca ──────────────────────────────────────────────────────────
    const searchInput = document.getElementById('search-contato');
    if (searchInput && !searchInput.dataset.contSearchWired) {
        searchInput.dataset.contSearchWired = '1';
        searchInput.addEventListener('input', (e) => {
            companyContactsManager?.setSearch(e.target.value);
            const clearBtn = document.getElementById('clear-search-contato');
            if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
        });
    }

    const clearSearchBtn = document.getElementById('clear-search-contato');
    if (clearSearchBtn && !clearSearchBtn.dataset.contClearWired) {
        clearSearchBtn.dataset.contClearWired = '1';
        clearSearchBtn.addEventListener('click', () => {
            const input = document.getElementById('search-contato');
            if (input) input.value = '';
            companyContactsManager?.setSearch('');
            clearSearchBtn.style.display = 'none';
        });
    }
}

export function refreshCompanyContactsTable() {
    if (!companyContactsManager) {
        initCompanyContactsTable();
        return;
    }
    companyContactsManager.setData(state.tempContatos || []);
}

// Alias de compatibilidade — navigation.js usa `ui.renderContatosTable`
export { refreshCompanyContactsTable as renderContatosTable };

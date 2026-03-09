/**
 * ============================================================================
 * Módulo: Company Products — Tabela (TableManager 2.0 — Standard 10/10)
 * ============================================================================
 * Gerencia a tabela de produtos contratados de uma empresa.
 *
 * Funcionalidades:
 *   ✅ Busca global
 *   ✅ Filtros por coluna
 *   ✅ Ordenação ASC/DESC/reset
 *   ✅ Paginação com ellipsis
 *   ✅ Chips de filtros ativos
 *   ✅ Seleção múltipla (checkboxes)
 *   ✅ Bulk toolbar (excluir em massa)
 *   ✅ Contador de seleção
 *
 * Exports:
 *   initCompanyProductsTable()       — inicializa (ao abrir formulário de empresa)
 *   refreshCompanyProductsTable()    — atualiza dados após CRUD
 *   renderProdutosTable()            — alias de compatibilidade (navigation.js)
 *   updateProdutosBulkUI()           — atualiza toolbar de seleção
 *   clearProdutosBulkSelection()     — limpa seleção
 *   getCompanyProductsManager()      — getter do manager
 */
import { TableManager } from '../../core/table-manager.js';
import { state } from '../state.js';

// ── Instância singleton ──────────────────────────────────────────────────────
let companyProductsManager = null;

export function getCompanyProductsManager() {
    return companyProductsManager;
}

// ============================================================================
// SEÇÃO 1: FORMATAÇÃO
// ============================================================================

function fmtBRL(val) {
    if (val == null || val === '' || isNaN(Number(val))) return '—';
    return 'R$\u00a0' + Number(val).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

// ============================================================================
// SEÇÃO 2: RENDERIZAÇÃO DE LINHAS (com checkboxes)
// ============================================================================

function renderProdutosRows(rows) {
    const tbody = document.getElementById('produtos-table-body');
    if (!tbody) return;

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="table-empty-cell">
                    <div class="table-empty-state">
                        <i class="ph ph-package"></i>
                        <span>Nenhum produto encontrado.
                            Clique em <strong>+ Adicionar Produto</strong> para começar.</span>
                    </div>
                </td>
            </tr>`;
        updateProdutosBulkUI();
        return;
    }

    tbody.innerHTML = rows.map(p => {
        const isSelected = companyProductsManager?.isSelected(String(p.id));
        return `
        <tr class="produto-row${isSelected ? ' row-selected' : ''}" data-prod-id="${p.id}">
            <td>
                <input type="checkbox" class="produto-checkbox"
                    data-prod-id="${p.id}"
                    ${isSelected ? 'checked' : ''}
                    style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;">
            </td>
            <td><strong class="prod-name-cell">${p.nome || '—'}</strong></td>
            <td>${p.tipoCobranca || '—'}</td>
            <td>${fmtBRL(p.valorUnitario)}</td>
            <td>${p.cobrancaSetup === 'Sim' ? fmtBRL(p.valorSetup) : '—'}</td>
            <td>${p.qtdUsuarios || '—'}</td>
            <td>${p.totalHorasHd ? p.totalHorasHd + 'h/mês' : '—'}</td>
            <td>
                ${p.propostaData
                    ? '<span class="badge-prod-yes"><i class="ph ph-check"></i> Sim</span>'
                    : '<span class="badge-prod-no">Não</span>'}
            </td>
            <td>
                ${p.contratoData
                    ? '<span class="badge-prod-yes"><i class="ph ph-check"></i> Sim</span>'
                    : '<span class="badge-prod-no">Não</span>'}
            </td>
            <td>
                <div class="actions">
                    <button type="button" class="btn btn-secondary btn-icon btn-edit-produto"
                            data-prod-id="${p.id}" title="Editar produto">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button type="button" class="btn btn-danger btn-icon btn-delete-produto"
                            data-prod-id="${p.id}" title="Excluir produto">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Atualiza a bulk toolbar após cada render
    updateProdutosBulkUI();
}

// ============================================================================
// SEÇÃO 3: PAGINAÇÃO
// ============================================================================

function renderProdutosPagination({ currentPage, totalPages, pageSize, totalRecords, hasPrev, hasNext }) {
    const container = document.getElementById('pagination-produtos');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    // Janela deslizante com ellipsis (padrão TM2)
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
    const end   = Math.min(currentPage * pageSize, totalRecords);

    container.style.display = 'flex';
    container.innerHTML = `
        <div class="pagination">
            <button class="pagination-btn" data-prod-action="prev" ${!hasPrev ? 'disabled' : ''} title="Página anterior">
                <i class="ph ph-caret-left"></i>
            </button>
            ${pageItems.map(item =>
                item === '...'
                    ? '<span class="pagination-dots">···</span>'
                    : `<button class="pagination-page ${item === currentPage ? 'active' : ''}"
                               data-prod-page="${item}">${item}</button>`
            ).join('')}
            <button class="pagination-btn" data-prod-action="next" ${!hasNext ? 'disabled' : ''} title="Próxima página">
                <i class="ph ph-caret-right"></i>
            </button>
        </div>
        <div class="pagination-info">
            ${start}–${end} de <strong>${totalRecords}</strong> produto${totalRecords !== 1 ? 's' : ''}
        </div>`;
}

// ============================================================================
// SEÇÃO 4: CHIPS DE FILTROS ATIVOS
// ============================================================================

function renderProdutosActiveFilters(activeFilters, search) {
    const bar = document.getElementById('produtos-active-filters');
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
                    onclick="ui.clearProdutosFilters()">
                <i class="ph ph-x-circle"></i> Limpar tudo
            </button>`);
        bar.innerHTML = chips.join('');
        bar.style.display = 'flex';
    } else {
        bar.innerHTML = '';
        bar.style.display = 'none';
    }

    // Wire os botões de remover chip
    bar.querySelectorAll('[data-remove-search]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!companyProductsManager) return;
            companyProductsManager.setSearch('');
            const searchInput = document.getElementById('search-produto');
            if (searchInput) searchInput.value = '';
            const clearBtn = document.getElementById('clear-search-produto');
            if (clearBtn) clearBtn.style.display = 'none';
        });
    });

    bar.querySelectorAll('[data-remove-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.removeFilter;
            if (companyProductsManager) companyProductsManager.setFilter(key, null);
        });
    });
}

// ============================================================================
// SEÇÃO 5: BULK SELECTION UI
// ============================================================================

/**
 * Atualiza o contador, estado da toolbar e checkboxes de seleção.
 * Deve ser chamado após qualquer mudança de seleção.
 */
export function updateProdutosBulkUI() {
    const mgr = companyProductsManager;
    const toolbar = document.getElementById('produtos-bulk-toolbar');
    if (!toolbar || !mgr) return;

    const ids    = mgr.getSelectedIds();
    const count  = ids.length;
    const hasAny = count > 0;

    // Toolbar visual
    toolbar.classList.toggle('has-selection', hasAny);

    // Contador
    const countEl = document.getElementById('produtos-bulk-count');
    if (countEl) {
        countEl.textContent = hasAny
            ? `${count} produto${count !== 1 ? 's' : ''} selecionado${count !== 1 ? 's' : ''}`
            : 'Nenhum produto selecionado';
    }

    // Botões — CRÍTICO: usar .disabled ao invés de apenas CSS
    const editBtn   = document.getElementById('bulk-edit-produtos-btn');
    const deleteBtn = document.getElementById('bulk-delete-produtos-btn');
    const clearBtn  = document.getElementById('bulk-clear-produtos-btn');
    if (editBtn)   editBtn.disabled   = !hasAny;
    if (deleteBtn) deleteBtn.disabled = !hasAny;
    if (clearBtn)  clearBtn.disabled  = !hasAny;

    // Select-all checkbox (estado: checked / indeterminate / unchecked)
    const selectAllCb = document.getElementById('select-all-produtos');
    if (selectAllCb) {
        const pageData = mgr.getPaginatedData();
        const pageIds  = pageData.map(p => String(p.id ?? p._id)).filter(Boolean);
        const allSelected  = pageIds.length > 0 && pageIds.every(id => mgr.isSelected(id));
        const someSelected = pageIds.some(id => mgr.isSelected(id));
        selectAllCb.checked       = allSelected;
        selectAllCb.indeterminate = someSelected && !allSelected;
    }
}

/** Limpa toda a seleção e atualiza a UI */
export function clearProdutosBulkSelection() {
    if (!companyProductsManager) return;
    companyProductsManager.clearSelection();
    // Re-render linhas para remover classe row-selected
    const rows = companyProductsManager.getPaginatedData();
    renderProdutosRows(rows);
    updateProdutosBulkUI();
}

// ============================================================================
// SEÇÃO 6: INICIALIZAÇÃO E ATUALIZAÇÃO
// ============================================================================

/**
 * Inicializa o TableManager 2.0 com dados de state.tempProdutos.
 * Chamado por navigation.js via `ui.renderProdutosTable()` ao abrir empresa.
 */
export function initCompanyProductsTable() {
    companyProductsManager = new TableManager({
        data: state.tempProdutos || [],
        columns: [
            { key: 'nome',          label: 'Produto',          type: 'string',       sortable: true,  searchable: true,  filterable: true },
            { key: 'tipoCobranca',  label: 'Tipo de Cobrança', type: 'string',       sortable: true,  searchable: true,  filterable: true },
            { key: 'valorUnitario', label: 'Valor Unitário',   type: 'number',       sortable: true,  searchable: false, filterable: true },
            { key: 'valorSetup',    label: 'Valor Setup',      type: 'number',       sortable: true,  searchable: false, filterable: true },
            { key: 'qtdUsuarios',   label: 'Usuários',         type: 'string',       sortable: false, searchable: true,  filterable: true },
            { key: 'totalHorasHd',  label: 'Help Desk (h)',    type: 'number',       sortable: true,  searchable: false, filterable: true },
            { key: 'propostaData',  label: 'Proposta',         type: 'string',       sortable: false, searchable: false, filterable: true, filterType: 'boolean-date' },
            { key: 'contratoData',  label: 'Contrato',         type: 'string',       sortable: false, searchable: false, filterable: true, filterType: 'boolean-date' },
        ],
        pageSize: 10,
        tableId:  'produtos-table',
        renderRows:       renderProdutosRows,
        renderPagination: renderProdutosPagination,
        renderFilters:    renderProdutosActiveFilters,
    });

    // ── Wire: paginação (event delegation, uma vez por container) ──────────
    const paginationEl = document.getElementById('pagination-produtos');
    if (paginationEl && !paginationEl.dataset.prodPaginationWired) {
        paginationEl.dataset.prodPaginationWired = '1';
        paginationEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-prod-page], [data-prod-action]');
            if (!btn || !companyProductsManager) return;
            const action = btn.dataset.prodAction;
            const page   = btn.dataset.prodPage;
            if (action === 'prev')       companyProductsManager.prevPage();
            else if (action === 'next')  companyProductsManager.nextPage();
            else if (page !== undefined) companyProductsManager.goToPage(parseInt(page));
        });
    }

    // ── Wire: busca (uma vez por input) ───────────────────────────────────
    const searchInput = document.getElementById('search-produto');
    if (searchInput && !searchInput.dataset.prodSearchWired) {
        searchInput.dataset.prodSearchWired = '1';
        searchInput.addEventListener('input', (e) => {
            companyProductsManager?.setSearch(e.target.value);
            const clearBtn = document.getElementById('clear-search-produto');
            if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
        });
    }

    const clearSearchBtn = document.getElementById('clear-search-produto');
    if (clearSearchBtn && !clearSearchBtn.dataset.prodClearWired) {
        clearSearchBtn.dataset.prodClearWired = '1';
        clearSearchBtn.addEventListener('click', () => {
            const input = document.getElementById('search-produto');
            if (input) input.value = '';
            companyProductsManager?.setSearch('');
            clearSearchBtn.style.display = 'none';
        });
    }
}

/**
 * Atualiza a tabela com os dados atuais de state.tempProdutos.
 * Chame após: adicionar, editar ou excluir um produto.
 */
export function refreshCompanyProductsTable() {
    if (!companyProductsManager) {
        initCompanyProductsTable();
        return;
    }
    companyProductsManager.setData(state.tempProdutos || []);
}

// Alias de compatibilidade — navigation.js usa `ui.renderProdutosTable`
export { refreshCompanyProductsTable as renderProdutosTable };

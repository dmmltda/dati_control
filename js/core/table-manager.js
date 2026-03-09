/**
 * ============================================================================
 * TableManager 2.0 — Motor Universal de Tabelas (DATI Control)
 * ============================================================================
 *
 * Classe reutilizável e sem dependências externas para gerenciar o estado
 * completo de qualquer tabela no sistema.
 *
 * RESPONSABILIDADES:
 *   - Busca global (deep search em todos os campos)
 *   - Filtros por coluna (text, select, multi-select, date range)
 *   - Ordenação (string, number, date) com alternância ASC/DESC
 *   - Paginação configurável
 *   - Seleção múltipla (checkboxes)
 *   - Chips de filtros ativos
 *
 * O TableManager NÃO gera HTML de linhas — ele controla os dados e
 * chama os callbacks de renderização fornecidos na configuração.
 *
 * FLUXO INTERNO (refresh):
 *   1. Aplicar filtros por coluna
 *   2. Aplicar busca global
 *   3. Aplicar ordenação
 *   4. Aplicar paginação
 *   5. Chamar renderRows(paginatedData)
 *   6. Chamar renderPagination(state)
 *   7. Chamar renderActiveFilters(activeFilters)
 * ============================================================================
 */
export class TableManager {

    /**
     * @param {Object} config - Configuração da tabela
     * @param {Array}    config.data              - Dados iniciais
     * @param {Array}    config.columns           - Definição das colunas
     * @param {number}   [config.pageSize=15]     - Registros por página
     * @param {Function} config.renderRows        - Callback(data) chamado após refresh
     * @param {Function} [config.renderPagination]- Callback(paginationState) opcional
     * @param {Function} [config.renderFilters]   - Callback(activeFilters) para chips
     * @param {string}   [config.tableId]         - ID do elemento <table> para atualizar headers
     */
    constructor(config) {
        // --- Dados ---
        this._originalData  = [...(config.data || [])];
        this._filteredTotal = 0; // total após filtros (antes de paginar)

        // --- Definição das colunas ---
        // Exemplo de coluna:
        // { key: 'nome', label: 'Nome', type: 'string', searchable: true, sortable: true, filterable: true }
        this._columns = config.columns || [];

        // --- Configurações ---
        this._pageSize  = config.pageSize || 15;
        this._tableId   = config.tableId  || null;

        // --- Callbacks ---
        this._renderRows       = config.renderRows       || (() => {});
        this._renderPagination = config.renderPagination || null;
        this._renderFilters    = config.renderFilters    || null;

        // --- Estado interno ---
        this._search    = '';                  // busca global (string)
        this._filters   = {};                  // { columnKey: value | value[] }
        this._sort      = { key: null, dir: 'asc' }; // coluna e direção
        this._page      = 1;                   // página atual (1-indexed)
        this._totalPages = 1;

        // --- Seleção múltipla ---
        this._selected = new Set();            // IDs das linhas selecionadas

        // --- Cache de dados processados ---
        this._processedData = [];              // dados após busca + filtros + ordenação

        // Disparar render inicial
        this.refresh();
    }

    // ==========================================================================
    // SEÇÃO 1: API PÚBLICA — atualização de estado
    // ==========================================================================

    /** Substitui os dados. Mantém filtros e ordenação ativos. */
    setData(data) {
        this._originalData = [...(data || [])];
        this._page = 1;
        this._selected.clear();
        this.refresh();
    }

    /** Define o termo de busca global. */
    setSearch(query) {
        this._search = String(query || '').toLowerCase().trim();
        this._page = 1;
        this.refresh();
    }

    /**
     * Define o filtro de uma coluna.
     * @param {string} key   - Chave da coluna (ex: 'status')
     * @param {*}      value - Valor do filtro. Null/undefined/'' remove o filtro.
     */
    setFilter(key, value) {
        const isEmpty = value === null || value === undefined || value === '' ||
                        (Array.isArray(value) && value.length === 0);
        if (isEmpty) {
            delete this._filters[key];
        } else {
            this._filters[key] = value;
        }
        this._page = 1;
        this.refresh();
    }

    /** Remove todos os filtros e a busca global. */
    clearFilters() {
        this._filters = {};
        this._search  = '';
        this._page    = 1;
        this.refresh();
    }

    /**
     * Define a ordenação. Se a coluna já está ordenada, alterna ASC → DESC → nenhuma.
     * @param {string} key - Chave da coluna
     */
    setSort(key) {
        if (this._sort.key === key) {
            if (this._sort.dir === 'asc')  { this._sort.dir = 'desc'; }
            else if (this._sort.dir === 'desc') { this._sort.key = null; this._sort.dir = 'asc'; }
        } else {
            this._sort.key = key;
            this._sort.dir = 'asc';
        }
        this.refresh();
    }

    /** Define ordenação explicitamente sem alternância. */
    setSortExplicit(key, dir = 'asc') {
        this._sort.key = key;
        this._sort.dir = dir;
        this.refresh();
    }

    /** Navega para uma página específica. */
    goToPage(page) {
        const p = parseInt(page);
        if (isNaN(p) || p < 1 || p > this._totalPages) return;
        this._page = p;
        this._renderOutput(); // só re-pagina, não refiltra
    }

    /** Avança para a próxima página (sem efeito se já for a última). */
    nextPage() {
        if (this._page < this._totalPages) {
            this._page++;
            this._renderOutput();
        }
    }

    /** Volta para a página anterior (sem efeito se já for a primeira). */
    prevPage() {
        if (this._page > 1) {
            this._page--;
            this._renderOutput();
        }
    }

    /** Define o tamanho da página e volta para a página 1. */
    setPageSize(size) {
        this._pageSize = Math.max(1, parseInt(size) || 15);
        this._page = 1;
        this.refresh();
    }

    // ==========================================================================
    // SEÇÃO 2: SELEÇÃO MÚLTIPLA
    // As IDs são sempre normalizadas para String para evitar mismatch entre
    // data-id (sempre string no DOM) e comp.id (pode ser number do banco).
    // ==========================================================================

    /** Alterna seleção de um item pelo seu ID. */
    toggleSelect(id) {
        const key = String(id);
        if (this._selected.has(key)) {
            this._selected.delete(key);
        } else {
            this._selected.add(key);
        }
    }

    /** Seleciona/deseleciona todos os itens da página atual. */
    toggleSelectAll(selectAll) {
        const paginated = this.getPaginatedData();
        paginated.forEach(item => {
            const raw = item.id ?? item._id;
            if (raw === undefined) return;
            const key = String(raw);
            if (selectAll) {
                this._selected.add(key);
            } else {
                this._selected.delete(key);
            }
        });
    }

    /** Retorna array com os IDs selecionados (sempre strings). */
    getSelectedIds() {
        return [...this._selected];
    }

    /** Retorna os objetos completos dos itens selecionados. */
    getSelectedItems() {
        return this._originalData.filter(item => {
            const raw = item.id ?? item._id;
            return raw !== undefined && this._selected.has(String(raw));
        });
    }

    /** Verifica se um item está selecionado. */
    isSelected(id) {
        return this._selected.has(String(id));
    }

    /** Limpa toda a seleção. */
    clearSelection() {
        this._selected.clear();
    }

    // ==========================================================================
    // SEÇÃO 3: LEITURA DE ESTADO
    // ==========================================================================

    /** Retorna os dados filtrados e ordenados (sem paginar). */
    getFilteredData() {
        return [...this._processedData];
    }

    /** Retorna os dados da página atual. */
    getPaginatedData() {
        const start = (this._page - 1) * this._pageSize;
        return this._processedData.slice(start, start + this._pageSize);
    }

    /** Retorna os filtros ativos como array de objetos { key, label, value }. */
    getActiveFilters() {
        return Object.entries(this._filters).map(([key, value]) => {
            const col = this._columns.find(c => c.key === key);
            let displayValue;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Range filter {min?, max?}
                const parts = [];
                if (value.min != null) parts.push(`\u2265 ${value.min}`);
                if (value.max != null) parts.push(`\u2264 ${value.max}`);
                displayValue = parts.length ? parts.join(' e ') : '(qualquer)';
            } else if (Array.isArray(value)) {
                displayValue = value.join(', ');
            } else {
                displayValue = String(value);
            }
            return {
                key,
                label: col?.label || key,
                value: displayValue,
            };
        });
    }

    /** Retorna o estado atual da paginação. */
    getPaginationState() {
        return {
            currentPage : this._page,
            totalPages  : this._totalPages,
            pageSize    : this._pageSize,
            totalRecords: this._filteredTotal,
            hasPrev     : this._page > 1,
            hasNext     : this._page < this._totalPages,
        };
    }

    /** Retorna o estado atual de ordenação. */
    getSortState() {
        return { ...this._sort };
    }

    // ==========================================================================
    // GETTERS DE COMPATIBILIDADE — permitem que código legado acesse propriedades
    // com a mesma interface do TableManager 1.0 (manager.columns, manager.filters,
    // manager.sort.key, manager.sort.direction)
    // ==========================================================================

    /** Exposição das colunas (compatível com manager.columns.find()) */
    get columns() {
        return this._columns;
    }

    /** Exposição dos filtros ativos como objeto chave→valor (compatível com manager.filters[key]) */
    get filters() {
        return { ...this._filters };
    }

    /** Exposição do estado de ordenação com alias 'direction' (compatível com manager.sort.direction) */
    get sort() {
        return {
            key      : this._sort.key,
            dir      : this._sort.dir,
            direction: this._sort.dir,    // alias legado
        };
    }

    /** Retorna os valores únicos de uma coluna (útil para gerar <select> de filtro). */
    getUniqueValues(key) {
        const seen = new Set();
        return this._originalData
            .map(item => item[key])
            .filter(v => {
                if (v === null || v === undefined || v === '') return false;
                const str = String(v);
                if (seen.has(str)) return false;
                seen.add(str);
                return true;
            })
            .sort((a, b) => String(a).localeCompare(String(b)));
    }

    // ==========================================================================
    // SEÇÃO 4: NÚCLEO — refresh e pipeline de processamento
    // ==========================================================================

    /**
     * Executa o pipeline completo:
     * filtros → busca → ordenação → paginação → callbacks de renderização
     */
    refresh() {
        // Pipeline: filtros → busca → sort → paginação
        let data = this._applyFilters(this._originalData);
        data = this._applySearch(data);
        data = this._applySort(data);

        this._processedData = data;
        this._filteredTotal = data.length;
        this._totalPages    = Math.max(1, Math.ceil(this._filteredTotal / this._pageSize));

        // Corrige página atual se necessário
        if (this._page > this._totalPages) this._page = this._totalPages;

        this._renderOutput();
    }

    /** Executa apenas a saída (chamada após mudança de página sem refiltrar). */
    _renderOutput() {
        const paginated       = this.getPaginatedData();
        const paginationState = this.getPaginationState();

        // 1. Renderizar linhas
        this._renderRows(paginated);

        // 2. Renderizar paginação (se callback fornecido)
        if (this._renderPagination) {
            this._renderPagination(paginationState);
        }

        // 3. Renderizar chips de filtros ativos (se callback fornecido)
        if (this._renderFilters) {
            this._renderFilters(this.getActiveFilters(), this._search);
        }

        // 4. Atualizar headers da tabela (classes de ordenação)
        this._updateHeaderUI();
    }

    // ==========================================================================
    // SEÇÃO 5: FILTROS INTERNOS
    // ==========================================================================

    /**
     * Busca global: procura o termo em todos os campos do objeto recursivamente.
     * Suporta strings, números, objetos aninhados e arrays.
     */
    _applySearch(data) {
        if (!this._search) return data;

        const searchable = this._columns
            .filter(c => c.searchable !== false)
            .map(c => c.key);

        return data.filter(item => {
            // Se há colunas searchable definidas, busca só nelas
            if (searchable.length > 0) {
                return searchable.some(key => {
                    const val = item[key];
                    return this._deepStringify(val).includes(this._search);
                });
            }
            // Fallback: busca em todo o objeto
            return this._deepStringify(item).includes(this._search);
        });
    }

    /**
     * Aplica filtros por coluna.
     * Suporta: text (contains), select (exact), multi-select, date range,
     *          number range ({min?, max?}), boolean-date ('Sim'/'N\u00e3o').
     */
    _applyFilters(data) {
        if (Object.keys(this._filters).length === 0) return data;

        return data.filter(item => {
            return Object.entries(this._filters).every(([key, filterValue]) => {
                const col   = this._columns.find(c => c.key === key);
                const type  = col?.filterType || col?.type || 'text';
                const raw   = item[key];

                // ── Range numerico: {min?, max?} ────────────────────────────
                if (filterValue && typeof filterValue === 'object' && !Array.isArray(filterValue)) {
                    const numVal = this._parseNumber(raw);
                    if (filterValue.min != null && numVal < Number(filterValue.min)) return false;
                    if (filterValue.max != null && numVal > Number(filterValue.max)) return false;
                    return true;
                }

                // ── Boolean-date: Sim (truthy) / N\u00e3o (falsy) ───────────────
                if (type === 'boolean-date') {
                    const has = raw != null && raw !== '';
                    if (String(filterValue).toLowerCase() === 'sim') return has;
                    if (String(filterValue).toLowerCase() === 'n\u00e3o') return !has;
                    return true; // '(tudo)'
                }

                // Multi-select: o valor do item deve estar no array de filtros
                if (type === 'multi-select' || Array.isArray(filterValue)) {
                    const targets = Array.isArray(filterValue) ? filterValue : [filterValue];
                    return targets.some(t =>
                        String(raw || '').toLowerCase() === String(t).toLowerCase()
                    );
                }

                // Date range: "DD/MM/YYYY a DD/MM/YYYY" ou "YYYY-MM-DD a YYYY-MM-DD"
                if (type === 'date' && String(filterValue).includes(' a ')) {
                    const [startStr, endStr] = String(filterValue).split(' a ');
                    const itemTime  = this._parseDate(raw);
                    const startTime = this._parseDate(startStr.trim());
                    // Inclui o dia inteiro do fim do range
                    const endTime   = this._parseDate(endStr.trim()) + 86399999;
                    if (!itemTime || !startTime) return false;
                    return itemTime >= startTime && itemTime <= endTime;
                }

                // Select: correspond\u00eancia exata (case-insensitive)
                if (type === 'select') {
                    return String(raw || '').toLowerCase() === String(filterValue).toLowerCase();
                }

                // Text (padr\u00e3o): contains
                return String(raw || '').toLowerCase().includes(String(filterValue).toLowerCase());
            });
        });
    }

    /** Aplica ordenação. Suporta tipos: string, number, date. */
    _applySort(data) {
        if (!this._sort.key) return data;

        const col    = this._columns.find(c => c.key === this._sort.key);
        const type   = col?.type || 'string';
        const factor = this._sort.dir === 'asc' ? 1 : -1;
        const key    = this._sort.key;

        return [...data].sort((a, b) => {
            const valA = a[key];
            const valB = b[key];

            if (type === 'date') {
                return (this._parseDate(valA) - this._parseDate(valB)) * factor;
            }

            if (type === 'number') {
                const numA = this._parseNumber(valA);
                const numB = this._parseNumber(valB);
                return (numA - numB) * factor;
            }

            // String (padrão)
            return String(valA ?? '').localeCompare(String(valB ?? ''), 'pt-BR') * factor;
        });
    }

    // ==========================================================================
    // SEÇÃO 6: HELPERS INTERNOS
    // ==========================================================================

    /** Converte recursivamente qualquer valor para string lowercase para busca. */
    _deepStringify(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
            return Object.values(value).map(v => this._deepStringify(v)).join(' ').toLowerCase();
        }
        return String(value).toLowerCase();
    }

    /**
     * Converte uma data para timestamp (ms).
     * Suporta: Date, ISO string, DD/MM/YYYY, YYYY-MM-DD.
     */
    _parseDate(value) {
        if (!value || value === '-') return 0;
        if (value instanceof Date) return isNaN(value) ? 0 : value.getTime();

        const s = String(value).trim();

        // DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
            const [d, m, y] = s.split('/');
            return new Date(`${y}-${m}-${d}`).getTime() || 0;
        }

        // YYYY-MM-DD ou ISO
        return new Date(s).getTime() || 0;
    }

    /**
     * Converte valor monetário ou numérico formatado (ex: "1.234,56") para float.
     */
    _parseNumber(value) {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return value;
        const clean = String(value).replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.');
        return parseFloat(clean) || 0;
    }

    /**
     * Atualiza classes CSS nos cabeçalhos da tabela (sort-asc / sort-desc / filter-active).
     * Requer que os <th> tenham o atributo: data-key="keyDaColuna"
     */
    _updateHeaderUI() {
        if (!this._tableId) return;
        const table = document.getElementById(this._tableId);
        if (!table) return;

        this._columns.forEach(col => {
            const th = table.querySelector(`th[data-key="${col.key}"]`);
            if (!th) return;

            // Classes de ordenação
            th.classList.toggle('sort-asc',  this._sort.key === col.key && this._sort.dir === 'asc');
            th.classList.toggle('sort-desc', this._sort.key === col.key && this._sort.dir === 'desc');

            // Indicador de filtro ativo
            const filterBtn = th.querySelector('.btn-filter-column');
            if (filterBtn) {
                filterBtn.classList.toggle('active', !!this._filters[col.key]);
            }
        });
    }
}

// ==============================================================================
// EXEMPLO DE USO
// ==============================================================================
/*
import { TableManager } from './js/core/table-manager.js';

const tm = new TableManager({
    data: empresas,

    columns: [
        { key: 'nome',      label: 'Empresa',  type: 'string', searchable: true, sortable: true },
        { key: 'status',    label: 'Status',   type: 'string', filterType: 'select', filterable: true },
        { key: 'nps',       label: 'NPS',      type: 'number', sortable: true },
        { key: 'createdAt', label: 'Criação',  type: 'date',   filterable: true },
    ],

    pageSize: 15,
    tableId:  'companies-table',

    // Callback principal: recebe os dados da página atual
    renderRows: (data) => renderCompanyTableRows(data),

    // Callback de paginação: recebe o estado e gera os controles
    renderPagination: (state) => renderPaginationControls(state, tm),

    // Callback de chips: recebe os filtros ativos e atualiza a barra
    renderFilters: (activeFilters, search) => renderActiveFilterChips(activeFilters, search, tm),
});

// API pública:
tm.setSearch('DATI');
tm.setFilter('status', 'Ativo');
tm.setFilter('createdAt', '01/01/2024 a 31/03/2024');
tm.setSort('nome');
tm.goToPage(2);
tm.clearFilters();

// Seleção múltipla:
tm.toggleSelectAll(true);
console.log(tm.getSelectedIds());

// Valores únicos de uma coluna (para popular select de filtro):
const statusOptions = tm.getUniqueValues('status');
*/

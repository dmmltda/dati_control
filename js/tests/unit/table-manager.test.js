/**
 * ============================================================================
 * Testes Unitários — TableManager 2.0
 * js/core/table-manager.js
 * ============================================================================
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TableManager } from '../../core/table-manager.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeData(n = 10) {
    return Array.from({ length: n }, (_, i) => ({
        id: String(i + 1),
        nome: `Empresa ${String.fromCharCode(65 + i)}`,   // A, B, C…
        status: i % 2 === 0 ? 'Ativo' : 'Inativo',
        valor: (i + 1) * 1000,
    }));
}

const COLUMNS = [
    { key: 'nome',   label: 'Nome',   type: 'string', searchable: true, filterable: true, sortable: true },
    // filterType:'select' usa exact match (case-insensitive) — padrão para selects de status
    { key: 'status', label: 'Status', type: 'string', filterType: 'select', searchable: true, filterable: true },
    { key: 'valor',  label: 'Valor',  type: 'number', sortable: true },
];

function makeManager(overrides = {}) {
    const renderRows = vi.fn();
    const mgr = new TableManager({
        data: makeData(10),
        columns: COLUMNS,
        pageSize: 5,
        renderRows,
        ...overrides,
    });
    renderRows.mockClear(); // ignora o render inicial do constructor
    return { mgr, renderRows };
}

// ─── CONSTRUCTOR ──────────────────────────────────────────────────────────────

describe('TableManager — constructor', () => {
    it('inicializa com dataset completo', () => {
        const { mgr } = makeManager();
        expect(mgr.getFilteredData()).toHaveLength(10);
    });

    it('usa pageSize configurado', () => {
        const { mgr } = makeManager({ pageSize: 3 });
        expect(mgr.getPaginatedData()).toHaveLength(3);
    });

    it('inicia na página 1 sem filtros ativos', () => {
        const { mgr } = makeManager();
        const state = mgr.getPaginationState();
        expect(state.currentPage).toBe(1);
        expect(mgr.getActiveFilters()).toHaveLength(0);
    });

    it('chama renderRows durante inicialização', () => {
        const renderRows = vi.fn();
        new TableManager({ data: makeData(5), columns: COLUMNS, pageSize: 5, renderRows });
        expect(renderRows).toHaveBeenCalledTimes(1);
    });
});

// ─── setData ──────────────────────────────────────────────────────────────────

describe('TableManager — setData()', () => {
    it('substitui o dataset completo', () => {
        const { mgr } = makeManager();
        mgr.setData(makeData(3));
        expect(mgr.getFilteredData()).toHaveLength(3);
    });

    it('reseta para página 1 após setData', () => {
        const { mgr } = makeManager();
        mgr.goToPage(2);
        mgr.setData(makeData(20));
        expect(mgr.getPaginationState().currentPage).toBe(1);
    });

    it('mantém filtros ativos após setData', () => {
        const { mgr } = makeManager();
        // Filtra por status='Ativo' (filterType:'select' = exact match case-insensitive)
        mgr.setFilter('status', 'Ativo');
        const beforeCount = mgr.getFilteredData().length; // 5 (índices pares 0,2,4,6,8)
        // Substitui dados com mesmo padrão — filtro deve ser mantido
        mgr.setData(makeData(10));
        // Deve manter o mesmo filtro aplicado
        expect(mgr.getFilteredData()).toHaveLength(beforeCount);
        expect(mgr.getFilteredData().every(r => r.status === 'Ativo')).toBe(true);
    });

    it('aceita array vazio sem erro', () => {
        const { mgr } = makeManager();
        expect(() => mgr.setData([])).not.toThrow();
        expect(mgr.getFilteredData()).toHaveLength(0);
    });
});

// ─── setSearch ────────────────────────────────────────────────────────────────

describe('TableManager — setSearch()', () => {
    it('filtra por texto parcial (case-insensitive)', () => {
        const { mgr } = makeManager();
        mgr.setSearch('empresa a');
        const result = mgr.getFilteredData();
        expect(result).toHaveLength(1);
        expect(result[0].nome).toBe('Empresa A');
    });

    it('retorna todos quando query está vazia', () => {
        const { mgr } = makeManager();
        mgr.setSearch('empresa a');
        mgr.setSearch('');
        expect(mgr.getFilteredData()).toHaveLength(10);
    });

    it('retorna zero quando nada bate', () => {
        const { mgr } = makeManager();
        mgr.setSearch('xxxxxxxxxxx');
        expect(mgr.getFilteredData()).toHaveLength(0);
    });

    it('reseta para página 1 após busca', () => {
        const { mgr } = makeManager({ pageSize: 3 });
        mgr.goToPage(2);
        mgr.setSearch('a');
        expect(mgr.getPaginationState().currentPage).toBe(1);
    });
});

// ─── setFilter / clearFilters ─────────────────────────────────────────────────

describe('TableManager — setFilter() e clearFilters()', () => {
    it('filtra por valor exato de coluna', () => {
        const { mgr } = makeManager();
        mgr.setFilter('status', 'Ativo');
        const result = mgr.getFilteredData();
        expect(result.every(r => r.status === 'Ativo')).toBe(true);
    });

    it('remove filtro quando valor é vazio', () => {
        const { mgr } = makeManager();
        mgr.setFilter('status', 'Ativo');
        mgr.setFilter('status', '');
        expect(mgr.getFilteredData()).toHaveLength(10);
    });

    it('remove filtro quando valor é null', () => {
        const { mgr } = makeManager();
        mgr.setFilter('status', 'Ativo');
        mgr.setFilter('status', null);
        expect(mgr.getFilteredData()).toHaveLength(10);
    });

    it('clearFilters() remove todos os filtros e busca', () => {
        const { mgr } = makeManager();
        mgr.setFilter('status', 'Ativo');
        mgr.setSearch('empresa a');
        mgr.clearFilters();
        expect(mgr.getFilteredData()).toHaveLength(10);
        expect(mgr.getActiveFilters()).toHaveLength(0);
    });

    it('getActiveFilters() retorna os filtros ativos', () => {
        const { mgr } = makeManager();
        mgr.setFilter('status', 'Ativo');
        const active = mgr.getActiveFilters();
        expect(active).toHaveLength(1);
        expect(active[0].key).toBe('status');
        expect(active[0].value).toBe('Ativo');
    });
});

// ─── setSort ──────────────────────────────────────────────────────────────────

describe('TableManager — setSort()', () => {
    it('ordena ASC na primeira chamada', () => {
        const { mgr } = makeManager();
        mgr.setSort('nome');
        const sorted = mgr.getFilteredData();
        expect(sorted[0].nome).toBe('Empresa A');
        expect(sorted[9].nome).toBe('Empresa J');
    });

    it('alterna para DESC na segunda chamada da mesma coluna', () => {
        const { mgr } = makeManager();
        mgr.setSort('nome');
        mgr.setSort('nome');
        const sorted = mgr.getFilteredData();
        expect(sorted[0].nome).toBe('Empresa J');
    });

    it('remove ordenação na terceira chamada', () => {
        const { mgr } = makeManager();
        mgr.setSort('nome');
        mgr.setSort('nome');
        mgr.setSort('nome');
        expect(mgr.getSortState().key).toBe(null);
    });

    it('ordena coluna numérica corretamente', () => {
        const { mgr } = makeManager();
        mgr.setSort('valor');
        const sorted = mgr.getFilteredData();
        expect(sorted[0].valor).toBe(1000);
        expect(sorted[9].valor).toBe(10000);
    });
});

// ─── goToPage / setPageSize ───────────────────────────────────────────────────

describe('TableManager — paginação', () => {
    it('goToPage() retorna a fatia correta', () => {
        const { mgr } = makeManager({ pageSize: 3 });
        mgr.goToPage(2);
        const page = mgr.getPaginatedData();
        expect(page).toHaveLength(3);
        expect(page[0].id).toBe('4'); // dados originais começam por índice 3
    });

    it('goToPage() ignora página inválida', () => {
        const { mgr } = makeManager({ pageSize: 5 });
        mgr.goToPage(999);
        expect(mgr.getPaginationState().currentPage).toBe(1);
    });

    it('setPageSize() muda o tamanho e volta para página 1', () => {
        const { mgr } = makeManager({ pageSize: 5 });
        mgr.goToPage(2);
        mgr.setPageSize(10);
        const state = mgr.getPaginationState();
        expect(state.pageSize).toBe(10);
        expect(state.currentPage).toBe(1);
    });

    it('totalPages é calculado corretamente', () => {
        const { mgr } = makeManager({ pageSize: 3 });
        // 10 itens / 3 por pág = ceil(3.33) = 4 páginas
        expect(mgr.getPaginationState().totalPages).toBe(4);
    });
});

// ─── seleção ──────────────────────────────────────────────────────────────────

describe('TableManager — seleção múltipla', () => {
    it('toggleSelect() adiciona ID ao set', () => {
        const { mgr } = makeManager();
        mgr.toggleSelect('3');
        expect(mgr.getSelectedIds()).toContain('3');
    });

    it('toggleSelect() duas vezes remove o ID', () => {
        const { mgr } = makeManager();
        mgr.toggleSelect('3');
        mgr.toggleSelect('3');
        expect(mgr.getSelectedIds()).not.toContain('3');
    });

    it('isSelected() retorna estado correto', () => {
        const { mgr } = makeManager();
        mgr.toggleSelect('2');
        expect(mgr.isSelected('2')).toBe(true);
        expect(mgr.isSelected('9')).toBe(false);
    });

    it('toggleSelectAll(true) seleciona todos da página', () => {
        const { mgr } = makeManager({ pageSize: 5 });
        mgr.toggleSelectAll(true);
        // página 1 tem IDs 1–5
        expect(mgr.getSelectedIds()).toHaveLength(5);
    });

    it('toggleSelectAll(false) deseleciona a página', () => {
        const { mgr } = makeManager({ pageSize: 5 });
        mgr.toggleSelectAll(true);
        mgr.toggleSelectAll(false);
        expect(mgr.getSelectedIds()).toHaveLength(0);
    });

    it('clearSelection() zera tudo', () => {
        const { mgr } = makeManager();
        mgr.toggleSelect('1');
        mgr.toggleSelect('2');
        mgr.clearSelection();
        expect(mgr.getSelectedIds()).toHaveLength(0);
    });

    it('getSelectedItems() retorna objetos completos', () => {
        const { mgr } = makeManager();
        mgr.toggleSelect('1');
        const items = mgr.getSelectedItems();
        expect(items).toHaveLength(1);
        expect(items[0].nome).toBe('Empresa A');
    });
});

// ─── getFilteredData / getPaginatedData ───────────────────────────────────────

describe('TableManager — leitura de dados', () => {
    it('getFilteredData() retorna cópia (não referência)', () => {
        const { mgr } = makeManager();
        const a = mgr.getFilteredData();
        const b = mgr.getFilteredData();
        expect(a).not.toBe(b); // objetos diferentes
        expect(a).toEqual(b);  // mas mesmos valores
    });

    it('getPaginatedData() respeita pageSize', () => {
        const { mgr } = makeManager({ pageSize: 4 });
        expect(mgr.getPaginatedData()).toHaveLength(4);
    });

    it('última página pode ter menos itens', () => {
        const { mgr } = makeManager({ pageSize: 3 });
        // total=10, página 4 tem apenas 1 item (índice 9)
        mgr.goToPage(4);
        expect(mgr.getPaginatedData()).toHaveLength(1);
    });
});

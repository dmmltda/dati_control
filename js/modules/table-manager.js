/**
 * TableManager - Sistema universal de ordenação e filtros (Padrão 10/10)
 * Gerencia o estado de uma tabela, permitindo filtros múltiplos e ordenação performática.
 */
export class TableManager {
    constructor(data, columns, renderCallback, containerId = null) {
        this.originalData = [...data];
        this.currentData = [...data];
        this.columns = columns;
        this.renderCallback = renderCallback;
        this.containerId = containerId;
        
        this.filters = {};
        this.globalSearch = '';
        this.sort = {
            key: null,
            direction: 'none'
        };

        // Paginação 10/10
        this.currentPage = 1;
        this.rowsPerPage = 10;
        this.totalPages = 0;
        this.paginationContainerId = null;
        this.searchKeys = null;
    }

    setData(newData) {
        this.originalData = [...newData];
        this.apply();
    }

    setFilter(key, value) {
        if (value === '' || value === null || value === undefined) {
            delete this.filters[key];
        } else {
            this.filters[key] = value;
        }
        this.apply();
    }

    setGlobalSearch(term) {
        this.globalSearch = String(term).toLowerCase();
        this.apply();
    }

    toggleSort(key) {
        if (this.sort.key === key) {
            if (this.sort.direction === 'asc') this.sort.direction = 'desc';
            else if (this.sort.direction === 'desc') this.sort.direction = 'none';
            else this.sort.direction = 'asc';
        } else {
            this.sort.key = key;
            this.sort.direction = 'asc';
        }
        this.apply();
    }

    apply() {
        // 1. Filtragem
        this.currentData = this.originalData.filter(item => {
            const matchColumns = Object.entries(this.filters).every(([key, filterValue]) => {
                const itemValue = String(item[key] || '').toLowerCase();
                const val = String(filterValue).toLowerCase();
                return itemValue.includes(val);
            });

            const matchGlobal = !this.globalSearch || (this.searchKeys || Object.keys(item)).some(key => {
                const val = item[key];
                if (typeof val === 'object' || Array.isArray(val)) return false;
                return String(val || '').toLowerCase().includes(this.globalSearch);
            });

            return matchColumns && matchGlobal;
        });

        // 2. Ordenação
        if (this.sort.key && this.sort.direction !== 'none') {
            const { key, direction } = this.sort;
            const column = this.columns.find(c => c.key === key);
            const factor = direction === 'asc' ? 1 : -1;

            this.currentData.sort((a, b) => {
                let valA = a[key];
                let valB = b[key];

                if (column?.type === 'date') {
                    const parseDate = (d) => {
                        if (!d) return 0;
                        // Brute force parsing logic 10/10
                        if (String(d).includes('-')) {
                            // Format: YYYY-MM-DD
                            return new Date(d).getTime() || 0;
                        }
                        if (String(d).includes('/')) {
                            // Format: DD/MM/YYYY
                            const [day, month, year] = d.split('/');
                            return new Date(`${year}-${month}-${day}`).getTime() || 0;
                        }
                        return new Date(d).getTime() || 0;
                    };
                    return (parseDate(valA) - parseDate(valB)) * factor;
                }

                if (column?.type === 'number') {
                    const numA = parseFloat(String(valA).replace('.', '').replace(',', '.')) || 0;
                    const numB = parseFloat(String(valB).replace('.', '').replace(',', '.')) || 0;
                    return (numA - numB) * factor;
                }

                return String(valA).localeCompare(String(valB)) * factor;
            });
        }

        // 3. Paginação 10/10
        this.filteredData = [...this.currentData];
        this.totalPages = Math.ceil(this.filteredData.length / this.rowsPerPage);
        
        // Ajusta página atual se estiver fora do range
        if (this.currentPage > this.totalPages) this.currentPage = Math.max(1, this.totalPages);
        
        const start = (this.currentPage - 1) * this.rowsPerPage;
        this.currentData = this.filteredData.slice(start, start + this.rowsPerPage);

        this.renderCallback(this.currentData);
        this.updateHeaderUI();
        this.updatePaginationUI();
    }

    setPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.apply();
    }

    updatePaginationUI() {
        if (!this.paginationContainerId) return;
        const container = document.getElementById(this.paginationContainerId);
        if (!container) return;

        if (this.totalPages <= 1) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        let html = `
            <div class="pagination">
                <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="getManagerForKeyPagination('${this.paginationContainerId}').setPage(${this.currentPage - 1})">
                    <i class="ph ph-caret-left"></i>
                </button>
        `;

        // Lógica de páginas (simplificada 10/10)
        for (let i = 1; i <= this.totalPages; i++) {
            if (i === 1 || i === this.totalPages || (i >= this.currentPage - 1 && i <= this.currentPage + 1)) {
                html += `
                    <button class="pagination-page ${i === this.currentPage ? 'active' : ''}" onclick="getManagerForKeyPagination('${this.paginationContainerId}').setPage(${i})">
                        ${i}
                    </button>
                `;
            } else if (i === this.currentPage - 2 || i === this.currentPage + 2) {
                html += `<span class="pagination-dots">...</span>`;
            }
        }

        html += `
                <button class="pagination-btn" ${this.currentPage === this.totalPages ? 'disabled' : ''} onclick="getManagerForKeyPagination('${this.paginationContainerId}').setPage(${this.currentPage + 1})">
                    <i class="ph ph-caret-right"></i>
                </button>
            </div>
            <div class="pagination-info">
                Página ${this.currentPage} de ${this.totalPages} (${this.filteredData.length} registros)
            </div>
        `;
        container.innerHTML = html;
    }

    updateHeaderUI() {
        if (!this.containerId) return;
        const container = document.getElementById(this.containerId);
        if (!container) return;

        this.columns.forEach(col => {
            const th = container.querySelector(`th[data-key="${col.key}"]`);
            if (!th) return;

            th.classList.toggle('sort-asc', this.sort.key === col.key && this.sort.direction === 'asc');
            th.classList.toggle('sort-desc', this.sort.key === col.key && this.sort.direction === 'desc');
            
            const btn = th.querySelector('.btn-filter-column');
            if (btn) btn.classList.toggle('active', !!this.filters[col.key]);
        });
    }

    getUniqueValues(key) {
        return [...new Set(this.originalData.map(item => item[key]))].sort();
    }
}

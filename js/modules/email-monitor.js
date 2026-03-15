import { TableManager } from '../core/table-manager.js';

const emailMonitor = (() => {
    let _tm = null;
    let _initialized = false;
    let _data = [];
    
    // Store toolbar filters separately from TM2 internal filters
    let _filters = { search: '', status: '', template: '', dateFrom: '', dateTo: '' };

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _statusBadge(status) {
        const map = {
            sent:    '<span style="background:rgba(16,185,129,0.15);color:#10b981;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">✅ Enviado</span>',
            failed:  '<span style="background:rgba(239,68,68,0.15);color:#ef4444;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">❌ Falha</span>',
            blocked: '<span style="background:rgba(245,158,11,0.15);color:#f59e0b;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">⛔ Bloqueado</span>',
            pending: '<span style="background:rgba(99,102,241,0.15);color:#818cf8;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">⏳ Pendente</span>',
        };
        return map[status] || `<span style="color:var(--text-muted);">${status || '—'}</span>`;
    }

    function _fmt(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
        } catch { return iso; }
    }

    function _esc(s) {
        if (!s) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ── Callbacks TableManager ────────────────────────────────────────────────

    function _renderRows(data) {
        const tbody = document.getElementById('email-mon-tbody');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">Nenhum e-mail encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(row => `
            <tr>
                <td style="font-size:0.78rem;white-space:nowrap;">${row.sent_at_formatted}</td>
                <td style="font-size:0.82rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(row.recipient)}">${_esc(row.recipient)}</td>
                <td style="font-size:0.82rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(row.subject)}">${_esc(row.subject)}</td>
                <td style="font-size:0.75rem;color:var(--text-muted);">${_esc(row.template) || '—'}</td>
                <td style="text-align:center;">${_statusBadge(row.status)}</td>
                <td style="font-size:0.75rem;color:var(--text-muted);">${_esc(row.tag) || '—'}</td>
                <td style="font-size:0.7rem;color:var(--text-muted);font-family:monospace;overflow:hidden;text-overflow:ellipsis;max-width:150px;" title="${_esc(row.resend_id)}">${_esc(row.resend_id) || '—'}</td>
                <td style="font-size:0.75rem;color:#f87171;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(row.error_message)}">${_esc(row.error_message) || '—'}</td>
            </tr>
        `).join('');
    }

    function _renderPagination(state) {
        const container = document.getElementById('pagination-email-mon');
        if (!container) return;

        if (state.totalPages <= 1) {
            container.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">${state.totalRecords} registro(s)</span>`;
        } else {
            let btns = '';
            for (let p = 1; p <= state.totalPages; p++) {
                btns += `<button class="pagination-btn${p === state.currentPage ? ' active' : ''}" onclick="window._emlTM.goToPage(${p})">${p}</button>`;
            }
            container.innerHTML = `
                <span style="font-size:0.8rem;color:var(--text-muted);">${state.totalRecords} registro(s)</span>
                <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">${btns}</div>
            `;
        }
    }

    function _renderActiveFilters(activeFilters, search) {
        const bar = document.getElementById('eml-active-chips');
        if (!bar) return;

        const chips = [];

        // 1. Filtros Globais (API Toolbar)
        if (_filters.search) {
            chips.push(`
                <span class="filter-chip">
                    <i class="ph ph-magnifying-glass"></i> "${_esc(_filters.search)}"
                    <button class="chip-remove" data-remove-global="search" title="Remover busca">
                        <i class="ph ph-x"></i>
                    </button>
                </span>`);
        }
        
        if (_filters.status) {
            chips.push(`
                <span class="filter-chip">
                    Status: <strong>${_esc(_filters.status)}</strong>
                    <button class="chip-remove" data-remove-global="status" title="Remover filtro">
                        <i class="ph ph-x"></i>
                    </button>
                </span>`);
        }

        if (_filters.template) {
            chips.push(`
                <span class="filter-chip">
                    Template: <strong>${_esc(_filters.template)}</strong>
                    <button class="chip-remove" data-remove-global="template" title="Remover filtro">
                        <i class="ph ph-x"></i>
                    </button>
                </span>`);
        }

        if (_filters.dateFrom || _filters.dateTo) {
            const fd = _filters.dateFrom ? _filters.dateFrom.split('-').reverse().join('/') : '...';
            const td = _filters.dateTo   ? _filters.dateTo.split('-').reverse().join('/')   : '...';
            chips.push(`
                <span class="filter-chip">
                    Data: <strong>${fd} - ${td}</strong>
                    <button class="chip-remove" data-remove-global="date" title="Remover filtro">
                        <i class="ph ph-x"></i>
                    </button>
                </span>`);
        }

        // 2. Filtros Internos (TableManager JS)
        if (search) {
            chips.push(`
                <span class="filter-chip">
                    <i class="ph ph-magnifying-glass"></i> "${_esc(search)}"
                    <button class="chip-remove" data-remove-tm-search="1" title="Remover busca">
                        <i class="ph ph-x"></i>
                    </button>
                </span>`);
        }

        (activeFilters || []).forEach(f => {
            chips.push(`
                <span class="filter-chip">
                    ${_esc(f.label)}: <strong>${_esc(f.value)}</strong>
                    <button class="chip-remove" data-remove-tm-filter="${_esc(f.key)}" title="Remover filtro">
                        <i class="ph ph-x"></i>
                    </button>
                </span>`);
        });

        // 3. Renderiza a barra
        if (chips.length > 0) {
            chips.push(`
                <button class="filter-chip-clear-all" onclick="emailMonitor.clearFilters()">
                    <i class="ph ph-x-circle"></i> Limpar tudo
                </button>`);
            bar.innerHTML = chips.join('');
            bar.style.display = 'flex';
        } else {
            bar.innerHTML = '';
            bar.style.display = 'none';
        }

        // 4. Delegação de Eventos (Event Listeners)
        bar.querySelectorAll('[data-remove-global]').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.removeGlobal;
                if (type === 'search') {
                    const el = document.getElementById('email-mon-search');
                    if(el) el.value = '';
                    setSearch('');
                } else if (type === 'status') {
                    const el = document.getElementById('email-mon-status');
                    if(el && el._customSelectInstance) el._customSelectInstance.setValue('');
                    else if(el) el.value = '';
                    setStatus('');
                } else if (type === 'template') {
                    const el = document.getElementById('email-mon-template');
                    if(el && el._customSelectInstance) el._customSelectInstance.setValue('');
                    else if(el) el.value = '';
                    setTemplate('');
                } else if (type === 'date') {
                    const dF = document.getElementById('email-mon-date-from');
                    const dT = document.getElementById('email-mon-date-to');
                    if(dF) dF.value = '';
                    if(dT) dT.value = '';
                    setDateFrom('');
                    setDateTo('');
                }
            });
        });

        bar.querySelectorAll('[data-remove-tm-search]').forEach(btn => {
            btn.addEventListener('click', () => { if (_tm) _tm.setSearch(''); });
        });

        bar.querySelectorAll('[data-remove-tm-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (_tm) _tm.setFilter(btn.dataset.removeTmFilter, null);
            });
        });
    }

    // ── API ───────────────────────────────────────────────────────────────────

    async function _fetchStats() {
        try {
            const params = new URLSearchParams();
            if (_filters.dateFrom) params.set('dateFrom', _filters.dateFrom);
            if (_filters.dateTo)   params.set('dateTo',   _filters.dateTo);
            const r = await fetch(`/api/email-logs/stats?${params}`);
            if (!r.ok) return;
            const s = await r.json();
            document.getElementById('eml-stat-total').textContent   = s.total   ?? '—';
            document.getElementById('eml-stat-sent').textContent    = s.sent    ?? '—';
            document.getElementById('eml-stat-failed').textContent  = s.failed  ?? '—';
            document.getElementById('eml-stat-blocked').textContent = s.blocked ?? '—';
            document.getElementById('eml-stat-pending').textContent = s.pending ?? '—';
        } catch (e) {
            console.warn('[emailMonitor] stats error:', e);
        }
    }

    async function _fetchLogs() {
        const tbody = document.getElementById('email-mon-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">Carregando...</td></tr>';

        try {
            const params = new URLSearchParams({ limit: 1000, sort: 'sent_at', order: 'desc' });
            if (_filters.search)   params.set('search',   _filters.search);
            if (_filters.status)   params.set('status',   _filters.status);
            if (_filters.template) params.set('template', _filters.template);
            if (_filters.dateFrom) params.set('dateFrom', _filters.dateFrom);
            if (_filters.dateTo)   params.set('dateTo',   _filters.dateTo);

            const r = await fetch(`/api/email-logs?${params}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const json = await r.json();
            
            _data = (json.data || []).map(row => ({
                ...row,
                sent_at_formatted: _fmt(row.sent_at)
            }));

            if (!_tm) {
                _tm = new TableManager({
                    data: _data,
                    columns: [
                        { key: 'sent_at_formatted', label: 'Data/Hora', type: 'string', searchable: true, filterable: true, sortable: true },
                        { key: 'recipient', label: 'Destinatário', type: 'string', searchable: true, filterable: true, sortable: true },
                        { key: 'subject', label: 'Assunto', type: 'string', searchable: true, filterable: true, sortable: true },
                        { key: 'template', label: 'Template', type: 'string', filterable: true, sortable: true },
                        { key: 'status', label: 'Status', type: 'string', filterType: 'select', filterable: true, sortable: true },
                        { key: 'tag', label: 'Tag', type: 'string', filterable: true, sortable: true },
                        { key: 'resend_id', label: 'Resend ID', type: 'string', searchable: true, filterable: true, sortable: true },
                        { key: 'error_message', label: 'Erro', type: 'string', searchable: true, filterable: true, sortable: true }
                    ],
                    pageSize: 50,
                    tableId: 'email-mon-table',
                    renderRows: _renderRows,
                    renderPagination: _renderPagination,
                    renderFilters: _renderActiveFilters
                });
                window._emlTM = _tm;
            } else {
                _tm.setData(_data);
            }
        } catch (e) {
            console.error('[emailMonitor] fetch error:', e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444;">Erro ao carregar: ${e.message}</td></tr>`;
        }
    }

    // ── Pública ───────────────────────────────────────────────────────────────

    function init() {
        if (_initialized) { refresh(); return; }
        _initialized = true;
        refresh();
    }

    function refresh() {
        _fetchStats();
        _fetchLogs();
    }

    let _debounce = null;
    function setSearch(val) {
        _filters.search = val;
        clearTimeout(_debounce);
        _debounce = setTimeout(() => { refresh(); }, 350);
    }

    function setStatus(val)   { _filters.status = val; refresh(); }
    function setTemplate(val) { 
        _filters.template = val; 
        clearTimeout(_debounce);
        _debounce = setTimeout(() => { refresh(); }, 350); 
    }
    function setDateFrom(val) { _filters.dateFrom = val; refresh(); }
    function setDateTo(val)   { _filters.dateTo = val; refresh(); }

    function clearFilters() {
        _filters = { search: '', status: '', template: '', dateFrom: '', dateTo: '' };
        ['email-mon-search','email-mon-status','email-mon-template','email-mon-date-from','email-mon-date-to']
            .forEach(id => { 
                const el = document.getElementById(id); 
                if (el) {
                    if (el._customSelectInstance) el._customSelectInstance.setValue('');
                    else el.value = '';
                }
            });
        if (_tm) _tm.clearFilters();
        
        // Dispara UI resets
        document.querySelectorAll('#email-mon-table .btn-filter-column').forEach(btn => btn.classList.remove('active'));
        refresh();
    }

    function handleSort(key) {
        if (_tm) {
            // Usa proxy para a TableManager 2.0 API
            if (typeof _tm.setSortExplicit === 'function') {
                const dir = _tm.sort.key === key && _tm.sort.direction === 'asc' ? 'desc' : 'asc';
                _tm.setSortExplicit(key, dir);
            } else {
                _tm.setSort(key);
            }
        }
    }

    return { init, refresh, setSearch, setStatus, setTemplate, setDateFrom, setDateTo, clearFilters, handleSort };
})();

window.emailMonitor = emailMonitor;


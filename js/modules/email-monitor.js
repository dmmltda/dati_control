/**
 * ============================================================================
 * emailMonitor — Monitor de E-mails
 * ============================================================================
 * Exibe todos os e-mails disparados pelo sistema com status, filtros e paginação.
 * Disponível apenas para usuários master.
 * ============================================================================
 */

const emailMonitor = (() => {
    let _filters = {
        search: '',
        status: '',
        template: '',
        dateFrom: '',
        dateTo: '',
    };
    let _page = 1;
    let _debounceTimer = null;
    let _initialized = false;

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
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">Carregando...</td></tr>';

        try {
            const params = new URLSearchParams({
                page:  _page,
                limit: 50,
                sort:  'sent_at',
                order: 'desc',
            });
            if (_filters.search)   params.set('search',   _filters.search);
            if (_filters.status)   params.set('status',   _filters.status);
            if (_filters.template) params.set('template', _filters.template);
            if (_filters.dateFrom) params.set('dateFrom', _filters.dateFrom);
            if (_filters.dateTo)   params.set('dateTo',   _filters.dateTo);

            const r = await fetch(`/api/email-logs?${params}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const { data, total, pages } = await r.json();

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">Nenhum e-mail encontrado.</td></tr>';
                document.getElementById('pagination-email-mon').innerHTML = '';
                return;
            }

            tbody.innerHTML = data.map(row => `
                <tr>
                    <td style="font-size:0.78rem;white-space:nowrap;">${_fmt(row.sent_at)}</td>
                    <td style="font-size:0.82rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(row.recipient)}">${_esc(row.recipient)}</td>
                    <td style="font-size:0.82rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(row.subject)}">${_esc(row.subject)}</td>
                    <td style="font-size:0.75rem;color:var(--text-muted);">${_esc(row.template) || '—'}</td>
                    <td style="text-align:center;">${_statusBadge(row.status)}</td>
                    <td style="font-size:0.75rem;color:var(--text-muted);">${_esc(row.tag) || '—'}</td>
                    <td style="font-size:0.7rem;color:var(--text-muted);font-family:monospace;overflow:hidden;text-overflow:ellipsis;max-width:150px;" title="${_esc(row.resend_id)}">${_esc(row.resend_id) || '—'}</td>
                    <td style="font-size:0.75rem;color:#f87171;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(row.error_message)}">${_esc(row.error_message) || '—'}</td>
                </tr>
            `).join('');

            // Paginação
            const pgEl = document.getElementById('pagination-email-mon');
            if (pages <= 1) {
                pgEl.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">${total} registro(s)</span>`;
            } else {
                let btns = '';
                for (let p = 1; p <= pages; p++) {
                    btns += `<button class="pagination-btn${p === _page ? ' active' : ''}" onclick="emailMonitor._goPage(${p})">${p}</button>`;
                }
                pgEl.innerHTML = `
                    <span style="font-size:0.8rem;color:var(--text-muted);">${total} registro(s)</span>
                    <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">${btns}</div>
                `;
            }
        } catch (e) {
            console.error('[emailMonitor] fetch error:', e);
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444;">Erro ao carregar: ${e.message}</td></tr>`;
        }
    }

    // ── Pública ───────────────────────────────────────────────────────────────

    function init() {
        if (_initialized) { refresh(); return; }
        _initialized = true;
        refresh();
    }

    function refresh() {
        _page = 1;
        _fetchStats();
        _fetchLogs();
    }

    function setSearch(val) {
        _filters.search = val;
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => { _page = 1; _fetchLogs(); }, 350);
    }

    function setStatus(val)   { _filters.status = val;   _page = 1; _fetchLogs(); }
    function setTemplate(val) { _filters.template = val; _page = 1; _fetchLogs(); }
    function setDateFrom(val) { _filters.dateFrom = val; _page = 1; _fetchStats(); _fetchLogs(); }
    function setDateTo(val)   { _filters.dateTo   = val; _page = 1; _fetchStats(); _fetchLogs(); }

    function clearFilters() {
        _filters = { search:'', status:'', template:'', dateFrom:'', dateTo:'' };
        ['email-mon-search','email-mon-status','email-mon-template','email-mon-date-from','email-mon-date-to']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        refresh();
    }

    function _goPage(p) { _page = p; _fetchLogs(); }

    return { init, refresh, setSearch, setStatus, setTemplate, setDateFrom, setDateTo, clearFilters, _goPage };
})();

window.emailMonitor = emailMonitor;

import { TableManager } from '../core/table-manager.js';
import { bindTooltip, initTooltipSystem } from '../../src/components/dashboard/Tooltip.js';

const emailMonitor = (() => {
    let _tm = null;
    let _initialized = false;
    let _data = [];
    
    // Store toolbar filters separately from TM2 internal filters
    let _filters = { search: '', status: '', template: '', dateFrom: '', dateTo: '' };

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _statusBadge(status) {
        if (!status) return '<span style="color:var(--text-muted);">—</span>';
        
        const map = {
            sent: { 
                label: 'ENVIADO', 
                icon: 'ph-check', 
                bg: 'rgba(16,185,129,0.1)', 
                color: '#10b981', 
                border: 'rgba(16,185,129,0.2)' 
            },
            received: { 
                label: 'RECEBIDO', 
                icon: 'ph-arrow-u-up-left', 
                bg: 'rgba(59,130,246,0.1)', 
                color: '#3b82f6', 
                border: 'rgba(59,130,246,0.2)' 
            },
            failed: { 
                label: 'FALHA', 
                icon: 'ph-x', 
                bg: 'rgba(239,68,68,0.1)', 
                color: '#ef4444', 
                border: 'rgba(239,68,68,0.2)' 
            },
            blocked: { 
                label: 'BLOQUEADO', 
                icon: 'ph-prohibit', 
                bg: 'rgba(245,158,11,0.1)', 
                color: '#f59e0b', 
                border: 'rgba(245,158,11,0.2)' 
            },
            pending: { 
                label: 'PENDENTE', 
                icon: 'ph-clock', 
                bg: 'rgba(99,102,241,0.1)', 
                color: '#818cf8', 
                border: 'rgba(99,102,241,0.2)' 
            }
        };

        const config = map[status];
        if (!config) {
            return `<span style="color:var(--text-muted); font-size:0.75rem;">${status}</span>`;
        }

        return `
            <div style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:10px; font-size:9.5px; font-weight:900; background:${config.bg}; color:${config.color}; border:1px solid ${config.border}; letter-spacing:0.3px;">
                <i class="ph ${config.icon}" style="font-size:11px;"></i>
                ${config.label}
            </div>
        `;
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
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted);">Nenhum e-mail encontrado.</td></tr>';
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
                <td style="text-align:center;">
                    <button class="btn-icon" title="Ver E-mail" onclick="window.emailMonitor.showDetails('${row.id}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;">
                        <i class="ph ph-eye"></i>
                    </button>
                </td>
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
                        { key: 'error_message', label: 'Erro', type: 'string', searchable: true, filterable: true, sortable: true },
                        { key: 'actions', label: 'Ações', type: 'string', sortable: false, filterable: false }
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

    async function showDetails(id) {
        const modal = document.createElement('div');
        modal.id = 'email-details-modal';
        modal.className = 'email-monitor-modal';
        modal.style = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(2,6,23,0.95); backdrop-filter:blur(12px); z-index:9999; display:flex; align-items:center; justify-content:center;`;
        
        modal.innerHTML = `
            <div style="width:96%; max-width:1100px; height:94%; background:#0b1120; border-radius:24px; border:1px solid rgba(255,255,255,0.08); display:flex; flex-direction:column; box-shadow:0 10px 100px rgba(0,0,0,0.8); overflow:hidden;">
                <!-- Header -->
                <div style="padding:1.4rem 2rem; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center; background:#0f172a;">
                    <div style="display:flex; align-items:center; gap:1.2rem;">
                         <div style="width:40px; height:40px; border-radius:12px; background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.2); display:flex; align-items:center; justify-content:center; color:#818cf8;">
                            <i class="ph ph-envelope-simple" style="font-size:1.4rem;"></i>
                        </div>
                        <div>
                            <div style="font-size:10px; color:#64748b; font-weight:800; text-transform:uppercase; letter-spacing:1.5px;">HISTÓRICO DE INTERAÇÃO</div>
                            <h3 style="margin: 0; font-size: 1.4rem; color: #ffffff; font-weight:900; letter-spacing:-0.01em;">
                                Cadeia de E-mails (Thread)
                            </h3>
                        </div>
                    </div>
                    <button onclick="document.getElementById('email-details-modal').remove()" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; width: 38px; height: 38px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                        <i class="ph ph-x" style="font-size:1.2rem;"></i>
                    </button>
                </div>

                <div id="email-details-body" style="padding:0; overflow-y:auto; flex:1; background:#020617; display:flex; flex-direction:column;">
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const bodyEl = document.getElementById('email-details-body');
        bodyEl.innerHTML = `<div style="text-align:center; color:#64748b; padding:5rem;"><i class="ph ph-spinner ph-spin" style="font-size:2.5rem; color:#6366f1; margin-bottom:1.5rem;"></i><br><span style="font-weight:600; font-size:1.1rem; color:#94a3b8;">Sincronizando métricas e histórico...</span></div>`;

        try {
            const r = await fetch(`/api/email-logs/${id}/thread`);
            if (!r.ok) throw new Error('Falha ao buscar linha do tempo');
            const { data } = await r.json();

            if (!data || data.length === 0) {
                bodyEl.innerHTML = `<div style="text-align:center; padding:5rem; color:#64748b;">Nenhum e-mail encontrado na thread.</div>`;
                return;
            }

            // ── Métricas e Critérios ──
            const SENTIMENTS = {
                very_positive: { label: 'Muito Positivo', color: '#1a9e6e', icon: 'ph-heart-straight' },
                positive:      { label: 'Positivo',      color: '#34d399', icon: 'ph-chat-circle-dots' },
                neutral:       { label: 'Neutro',        color: '#d4911a', icon: 'ph-minus-circle' },
                negative:      { label: 'Negativo',      color: '#f97316', icon: 'ph-warning-circle' },
                very_negative: { label: 'Muito Negativo', color: '#e05454', icon: 'ph-seal-warning' }
            };

            const formatDur = (ms) => {
                if (!ms || ms < 0) return '---';
                const mins = Math.floor(ms / 60000);
                if (mins < 1) return '< 1 min';
                if (mins < 60) return `${mins} min`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) return `${hrs}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`;
                return `${Math.floor(hrs / 24)} dias`;
            };

            // Cálculos Avançados
            let gabiTimes = [], teamTimes = [], clientTimes = [];
            let counts = { pos: 0, neu: 0, neg: 0 };
            let totalPoints = 0;

            data.forEach((row, i) => {
                const s = row.gabi_analysis?.sentiment?.level || 'neutral';
                if (s.includes('positive')) { counts.pos++; totalPoints += (s==='very_positive'?100:75); }
                else if (s === 'neutral') { counts.neu++; totalPoints += 50; }
                else { counts.neg++; totalPoints += (s==='very_negative'?0:25); }

                if (i > 0) {
                    const diff = new Date(row.sent_at) - new Date(data[i-1].sent_at);
                    if (row.direction === 'outbound') {
                        if (row.gabi_analysis?.processed_by_ai) gabiTimes.push(diff);
                        else teamTimes.push(diff);
                    } else {
                        clientTimes.push(diff);
                    }
                }
            });

            const avgP = totalPoints / data.length;
            const avgS = avgP >= 80 ? 'very_positive' : (avgP >= 60 ? 'positive' : (avgP >= 35 ? 'neutral' : (avgP >= 15 ? 'negative' : 'very_negative')));
            const sDataG = SENTIMENTS[avgS];

            const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
            const resTimes = [
                { label: 'GABI', color: '#10b981', val: avg(gabiTimes), limit: 120000 },
                { label: 'Usuário', color: '#6366f1', val: avg(teamTimes), limit: 7200000 },
                { label: 'Cliente', color: '#f59e0b', val: avg(clientTimes), limit: 86400000 }
            ];

            // ── Renderização das Métricas (Top Cards) ──
            let html = `
                <div style="padding:2.5rem; background:linear-gradient(180deg, #0f172a 0%, #020617 100%); border-bottom:1px solid rgba(255,255,255,0.06); display:grid; grid-template-columns:1fr 1fr; gap:2rem;">
                    <!-- Sentimento Médio -->
                    <div id="eml-summary-sentiment" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:20px; padding:2rem; display:flex; flex-direction:column; gap:1.2rem; cursor:help;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-size:10px; color:#475569; font-weight:800; text-transform:uppercase; letter-spacing:1px;">SENTIMENTO MÉDIO</div>
                            <i class="ph ph-thermometer" style="color:${sDataG.color}; font-size:1.4rem;"></i>
                        </div>
                        <div style="font-size:2.4rem; font-weight:950; color:#fff; letter-spacing:-0.03em;">${sDataG.label}</div>
                        <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px; position:relative;">
                            <div style="position:absolute; left:0; top:0; height:100%; width:${avgP}%; background:${sDataG.color}; border-radius:3px; box-shadow:0 0 15px ${sDataG.color}44;"></div>
                        </div>
                        <div style="display:flex; gap:1.2rem; font-size:11px; font-weight:800;">
                            <span style="color:#10b981; display:flex; align-items:center; gap:5px;"><i class="ph-fill ph-circle"></i> Pos ×${counts.pos}</span>
                            <span style="color:#f59e0b; display:flex; align-items:center; gap:5px;"><i class="ph-fill ph-circle"></i> Neu ×${counts.neu}</span>
                            <span style="color:#ef4444; display:flex; align-items:center; gap:5px;"><i class="ph-fill ph-circle"></i> Neg ×${counts.neg}</span>
                        </div>
                    </div>

                    <!-- Tempo de Resposta -->
                    <div id="eml-summary-team" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:20px; padding:2rem; display:flex; flex-direction:column; gap:1rem; cursor:help;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <div style="font-size:10px; color:#475569; font-weight:800; text-transform:uppercase; letter-spacing:1px;">TEMPO DE RESPOSTA</div>
                            <i class="ph ph-timer" style="color:#818cf8; font-size:1.4rem;"></i>
                        </div>
                        <div style="display:grid; gap:0.8rem;">
                            ${resTimes.map(t => `
                                <div style="display:grid; grid-template-columns: 80px 1fr 65px; align-items:center; gap:1rem;">
                                    <div style="font-size:11px; font-weight:800; color:#94a3b8; display:flex; align-items:center; gap:6px;">
                                        <div style="width:7px; height:7px; border-radius:50%; background:${t.color};"></div> ${t.label}
                                    </div>
                                    <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:2px; position:relative;">
                                        ${t.val !== null ? `<div style="position:absolute; left:0; top:0; height:100%; width:${Math.min(100, (t.val/t.limit)*100)}%; background:${t.color}; border-radius:3px;"></div>` : ''}
                                    </div>
                                    <div style="font-size:11px; font-weight:900; color:#ffffff; text-align:right;">${t.val !== null ? (t.val < 60000 ? '<1 min' : formatDur(t.val)) : '---'}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div style="font-size:9.5px; color:#475569; font-weight:700; margin-top:5px; border-top:1px solid rgba(255,255,255,0.03); padding-top:8px;">
                            Ref. email: GABI ≤2min · Equipe ≤2h · Cliente ≤24h
                        </div>
                    </div>
                </div>

                <div style="padding:2.5rem 4rem; background:#020617;">
                    <!-- Timeline -->
                    <div style="border-left: 2px solid rgba(255,255,255,0.06); position: relative; display:flex; flex-direction:column;">
            `;

            // ── Loop Principal da Timeline ──
            data.forEach((row, idx) => {
                const isInbound = row.direction === 'inbound';
                const isGabi = row.gabi_analysis?.processed_by_ai;
                const s = row.gabi_analysis?.sentiment?.level || 'neutral';
                const sData = SENTIMENTS[s];
                const senderColor = isInbound ? '#10b981' : (isGabi ? '#8b5cf6' : '#3b82f6');
                
                const prev = idx > 0 ? data[idx-1] : null;
                const tDiff = prev ? new Date(row.sent_at) - new Date(prev.sent_at) : 0;

                // Banner de Eficiência (Entre Cards)
                if (idx > 0 && row.direction === 'outbound') {
                    const isExc = tDiff < (isGabi ? 120000 : 7200000);
                    html += `
                        <div style="margin:0.5rem 0 1.5rem 2.8rem; display:flex; align-items:center; gap:0.6rem; background:${isExc?'rgba(16,185,129,0.08)':'rgba(245,158,11,0.08)'}; padding:6px 14px; border-radius:30px; border:1px solid ${isExc?'rgba(16,185,129,0.15)':'rgba(245,158,11,0.15)'}; width:fit-content;">
                            <span style="font-size:11px; font-weight:900; color:${isExc?'#10b981':'#f59e0b'}; text-transform:uppercase; letter-spacing:0.5px;">
                                » ${isGabi?'GABI':'EQUIPE'} respondeu em ${tDiff<60000?'<1 min':formatDur(tDiff)} — ${isExc?'excelente':'aceitável'}
                                <span style="opacity:0.6; font-weight:700;"> (limite: ${isGabi?'2 min':'2h'})</span>
                            </span>
                        </div>
                    `;
                }

                html += `
                    <div style="position:relative; margin-bottom:3rem; padding-left:3.5rem;">
                        <!-- Node Circle -->
                        <div style="position:absolute; left:-1.25rem; top:0; width:2.5rem; height:2.5rem; border-radius:10px; background:${senderColor}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:0.95rem; z-index:2; border:2px solid #020617; box-shadow:0 0 15px ${senderColor}44;">
                            #${idx+1}
                        </div>

                        <!-- Card de Mensagem -->
                        <div style="background:#0f172a; border:1px solid rgba(255,255,255,0.06); border-radius:20px; box-shadow:0 20px 40px rgba(0,0,0,0.3); overflow:hidden;">
                            
                            <!-- Header do Card -->
                            <div style="padding:1.4rem 2rem; border-bottom:1px solid rgba(255,255,255,0.04); display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.015);">
                                <div style="display:flex; align-items:center; gap:2rem;">
                                    <div style="font-size:12px; line-height:1.5;">
                                        <div style="color:#ffffff; font-weight:800;"><span style="color:#475569; text-transform:uppercase; font-size:9.5px;">DE:</span> ${row.direction==='outbound'?'Gabi (Journey)':_esc(row.recipient)}</div>
                                        <div style="color:#94a3b8; font-weight:600;"><span style="color:#475569; text-transform:uppercase; font-size:9.5px;">PARA:</span> ${row.direction==='inbound'?'Gabi (Journey)':_esc(row.recipient)}</div>
                                    </div>
                                    <div style="height:28px; width:1px; background:rgba(255,255,255,0.06);"></div>
                                    <div style="font-size:11.5px; color:#ffffff; font-weight:850; display:flex; align-items:center; gap:8px;">
                                        ${_fmtShort(row.sent_at)}
                                    </div>
                                </div>

                                <div style="display:flex; gap:0.6rem; align-items:center;">
                                    <div style="padding:5px 12px; border-radius:10px; font-size:10px; font-weight:900; background:${sData.color}15; color:${sData.color}; border:1px solid ${sData.color}25; display:flex; align-items:center; gap:6px;">
                                        <i class="ph-fill ${sData.icon}"></i> ${sData.label.toUpperCase()}
                                    </div>
                                    ${idx > 0 && row.direction === 'outbound' ? `
                                        <div style="padding:5px 12px; border-radius:10px; font-size:10px; font-weight:900; background:rgba(99,102,241,0.1); color:#818cf8; border:1px solid rgba(99,102,241,0.2); display:flex; align-items:center; gap:6px;">
                                            <i class="ph ph-timer"></i> ${tDiff<60000?'<1 min':formatDur(tDiff)}
                                        </div>
                                    ` : ''}
                                    ${isGabi ? `<span style="padding:5px 10px; border-radius:8px; background:rgba(139,92,246,0.15); color:#a78bfa; font-weight:900; font-size:10px; border:1px solid rgba(139,92,246,0.3);">IA</span>` : ''}
                                    <div style="padding:5px 12px; border-radius:10px; font-size:10px; font-weight:900; background:${isInbound?'rgba(59,130,246,0.1)':'rgba(16,185,129,0.1)'}; color:${isInbound?'#3b82f6':'#10b981'}; border:1px solid ${isInbound?'rgba(59,130,246,0.2)':'rgba(16,185,129,0.2)'}; display:flex; align-items:center; gap:6px;">
                                        <i class="ph ${isInbound ? 'ph-arrow-u-up-left' : 'ph-check'}"></i> ${isInbound ? 'RECEBIDO' : 'ENVIADO'}
                                    </div>
                                </div>
                            </div>

                            <div style="padding:2rem; background:#020617;">
                                <div style="font-size:10px; color:#475569; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:1rem; display:flex; align-items:center; gap:6px;">
                                    <i class="ph ph-text-align-left"></i> MENSAGEM ORIGINAL
                                </div>
                                <h4 style="margin:0 0 1.5rem; color:#ffffff; font-size:1.4rem; font-weight:900; letter-spacing:-0.02em;">${_esc(row.subject)}</h4>

                                ${row.content ? `
                                    <div style="background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); box-shadow:0 10px 40px rgba(0,0,0,0.4);">
                                        <div style="background:#f8fafc; padding:0.6rem 1.4rem; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                                            <span style="font-size:10px; color:#64748b; font-weight:800; text-transform:uppercase;">Visualização do E-mail</span>
                                            <i class="ph ph-monitor" style="color:#cbd5e1;"></i>
                                        </div>
                                        <div style="padding:1.5rem; overflow-x:auto;">
                                            ${(/<body|<html/i.test(row.content)) 
                                                ? `<iframe srcdoc="${_esc(row.content).replace(/"/g, '&quot;')}" style="width:100%; height:450px; border:none;"></iframe>`
                                                : `<div style="color:#1e293b; font-size:1rem; line-height:1.7; white-space:pre-wrap;">${_esc(row.content)}</div>`
                                            }
                                        </div>
                                    </div>
                                ` : `<div style="padding:4rem; text-align:center; color:#475569; font-style:italic; border:1px dashed rgba(255,255,255,0.1); border-radius:14px;">Conteúdo indisponível.</div>`}

                                ${isGabi ? `
                                    <div style="margin-top:2rem; background:rgba(99,102,241,0.04); border:1px solid rgba(99,102,241,0.15); border-radius:18px; padding:1.8rem;">
                                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.8rem;">
                                            <div style="display:flex; align-items:center; gap:0.6rem; color:#818cf8; font-size:11.5px; font-weight:900; text-transform:uppercase; letter-spacing:1px;">
                                                <i class="ph ph-brain" style="font-size:1.5rem;"></i> GABI: TRIAGEM & RACIOCÍNIO (INTERNO)
                                            </div>
                                            <div style="padding:4px 12px; background:rgba(99,102,241,0.1); border-radius:8px; font-size:9.5px; color:#818cf8; font-weight:800;">IA MODEL: GEMINI v1</div>
                                        </div>
                                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:2.5rem; margin-bottom:1.8rem;">
                                            <div>
                                                <div style="font-size:10px; color:#475569; font-weight:800; text-transform:uppercase; margin-bottom:0.6rem;">INTENÇÃO DETECTADA</div>
                                                <div style="color:#ffffff; font-weight:900; font-size:1.15rem;">${_esc(row.gabi_analysis.intent)}</div>
                                            </div>
                                            <div>
                                                <div style="font-size:10px; color:#475569; font-weight:800; text-transform:uppercase; margin-bottom:0.6rem;">AÇÃO EXECUTADA</div>
                                                <div style="color:#34d399; font-weight:900; font-size:1.15rem; display:flex; align-items:center; gap:0.6rem;">
                                                    <i class="ph ph-check-circle"></i> Resposta Enviada
                                                    <span style="font-size:9px; background:rgba(52,211,153,0.1); padding:2px 7px; border-radius:5px; border:1px solid rgba(52,211,153,0.25); color:#34d399;">ENVIADO</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style="margin-bottom:1.8rem;">
                                            <div style="font-size:10px; color:#475569; font-weight:800; text-transform:uppercase; margin-bottom:0.6rem;">PROCESSO DE PENSAMENTO DA IA:</div>
                                            <div style="color:#cbd5e1; font-size:0.95rem; line-height:1.7;">${_esc(row.gabi_analysis.summary || 'A IA processou o e-mail de forma objetiva.')}</div>
                                        </div>
                                         ${(() => {
                                            const next = data[idx + 1];
                                            const hasNext = next && next.direction === 'outbound';
                                            const responseContent = hasNext ? next.content : (row.gabi_analysis.response_content || row.gabi_analysis.suggested_reply || null);
                                            const nextNum = idx + 2;
                                            return `
                                                <div style="background:rgba(99,102,241,0.06); border-radius:14px; border:1px solid rgba(99,102,241,0.2); padding:1.2rem;">
                                                    <div style="font-size:10px; color:#818cf8; font-weight:800; text-transform:uppercase; margin-bottom:0.0rem; display:flex; justify-content:space-between; align-items:center;">
                                                        <span style="display:flex; align-items:center; gap:5px;"><i class="ph ph-paper-plane-tilt"></i> E-MAIL ENVIADO PELA GABI</span>
                                                        ${hasNext ? `<span style="background:#6366f1; color:#fff; padding:2px 8px; border-radius:6px; font-size:9px; font-weight:900;">E-MAIL #${nextNum}</span>` : ''}
                                                    </div>
                                                    <div style="color:#ffffff; font-size:0.92rem; line-height:1.7; white-space:pre-wrap; max-height:180px; overflow-y:auto; margin-top:0.8rem;">
                                                        ${responseContent ? _esc(responseContent.substring(0, 600)) + (responseContent.length > 600 ? '...' : '') : '<span style="color:#475569; font-style:italic;">Ver card seguinte.</span>'}
                                                    </div>
                                                    <div style="margin-top:0.8rem; border-top:1px solid rgba(99,102,241,0.1); padding-top:0.7rem; display:flex; justify-content:space-between; align-items:center;">
                                                        <span style="font-size:9px; color:#6366f1; font-weight:800; display:flex; align-items:center; gap:4px;">
                                                            <i class="ph ph-arrow-down-bold"></i> ESTA ANÁLISE GEROU O E-MAIL #${nextNum} ABAIXO
                                                        </span>
                                                        <span style="font-size:9px; color:#475569; font-weight:700; display:flex; align-items:center; gap:4px;">
                                                            <i class="ph ph-check-double"></i> SMTP JOURNEY
                                                        </span>
                                                    </div>
                                                </div>
                                            `;
                                         })()}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div> <!-- End of Timeline -->
                </div> <!-- End of Content Container -->
            `;

            bodyEl.innerHTML = html;

            // ── Tooltips ──
            initTooltipSystem();
            bindTooltip(document.getElementById('eml-summary-sentiment'), {
                titulo: 'Tom de Comunicação',
                desc: 'Média de todas as interações. Ajuda a identificar o humor dos clientes ao longo da thread.',
                video: true, type: 'status'
            });
            bindTooltip(document.getElementById('eml-summary-team'), {
                titulo: 'Métricas de Agilidade',
                desc: 'Monitoramento de SLA por tipo de agente. GABI responde instantaneamente para filtrar demandas.',
                video: true, type: 'proximoPasso'
            });

        } catch(e) {
            bodyEl.innerHTML = `<div style="color:#ef4444; padding:5rem; text-align:center;"><i class="ph ph-warning-circle" style="font-size:2.5rem; margin-bottom:1rem;"></i><br>Erro ao carregar thread: ${e.message}</div>`;
        }
    }


    function _fmtShort(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    }

    return { init, refresh, setSearch, setStatus, setTemplate, setDateFrom, setDateTo, clearFilters, handleSort, showDetails };
})();

window.emailMonitor = emailMonitor;

/**
 * navigateToEmail(emailLogId)
 * Navega para o Monitor de E-mails e abre direto a Thread/Cadeia do e-mail pelo ID do log.
 * Chamado pelo link na descrição do card de atividade da Gabi.
 */
window.navigateToEmail = function(emailLogId) {
    // 1. Fecha qualquer drawer/modal aberto antes de navegar
    document.getElementById('tb-drawer-overlay')?.remove();
    document.getElementById('email-details-modal')?.remove();

    // 2. Navega para o Monitor de E-mails clicando no nav-item correspondente
    const navItem = document.querySelector('[data-view="email-monitor"]');
    if (navItem) {
        navItem.click();
    }

    // 3. Após a view carregar os dados, abre a Thread do e-mail
    setTimeout(() => {
        if (window.emailMonitor?.showDetails) {
            window.emailMonitor.showDetails(emailLogId);
        }
    }, 600);
};

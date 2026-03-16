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
        // Remove modal antigo se existir para garantir que o novo design e o conteúdo sejam aplicados
        document.getElementById('email-details-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'email-details-modal';
        modal.style.cssText = 'display:flex; position:fixed; inset:0; z-index:99999; background:rgba(2, 6, 23, 0.85); backdrop-filter:blur(10px); align-items:center; justify-content:center; animation: fadeIn 0.3s ease;';
        modal.innerHTML = `
            <div style="background:#0f172a; width:850px; max-width:92%; border-radius:16px; display:flex; flex-direction:column; max-height:88vh; border: 1px solid rgba(99,102,241,0.3); box-shadow: 0 0 40px rgba(99,102,241,0.1), 0 25px 50px -12px rgba(0,0,0,0.8); overflow:hidden;">
                <div style="padding:1.25rem 1.75rem; border-bottom:1px solid rgba(255,255,255,0.08); background: linear-gradient(90deg, rgba(99,102,241,0.15) 0%, rgba(2,6,23,0) 100%); display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; flex-direction:column; gap:0.25rem;">
                        <span style="font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; color:var(--primary-color); font-weight:700;">Histórico de Interação</span>
                        <h3 style="margin:0; font-size:1.25rem; color:#f8fafc; display:flex; align-items:center; gap:0.75rem;">
                             <i class="ph ph-envelope-open" style="color:var(--primary-color); filter: drop-shadow(0 0 8px var(--primary-color));"></i> 
                             Cadeia de E-mails (Thread)
                        </h3>
                    </div>
                    <button onclick="document.getElementById('email-details-modal').remove()" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#94a3b8; cursor:pointer; font-size:1.25rem; width:36px; height:36px; display:flex; align-items:center; justify-content:center; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(239, 68, 68, 0.15)'; this.style.color='#ef4444';" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color='#94a3b8';">
                        <i class="ph ph-x"></i>
                    </button>
                </div>
                <div id="email-details-body" style="padding:2rem; overflow-y:auto; font-size:0.95rem; line-height:1.6; color:#cbd5e1; display:flex; flex-direction:column; background:#020617;">
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.style.display = 'flex';
        const bodyEl = document.getElementById('email-details-body');
        bodyEl.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:3rem;"><i class="ph ph-spinner ph-spin" style="font-size:2rem; margin-bottom:1rem;"></i><br>Buscando histórico de conversas...</div>`;

        try {
            const r = await fetch(`/api/email-logs/${id}/thread`);
            if (!r.ok) throw new Error('Falha ao buscar linha do tempo do e-mail');
            const { data } = await r.json();

            if (!data || data.length === 0) {
                bodyEl.innerHTML = `<em style="color:var(--text-muted)">Nenhum e-mail encontrado.</em>`;
                return;
            }

            let html = '';
            data.forEach((row, idx) => {
                const isLast = idx === data.length - 1;
                const isInbound = row.direction === 'inbound';
                const count = idx + 1;
                
                // Padrão de Cores e Ícones
                const color = isInbound ? '#3b82f6' : '#10b981'; // Azul Royal vs Verde Esmeralda
                const badgeLabel = isInbound ? 'Recebido' : 'Enviado';
                const badgeIcon = isInbound ? 'ph-arrow-arc-left' : 'ph-paper-plane-tilt';
                
                // Formata nomes
                const fromStr = isInbound ? row.recipient : 'Gabi (Journey)';
                const toStr = isInbound ? 'Gabi (Journey)' : row.recipient;

                const gabi = row.gabi_analysis || {};
                let analysisHtml = '';
                
                if (gabi && gabi.processed_by_ai) {
                    analysisHtml = `
                        <div style="background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.25); padding:1rem; border-radius:10px; margin-top:1.5rem; position:relative; overflow:hidden;">
                            <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:var(--primary-color);"></div>
                            <strong style="color:var(--primary-color); display:flex; align-items:center; gap:0.6rem; margin-bottom:0.75rem; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.5px;">
                                <i class="ph ph-sparkle" style="font-size:1.1rem;"></i> Inteligência Gabi
                            </strong>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:0.75rem;">
                                <div style="font-size:0.85rem;"><span style="color:#94a3b8;">Intenção:</span> <br><strong style="color:#f1f5f9;">${gabi.intent}</strong></div>
                                <div style="font-size:0.85rem;"><span style="color:#94a3b8;">Ação:</span> <br><strong style="color:#f1f5f9; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">${gabi.action_taken}</strong></div>
                            </div>
                            <div style="font-size:0.85rem; color:#cbd5e1; line-height:1.5; padding:0.75rem; background:rgba(0,0,0,0.2); border-radius:8px;">
                                <span style="color:#94a3b8; font-size:0.75rem; display:block; margin-bottom:0.4rem;">RESUMO DA ANÁLISE:</span>
                                ${gabi.summary}
                            </div>
                            ${gabi.generated_reply ? `
                                <div style="margin-top:1rem; border-top:1px dashed rgba(99,102,241,0.2); padding-top:1rem;">
                                    <span style="color:var(--primary-color); font-size:0.75rem; font-weight:700; display:block; margin-bottom:0.5rem;">RESPOSTA AUTOMÁTICA ENVIADA:</span>
                                    <div style="padding:0.75rem; background:rgba(99,102,241,0.05); border-radius:8px; font-style:italic; border-left:2px solid var(--primary-color); color:#e2e8f0; font-size:0.85rem;">
                                        "${_esc(gabi.generated_reply)}"
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }

                let contentHtml = '';
                if (row.content) {
                    const isHtml = row.direction === 'outbound' || /<body|<html/i.test(row.content);
                    if (isHtml) {
                        const safeSrcDoc = String(row.content)
                            .replace(/&/g, '&amp;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#39;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                        contentHtml = `
                            <div style="margin-top:1rem; border:1px solid rgba(255,255,255,0.1); border-radius:12px; overflow:hidden; background:#fff; box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                                <div style="background:#f8fafc; padding:0.5rem 1rem; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:0.7rem; color:#64748b; font-weight:600; text-transform:uppercase;">Visualização do E-mail Enviado</span>
                                    <i class="ph ph-monitor" style="color:#94a3b8;"></i>
                                </div>
                                <iframe srcdoc="${safeSrcDoc}" style="width:100%; height:420px; border:none; display:block;"></iframe>
                            </div>
                        `;
                    } else {
                        contentHtml = `
                            <div style="white-space:pre-wrap; background:rgba(255,255,255,0.03); padding:1.25rem; border-radius:10px; font-size:0.9rem; max-height:350px; overflow-y:auto; line-height:1.6; color:#e2e8f0; margin-top:1rem; border:1px solid rgba(255,255,255,0.08);">
                                ${_esc(row.content)}
                            </div>
                        `;
                    }
                } else {
                    contentHtml = `<div style="padding:2rem; text-align:center; background:rgba(255,255,255,0.02); border-radius:10px; margin-top:1rem; border:1px dashed rgba(255,255,255,0.1); color:#64748b; font-style:italic;">Conteúdo da mensagem não capturado no log histórico.</div>`;
                }

                html += `
                    <div style="position:relative; padding-left:3.5rem; padding-bottom:${isLast ? '0' : '3.5rem'};">
                        <!-- Timeline Lane -->
                        <div style="position:absolute; left:0.9rem; top:2.5rem; bottom:0; width:2px; background:linear-gradient(to bottom, ${color} 0%, rgba(255,255,255,0.05) 100%); display:${isLast ? 'none' : 'block'}; opacity:0.3;"></div>
                        
                        <!-- Timeline Node (#) -->
                        <div style="position:absolute; left:0; top:0; width:2rem; height:2rem; border-radius:8px; background:${color}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.8rem; box-shadow:0 0 15px ${color}44; z-index:2;">
                            #${count}
                        </div>

                        <!-- Badge Status -->
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            <div style="display:flex; align-items:center; gap:0.5rem; background:rgba(255,255,255,0.03); padding:0.4rem 0.8rem; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                                <div style="display:flex; flex-direction:column;">
                                    <span style="font-size:0.65rem; color:#64748b; text-transform:uppercase; font-weight:700;">De: <span style="color:#cbd5e1; text-transform:none; font-weight:400;">${_esc(fromStr)}</span></span>
                                    <span style="font-size:0.65rem; color:#64748b; text-transform:uppercase; font-weight:700;">Para: <span style="color:#cbd5e1; text-transform:none; font-weight:400;">${_esc(toStr)}</span></span>
                                </div>
                            </div>
                            
                            <div style="display:flex; align-items:center; gap:1rem;">
                                <div style="font-size:0.75rem; color:#64748b; display:flex; align-items:center; gap:0.3rem;"><i class="ph ph-calendar"></i> ${_fmt(row.sent_at)}</div>
                                <div style="background:${color}15; color:${color}; border:1px solid ${color}33; display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0.8rem; border-radius:8px; font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px;">
                                    <i class="ph ${badgeIcon}"></i> ${badgeLabel}
                                </div>
                            </div>
                        </div>

                        <!-- Card Content -->
                        <div style="background:#0f172a; border-radius:16px; border:1px solid rgba(255,255,255,0.06); padding:1.5rem; box-shadow:0 10px 25px rgba(0,0,0,0.3);">
                            <h4 style="margin:0 0 0.5rem 0; font-size:1.05rem; color:#f8fafc; font-weight:700;">${_esc(row.subject)}</h4>
                            ${contentHtml}
                            ${analysisHtml}
                        </div>
                    </div>
                `;
            });
            bodyEl.innerHTML = html;
        } catch(e) {
            bodyEl.innerHTML = `<div style="color:#ef4444; padding:1rem; text-align:center;">Erro ao carregar thread: ${e.message}</div>`;
        }
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

/**
 * settings-whatsapp.js — Módulo de Configurações → WhatsApp
 * 
 * Mirror da Gabi AI para controle de custos e credenciais do WhatsApp.
 */

import { getAuthToken } from './auth.js';
import { showToast }    from './utils.js';
import { TableManager } from '../core/table-manager.js';

// ── Estado interno ────────────────────────────────────────────────────────────
let _autoRefreshTimer = null;
let _lastData         = null;
let _buttonsWired     = false;
let _manager          = null; 
const REFRESH_INTERVAL = 60_000; // 60s

// ── Multi-email chips controller ─────────────────────────────────────────────
const waEmailChips = {
    _emails: [],

    init(csvEmails) {
        this._emails = (csvEmails || '')
            .split(',')
            .map(e => e.trim())
            .filter(e => e.length > 0);
        this._render();
    },

    getValue() {
        return this._emails.join(',');
    },

    add(email) {
        const e = email.trim().toLowerCase();
        if (!e) return false;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
            showToast(`E-mail inválido: ${e}`, 'error');
            return false;
        }
        if (this._emails.includes(e)) {
            showToast(`E-mail já adicionado: ${e}`, 'error');
            return false;
        }
        this._emails.push(e);
        this._render();
        return true;
    },

    remove(idx) {
        this._emails.splice(idx, 1);
        this._render();
    },

    confirmCurrent() {
        const inp = document.getElementById('wa-email-input');
        if (!inp) return;
        const val = inp.value.trim();
        if (val) {
            if (this.add(val)) inp.value = '';
        }
    },

    onKey(event) {
        const inp = event.target;
        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            const val = inp.value.trim().replace(/,$/, '');
            if (val && this.add(val)) inp.value = '';
        } else if (event.key === 'Backspace' && inp.value === '' && this._emails.length > 0) {
            this.remove(this._emails.length - 1);
        }
    },

    _render() {
        const container = document.getElementById('wa-email-chips');
        const inp       = document.getElementById('wa-email-input');
        if (!container || !inp) return;

        container.querySelectorAll('.wa-email-chip').forEach(c => c.remove());

        this._emails.forEach((email, idx) => {
            const chip = document.createElement('span');
            chip.className = 'wa-email-chip';
            chip.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem;background:rgba(37,211,102,0.18);border:1px solid rgba(37,211,102,0.35);border-radius:20px;padding:0.15rem 0.55rem;font-size:0.78rem;color:#c6f6d5;white-space:nowrap;';
            chip.innerHTML = `<i class="ph ph-envelope-simple" style="font-size:0.7rem;"></i> ${email} <button onclick="window.waEmailChips.remove(${idx})" style="background:none;border:none;color:#25d366;cursor:pointer;padding:0;font-size:0.85rem;display:flex;align-items:center;" title="Remover"><i class="ph ph-x"></i></button>`;
            container.insertBefore(chip, inp);
        });

        inp.placeholder = this._emails.length === 0 ? 'email@exemplo.com' : '+ adicionar';
    },
};

window.waEmailChips = waEmailChips;

// ── Init ────────────────────────────────────────────────────────────────────────────
function _renderApiBadge(tokenConfigured, phoneIdConfigured) {
    const badge = document.getElementById('wa-api-badge');
    const configured = tokenConfigured && phoneIdConfigured;

    if (!badge) return;
    if (configured) {
        badge.textContent = '✅ Configurado';
        badge.style.display = 'inline-block';
        badge.style.background = 'rgba(16,185,129,0.15)';
        badge.style.color = '#10b981';
        badge.style.border = '1px solid rgba(16,185,129,0.3)';
    } else {
        badge.textContent = '⚠️ Configuração Pessoal';
        badge.style.display = 'inline-block';
        badge.style.background = 'rgba(245,158,11,0.12)';
        badge.style.color = '#f59e0b';
        badge.style.border = '1px solid rgba(245,158,11,0.3)';
    }
}

export async function initSettingsWhatsApp() {
    _renderSkeleton();
    await _carregarDados();

    if (!_buttonsWired) {
        _wireButtons();
        _buttonsWired = true;
    }

    _stopAutoRefresh();
    _autoRefreshTimer = setInterval(() => {
        const view = document.getElementById('view-settings-whatsapp');
        if (view && view.style.display !== 'none') {
            _carregarDados(true);
        } else {
            _stopAutoRefresh();
        }
    }, REFRESH_INTERVAL);
}

export function destroySettingsWhatsApp() {
    _stopAutoRefresh();
    _buttonsWired = false;
}

function _stopAutoRefresh() {
    if (_autoRefreshTimer) {
        clearInterval(_autoRefreshTimer);
        _autoRefreshTimer = null;
    }
}

async function _carregarDados(silent = false) {
    if (!silent) _setLoadingState(true);
    try {
        const token = await getAuthToken();
        const res   = await fetch('/api/whatsapp/usage', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        _lastData = await res.json();
        
        _renderKPIs(_lastData);
        _renderBarra(_lastData);
        _renderTabela(_lastData);
        _atualizarTimestamp();
    } catch (err) {
        console.error('[SettingsWA] Erro:', err);
        _renderErro(err.message);
    } finally {
        _setLoadingState(false);
    }
}

function _setLoadingState(loading) {
    const btn = document.getElementById('wa-cfg-refresh-btn');
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
        ? '<i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i>'
        : '<i class="ph ph-arrows-clockwise"></i> Atualizar';
}

function _atualizarTimestamp() {
    const el = document.getElementById('wa-last-update');
    if (el) el.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
}

function _renderSkeleton() {
    ['wa-kpi-sessions', 'wa-kpi-cost'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span class="skeleton-pulse">···</span>';
    });
}

function _renderKPIs(data) {
    const { monthly } = data;
    const el = id => document.getElementById(id);
    if (el('wa-kpi-sessions')) el('wa-kpi-sessions').textContent = monthly.sessions || 0;
    if (el('wa-kpi-cost'))     el('wa-kpi-cost').textContent     = `$ ${parseFloat(monthly.cost || 0).toFixed(4)}`;
    
    _renderApiBadge(data.token_configured, data.phone_id_configured);
}

function _renderBarra(data) {
    const spent = parseFloat(data.monthly?.cost || 0);
    const limit = parseFloat(data.limit || 20);
    const pct   = Math.min(100, (spent / limit) * 100);

    const bar = document.getElementById('wa-usage-bar');
    if (bar) {
        bar.style.width = pct.toFixed(1) + '%';
        bar.style.background = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#25d366';
    }

    const e = id => document.getElementById(id);
    if (e('wa-bar-spent')) e('wa-bar-spent').textContent = spent.toFixed(4);
    if (e('wa-bar-pct')) {
        e('wa-bar-pct').textContent = pct.toFixed(1) + '%';
        e('wa-bar-pct').style.color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#94a3b8';
    }
    if (e('wa-bar-limit')) e('wa-bar-limit').textContent = limit.toFixed(0);
    
    if (e('wa-limit-input')) e('wa-limit-input').value = limit;
    if (e('wa-alert-pct'))   e('wa-alert-pct').value   = data.alert_pct || 80;

    // Popula chips de e-mail
    waEmailChips.init(data.alert_email || '');

    // Populate Credentials Card
    const phoneInput = e('wa-phoneid-input');
    const tokenInput = e('wa-token-input');
    
    if (phoneInput && data.phone_id) phoneInput.value = data.phone_id;
    if (tokenInput && data.token_configured) {
        tokenInput.value = '••••••••••••••••••••••••••••••••••••';
        tokenInput.onfocus = function() { if (this.value.includes('•')) this.value = ''; };
    }

    _renderAlerta(pct, spent, limit);
}

function _renderAlerta(pct, spent, limit) {
    const alertEl = document.getElementById('wa-alerta-box');
    if (!alertEl) return;

    if (pct >= 100) {
        alertEl.style.display = 'flex';
        alertEl.style.background = 'rgba(239,68,68,0.1)';
        alertEl.style.borderColor = 'rgba(239,68,68,0.3)';
        alertEl.innerHTML = `<i class="ph ph-warning-octagon" style="color:#ef4444;font-size:1.2rem;"></i>
            <div><strong style="color:#fca5a5;">Limite diário atingido!</strong><br><small>Aumente o limite para continuar enviando mensagens.</small></div>`;
    } else {
        alertEl.style.display = 'none';
    }
}

function _renderTabela(data) {
    const daily = data.daily || [];
    const tableData = daily.map(d => ({
        _raw: d,
        date: d.date,
        sessions: d.sessions,
        cost: parseFloat(d.cost || 0)
    }));

    if (!_manager) {
        _manager = new TableManager({
            data: tableData,
            columns: [
                { key: 'date', label: 'Data', type: 'string', sortable: true, searchable: true },
                { key: 'sessions', label: 'Chamadas', type: 'number', sortable: true },
                { key: 'cost', label: 'Custo', type: 'number', sortable: true }
            ],
            pageSize: 25,
            tableId: 'wa-usage-table',
            renderRows: _renderRows,
            renderPagination: _renderPagination,
            renderFilters: _renderActiveFilters
        });
    } else {
        _manager.setData(tableData);
    }
}

function _renderRows(data) {
    const tbody = document.getElementById('wa-usage-table-body');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:#475569;">
            <i class="ph ph-whatsapp-logo" style="font-size:2rem; display:block; margin-bottom:0.75rem; opacity:0.3;"></i>
            Nenhum uso registrado este mês.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(tmRow => {
        const row = tmRow._raw;
        const isToday = row.date === new Date().toLocaleDateString('pt-BR');
        return `
            <tr ${isToday ? 'style="background:rgba(37,211,102,0.05);"' : ''}>
                <td>
                    <div style="display:flex; align-items:center;">
                        <span style="color:${isToday ? 'var(--text-main)' : 'var(--text-secondary)'}; font-weight:${isToday ? '600' : '400'};">${row.date}</span>
                        ${isToday ? '<span style="font-size:0.62rem; background:rgba(37,211,102,0.2); color:#25d366; padding:0.1rem 0.4rem; border-radius:4px; margin-left:0.5rem; font-weight:600;">HOJE</span>' : ''}
                    </div>
                </td>
                <td style="text-align:center; color:var(--text-secondary);">${row.sessions}</td>
                <td style="text-align:right;">
                    <span style="font-family:monospace; color:#10b981;">$ ${row.cost.toFixed(6)}</span>
                </td>
            </tr>
        `;
    }).join('');
}

function _wireButtons() {
    document.getElementById('wa-cfg-refresh-btn')?.addEventListener('click', () => _carregarDados());

    document.getElementById('wa-save-api-btn')?.addEventListener('click', async () => {
        const token = document.getElementById('wa-token-input').value.trim();
        const phoneId = document.getElementById('wa-phoneid-input').value.trim();
        if (!token && !phoneId) return showToast('Preencha ao menos um campo.', 'info');
        try {
            const authToken = await getAuthToken();
            const res = await fetch('/api/whatsapp/settings', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ whatsapp_access_token: token, whatsapp_phone_number_id: phoneId }),
            });
            if (!res.ok) throw new Error(await res.text());
            showToast('✅ Credenciais atualizadas!', 'success');
            document.getElementById('wa-token-input').value = '';
            _carregarDados();
        } catch (err) {
            showToast('Erro ao salvar: ' + err.message, 'error');
        }
    });

    document.getElementById('wa-save-limit-btn')?.addEventListener('click', async () => {
        const limit = parseFloat(document.getElementById('wa-limit-input').value);
        const alert = parseFloat(document.getElementById('wa-alert-pct').value);
        try {
            const authToken = await getAuthToken();
            const res = await fetch('/api/whatsapp/settings', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthly_limit_usd: limit, alert_pct: alert }),
            });
            if (!res.ok) throw new Error(await res.text());
            showToast('✅ Limites salvos!', 'success');
            _carregarDados();
        } catch (err) {
            showToast('Erro ao salvar: ' + err.message, 'error');
        }
    });

    document.getElementById('wa-save-email-btn')?.addEventListener('click', async () => {
        waEmailChips.confirmCurrent();
        const emailVal = waEmailChips.getValue();
        try {
            const authToken = await getAuthToken();
            const res = await fetch('/api/whatsapp/settings', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ alert_email: emailVal }),
            });
            if (!res.ok) throw new Error(await res.text());
            showToast('✅ E-mails de alerta salvos!', 'success');
            _carregarDados();
        } catch (err) {
            showToast('Erro ao salvar: ' + err.message, 'error');
        }
    });
}

// ── Funções Auxiliares: TableManager ──────────────────────────────────────────
function _renderPagination(state) {
    const container = document.getElementById('pagination-wa');
    if (!container) return;
    if (state.totalPages <= 1) { container.innerHTML = ''; return; }
    const { currentPage, totalPages, totalRecords } = state;
    let html = `<div class="pagination">
        <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window._waGoPage(${currentPage - 1})">
            <i class="ph ph-caret-left"></i>
        </button>`;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="pagination-page ${i === currentPage ? 'active' : ''}" onclick="window._waGoPage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="pagination-dots">...</span>`;
        }
    }
    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window._waGoPage(${currentPage + 1})">
            <i class="ph ph-caret-right"></i>
        </button>
    </div>
    <div class="pagination-info">Página ${currentPage} de ${totalPages} (${totalRecords} registros)</div>`;
    container.innerHTML = html;
}

function _renderActiveFilters(activeFilters, search) {
    const bar = document.getElementById('wa-active-chips');
    if (!bar) return;
    const chips = [];
    if (search) {
        chips.push(`<span class="filter-chip"><i class="ph ph-magnifying-glass"></i> "${search}"<button class="chip-remove" onclick="window._waSearch('')"><i class="ph ph-x"></i></button></span>`);
    }
    if (chips.length > 0) { bar.innerHTML = chips.join(''); bar.style.display = 'flex'; }
    else { bar.innerHTML = ''; bar.style.display = 'none'; }
}

function _buildFilterPopovers() {
    if (!_manager) return;
    ['date', 'sessions', 'cost'].forEach(key => _buildSelectPopover(`filter-popover-wa-${key}`, _manager.getUniqueValues(key), key));
}

function _buildSelectPopover(id, values, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = _manager?.filters[filterKey] || '';
    const currentDir = _manager?.sort.key === filterKey ? _manager.sort.dir : 'none';
    el.innerHTML = `
        <div class="filter-group"><span class="filter-label">Ordenar</span><div class="sort-buttons">
            <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._waSortEx('${filterKey}', 'asc', event)"><i class="ph ph-sort-ascending"></i> Crescente</button>
            <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._waSortEx('${filterKey}', 'desc', event)"><i class="ph ph-sort-descending"></i> Decrescente</button>
        </div></div>
        <div class="filter-group"><span class="filter-label">Filtrar</span><div class="filter-list">
            <div class="filter-option ${!current ? 'selected' : ''}" onclick="window._waFilter('${filterKey}', '', event)">(Tudo)</div>
            ${values.map(v => `<div class="filter-option ${current === v ? 'selected' : ''}" onclick="window._waFilter('${filterKey}', '${v}', event)">${v}</div>`).join('')}
        </div></div>`;
}

function _renderErro(msg) {
    const tbody = document.getElementById('wa-usage-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2rem; color:#ef4444;"><i class="ph ph-warning" style="font-size:1.5rem; display:block; margin-bottom:0.5rem;"></i>${msg}</td></tr>`;
}

// Window globals for TM
window._waGoPage = (p) => _manager && _manager.goToPage(p);
window._waSearch = (q) => { if (_manager) { _manager.setSearch(q); document.getElementById('btn-clear-wa-filters').style.display = (q || _manager.getActiveFilters().length) ? 'inline-flex' : 'none'; } };
window._waClearFilters = () => { if (_manager) { _manager.clearFilters(); _manager.setSearch(''); document.getElementById('wa-search').value = ''; document.getElementById('btn-clear-wa-filters').style.display='none'; document.querySelectorAll('#wa-usage-table .btn-filter-column').forEach(b=>b.classList.remove('active')); } };
window._waSortEx = (k, d, e) => { if (e) e.stopPropagation(); if (_manager) { _manager.setSortExplicit(k, d); _buildFilterPopovers(); document.querySelectorAll('.filter-popover').forEach(p=>p.classList.remove('show')); } };
window._waFilter = (k, v, e) => { if (e) e.stopPropagation(); if (_manager) { _manager.setFilter(k, v || null); _buildFilterPopovers(); const th = document.querySelector(`#wa-usage-table th[data-key="${k}"]`); if (th) th.querySelector('.btn-filter-column').classList.toggle('active', !!v); document.getElementById('btn-clear-wa-filters').style.display = (_manager.getActiveFilters().length || _manager._search) ? 'inline-flex' : 'none'; document.querySelectorAll('.filter-popover.show').forEach(p=>p.classList.remove('show')); } };
window._waToggleFilter = (k, e) => {
    if (e) e.stopPropagation();
    if (!_manager) return;
    const popoverId = `filter-popover-wa-${k}`;
    let popover = document.getElementById(popoverId);
    if (!popover) {
        const th = document.querySelector(`#wa-usage-table th[data-key="${k}"]`);
        if (!th) return;
        popover = document.createElement('div');
        popover.id = popoverId; popover.className = 'filter-popover';
        th.appendChild(popover);
    }
    document.querySelectorAll('.filter-popover').forEach(p => { if (p !== popover) p.classList.remove('show'); });
    if (popover.classList.contains('show')) popover.classList.remove('show');
    else { _buildFilterPopovers(); popover.classList.add('show'); popover.style.top = '100%'; }
};

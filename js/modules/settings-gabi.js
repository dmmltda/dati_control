/**
 * settings-gabi.js — Módulo de Configurações → Gabi AI
 *
 * Features:
 * - KPIs de consumo em tempo real com auto-refresh a cada 60s
 * - Barra de progresso colorida (verde→amarelo→vermelho)
 * - Tabela diária de consumo
 * - Configuração de limite mensal (USD)
 * - Configuração de alerta de percentual (ex: avisar com 80%)
 * - Campos de notificação: email + WhatsApp (preparados, em breve)
 */

import { getAuthToken } from './auth.js';
import { showToast }    from './utils.js';
import { TableManager } from '../core/table-manager.js';

// ── Estado interno ────────────────────────────────────────────────────────────
let _autoRefreshTimer = null;
let _lastData         = null;
let _buttonsWired     = false;
let _manager          = null; // Instância do TableManager
const REFRESH_INTERVAL = 60_000; // 60s

// ── Multi-email chips controller ─────────────────────────────────────────────
const gabiEmailChips = {
    _emails: [],

    /** Inicializa/reseta os chips com uma lista de e-mails separados por vírgula */
    init(csvEmails) {
        this._emails = (csvEmails || '')
            .split(',')
            .map(e => e.trim())
            .filter(e => e.length > 0);
        this._render();
    },

    /** Retorna os e-mails como string separada por vírgula */
    getValue() {
        return this._emails.join(',');
    },

    /** Adiciona um e-mail (valida formato básico) */
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

    /** Remove um e-mail pelo índice */
    remove(idx) {
        this._emails.splice(idx, 1);
        this._render();
    },

    /** Confirma o texto atual do input como novo chip */
    confirmCurrent() {
        const inp = document.getElementById('gabi-email-input');
        if (!inp) return;
        const val = inp.value.trim();
        if (val) {
            if (this.add(val)) inp.value = '';
        }
    },

    /** Handler de keydown no input */
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

    /** Re-renderiza os chips no container */
    _render() {
        const container = document.getElementById('gabi-email-chips');
        const inp       = document.getElementById('gabi-email-input');
        if (!container || !inp) return;

        // Remove chips antigos (preserva o input)
        container.querySelectorAll('.gabi-email-chip').forEach(c => c.remove());

        this._emails.forEach((email, idx) => {
            const chip = document.createElement('span');
            chip.className = 'gabi-email-chip';
            chip.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem;background:rgba(99,102,241,0.18);border:1px solid rgba(99,102,241,0.35);border-radius:20px;padding:0.15rem 0.55rem;font-size:0.78rem;color:#c7d2fe;white-space:nowrap;';
            chip.innerHTML = `<i class="ph ph-envelope-simple" style="font-size:0.7rem;"></i> ${email} <button onclick="gabiEmailChips.remove(${idx})" style="background:none;border:none;color:#818cf8;cursor:pointer;padding:0;font-size:0.85rem;display:flex;align-items:center;" title="Remover"><i class="ph ph-x"></i></button>`;
            container.insertBefore(chip, inp);
        });

        // Placeholder só aparece quando não há chips
        inp.placeholder = this._emails.length === 0 ? 'email@exemplo.com' : '+ adicionar';
    },
};

// Expõe globalmente para os handlers inline do HTML
window.gabiEmailChips = gabiEmailChips;

// Exposta globalmente para o onclick inline do botão "Salvar alterações"
window.gabiSaveEmails = async function() {
    gabiEmailChips.confirmCurrent();
    const emailVal = gabiEmailChips.getValue();
    try {
        const { getAuthToken } = await import('./auth.js');
        const { showToast }    = await import('./utils.js');
        const token = await getAuthToken();
        const res   = await fetch('/api/gabi/settings', {
            method:  'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ alert_email: emailVal }),
        });
        if (!res.ok) throw new Error(await res.text());
        const count = emailVal ? emailVal.split(',').filter(Boolean).length : 0;
        showToast(
            count === 0 ? '✅ E-mails de alerta removidos' :
            count === 1 ? `✅ Alerta configurado para ${emailVal}` :
                          `✅ Alertas configurados para ${count} e-mails`,
            'success'
        );
    } catch (err) {
        const { showToast } = await import('./utils.js');
        showToast('Erro ao salvar: ' + err.message, 'error');
    }
};

// ── Init ────────────────────────────────────────────────────────────────────────────
function _renderApiKeyBadge(configured) {
    const badge = document.getElementById('gabi-apikey-badge');
    const card  = document.getElementById('gabi-apikey-card');
    const input = document.getElementById('gabi-apikey-input');

    if (!badge) return;
    if (configured) {
        badge.textContent = '✅ Configurada';
        badge.style.display = 'inline-block';
        badge.style.background = 'rgba(16,185,129,0.15)';
        badge.style.color = '#10b981';
        badge.style.border = '1px solid rgba(16,185,129,0.3)';
        if (card) card.style.borderColor = 'rgba(16,185,129,0.3)';
        if (input) {
            input.value = '•••••••••••••••••••••••••••••••••••••••';
            input.onfocus = function() {
                if (this.value.includes('•')) this.value = '';
                this.style.borderColor='rgba(251,191,36,0.6)';
            };
        }
    } else {
        badge.textContent = '⚠️ Não configurada';
        badge.style.display = 'inline-block';
        badge.style.background = 'rgba(239,68,68,0.12)';
        badge.style.color = '#f87171';
        badge.style.border = '1px solid rgba(239,68,68,0.3)';
        if (card) card.style.borderColor = 'rgba(239,68,68,0.4)';
        if (input && input.value.includes('•')) {
            input.value = '';
        }
    }
}

export async function initSettingsGabi() {
    _renderSkeleton();
    await _carregarDados();

    if (!_buttonsWired) {
        _wireButtons();
        _buttonsWired = true;
    }

    // Auto-refresh a cada 60s enquanto a view estiver visível
    _stopAutoRefresh();
    _autoRefreshTimer = setInterval(() => {
        const view = document.getElementById('view-config-gabi');
        if (view && view.style.display !== 'none') {
            _carregarDados(true); // silent = true (sem skeleton)
        } else {
            _stopAutoRefresh();
        }
    }, REFRESH_INTERVAL);
}

export function destroySettingsGabi() {
    _stopAutoRefresh();
    _buttonsWired = false;
}

function _stopAutoRefresh() {
    if (_autoRefreshTimer) {
        clearInterval(_autoRefreshTimer);
        _autoRefreshTimer = null;
    }
}

// ── Carregar dados da API ─────────────────────────────────────────────────────
async function _carregarDados(silent = false) {
    if (!silent) _setLoadingState(true);
    try {
        const token = await getAuthToken();
        const res   = await fetch('/api/gabi/usage', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        _lastData = await res.json();
        _renderKPIs(_lastData);
        _renderBarra(_lastData);
        _renderTabela(_lastData);
        _atualizarTimestamp();
    } catch (err) {
        console.error('[SettingsGabi] Erro ao carregar dados:', err);
        _renderErro(err.message);
    } finally {
        _setLoadingState(false);
    }
}

function _setLoadingState(loading) {
    const btn = document.getElementById('gabi-cfg-refresh-btn');
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
        ? '<i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i> Atualizando...'
        : '<i class="ph ph-arrows-clockwise"></i> Atualizar';
}

function _atualizarTimestamp() {
    const el = document.getElementById('gabi-last-update');
    if (el) el.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function _renderSkeleton() {
    ['gabi-kpi-calls', 'gabi-kpi-cost', 'gabi-kpi-input', 'gabi-kpi-output'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.textContent === '—') el.innerHTML = '<span style="opacity:0.3; animation:pulse 1.2s ease-in-out infinite;">···</span>';
    });
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function _renderKPIs(data) {
    const { monthly } = data;
    const el = id => document.getElementById(id);
    if (el('gabi-kpi-calls'))  el('gabi-kpi-calls').textContent  = (monthly.calls ?? 0).toLocaleString('pt-BR');
    if (el('gabi-kpi-cost'))   el('gabi-kpi-cost').textContent   = `$ ${parseFloat(monthly.cost || 0).toFixed(4)}`;
    if (el('gabi-kpi-input'))  el('gabi-kpi-input').textContent  = _formatTokens(monthly.input);
    if (el('gabi-kpi-output')) el('gabi-kpi-output').textContent = _formatTokens(monthly.output);

    // Custo por chamada (média)
    const calls = monthly.calls || 0;
    const perCall = calls > 0 ? (parseFloat(monthly.cost || 0) / calls) : 0;
    if (el('gabi-kpi-per-call')) el('gabi-kpi-per-call').textContent = `$ ${perCall.toFixed(6)} / chamada`;
}

// ── Barra de progresso ────────────────────────────────────────────────────────
function _renderBarra(data) {
    const spent = parseFloat(data.monthly?.cost || 0);
    const limit = parseFloat(data.limit || 20);
    const pct   = Math.min(100, (spent / limit) * 100);

    // Badge da API key
    _renderApiKeyBadge(!!data.api_key_configured);

    // Cor da barra baseada no percentual
    let barColor;
    if (pct >= 90)      barColor = 'linear-gradient(90deg,#ef4444,#dc2626)';
    else if (pct >= 70) barColor = 'linear-gradient(90deg,#f59e0b,#d97706)';
    else                barColor = 'linear-gradient(90deg,#6366f1,#8b5cf6)';

    const e = id => document.getElementById(id);

    const bar = e('gabi-usage-bar');
    if (bar) { bar.style.width = pct.toFixed(1) + '%'; bar.style.background = barColor; }

    if (e('gabi-bar-spent'))   e('gabi-bar-spent').textContent   = spent.toFixed(4);
    if (e('gabi-bar-pct'))     e('gabi-bar-pct').textContent     = pct.toFixed(1) + '%';
    if (e('gabi-bar-limit'))   e('gabi-bar-limit').textContent   = limit.toFixed(0);
    if (e('gabi-limit-input')) e('gabi-limit-input').value = limit;
    // Popula chips de e-mail
    gabiEmailChips.init(data.alert_email || '');


    // Cor do percentual
    if (e('gabi-bar-pct')) {
        e('gabi-bar-pct').style.color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#94a3b8';
        e('gabi-bar-pct').style.fontWeight = pct >= 70 ? '700' : '400';
    }

    // Alertas visuais
    _renderAlerta(pct, spent, limit);
}

function _renderAlerta(pct, spent, limit) {
    const alertEl = document.getElementById('gabi-alerta-box');
    if (!alertEl) return;

    if (pct >= 100) {
        alertEl.style.display = 'flex';
        alertEl.style.background = 'rgba(239,68,68,0.1)';
        alertEl.style.borderColor = 'rgba(239,68,68,0.3)';
        alertEl.innerHTML = `<i class="ph ph-warning-octagon" style="color:#ef4444;font-size:1.2rem;flex-shrink:0;"></i>
            <div><strong style="color:#fca5a5;">Limite atingido!</strong> A Gabi está pausada.<br>
            <small style="color:#94a3b8;">Aumente o limite ou aguarde o próximo mês.</small></div>`;
    } else if (pct >= 90) {
        alertEl.style.display = 'flex';
        alertEl.style.background = 'rgba(239,68,68,0.08)';
        alertEl.style.borderColor = 'rgba(239,68,68,0.25)';
        alertEl.innerHTML = `<i class="ph ph-warning" style="color:#ef4444;font-size:1.2rem;flex-shrink:0;"></i>
            <div><strong style="color:#fca5a5;">Atenção! ${pct.toFixed(0)}% do limite consumido.</strong><br>
            <small style="color:#94a3b8;">US$ ${(limit - spent).toFixed(4)} restantes este mês.</small></div>`;
    } else if (pct >= 70) {
        alertEl.style.display = 'flex';
        alertEl.style.background = 'rgba(245,158,11,0.08)';
        alertEl.style.borderColor = 'rgba(245,158,11,0.25)';
        alertEl.innerHTML = `<i class="ph ph-warning-circle" style="color:#f59e0b;font-size:1.2rem;flex-shrink:0;"></i>
            <div><strong style="color:#fcd34d;">${pct.toFixed(0)}% do limite consumido.</strong><br>
            <small style="color:#94a3b8;">US$ ${(limit - spent).toFixed(4)} restantes este mês.</small></div>`;
    } else {
        alertEl.style.display = 'none';
    }
}

// ── Tabela diária ─────────────────────────────────────────────────────────────
function _renderTabela(data) {
    const daily = data.daily || [];

    const tableData = daily.map(d => ({
        _raw: d,
        date: d.date,
        calls: d.calls,
        cost: parseFloat(d.cost || 0)
    }));

    if (!_manager) {
        _manager = new TableManager({
            data: tableData,
            columns: [
                { key: 'date', label: 'Data', type: 'string', sortable: true, searchable: true },
                { key: 'calls', label: 'Chamadas', type: 'number', sortable: true },
                { key: 'cost', label: 'Custo', type: 'number', sortable: true }
            ],
            pageSize: 25,
            tableId: 'gabi-usage-table',
            renderRows: _renderRows,
            renderPagination: _renderPagination,
            renderFilters: _renderActiveFilters
        });
    } else {
        _manager.setData(tableData);
    }
}

function _renderRows(data) {
    const tbody = document.getElementById('gabi-usage-table-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:#475569;">
            <i class="ph ph-robot" style="font-size:2rem; display:block; margin-bottom:0.75rem; opacity:0.3;"></i>
            Nenhum registro encontrado.<br>
            <small style="color:#334155; display:block; margin-top:0.35rem;">Configure a <strong>GEMINI_API_KEY</strong> no servidor para ativar a Gabi.</small>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(tmRow => {
        const row = tmRow._raw;
        const cost    = parseFloat(row.cost  || 0);
        const isToday = row.date === new Date().toLocaleDateString('pt-BR');

        return `
            <tr ${isToday ? 'style="background:rgba(99,102,241,0.05);"' : ''}>
                <td>
                    <div style="display:flex; align-items:center;">
                        <span style="color:${isToday ? 'var(--text-main)' : 'var(--text-secondary)'}; font-weight:${isToday ? '600' : '400'};">${row.date}</span>
                        ${isToday ? '<span style="font-size:0.62rem; background:rgba(99,102,241,0.2); color:#818cf8; padding:0.1rem 0.4rem; border-radius:4px; margin-left:0.5rem; font-weight:600;">HOJE</span>' : ''}
                    </div>
                </td>
                <td style="text-align:center; color:var(--text-secondary);">${row.calls}</td>
                <td style="text-align:right;">
                    <span style="font-family:monospace; color:#10b981;">$ ${cost.toFixed(6)}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// ── Erro ──────────────────────────────────────────────────────────────────────
function _renderErro(msg) {
    const tbody = document.getElementById('gabi-usage-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2rem; color:#ef4444;">
        <i class="ph ph-warning" style="font-size:1.5rem; display:block; margin-bottom:0.5rem;"></i>
        ${msg}
    </td></tr>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _formatTokens(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString('pt-BR');
}

// ── Wire buttons ──────────────────────────────────────────────────────────────
function _wireButtons() {
    // Botão Salvar chave API
    document.getElementById('gabi-save-apikey-btn')?.addEventListener('click', async () => {
        const keyVal = document.getElementById('gabi-apikey-input')?.value?.trim();
        if (!keyVal) return showToast('Cole a chave da API antes de salvar.', 'error');
        if (keyVal.includes('•')) return showToast('Cole uma nova chave para alterar.', 'info');
        const btn = document.getElementById('gabi-save-apikey-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i> Salvando...'; }
        try {
            const token = await getAuthToken();
            const res = await fetch('/api/gabi/settings', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ gemini_api_key: keyVal }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            document.getElementById('gabi-apikey-input').value = '';
            document.getElementById('gabi-apikey-input').placeholder = 'Chave salva — cole uma nova para substituir';
            _renderApiKeyBadge(!!data.api_key_configured);
            showToast('✅ Chave da API salva com sucesso! A Gabi já está ativada.', 'success');
        } catch (err) {
            showToast('Erro ao salvar chave: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar chave'; }
        }
    });

    // Botão Atualizar
    document.getElementById('gabi-cfg-refresh-btn')?.addEventListener('click', () => _carregarDados());

    // Botão Salvar limite + percentual
    document.getElementById('gabi-save-limit-btn')?.addEventListener('click', async () => {
        const limitVal = parseFloat(document.getElementById('gabi-limit-input')?.value || '20');
        const alertVal = parseFloat(document.getElementById('gabi-alert-pct')?.value   || '80');

        if (isNaN(limitVal) || limitVal <= 0) return showToast('Informe um limite válido.', 'error');
        if (isNaN(alertVal) || alertVal < 1 || alertVal > 100) return showToast('Percentual de alerta deve ser entre 1 e 100.', 'error');

        try {
            const token = await getAuthToken();
            const res   = await fetch('/api/gabi/settings', {
                method:  'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ monthly_limit_usd: limitVal, alert_pct: alertVal }),
            });
            if (!res.ok) throw new Error(await res.text());
            showToast(`✅ Limite US$ ${limitVal.toFixed(2)} · Alerta em ${alertVal}%`, 'success');
            await _carregarDados();
        } catch (err) {
            showToast('Erro ao salvar: ' + err.message, 'error');
        }
    });

    // Botão Salvar e-mails de alerta (seção Notificações)
    document.getElementById('gabi-save-email-btn')?.addEventListener('click', async () => {
        // Confirma chip ainda digitado antes de salvar
        gabiEmailChips.confirmCurrent();

        const emailVal = gabiEmailChips.getValue();

        try {
            const token = await getAuthToken();
            const res   = await fetch('/api/gabi/settings', {
                method:  'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ alert_email: emailVal }),
            });
            if (!res.ok) throw new Error(await res.text());
            const count = emailVal ? emailVal.split(',').length : 0;
            showToast(
                count === 0 ? '✅ E-mails de alerta removidos' :
                count === 1 ? `✅ Alerta configurado para ${emailVal}` :
                              `✅ Alertas configurados para ${count} e-mails`,
                'success'
            );
            await _carregarDados();
        } catch (err) {
            showToast('Erro ao salvar: ' + err.message, 'error');
        }
    });
}

// ── Funções Auxiliares: TableManager ──────────────────────────────────────────

function _renderPagination(state) {
    const container = document.getElementById('pagination-gabi');
    if (!container) return;
    if (state.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    const { currentPage, totalPages, totalRecords } = state;
    let html = `<div class="pagination">
        <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window._gabiGoPage(${currentPage - 1})">
            <i class="ph ph-caret-left"></i>
        </button>`;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="pagination-page ${i === currentPage ? 'active' : ''}" onclick="window._gabiGoPage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="pagination-dots">...</span>`;
        }
    }
    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window._gabiGoPage(${currentPage + 1})">
            <i class="ph ph-caret-right"></i>
        </button>
    </div>
    <div class="pagination-info">Página ${currentPage} de ${totalPages} (${totalRecords} registros)</div>`;
    container.innerHTML = html;
}

function _renderActiveFilters(activeFilters, search) {
    const bar = document.getElementById('gabi-active-chips');
    if (!bar) return;

    const chips = [];
    if (search) {
        chips.push(`
            <span class="filter-chip">
                <i class="ph ph-magnifying-glass"></i> "${_escapeHtml(search)}"
                <button class="chip-remove" data-remove-tm-search="1" title="Remover busca">
                    <i class="ph ph-x"></i>
                </button>
            </span>`);
    }

    if (chips.length > 0) {
        bar.innerHTML = chips.join('');
        bar.style.display = 'flex';
    } else {
        bar.innerHTML = '';
        bar.style.display = 'none';
    }

    bar.querySelectorAll('[data-remove-tm-search]').forEach(btn => {
        btn.addEventListener('click', () => {
             const el = document.getElementById('gabi-search');
             if(el) el.value = '';
             if (_manager) _manager.setSearch(''); 
        });
    });
}

function _buildFilterPopovers() {
    if (!_manager) return;
    const dates = _manager.getUniqueValues('date');
    const calls = _manager.getUniqueValues('calls');
    const costs = _manager.getUniqueValues('cost');

    _buildSelectPopover('filter-popover-gabi-date', dates, 'date');
    _buildSelectPopover('filter-popover-gabi-calls', calls, 'calls');
    _buildSelectPopover('filter-popover-gabi-cost', costs, 'cost');
}

function _buildSelectPopover(id, values, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;

    const current    = _manager?.filters[filterKey] || '';
    const currentDir = _manager?.sort.key === filterKey ? _manager.sort.dir : 'none';

    el.innerHTML = `
        <div class="filter-group">
            <span class="filter-label">Ordenar</span>
            <div class="sort-buttons">
                <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._gabiSortEx('${filterKey}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> Crescente
                </button>
                <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._gabiSortEx('${filterKey}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Decrescente
                </button>
            </div>
        </div>
        <div class="filter-group">
            <span class="filter-label">Filtrar Valores</span>
            <div class="filter-list">
                <div class="filter-option ${!current ? 'selected' : ''}" onclick="window._gabiFilter('${filterKey}', '', event)">
                    (Tudo)
                </div>
                ${values.filter(v=>v || v===0).map(v => `
                    <div class="filter-option ${current === v ? 'selected' : ''}" onclick="window._gabiFilter('${filterKey}', '${v}', event)">
                        ${v}
                    </div>`).join('')}
            </div>
        </div>
        <div class="filter-actions">
            <button class="btn-clear-filter" onclick="window._gabiFilter('${filterKey}', '', event)">
                <i class="ph ph-trash"></i> Limpar Filtro
            </button>
        </div>`;
}

// ── API Handlers ──────────────────────────────────────────────────────────────
window._gabiGoPage = function(page) {
    if (_manager) _manager.goToPage(page);
};

window._gabiSearch = function(query) {
    if (!_manager) return;
    _manager.setSearch(query);
    const clearBtn = document.getElementById('btn-clear-gabi-filters');
    if (clearBtn) clearBtn.style.display = (_manager.getActiveFilters().length > 0 || _manager._search) ? 'inline-flex' : 'none';
};

window._gabiClearFilters = function() {
    if (!_manager) return;
    _manager.clearFilters();
    _manager.setSearch('');
    const input = document.getElementById('gabi-search');
    if (input) input.value = '';
    
    document.querySelectorAll('#gabi-usage-table .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    
    const clearBtn = document.getElementById('btn-clear-gabi-filters');
    if (clearBtn) clearBtn.style.display = 'none';
};

window._gabiSort = function(key) {
    if (!_manager) return;
    _manager.setSort(key);
    _buildFilterPopovers(); // Atualiza indicação de ordenação no popover
};

window._gabiSortEx = function(key, dir, event) {
    if (event) event.stopPropagation();
    if (!_manager) return;
    _manager.setSortExplicit(key, dir);
    _buildFilterPopovers();
    document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
};

window._gabiFilter = function(key, value, event) {
    if (event) event.stopPropagation();
    if (!_manager) return;
    _manager.setFilter(key, value || null);
    _buildFilterPopovers();
    
    // Atualiza o CSS do botão do header
    const th = document.querySelector(`#gabi-usage-table th[data-key="${key}"]`);
    if (th) {
        const btn = th.querySelector('.btn-filter-column');
        if (btn) btn.classList.toggle('active', !!value);
    }

    const clearBtn = document.getElementById('btn-clear-gabi-filters');
    if (clearBtn) clearBtn.style.display = (_manager.getActiveFilters().length > 0 || _manager._search) ? 'inline-flex' : 'none';
    
    document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
};

window._gabiToggleFilter = function(filterKey, event) {
    if (event) event.stopPropagation();
    if (!_manager) return;

    const popoverId = `filter-popover-gabi-${filterKey}`;
    let popover = document.getElementById(popoverId);

    if (!popover) {
        const th = document.querySelector(`#gabi-usage-table th[data-key="${filterKey}"]`);
        if (!th) return;
        popover = document.createElement('div');
        popover.id = popoverId;
        popover.className = 'filter-popover';
        th.appendChild(popover);
    }

    document.querySelectorAll('.filter-popover').forEach(p => {
        if (p !== popover) p.classList.remove('show');
    });

    const isOpen = popover.classList.contains('show');
    if (isOpen) {
        popover.classList.remove('show');
    } else {
        _buildFilterPopovers();
        popover.classList.add('show');
        popover.classList.remove('align-right');
        popover.style.bottom = 'auto';
        popover.style.top = '100%';

        const rect = popover.getBoundingClientRect();
        if (rect.right > window.innerWidth - 20) popover.classList.add('align-right');
        if (rect.bottom > window.innerHeight - 20) {
            popover.style.top = 'auto';
            popover.style.bottom = '100%';
        }
    }
};

// Hide popovers when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-popover') && !e.target.closest('.btn-filter-column')) {
        document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
    }
}, { capture: false });

function _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


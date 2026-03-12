/**
 * ============================================================================
 * Módulo Histórico de Alterações (Audit Log) — Journey
 * ============================================================================
 *
 * Exibe o registro completo de quem fez o quê e quando no sistema.
 * Segue o PADRÃO TABLEMANAGER 2.0 — igual ao log-testes.js
 *
 * ACTOR LABEL:
 *   - "Daniel Martins"              → master agiu diretamente
 *   - "Rafa via Daniel Martins"     → standard agiu (e quem a convidou)
 *   - "Journey"                     → plataforma executou automaticamente
 *
 * ARQUITETURA:
 *   - Dados buscados via GET /api/audit-logs (todos de uma vez, client-side)
 *   - TableManager 2.0 para filtragem, ordenação e paginação
 *   - Filtros: busca global, ação (select na toolbar), data (from/to), popovers
 * ============================================================================
 */

import { TableManager } from '../core/table-manager.js';

// ─── Configuração visual por tipo de ação ────────────────────────────────────
const ACTION_CONFIG = {
    CREATE:     { label: 'Criação',     icon: 'ph-plus-circle',     color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)'  },
    UPDATE:     { label: 'Alteração',   icon: 'ph-pencil-simple',   color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.3)'   },
    DELETE:     { label: 'Exclusão',    icon: 'ph-trash',           color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)'   },
    MEMBERSHIP: { label: 'Acesso',      icon: 'ph-users',           color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)'   },
    INVITE:     { label: 'Convite',     icon: 'ph-envelope',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)'   },
    IMPORT:     { label: 'Importação',  icon: 'ph-upload-simple',   color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.3)'   },
    SYSTEM:     { label: 'Sistema',     icon: 'ph-robot',           color: '#64748b', bg: 'rgba(100,116,139,0.12)',border: 'rgba(100,116,139,0.3)'  },
};

const ENTITY_LABELS = {
    company:    'Empresa',
    user:       'Usuário',
    membership: 'Acesso',
    invite:     'Convite',
    activity:   'Atividade',
    import:     'Importação',
};

// ─── Colunas para o TableManager ─────────────────────────────────────────────
const AUDIT_COLUMNS = [
    { key: 'quando',    label: 'Quando',         type: 'string',  sortable: true,  filterable: false, searchable: true  },
    { key: 'quem',      label: 'Quem',           type: 'string',  sortable: true,  filterable: true,  searchable: true  },
    { key: 'acao',      label: 'Ação',           type: 'string',  sortable: true,  filterable: true,  searchable: true  },
    { key: 'descricao', label: 'O que foi feito',type: 'string',  sortable: false, filterable: false, searchable: true  },
    { key: 'entidade',  label: 'Entidade',       type: 'string',  sortable: true,  filterable: true,  searchable: true  },
];

// ─── Estado do módulo ─────────────────────────────────────────────────────────
let _manager      = null;
let _allRows      = [];
let _rawRows      = [];     // dados brutos para o toggle de detalhe
let _initialized  = false;
let _filters      = { action: '', dateFrom: '', dateTo: '' };
let _pollTimer    = null;   // timer de auto-refresh
const POLL_INTERVAL = 30_000; // 30 segundos

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _actionBadge(action) {
    const cfg = ACTION_CONFIG[action] ?? ACTION_CONFIG.SYSTEM;
    return `<span class="badge" style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};font-size:0.75rem;white-space:nowrap;">
        <i class="${cfg.icon}"></i> ${cfg.label}
    </span>`;
}

function _actorChip(actorLabel) {
    if (!actorLabel) return '—';
    const isJourney = actorLabel === 'Journey';
    const isVia     = actorLabel.includes(' via ');
    let icon = 'ph-user';
    let color = 'var(--text-main)';
    if (isJourney) { icon = 'ph-robot'; color = '#64748b'; }
    else if (isVia) { icon = 'ph-users-three'; color = '#6366f1'; }
    return `<span style="display:inline-flex;align-items:center;gap:0.4rem;color:${color};font-size:0.85rem;">
        <i class="ph ${icon}"></i> ${_escapeHtml(actorLabel)}
    </span>`;
}

function _formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function _entityLabel(type) {
    return ENTITY_LABELS[type] ?? type;
}

function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _renderDiffPreview(meta) {
    if (!meta?.changes?.length) return '';
    const preview = meta.changes.slice(0, 3).map(c =>
        `<span style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.72rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:5px;padding:0.1rem 0.45rem;margin-top:0.3rem;">
            <b style="color:var(--text-muted);">${_escapeHtml(c.label)}:</b>
            <span style="color:#ef4444;text-decoration:line-through;">${_escapeHtml(String(c.old))}</span>
            <i class="ph ph-arrow-right" style="font-size:0.65rem;color:var(--text-muted);"></i>
            <span style="color:#10b981;">${_escapeHtml(String(c.new))}</span>
        </span>`
    ).join(' ');
    const more = meta.changes.length > 3
        ? `<span style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem;">+${meta.changes.length - 3} campos</span>`
        : '';
    return `<div style="display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.35rem;">${preview}${more}</div>`;
}

// ─── Transformar dados brutos em linhas planas ────────────────────────────────
function _flattenRows(data) {
    return data.map(row => ({
        _rawId:     String(row.id),
        _raw:       row,
        quando:     _formatDate(row.created_at),
        quem:       row.actor_label ?? '—',
        acao:       ACTION_CONFIG[row.action]?.label ?? row.action,
        _action:    row.action,
        descricao:  row.description ?? '',
        entidade:   _entityLabel(row.entity_type),
        _entityName:row.entity_name ?? '',
        _meta:      row.meta ?? null,
        _ip:        row.ip_address ?? '',
    }));
}

// ─── Renderizar linhas ────────────────────────────────────────────────────────
function _renderRows(data) {
    const tbody = document.getElementById('audit-log-tbody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="ph ph-clock-counter-clockwise" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
                    Nenhum registro encontrado.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const diffHtml = _renderDiffPreview(row._meta);
        const detailId = `audit-detail-${row._rawId}`;

        return `
            <tr class="audit-row" data-raw-id="${row._rawId}" onclick="window._auditToggleDetail('${row._rawId}', '${detailId}')" style="cursor:pointer;">
                <td style="font-size:0.82rem; white-space:nowrap; color:var(--text-muted);">${row.quando}</td>
                <td>${_actorChip(row.quem)}</td>
                <td>${_actionBadge(row._action)}</td>
                <td style="font-size:0.82rem; max-width:300px;">
                    <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
                        <span style="font-size:0.7rem;background:rgba(255,255,255,0.07);color:var(--text-muted);padding:0.1rem 0.4rem;border-radius:4px;font-weight:600;white-space:nowrap;">${_escapeHtml(row.entidade)}</span>
                        <span>${_escapeHtml(row.descricao)}</span>
                    </div>
                    ${diffHtml}
                </td>
                <td style="font-size:0.82rem; color:#94a3b8;">
                    <div style="display:flex;align-items:center;gap:0.3rem;">
                        ${_escapeHtml(row._entityName)}
                        <i class="ph ph-caret-down" style="font-size:0.7rem;opacity:0.4;margin-left:auto;"></i>
                    </div>
                </td>
            </tr>
            <tr id="${detailId}" class="audit-detail-row" style="display:none;"></tr>`;
    }).join('');
}

// ─── Renderizar paginação — padrão log-testes.js ──────────────────────────────
function _renderPagination(state) {
    const container = document.getElementById('pagination-audit');
    if (!container) return;

    // Atualiza o contador ao renderizar paginação
    _updateCount(state.totalRecords);

    if (state.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const { currentPage, totalPages, totalRecords } = state;
    let html = `<div class="pagination">
        <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window._auditGoPage(${currentPage - 1})">
            <i class="ph ph-caret-left"></i>
        </button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="pagination-page ${i === currentPage ? 'active' : ''}" onclick="window._auditGoPage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="pagination-dots">...</span>`;
        }
    }

    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window._auditGoPage(${currentPage + 1})">
            <i class="ph ph-caret-right"></i>
        </button>
    </div>
    <div class="pagination-info">Página ${currentPage} de ${totalPages} (${totalRecords} registros)</div>`;
    container.innerHTML = html;
}

// ─── Atualizar contador no bulk-toolbar ──────────────────────────────────────
function _updateCount(total) {
    const el = document.getElementById('audit-log-count');
    if (el) el.textContent = `${total.toLocaleString('pt-BR')} registro${total !== 1 ? 's' : ''}`;
}

// ─── Popovers de filtro por coluna ───────────────────────────────────────────
function _buildFilterPopovers() {
    if (!_manager) return;

    const quemValues     = _manager.getUniqueValues('quem');
    const acaoValues     = _manager.getUniqueValues('acao');
    const entidadeValues = _manager.getUniqueValues('entidade');

    _buildPopover('filter-popover-audit_quem',     quemValues,     'quem');
    _buildPopover('filter-popover-audit_acao',     acaoValues,     'acao');
    _buildPopover('filter-popover-audit_entidade', entidadeValues, 'entidade');
    _buildDatePopover('filter-popover-audit_quando');
}

function _buildDatePopover(id) {
    const el = document.getElementById(id);
    if (!el) return;

    const fromVal = _filters.dateFrom || '';
    const toVal   = _filters.dateTo   || '';

    el.innerHTML = `
        <div style="padding:0.75rem; min-width:240px;">
            <div class="filter-group">
                <span class="filter-label">Período</span>
                <div style="display:flex;flex-direction:column;gap:0.5rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span style="font-size:0.72rem;color:var(--text-muted);min-width:28px;">De</span>
                        <input type="date" id="audit-popover-from"
                            value="${fromVal}"
                            style="flex:1;background:rgba(15,23,42,0.6);border:1px solid var(--dark-border);border-radius:6px;padding:0.35rem 0.5rem;color:var(--text-main);font-size:0.82rem;outline:none;color-scheme:dark;"
                            onchange="window._auditDateFrom(this.value)">
                    </div>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span style="font-size:0.72rem;color:var(--text-muted);min-width:28px;">Até</span>
                        <input type="date" id="audit-popover-to"
                            value="${toVal}"
                            style="flex:1;background:rgba(15,23,42,0.6);border:1px solid var(--dark-border);border-radius:6px;padding:0.35rem 0.5rem;color:var(--text-main);font-size:0.82rem;outline:none;color-scheme:dark;"
                            onchange="window._auditDateTo(this.value)">
                    </div>
                </div>
            </div>
            <div class="filter-actions">
                <button class="btn-clear-filter" onclick="window._auditClearDate()">
                    <i class="ph ph-x-circle"></i> Limpar
                </button>
            </div>
        </div>`;
}

function _buildPopover(id, values, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;

    const current = _manager?.filters[filterKey] ?? '';

    el.innerHTML = `
        <div class="filter-group">
            <span class="filter-label">Filtrar por ${filterKey === 'quem' ? 'Usuário' : filterKey === 'acao' ? 'Ação' : 'Entidade'}</span>
            <div class="filter-list">
                <div class="filter-option ${!current ? 'selected' : ''}"
                     onclick="window._auditFilter('${filterKey}', '')">
                    (Tudo)
                </div>
                ${values.map(v => `
                <div class="filter-option ${current === String(v) ? 'selected' : ''}"
                     onclick="window._auditFilter('${filterKey}', '${String(v).replace(/'/g, "\\'")}')">
                    ${_escapeHtml(String(v))}
                </div>`).join('')}
            </div>
        </div>
        <div class="filter-actions">
            <button class="btn-clear-filter" onclick="window._auditFilter('${filterKey}', '')">
                <i class="ph ph-x-circle"></i> Limpar Filtro
            </button>
        </div>`;
}

// ─── Filtro externo (action select + date range) ──────────────────────────────
function _applyExternalFilters(rows) {
    return rows.filter(row => {
        // Filtro por ação (original action code, não label)
        if (_filters.action && row._raw.action !== _filters.action) return false;

        // Filtro por data
        if (_filters.dateFrom || _filters.dateTo) {
            const d = new Date(row._raw.created_at);
            if (isNaN(d)) return false;
            if (_filters.dateFrom) {
                const from = new Date(_filters.dateFrom + 'T00:00:00');
                if (d < from) return false;
            }
            if (_filters.dateTo) {
                const to = new Date(_filters.dateTo + 'T23:59:59');
                if (d > to) return false;
            }
        }
        return true;
    });
}

// ─── Mostrar / ocultar botão "Limpar Filtros" ─────────────────────────────────
function _syncClearBtn() {
    const hasExternal = _filters.action || _filters.dateFrom || _filters.dateTo;
    const hasInternal = _manager && _manager.getActiveFilters().length > 0;
    const hasSearch   = _manager && _manager._search;
    const show = hasExternal || hasInternal || hasSearch;

    const btn     = document.getElementById('btn-clear-audit-filters');
    const divider = document.getElementById('audit-clear-divider');
    if (btn) btn.style.display = show ? 'inline-flex' : 'none';
    if (divider) divider.style.display = show ? 'block' : 'none';
}

// ─── Fetch & init ─────────────────────────────────────────────────────────────
async function _load() {
    const tbody = document.getElementById('audit-log-tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="ph ph-spinner" style="font-size:2rem; display:block; margin-bottom:0.5rem; animation: spin 1s linear infinite;"></i>
                    Carregando histórico...
                </td>
            </tr>`;
    }

    // Loading no botão
    const btn = document.getElementById('audit-btn-refresh');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner"></i> Carregando...'; }

    try {
        const res = await fetch('/api/audit-logs?limit=500');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = json.data ?? json ?? [];

        const filtered = _applyExternalFilters(_flattenRows(data));
        _allRows = filtered;

        _updateCount(filtered.length);

        if (!_manager) {
            _manager = new TableManager({
                data:             filtered,
                columns:          AUDIT_COLUMNS,
                pageSize:         25,
                tableId:          'audit-log-table',
                renderRows:       _renderRows,
                renderPagination: _renderPagination,
            });
        } else {
            _manager.setData(filtered);
        }

        _buildFilterPopovers();
        _syncClearBtn();

    } catch (err) {
        console.error('[AuditLog] Erro ao carregar:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:3rem; color:#ef4444;">
                        <i class="ph ph-warning-circle" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
                        Erro ao carregar: ${_escapeHtml(err.message)}
                    </td>
                </tr>`;
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Atualizar'; }
    }
}

/**
 * Recarrega os dados SEM mostrar o spinner de loading.
 * Usado pelo auto-refresh (polling + notifyChange) para não interromper a UX.
 */
async function _silentLoad() {
    try {
        const res = await fetch('/api/audit-logs?limit=500');
        if (!res.ok) return; // silencia erros no background

        const json = await res.json();
        const data = json.data ?? json ?? [];
        const filtered = _applyExternalFilters(_flattenRows(data));

        // Só atualiza se houver mudança de quantidade de registros
        if (_manager && filtered.length === _allRows.length) {
            // Mesmo número — verifica se o primeiro item mudou (novo mais recente)
            const newFirst = filtered[0]?._raw?.id;
            const curFirst = _allRows[0]?._raw?.id;
            if (newFirst === curFirst) return; // nada mudou, evita re-render
        }

        _allRows = filtered;
        _updateCount(filtered.length);

        if (!_manager) {
            _manager = new TableManager({
                data:             filtered,
                columns:          AUDIT_COLUMNS,
                pageSize:         25,
                tableId:          'audit-log-table',
                renderRows:       _renderRows,
                renderPagination: _renderPagination,
            });
        } else {
            _manager.setData(filtered);
        }

        _buildFilterPopovers();
        _syncClearBtn();

    } catch (err) {
        console.warn('[AuditLog] Silent load falhou silenciosamente:', err.message);
    }
}

// ─── Toggle do detalhe de uma linha ──────────────────────────────────────────
function _toggleDetail(rawId, detailId) {
    const detailRow = document.getElementById(detailId);
    if (!detailRow) return;

    const isOpen = detailRow.style.display !== 'none';

    // Fecha todos os detalhes abertos
    document.querySelectorAll('.audit-detail-row').forEach(r => {
        r.style.display = 'none';
        r.innerHTML = '';
    });
    document.querySelectorAll('.audit-row').forEach(r => r.classList.remove('expanded'));

    if (isOpen) return; // apenas fechou

    // Abre o detalhe da linha clicada
    const row = _allRows.find(r => r._rawId === rawId);
    if (!row) return;

    const mainRow = detailRow.previousElementSibling;
    if (mainRow) mainRow.classList.add('expanded');

    let metaHtml = '';
    if (row._meta?.changes?.length) {
        metaHtml = `<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
                    <th style="padding:0.5rem 1rem;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">Campo</th>
                    <th style="padding:0.5rem 1rem;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">Antes</th>
                    <th style="padding:0.5rem 1rem;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">Depois</th>
                </tr>
            </thead>
            <tbody>
                ${row._meta.changes.map(c => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                        <td style="padding:0.5rem 1rem;font-weight:600;color:#e2e8f0;">${_escapeHtml(c.label)}</td>
                        <td style="padding:0.5rem 1rem;color:#ef4444;">${_escapeHtml(String(c.old))}</td>
                        <td style="padding:0.5rem 1rem;color:#10b981;">${_escapeHtml(String(c.new))}</td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
    } else if (row._meta) {
        metaHtml = `<pre style="font-size:0.75rem;color:#94a3b8;padding:1rem;overflow-x:auto;white-space:pre-wrap;">${_escapeHtml(JSON.stringify(row._meta, null, 2))}</pre>`;
    } else {
        metaHtml = `<em style="color:var(--text-muted);font-size:0.82rem;">Sem detalhes adicionais.</em>`;
    }

    const ipHtml = row._ip ? `<div style="font-size:0.72rem;color:var(--text-muted);padding:0.5rem 1rem;border-top:1px solid rgba(255,255,255,0.05);">IP: ${_escapeHtml(row._ip)}</div>` : '';

    detailRow.style.display = 'table-row';
    detailRow.innerHTML = `<td colspan="5" style="padding:0; background:rgba(0,0,0,0.2); border-left:3px solid ${ACTION_CONFIG[row._raw?.action]?.color ?? '#6366f1'};">
        <div style="padding:1rem 0.5rem;">
            ${metaHtml}
            ${ipHtml}
        </div>
    </td>`;

    // Anima o caret
    const caret = mainRow?.querySelector('.ph-caret-down');
    if (caret) caret.style.transform = 'rotate(180deg)';
}

// ─── Expõe globais para onclick no HTML ──────────────────────────────────────
function _exposeGlobals() {
    window._auditGoPage = (page) => {
        if (!_manager) return;
        _manager.goToPage(page);
    };

    window._auditFilter = (key, value) => {
        if (!_manager) return;
        _manager.setFilter(key, value || null);
        _buildFilterPopovers();
        _syncClearBtn();
        document.querySelectorAll('.filter-popover.open').forEach(p => p.classList.remove('open'));
    };

    // ─── Handlers do popover de data (coluna QUANDO) ──────────────────────────
    window._auditDateFrom = (value) => {
        _filters.dateFrom = value;
        // Sincroniza com o input da toolbar
        const tb = document.getElementById('audit-date-from');
        if (tb) tb.value = value;
        _reloadWithFilters();
    };

    window._auditDateTo = (value) => {
        _filters.dateTo = value;
        // Sincroniza com o input da toolbar
        const tb = document.getElementById('audit-date-to');
        if (tb) tb.value = value;
        _reloadWithFilters();
    };

    window._auditClearDate = () => {
        _filters.dateFrom = '';
        _filters.dateTo   = '';
        const f = document.getElementById('audit-date-from');
        const t = document.getElementById('audit-date-to');
        if (f) f.value = '';
        if (t) t.value = '';
        _buildFilterPopovers(); // rebuild para limpar valores no popover
        _reloadWithFilters();
    };

    // ─── Toggle de popover próprio (sem usar ui.toggleFilterPopover) ──────────
    // O ui.toggleFilterPopover chama renderFilterOptions que usa getManagerForKey,
    // que não conhece as chaves do audit-log e sobrescreve o conteúdo correto.
    window._auditTogglePopover = (key, event) => {
        event.stopPropagation();
        const popover = document.getElementById(`filter-popover-audit_${key}`);
        if (!popover) return;

        // Fecha todos os outros popovers
        document.querySelectorAll('.filter-popover').forEach(p => {
            if (p !== popover) p.classList.remove('show');
        });

        const isOpen = popover.classList.contains('show');
        if (isOpen) {
            popover.classList.remove('show');
            return;
        }

        // Reconstrói o conteúdo antes de mostrar (garante dados frescos)
        if (key === 'quando') {
            _buildDatePopover(`filter-popover-audit_quando`);
        } else {
            _buildPopover(`filter-popover-audit_${key}`, _manager?.getUniqueValues(key) ?? [], key);
        }

        popover.classList.add('show');

        // Posicionamento inteligente
        popover.classList.remove('align-right');
        popover.style.bottom = 'auto';
        popover.style.top = '100%';

        requestAnimationFrame(() => {
            const rect = popover.getBoundingClientRect();
            if (rect.right > window.innerWidth - 20) popover.classList.add('align-right');
            if (rect.bottom > window.innerHeight - 20) {
                popover.style.top = 'auto';
                popover.style.bottom = '100%';
            }
        });
    };

    window._auditToggleDetail = _toggleDetail;
}

// ─── _patchManager — não necessário no TM 2.0 (usa renderPagination nativo)
function _patchManager() { /* no-op */ }

// ─── Polling automático ──────────────────────────────────────────────
function _startPolling() {
    _stopPolling();
    _pollTimer = setInterval(() => {
        // Só faz poll se a view do audit-log estiver visível
        const view = document.getElementById('view-audit-log');
        if (view && view.style.display !== 'none') {
            _silentLoad(); // refresh silencioso sem spinner
        } else {
            _stopPolling(); // view fechada, para o timer
        }
    }, POLL_INTERVAL);
}

function _stopPolling() {
    if (_pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
    }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Inicializa o módulo — busca dados e monta a tabela.
 * Chamado ao navegar para a view Histórico.
 */
/**
 * Inicializa o módulo — busca dados e monta a tabela.
 * Chamado ao navegar para a view Histórico.
 * Sempre recarrega ao abrir, sem depender de clique manual.
 */
export async function init() {
    if (_initialized) {
        // Já inicializado: atualiza os dados ao abrir a view
        await _load();
        _startPolling(); // reinicia o polling
        return;
    }
    _exposeGlobals();
    await _load();
    _patchManager();
    _initialized = true;
    _startPolling(); // inicia auto-refresh a cada 30s
}

/**
 * Recarrega os dados da API manualmente (botão Atualizar).
 */
export async function refresh() {
    await _load();
}

/**
 * Notifica o módulo que uma alteração ocorreu em qualquer parte do sistema.
 * Se a view estiver visível, atualiza silenciosamente (sem spinner).
 * Chamado pelo interceptor de fetch sempre que uma operação mutante sucede.
 */
export function notifyChange() {
    const view = document.getElementById('view-audit-log');
    if (view && view.style.display !== 'none') {
        _silentLoad(); // verdadeiramente silencioso, sem interromper UX
    }
}

/**
 * Busca global — chamada pelo input de pesquisa.
 */
export function handleSearch(value) {
    if (!_manager) return;
    _manager.setSearch(value);
    _syncClearBtn();
}

/**
 * Filtro por ação (select na toolbar).
 */
export function handleActionFilter(value) {
    _filters.action = value;
    _reloadWithFilters();
}

/**
 * Filtro de data "De".
 */
export function handleDateFrom(value) {
    _filters.dateFrom = value;
    _reloadWithFilters();
}

/**
 * Filtro de data "Até".
 */
export function handleDateTo(value) {
    _filters.dateTo = value;
    _reloadWithFilters();
}

/**
 * Reaplica filtros externos e atualiza o manager.
 */
async function _reloadWithFilters() {
    if (!_manager) return _load();

    // Rebusca os dados brutos da API e aplica filtros externos
    try {
        const res = await fetch('/api/audit-logs?limit=500');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = json.data ?? json ?? [];
        const filtered = _applyExternalFilters(_flattenRows(data));
        _allRows = filtered;
        _manager.setData(filtered);
        _buildFilterPopovers();
        _syncClearBtn();
    } catch (err) {
        console.error('[AuditLog] Erro ao refiltrar:', err);
    }
}

/**
 * Ordena por coluna.
 */
export function handleSort(key) {
    if (!_manager) return;
    _manager.setSort(key);
}

/**
 * Limpa todos os filtros.
 */
export function clearFilters() {
    _filters = { action: '', dateFrom: '', dateTo: '' };

    const s = document.getElementById('audit-search-global');
    if (s) s.value = '';
    const a = document.getElementById('audit-filter-action');
    if (a) a.value = '';
    const df = document.getElementById('audit-date-from');
    if (df) df.value = '';
    const dt = document.getElementById('audit-date-to');
    if (dt) dt.value = '';

    if (_manager) {
        _manager.clearFilters();
    }

    _syncClearBtn();
    _reloadWithFilters();
}

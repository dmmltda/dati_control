/**
 * ============================================================================
 * log-testes.js — Módulo de Log de Testes (Fase 1)
 * ============================================================================
 * Responsável por:
 *   - Buscar execuções reais via GET /api/test-runs
 *   - Renderizar a tabela com TableManager 2.0
 *   - Exibir badges de status, filtros, paginação
 *   - Mostrar painel de detalhes com stack trace (expand row)
 *   - Atualizar o summary header com dados reais (não mais hardcoded)
 * ============================================================================
 */

import { TableManager } from '../core/table-manager.js';

// ─── Estado do módulo --------------------------------------------------------
let _manager = null;
let _allCases  = [];      // todos os test_cases achatados de todas as runs
let _initialized = false;

// ─── Configuração das colunas ------------------------------------------------
const LOG_COLUMNS = [
    { key: 'data',        label: 'Data',           type: 'date',   sortable: true, filterable: true, filterType: 'date',   searchable: false },
    { key: 'hora',        label: 'Hora',           type: 'string', sortable: true,                                          searchable: false },
    { key: 'tipo',        label: 'Tipo',           type: 'string', sortable: true, filterable: true, filterType: 'select', searchable: true  },
    { key: 'modulo',      label: 'Módulo',         type: 'string', sortable: true, filterable: true, filterType: 'select', searchable: true  },
    { key: 'descricao',   label: 'O que foi testado', type: 'string', sortable: false,                                    searchable: true  },
    { key: 'status',      label: 'Resultado',      type: 'string', sortable: true, filterable: true, filterType: 'select', searchable: true  },
    { key: 'duracao',     label: 'Duração',        type: 'number', sortable: true,                                          searchable: false },
];

// ─── Helpers -----------------------------------------------------------------

function _badgeStatus(status) {
    const map = {
        'PASSOU':   { bg: 'rgba(16,185,129,0.15)',  color: '#10b981', border: 'rgba(16,185,129,0.3)',  icon: 'ph-check-circle' },
        'FALHOU':   { bg: 'rgba(239,68,68,0.1)',    color: '#ef4444', border: 'rgba(239,68,68,0.2)',   icon: 'ph-x-circle' },
        'ERRO':     { bg: 'rgba(245,158,11,0.1)',   color: '#f59e0b', border: 'rgba(245,158,11,0.2)',  icon: 'ph-warning' },
        'SKIPADO':  { bg: 'rgba(100,116,139,0.1)',  color: '#64748b', border: 'rgba(100,116,139,0.2)', icon: 'ph-minus-circle' },
    };
    const s = map[status] || map['ERRO'];
    return `<span class="badge" style="background:${s.bg};color:${s.color};border:1px solid ${s.border};font-size:0.75rem;white-space:nowrap;">
                <i class="${s.icon}"></i> ${status}
            </span>`;
}

function _badgeTipo(tipo) {
    const map = {
        'UNITÁRIO':   { bg: 'rgba(91,82,246,0.15)',  color: '#5b52f6', border: 'rgba(91,82,246,0.3)' },
        'FUNCIONAL':  { bg: 'rgba(16,185,129,0.1)',  color: '#10b981', border: 'rgba(16,185,129,0.2)' },
        'E2E':        { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', border: 'rgba(245,158,11,0.2)' },
    };
    const s = map[tipo] || { bg: 'rgba(100,116,139,0.1)', color: '#64748b', border: 'rgba(100,116,139,0.2)' };
    return `<span class="badge" style="background:${s.bg};color:${s.color};border:1px solid ${s.border};font-size:0.75rem;">${tipo}</span>`;
}

function _formatDuration(ms) {
    if (!ms && ms !== 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function _formatDate(dt) {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString('pt-BR');
}

function _formatTime(dt) {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Transformar runs em linhas planas para a tabela ------------------------
function _flattenRuns(runs) {
    const rows = [];
    for (const run of runs) {
        const cases = run.test_cases || [];
        if (cases.length === 0) {
            // Run sem casos — mostra a run inteira como uma linha
            rows.push({
                _rowId:     run.id,
                _runId:     run.id,
                data:       _formatDate(run.triggered_at),
                hora:       _formatTime(run.triggered_at),
                tipo:       run.suite_type,
                modulo:     '(suite completa)',
                descricao:  `Execução: ${run.total_tests} testes | ${run.passed_tests} passou | ${run.failed_tests} falhou`,
                status:     run.status === 'passed' ? 'PASSOU' : (run.status === 'failed' ? 'FALHOU' : 'ERRO'),
                duracao:    run.duration_ms,
                _errorMsg:  null,
                _errorStack:null,
                _screenshot:null,
                _video:     null,
            });
        } else {
            for (const c of cases) {
                rows.push({
                    _rowId:      c.id,
                    _runId:      run.id,
                    data:        _formatDate(c.created_at || run.triggered_at),
                    hora:        _formatTime(c.created_at || run.triggered_at),
                    tipo:        c.suite_type || run.suite_type,
                    modulo:      c.module || c.suite_file || '—',
                    descricao:   c.test_name,
                    status:      c.status || 'ERRO',
                    duracao:     c.duration_ms,
                    _errorMsg:   c.error_message,
                    _errorStack: c.error_stack,
                    _screenshot: c.screenshot_url,
                    _video:      c.video_url,
                });
            }
        }
    }
    return rows;
}

// ─── Renderizar linhas da tabela ---------------------------------------------
function _renderRows(data) {
    const tbody = document.getElementById('log-testes-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="ph ph-test-tube" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
                    Nenhum teste encontrado. Execute os testes e os resultados aparecerão aqui.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const hasDetails = row._errorMsg || row._errorStack || row._screenshot || row._video;
        const detailsId = `log-detail-${row._rowId}`;

        const detailContent = hasDetails ? `
            <tr id="${detailsId}" class="log-detail-row" style="display:none;">
                <td colspan="7" style="padding:0.75rem 1.25rem; background:rgba(0,0,0,0.2); border-left:3px solid #ef4444;">
                    ${row._errorMsg ? `
                        <div style="margin-bottom:0.5rem;">
                            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">MENSAGEM DE ERRO</span>
                            <pre style="margin:0.25rem 0 0; font-size:0.78rem; color:#ef4444; white-space:pre-wrap; font-family:monospace;">${_escapeHtml(row._errorMsg)}</pre>
                        </div>` : ''}
                    ${row._errorStack ? `
                        <div style="margin-top:0.5rem;">
                            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">STACK TRACE</span>
                            <pre style="margin:0.25rem 0 0; font-size:0.72rem; color:#94a3b8; white-space:pre-wrap; font-family:monospace; max-height:200px; overflow-y:auto;">${_escapeHtml(row._errorStack)}</pre>
                        </div>` : ''}
                    ${row._screenshot ? `
                        <div style="margin-top:0.75rem;">
                            <a href="${row._screenshot}" target="_blank" class="btn btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.7rem;">
                                <i class="ph ph-image"></i> Ver Screenshot
                            </a>
                        </div>` : ''}
                    ${row._video ? `
                        <div style="margin-top:0.5rem;">
                            <a href="${row._video}" target="_blank" class="btn btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.7rem;">
                                <i class="ph ph-video"></i> Ver Vídeo
                            </a>
                        </div>` : ''}
                </td>
            </tr>` : '';

        return `
            <tr class="log-row" data-row-id="${row._rowId}" style="cursor: ${hasDetails ? 'pointer' : 'default'};"
                ${hasDetails ? `onclick="window._logTesteToggleDetail('${detailsId}')"` : ''}>
                <td style="font-size:0.82rem; white-space:nowrap;">${row.data}</td>
                <td style="font-size:0.82rem; color:var(--text-muted); white-space:nowrap;">${row.hora}</td>
                <td style="text-align:center;">${_badgeTipo(row.tipo)}</td>
                <td style="font-size:0.82rem; color:#94a3b8;">${_escapeHtml(row.modulo)}</td>
                <td style="font-size:0.82rem; max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${_escapeHtml(row.descricao)}">${_escapeHtml(row.descricao)}</td>
                <td style="text-align:center;">${_badgeStatus(row.status)}</td>
                <td style="font-size:0.82rem; color:var(--text-muted); white-space:nowrap;">
                    ${_formatDuration(row.duracao)}
                    ${hasDetails ? '<i class="ph ph-caret-down" style="margin-left:0.3rem; font-size:0.7rem; opacity:0.5;"></i>' : ''}
                </td>
            </tr>
            ${detailContent}`;
    }).join('');
}

// ─── Renderizar paginação ---------------------------------------------------
function _renderPagination(state) {
    const container = document.getElementById('pagination-log');
    if (!container) return;

    if (state.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const { currentPage, totalPages, totalRecords } = state;
    let html = `<div class="pagination">
        <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window._logTesteGoPage(${currentPage - 1})">
            <i class="ph ph-caret-left"></i>
        </button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="pagination-page ${i === currentPage ? 'active' : ''}" onclick="window._logTesteGoPage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="pagination-dots">...</span>`;
        }
    }

    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window._logTesteGoPage(${currentPage + 1})">
            <i class="ph ph-caret-right"></i>
        </button>
    </div>
    <div class="pagination-info">Página ${currentPage} de ${totalPages} (${totalRecords} casos)</div>`;
    container.innerHTML = html;
}

// ─── Atualizar summary header com dados reais -------------------------------
function _updateSummary(runs) {
    const totalCases   = runs.reduce((s, r) => s + (r.total_tests || 0), 0);
    const totalPassed  = runs.reduce((s, r) => s + (r.passed_tests || 0), 0);
    const totalFailed  = runs.reduce((s, r) => s + (r.failed_tests || 0), 0);
    const lastRun = runs[0];
    const lastDate = lastRun ? _formatDate(lastRun.triggered_at) : 'Nunca';
    const lastTime = lastRun ? _formatDate(lastRun.triggered_at) + ' ' + _formatTime(lastRun.triggered_at) : '';
    const totalMs  = runs.reduce((s, r) => s + (r.duration_ms || 0), 0);

    // Header de última execução
    const headerEl = document.getElementById('log-testes-last-run');
    if (headerEl) {
        headerEl.innerHTML = lastRun
            ? `Última execução: <strong>${lastDate}</strong> — <span style="color:${totalFailed > 0 ? '#ef4444' : '#10b981'}; font-weight:600;">
                ${totalPassed}/${totalCases} passando ${totalFailed > 0 ? '✗' : '✓'}
               </span>`
            : 'Nenhuma execução disponível. Execute <code>npm run test:report</code> para registrar.';
    }

    // Badges de resumo
    const badgesEl = document.getElementById('log-testes-badges');
    if (badgesEl) {
        badgesEl.innerHTML = `
            <span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);font-size:0.8rem;">
                <i class="ph ph-check-circle"></i> ${totalPassed} Passou
            </span>
            <span class="badge" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2);font-size:0.8rem;">
                <i class="ph ph-x-circle"></i> ${totalFailed} Falhou
            </span>
            <span class="badge" style="background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.2);font-size:0.8rem;">
                <i class="ph ph-clock"></i> ${_formatDuration(totalMs)}
            </span>
            <span class="badge" style="background:rgba(91,82,246,0.1);color:#5b52f6;border:1px solid rgba(91,82,246,0.2);font-size:0.8rem;">
                <i class="ph ph-stack"></i> ${runs.length} execuções
            </span>`;
    }
}

// ─── Indicador de agendamento no botão ─────────────────────────────────────
async function _updateScheduleButtonStatus() {
    const $badge    = document.getElementById('sched-btn-active-badge');
    const $nextTime = document.getElementById('sched-btn-next-time');
    const $btn      = document.getElementById('btn-log-agendamento');
    if (!$badge || !$nextTime) return;

    try {
        const res = await fetch('/api/test-schedule');
        if (!res.ok) return;
        const data = await res.json();
        const scheduler = data.scheduler;
        const config    = data.config;

        // Ativo = enabled no banco, independente do _currentTask em memória
        const isEnabled  = !!config?.enabled;
        const isScheduled = config?.frequency && config.frequency !== 'manual';
        const active = isEnabled;

        if (active && scheduler?.nextRun && isScheduled) {
            // Caso 1: enabled + frequência automática → mostra próxima execução
            const d = new Date(scheduler.nextRun);
            const fmt = d.toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
            $nextTime.textContent = fmt;
            $badge.style.display = 'inline-flex';
            if ($btn) {
                $btn.style.color = '#10b981';
                $btn.title = `Agendamento ativo — próxima execução: ${fmt}`;
            }
        } else if (active) {
            // Caso 2: enabled mas frequência manual → mostra indicador sem horário
            $nextTime.textContent = 'Ativo';
            $badge.style.display = 'inline-flex';
            if ($btn) {
                $btn.style.color = '#10b981';
                $btn.title = 'Agendamento ativo';
            }
        } else {
            // Caso 3: desabilitado
            $badge.style.display = 'none';
            if ($btn) {
                $btn.style.color = '';
                $btn.title = 'Configurar agendamento de testes';
            }
        }
    } catch (_) {
        // silencia erros — não critica o botão se a API estiver offline
    }
}

// ─── Popular filtros de coluna (popovers) -----------------------------------
function _buildFilterPopovers() {
    if (!_manager) return;

    const tipoValues   = _manager.getUniqueValues('tipo');
    const moduloValues = _manager.getUniqueValues('modulo');
    const statusValues = ['PASSOU', 'FALHOU', 'ERRO', 'SKIPADO'];

    _buildSelectPopover('filter-popover-tipo',     tipoValues,   'tipo');
    _buildSelectPopover('filter-popover-modulo',   moduloValues, 'modulo');
    _buildSelectPopover('filter-popover-status',   statusValues, 'status');
    _buildTextSearchPopover('filter-popover-hora',       'hora');
    _buildTextSearchPopover('filter-popover-descricao',  'descricao');
    _buildDurationPopover('filter-popover-duracao',      'duracao');
    _buildDatePopover('filter-popover-data',             'data');
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
                <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> Cresc.
                </button>
                <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Decresc.
                </button>
            </div>
        </div>
        <div class="filter-group">
            <span class="filter-label">Filtrar Valores</span>
            <div class="filter-list">
                <div class="filter-option ${!current ? 'selected' : ''}" onclick="window._logTesteFilter('${filterKey}', '', event)">
                    (Tudo)
                </div>
                ${values.map(v => `
                    <div class="filter-option ${current === v ? 'selected' : ''}" onclick="window._logTesteFilter('${filterKey}', '${v}', event)">
                        ${v}
                    </div>`).join('')}
            </div>
        </div>
        <div class="filter-actions">
            <button class="btn-clear-filter" onclick="window._logTesteFilter('${filterKey}', '', event)">
                <i class="ph ph-trash"></i> Limpar Filtro
            </button>
        </div>`;
}

function _buildTextSearchPopover(id, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;

    const current    = _manager?.filters[filterKey] || '';
    const currentDir = _manager?.sort.key === filterKey ? _manager.sort.dir : 'none';

    el.innerHTML = `
        <div class="filter-group">
            <span class="filter-label">Ordenar</span>
            <div class="sort-buttons">
                <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> A→Z
                </button>
                <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Z→A
                </button>
            </div>
        </div>
        <div class="filter-group">
            <span class="filter-label">Buscar texto</span>
            <input type="text" id="log-text-filter-${filterKey}" class="filter-search"
                placeholder="Filtrar por texto..." value="${_escapeHtml(current)}"
                oninput="window._logTesteTextFilter('${filterKey}', this.value)">
        </div>
        <div class="filter-actions">
            <button class="btn-clear-filter" onclick="window._logTesteFilter('${filterKey}', '', event)">
                <i class="ph ph-trash"></i> Limpar Filtro
            </button>
        </div>`;
}

function _buildDurationPopover(id, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;

    const currentDir    = _manager?.sort.key === filterKey ? _manager.sort.dir : 'none';
    const currentFilter = _manager?.filters[filterKey];

    // Faixas de duração em ms (exibidas em segundos para o usuário)
    const buckets = [
        { label: '< 1s',    min: null, max: 1000 },
        { label: '1s – 5s', min: 1000, max: 5000 },
        { label: '5s – 30s',min: 5000, max: 30000 },
        { label: '> 30s',   min: 30000, max: null },
    ];

    const isActive = (b) => {
        if (!currentFilter || typeof currentFilter !== 'object') return false;
        return currentFilter.min === b.min && currentFilter.max === b.max;
    };

    el.innerHTML = `
        <div class="filter-group">
            <span class="filter-label">Ordenar</span>
            <div class="sort-buttons">
                <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> Cresc.
                </button>
                <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Decresc.
                </button>
            </div>
        </div>
        <div class="filter-group">
            <span class="filter-label">Faixa de Duração</span>
            <div class="filter-list">
                <div class="filter-option ${!currentFilter ? 'selected' : ''}"
                    onclick="window._logTesteFilter('${filterKey}', '', event)">
                    (Tudo)
                </div>
                ${buckets.map(b => `
                    <div class="filter-option ${isActive(b) ? 'selected' : ''}"
                        onclick="window._logTesteRangeBucket('${filterKey}', ${b.min}, ${b.max}, event)">
                        ${b.label}
                    </div>`).join('')}
            </div>
        </div>
        <div class="filter-actions">
            <button class="btn-clear-filter" onclick="window._logTesteFilter('${filterKey}', '', event)">
                <i class="ph ph-trash"></i> Limpar Filtro
            </button>
        </div>`;
}

function _buildDatePopover(id, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;

    const currentDir = _manager?.sort.key === filterKey ? _manager.sort.dir : 'none';

    el.innerHTML = `
        <div class="filter-group">
            <span class="filter-label">Ordenar</span>
            <div class="sort-buttons">
                <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> Cresc.
                </button>
                <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Decresc.
                </button>
            </div>
        </div>
        <div class="filter-group" style="min-width:200px;">
            <span class="filter-label">Intervalo de Datas</span>
            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:0.35rem;">De:</label>
            <input type="date" id="log-date-from" class="input-control" style="width:100%; margin-bottom:0.5rem; font-size:0.8rem; padding:0.35rem 0.5rem;">
            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:0.35rem;">Até:</label>
            <input type="date" id="log-date-to" class="input-control" style="width:100%; margin-bottom:0.75rem; font-size:0.8rem; padding:0.35rem 0.5rem;">
        </div>
        <div class="filter-actions">
            <button class="btn-apply-filter" onclick="window._logTesteDateRange(event)">
                <i class="ph ph-check"></i> Aplicar
            </button>
            <button class="btn-clear-filter" onclick="window._logTesteFilter('${filterKey}', '', event)">
                <i class="ph ph-trash"></i> Limpar
            </button>
        </div>`;
}

// ─── Helper anti-XSS --------------------------------------------------------
function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── API pública do módulo ---------------------------------------------------

/**
 * Inicializa o módulo — busca dados e monta a tabela.
 * Chamado ao navegar para a view "Log Testes".
 */
export async function initLogTestes() {
    if (_initialized) {
        // Já inicializado — apenas refresca
        return refreshLogTestes();
    }

    _exposeGlobals();
    await refreshLogTestes();
    _initTestLogsTooltips();
    _initialized = true;
}

/**
 * Busca dados frescos da API e atualiza a tabela.
 */
export async function refreshLogTestes() {
    const tbody = document.getElementById('log-testes-body');
    if (!tbody) return;

    // Loading state
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted);">
                <i class="ph ph-spinner" style="font-size:2rem; display:block; margin-bottom:0.5rem; animation: spin 1s linear infinite;"></i>
                Carregando histórico de testes...
            </td>
        </tr>`;

    try {
        const resp = await fetch('/api/test-runs?limit=100');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const runs = await resp.json();

        _allCases = _flattenRuns(runs);
        _updateSummary(runs);

        // Monta ou atualiza o TableManager 2.0
        if (!_manager) {
            _manager = new TableManager({
                data:       _allCases,
                columns:    LOG_COLUMNS,
                pageSize:   25,
                tableId:    null, // sem auto-update de headers (fazemos manual)
                renderRows: _renderRows,
                renderPagination: _renderPagination,
                renderFilters: _renderActiveFilters,
            });
        } else {
            _manager.setData(_allCases);
        }

        _buildFilterPopovers();

        // Atualiza o indicador de agendamento ativo no botão (não bloqueia)
        await _updateScheduleButtonStatus();

        // ── Permissões de Visualização de Testes ─────────────────────────────
        const podeTestar = window.__usuarioAtual && window.__usuarioAtual.user_type === 'master';
        ['btn-log-agendamento', 'btn-log-run-now'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                if (!podeTestar) {
                    btn.disabled = true;
                    btn.style.opacity = '0.6';
                    btn.style.cursor = 'not-allowed';
                    btn.style.pointerEvents = 'auto'; // allow hover for tooltip
                    btn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); };
                    btn.setAttribute('data-th-title', 'MODO SOMENTE LEITURA');
                    btn.setAttribute('data-th-tooltip', 'Você tem permissão apenas para visualizar o histórico de execuções.');
                    btn.removeAttribute('title'); // impede tooltip nativo conflitar
                }
            }
        });

    } catch (err) {
        console.error('[log-testes] Erro ao carregar dados:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3rem; color:#ef4444;">
                    <i class="ph ph-warning-circle" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
                    Não foi possível carregar os dados de testes.<br>
                    <small style="color:var(--text-muted);">${err.message}</small><br><br>
                    <span style="font-size:0.8rem; color:var(--text-muted);">
                        Para popular o LOG, execute: <code>npm run test:report</code>
                    </span>
                </td>
            </tr>`;
    }
}

/**
 * Busca global — chamada pelo input de pesquisa no HTML.
 */
export function handleLogSearch(query) {
    if (!_manager) return;

    const clearBtn = document.getElementById('btn-clear-log-filters');
    if (clearBtn) clearBtn.style.display = query ? 'inline-flex' : 'none';

    _manager.setSearch(query);
}

export function handleLogSort(key) {
    if (!_manager) return;
    _manager.setSort(key);
}

/**
 * Filtros ativos (barrinha de chips)
 */
function _renderActiveFilters(activeFilters, search) {
    const bar = document.getElementById('test-log-active-chips');
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

    (activeFilters || []).forEach(f => {
        let displayValue = String(f.value);
        if (typeof f.value === 'object' && f.value !== null) {
            if (f.value.min !== undefined && f.value.max !== undefined) {
                 if (f.value.min === null) displayValue = `< ${f.value.max/1000}s`;
                 else if (f.value.max === null) displayValue = `> ${f.value.min/1000}s`;
                 else displayValue = `${f.value.min/1000}s – ${f.value.max/1000}s`;
            }
        }
        
        chips.push(`
            <span class="filter-chip">
                ${_escapeHtml(f.label)}: <strong>${_escapeHtml(displayValue)}</strong>
                <button class="chip-remove" data-remove-tm-filter="${_escapeHtml(f.key)}" title="Remover filtro">
                    <i class="ph ph-x"></i>
                </button>
            </span>`);
    });

    if (chips.length > 0) {
        bar.innerHTML = chips.join('');
        bar.style.display = 'flex';
    } else {
        bar.innerHTML = '';
        bar.style.display = 'none';
    }

    bar.querySelectorAll('[data-remove-tm-search]').forEach(btn => {
        btn.addEventListener('click', () => {
             const el = document.getElementById('log-search-global');
             if(el) el.value = '';
             if (_manager) _manager.setSearch(''); 
        });
    });

    bar.querySelectorAll('[data-remove-tm-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (_manager) {
                _manager.setFilter(btn.dataset.removeTmFilter, null);
                const th = document.querySelector(`#log-testes-table th[data-key="${btn.dataset.removeTmFilter}"]`);
                if (th) {
                    const btnF = th.querySelector('.btn-filter-column');
                    if (btnF) btnF.classList.remove('active');
                }
            }
        });
    });
}

/**
 * Limpa filtros e busca.
 */
export function clearLogFilters() {
    if (!_manager) return;
    _manager.clearFilters();
    _manager.setSearch('');

    const searchInput = document.getElementById('log-search-global');
    if (searchInput) searchInput.value = '';

    const clearBtn = document.getElementById('btn-clear-log-filters');
    if (clearBtn) clearBtn.style.display = 'none';
    
    document.querySelectorAll('#log-testes-table .btn-filter-column').forEach(btn => btn.classList.remove('active'));
}

// ─── Expõe globais para uso no HTML inline (onclick="...") ------------------
function _exposeGlobals() {
    window._logTesteGoPage = (page) => _manager?.goToPage(page);

    // Abre/fecha o popover de filtro de coluna
    window._logTesteToggleFilter = (filterKey, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;

        const popoverId = `filter-popover-${filterKey}`;
        let popover = document.getElementById(popoverId);

        // Se o elemento não existir no DOM (cache do navegador sem a versão nova do HTML),
        // cria dinamicamente e anexa ao <th> correto
        if (!popover) {
            const th = document.querySelector(`#log-testes-table th[data-key="${filterKey}"]`);
            if (!th) return;
            popover = document.createElement('div');
            popover.id = popoverId;
            popover.className = 'filter-popover';
            th.appendChild(popover);
        }

        // Fecha todos os outros popovers
        document.querySelectorAll('.filter-popover').forEach(p => {
            if (p !== popover) p.classList.remove('show');
        });

        const isOpen = popover.classList.contains('show');
        if (isOpen) {
            popover.classList.remove('show');
        } else {
            // Re-renderiza o conteúdo do popover antes de abrir
            _buildFilterPopovers();
            popover.classList.add('show');

            // Smart positioning: detecta limites da tela
            popover.classList.remove('align-right');
            popover.style.bottom = 'auto';
            popover.style.top = '100%';

            const rect = popover.getBoundingClientRect();
            if (rect.right > window.innerWidth - 20) {
                popover.classList.add('align-right');
            }
            if (rect.bottom > window.innerHeight - 20) {
                popover.style.top = 'auto';
                popover.style.bottom = '100%';
            }
        }
    };


    // Aplica sort explícito via popover
    window._logTesteSort = (key, dir, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;
        _manager.setSortExplicit(key, dir);
        _buildFilterPopovers();
        document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
    };

    window._logTesteFilter = (key, value, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;
        _manager.setFilter(key, value || null);
        _buildFilterPopovers();

        // Atualiza o indicador visual do botão de filtro ativo
        const th = document.querySelector(`#log-testes-table th[data-key="${key}"]`);
        if (th) {
            const btn = th.querySelector('.btn-filter-column');
            if (btn) btn.classList.toggle('active', !!value);
        }

        // Atualiza botão "limpar filtros"
        const activeFilters = _manager.getActiveFilters();
        const clearBtn = document.getElementById('btn-clear-log-filters');
        if (clearBtn) clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';

        // Fecha o popover
        document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
    };

    // Filtro de texto livre (não fecha o popover ao digitar)
    window._logTesteTextFilter = (key, value) => {
        if (!_manager) return;
        _manager.setFilter(key, value || null);

        // Atualiza indicador visual do botão
        const th = document.querySelector(`#log-testes-table th[data-key="${key}"]`);
        if (th) {
            const btn = th.querySelector('.btn-filter-column');
            if (btn) btn.classList.toggle('active', !!value);
        }

        // Atualiza botão "limpar filtros"
        const activeFilters = _manager.getActiveFilters();
        const clearBtn = document.getElementById('btn-clear-log-filters');
        if (clearBtn) clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';
        // Não fecha o popover — usuário está digitando
    };

    // Filtro de range numérico (Duração)
    window._logTesteRangeFilter = (key, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;

        const minEl = document.getElementById(`log-range-min-${key}`);
        const maxEl = document.getElementById(`log-range-max-${key}`);
        const min   = minEl?.value !== '' ? parseFloat(minEl.value) : null;
        const max   = maxEl?.value !== '' ? parseFloat(maxEl.value) : null;

        if (min === null && max === null) {
            _manager.setFilter(key, null);
        } else {
            _manager.setFilter(key, { min, max });
        }

        _buildFilterPopovers();

        // Atualiza indicador visual
        const th = document.querySelector(`#log-testes-table th[data-key="${key}"]`);
        if (th) {
            const btn = th.querySelector('.btn-filter-column');
            const hasFilter = min !== null || max !== null;
            if (btn) btn.classList.toggle('active', hasFilter);
        }

        const activeFilters = _manager.getActiveFilters();
        const clearBtn = document.getElementById('btn-clear-log-filters');
        if (clearBtn) clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';

        document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
    };


    // Aplica faixa de duração predefinida (ex: < 1s, 1-5s)
    window._logTesteRangeBucket = (key, min, max, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;

        const filterVal = (min === null && max === null) ? null : { min, max };
        _manager.setFilter(key, filterVal);
        _buildFilterPopovers();

        const th = document.querySelector(`#log-testes-table th[data-key="${key}"]`);
        if (th) {
            const btn = th.querySelector('.btn-filter-column');
            if (btn) btn.classList.toggle('active', filterVal !== null);
        }

        const activeFilters = _manager.getActiveFilters();
        const clearBtn = document.getElementById('btn-clear-log-filters');
        if (clearBtn) clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';

        document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
    };

    window._logTesteDateRange = (event) => {
        if (event) event.stopPropagation();
        const from = document.getElementById('log-date-from')?.value;
        const to   = document.getElementById('log-date-to')?.value;
        if (!from && !to) return window._logTesteFilter('data', null);

        // Converte YYYY-MM-DD para DD/MM/YYYY (formato interno do TableManager)
        const fmt = (s) => s ? s.split('-').reverse().join('/') : null;
        const range = from && to ? `${fmt(from)} a ${fmt(to)}` : fmt(from || to);
        window._logTesteFilter('data', range);
    };

    window._logTesteToggleDetail = (detailsId) => {
        const row = document.getElementById(detailsId);
        if (!row) return;
        const isOpen = row.style.display !== 'none';
        row.style.display = isOpen ? 'none' : 'table-row';

        // Anima o caret
        const mainRow = row.previousElementSibling;
        const caret = mainRow?.querySelector('.ph-caret-down');
        if (caret) caret.style.transform = isOpen ? '' : 'rotate(180deg)';
    };

    // Fecha popovers ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-popover') && !e.target.closest('.btn-filter-column')) {
            document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
        }
    }, { capture: false });
}

// ══════════════════════════════════════════════════════════════════════════════
// VTT ANIMATED TOOLTIPS (Test Logs)
// ══════════════════════════════════════════════════════════════════════════════

function _initTestLogsTooltips() {
    const W=300, H=169;
    function init(el){ const DPR=window.devicePixelRatio||1; el.width=W*DPR; el.height=H*DPR; el.style.width=W+'px'; el.style.height=H+'px'; const ctx=el.getContext('2d'); ctx.scale(DPR,DPR); return ctx; }
    function prog(f,s,e){ return Math.max(0,Math.min(1,(f-s)/(e-s)||0)); }
    function lerp(a,b,t){ return a+(b-a)*t; }

    function drawCursor(ctx,x,y,pressing=false){
        ctx.save(); ctx.translate(x,y); ctx.scale(0.8,0.8);
        ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=2; ctx.shadowOffsetX=1; ctx.shadowOffsetY=1;
        ctx.fillStyle=pressing?'#e2e8f0':'#ffffff'; ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,11); ctx.lineTo(2.4,8.6); ctx.lineTo(4,12.4); ctx.lineTo(5.6,11.7); ctx.lineTo(4.1,7.9); ctx.lineTo(6.8,7.9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }

    const anims = {
        'tl-data': function(ctx,f) {
            ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
            const cx = W/2, cy = H/2+10;
            // Calendar icon
            const s = 1 + Math.sin(prog(f,20,80)*Math.PI)*0.1;
            ctx.save(); ctx.translate(cx, cy); ctx.scale(s,s);
            ctx.fillStyle='#1e293b'; ctx.beginPath(); ctx.roundRect(-40,-30,80,70,8); ctx.fill();
            ctx.fillStyle='#ef4444'; ctx.beginPath(); ctx.roundRect(-40,-30,80,20,8); ctx.fill();
            ctx.fillStyle='#cbd5e1'; ctx.fillRect(-40,-15,80,55); ctx.roundRect(-40,-15,80,55,8); ctx.fill();
            // Grid
            ctx.fillStyle='#94a3b8';
            for(let i=0;i<3;i++) {
                for(let j=0;j<4;j++) {
                    if (i===1 && j===2) ctx.fillStyle='#3b82f6';
                    else ctx.fillStyle='#94a3b8';
                    ctx.beginPath(); ctx.roundRect(-30+j*18, -5+i*16, 12,12,3); ctx.fill();
                }
            }
            ctx.restore();
            // Checking dates
            if(f>100) {
                const a = prog(f,100,160);
                ctx.globalAlpha = Math.sin(a*Math.PI);
                ctx.fillStyle='#3b82f6'; ctx.beginPath(); ctx.arc(cx-30+2*18+6, cy-5+1*16+6, 14+a*10, 0, Math.PI*2); ctx.fill();
                ctx.globalAlpha = 1;
            }
        },
        'tl-hora': function(ctx,f) {
            ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
            const cx=W/2, cy=H/2+10;
            ctx.fillStyle='#1e293b'; ctx.beginPath(); ctx.arc(cx,cy,50,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle='#334155'; ctx.lineWidth=4; ctx.stroke();
            
            // Ticks
            ctx.fillStyle='#64748b';
            for(let i=0;i<12;i++){
                ctx.save(); ctx.translate(cx,cy); ctx.rotate((i*30)*Math.PI/180);
                ctx.fillRect(-2,-40,4,8);
                ctx.restore();
            }
            
            // Hands
            const minutesProgress = (f%180)/180;
            const hoursProgress = minutesProgress/12;
            
            ctx.save(); ctx.translate(cx,cy); ctx.rotate(hoursProgress*Math.PI*2 - Math.PI/2);
            ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=6; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(25,0); ctx.stroke();
            ctx.restore();
            
            ctx.save(); ctx.translate(cx,cy); ctx.rotate(minutesProgress*Math.PI*2 - Math.PI/2);
            ctx.strokeStyle='#94a3b8'; ctx.lineWidth=4; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(35,0); ctx.stroke();
            ctx.restore();
            
            ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fill();
        },
        'tl-tipo': function(ctx,f) {
            ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
            const cx=W/2, cy=H/2+10;
            const p = prog(f, 20, 140);
            
            // Target
            ctx.save(); ctx.translate(cx,cy);
            ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=2;
            ctx.beginPath(); ctx.arc(0,0,50,0,Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0,0,30,0,Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.stroke();
            
            // E2E Path
            if (f>20) {
                ctx.strokeStyle='#10b981'; ctx.lineWidth=3; ctx.lineCap='round';
                ctx.beginPath(); 
                ctx.moveTo(-60, 40);
                const x1 = lerp(-60, -20, Math.min(1, p*3));
                const y1 = lerp(40, -30, Math.min(1, p*3));
                ctx.lineTo(x1, y1);
                
                if (p > 0.33) {
                    const x2 = lerp(-20, 20, Math.min(1, (p-0.33)*3));
                    const y2 = lerp(-30, 20, Math.min(1, (p-0.33)*3));
                    ctx.lineTo(x2, y2);
                }
                
                if (p > 0.66) {
                    const x3 = lerp(20, 50, Math.min(1, (p-0.66)*3));
                    const y3 = lerp(20, -10, Math.min(1, (p-0.66)*3));
                    ctx.lineTo(x3, y3);
                    // Hit!
                    if(p > 0.9) {
                        ctx.fillStyle='#10b981'; ctx.beginPath(); ctx.arc(x3,y3,6 + Math.sin(f)*2,0,Math.PI*2); ctx.fill();
                    }
                }
                ctx.stroke();
            }
            ctx.restore();
        },
        'tl-modulo': function(ctx,f) {
            ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
            const cx=W/2, cy=H/2+10;
            // Draw blocks connecting
            const blocks = [ {x:-50, y:-30}, {x:50, y:-30}, {x:0, y:20} ];
            
            ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=2;
            if(f>40) { ctx.beginPath(); ctx.moveTo(cx+blocks[0].x, cy+blocks[0].y); ctx.lineTo(cx+blocks[2].x, cy+blocks[2].y); ctx.stroke(); }
            if(f>60) { ctx.beginPath(); ctx.moveTo(cx+blocks[1].x, cy+blocks[1].y); ctx.lineTo(cx+blocks[2].x, cy+blocks[2].y); ctx.stroke(); }
            
            blocks.forEach((b, i) => {
                const s = f > i*20+20 ? 1 : 0;
                if(!s) return;
                
                const hover = (i===2 && f>100 && f<160);
                const a = hover ? Math.sin((f-100)*Math.PI/60) : 0;
                
                ctx.save(); ctx.translate(cx+b.x, cy+b.y - a*10);
                if(hover) { ctx.shadowColor='#6366f1'; ctx.shadowBlur=15; }
                
                ctx.fillStyle='#1e293b'; ctx.beginPath(); ctx.roundRect(-25, -20, 50, 40, 6); ctx.fill();
                ctx.strokeStyle=hover?'#6366f1':'#334155'; ctx.lineWidth=2; ctx.stroke();
                
                // Tech decor
                ctx.fillStyle=hover?'#6366f1':'#cbd5e1';
                ctx.fillRect(-15, -10, 30, 4);
                ctx.fillRect(-15, 0, 20, 4);
                ctx.restore();
            });
            
            if(f>100 && f<160) {
                drawCursor(ctx, cx, cy+20 - Math.sin((f-100)*Math.PI/60)*10, true);
            } else if(f<100) {
                drawCursor(ctx, lerp(W, cx, prog(f,80,100)), lerp(H, cy+20, prog(f,80,100)));
            } else {
                drawCursor(ctx, lerp(cx, W, prog(f,160,180)), lerp(cy+20, H, prog(f,160,180)));
            }
        },
        'tl-descricao': function(ctx,f) {
            ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
            
            ctx.fillStyle='#141824'; ctx.beginPath(); ctx.roundRect(20, 30, W-40, H-50, 6); ctx.fill();
            ctx.fillStyle='#1e293b'; ctx.fillRect(20, 30, W-40, 20); // Header
            
            const lines = [
                {w: 180, c: '#cbd5e1'},
                {w: 140, c: '#94a3b8'},
                {w: 200, c: '#94a3b8'},
                {w: 160, c: '#10b981'}, // Success line
            ];
            
            lines.forEach((l, i) => {
                if (f > 40 + i*20) {
                    const pw = Math.min(l.w, prog(f, 40+i*20, 80+i*20)*l.w);
                    ctx.fillStyle = l.c;
                    ctx.fillRect(40, 65+i*16, pw, 6);
                }
            });
            
            // Scanner effect
            if (f > 40 && f < 180) {
                const sy = lerp(60, 140, prog(f, 40, 180));
                ctx.fillStyle = 'rgba(99,102,241,0.2)';
                ctx.fillRect(20, sy, W-40, 20);
                ctx.fillStyle = 'rgba(99,102,241,0.8)';
                ctx.fillRect(20, sy, W-40, 2);
            }
        },
        'tl-status': function(ctx,f) {
            ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
            const cx=W/2, cy=H/2+10;
            
            const isSuccess = f % 240 < 120;
            const pf = isSuccess ? f % 240 : (f % 240) - 120;
            const p = prog(pf, 20, 60);
            
            ctx.save(); ctx.translate(cx, cy);
            
            // Circle
            ctx.strokeStyle = isSuccess ? '#10b981' : '#ef4444';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, Math.PI * 2 * p);
            ctx.stroke();
            
            // Icon
            if(pf > 60) {
                ctx.fillStyle = isSuccess ? '#10b981' : '#ef4444';
                const s = 1 + Math.sin(prog(pf,60,100)*Math.PI)*0.2;
                ctx.scale(s,s);
                if (isSuccess) { // Check
                    ctx.beginPath(); ctx.moveTo(-10,2); ctx.lineTo(-2,10); ctx.lineTo(15,-8); 
                    ctx.lineTo(10,-12); ctx.lineTo(-2,2); ctx.lineTo(-6,-2); ctx.fill();
                } else { // X
                    ctx.beginPath(); ctx.moveTo(-10,-10); ctx.lineTo(10,10); ctx.moveTo(10,-10); ctx.lineTo(-10,10); 
                    ctx.strokeStyle='#ef4444'; ctx.lineWidth=6; ctx.stroke();
                }
            }
            ctx.restore();
        },
        'tl-duracao': function(ctx,f) {
            ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
            
            const bars = [20, 35, 25, 60, 30, 80]; // ms simulations
            const maxH = 80;
            const w = 24;
            const gap = 12;
            const startX = (W - (bars.length * (w + gap) - gap)) / 2;
            const cy = H/2 + 40;
            
            bars.forEach((b, i) => {
                if (f > i*15) {
                    const hp = prog(f, i*15, i*15+30);
                    const h = hp * b;
                    
                    // Color based on height (duration)
                    ctx.fillStyle = b > 50 ? '#ef4444' : (b > 30 ? '#f59e0b' : '#10b981');
                    ctx.beginPath(); ctx.roundRect(startX + i*(w+gap), cy - h, w, h, [3,3,0,0]); ctx.fill();
                    
                    // Highlight the slow one
                    if (b > 50 && hp === 1 && f % 60 < 30) {
                         ctx.fillStyle='rgba(239,68,68,0.2)';
                         ctx.beginPath(); ctx.roundRect(startX + i*(w+gap)-4, cy - h - 4, w+8, h+8, 4); ctx.fill();
                    }
                }
            });
            
            // Average line
            if (f > bars.length*15 + 20) {
                const lh = prog(f, bars.length*15+20, bars.length*15+60);
                ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
                ctx.beginPath(); ctx.moveTo(startX-10, cy-35); ctx.lineTo(startX-10 + lh*(W-startX*2+20), cy-35); ctx.stroke();
                ctx.setLineDash([]);
            }
        },
        'tl-agendamento': function(ctx,f) {
            ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
            const cx=W/2, cy=H/2+5;
            
            // Loop path
            ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=4;
            ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI*2); ctx.stroke();
            
            // Moving dots
            for(let i=0; i<3; i++) {
                const a = ((f + i*60) % 180) / 180 * Math.PI*2;
                const x = cx + Math.cos(a)*40;
                const y = cy + Math.sin(a)*40;
                
                ctx.fillStyle='#10b981';
                ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill();
                ctx.shadowColor='#10b981'; ctx.shadowBlur=10; ctx.fill(); ctx.shadowBlur=0;
                
                // execution bursts
                if (a > Math.PI*1.5 && a < Math.PI*1.6) {
                    ctx.strokeStyle='#10b981'; ctx.lineWidth=2;
                    ctx.beginPath(); ctx.arc(cx,cy,40 + Math.sin(f)*10,0,Math.PI*2); ctx.stroke();
                }
            }
            
            // Clock center
            ctx.fillStyle='#1e293b'; ctx.beginPath(); ctx.arc(cx,cy,20,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy-10); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+8,cy+5); ctx.stroke();
        },
        'tl-rodar': function(ctx,f) {
            ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
            const cx=W/2, cy=H/2+10;
            
            // Button
            const pressing = f>60 && f<80;
            const bs = pressing ? 0.95 : 1;
            
            ctx.save(); ctx.translate(cx,cy); ctx.scale(bs,bs);
            ctx.shadowColor='rgba(16,185,129,0.4)'; ctx.shadowBlur=pressing?5:15; ctx.shadowOffsetY=pressing?2:5;
            ctx.fillStyle='#10b981'; ctx.beginPath(); ctx.roundRect(-50,-20,100,40,8); ctx.fill();
            ctx.shadowBlur=0; ctx.shadowOffsetY=0;
            
            ctx.fillStyle='#fff';
            ctx.beginPath(); ctx.moveTo(-10,-8); ctx.lineTo(15,0); ctx.lineTo(-10,8); ctx.fill(); // Play icon
            ctx.restore();
            
            // Cursor
            let cursX=cx+60, cursY=cy+40;
            if (f<40) cursX = lerp(W, cx+10, prog(f,0,40));
            if (f<40) cursY = lerp(H, cy+10, prog(f,0,40));
            else if (f<100) { cursX=cx+10; cursY=cy+10; }
            else { cursX = lerp(cx+10, W, prog(f,100,140)); cursY = lerp(cy+10, H, prog(f,100,140)); }
            
            if (f<140) drawCursor(ctx, cursX, cursY, pressing);
            
            // Ripples
            if (f > 70 && f < 130) {
                const rp = prog(f, 70, 130);
                ctx.strokeStyle=`rgba(16,185,129,${1-rp})`; ctx.lineWidth=2;
                ctx.beginPath(); ctx.roundRect(cx-50-rp*20, cy-20-rp*10, 100+rp*40, 40+rp*20, 12); ctx.stroke();
            }
        }
    };

    function setup(id, durationFrames) {
        const wrap = document.getElementById(`vcw-${id}`);
        const tooltip = document.getElementById(`vct-${id}`);
        const canvas = document.getElementById(`vcc-${id}`);
        const ctaTime = document.getElementById(`vctm-${id}`);
        if(!wrap || !tooltip || !canvas) return;

        const ctx = init(canvas);
        let animId=null, frame=0, visible=false;
        
        function draw(){ if(anims[id]) anims[id](ctx,frame); }
        function tick(){ draw(); frame=(frame+1)%durationFrames; if (ctaTime) ctaTime.innerHTML=`0:${String(Math.floor(frame/60)).padStart(2,'0')}`; animId=requestAnimationFrame(tick); }
        
        wrap.addEventListener('mouseenter', () => {
            if(visible) return; visible=true;
            document.querySelectorAll('.vtt-tooltip.vtt-visible').forEach(t=>t.classList.remove('vtt-visible'));
            tooltip.classList.add('vtt-visible'); frame=0; if(animId)cancelAnimationFrame(animId); animId=requestAnimationFrame(tick);
        });
        wrap.addEventListener('mouseleave', (e) => {
            if(!wrap.contains(e.relatedTarget)){ visible=false; tooltip.classList.remove('vtt-visible'); if(animId)cancelAnimationFrame(animId); animId=null; frame=0; draw(); }
        });
        draw();
    }

    setup('tl-data', 180);
    setup('tl-hora', 180);
    setup('tl-tipo', 160);
    setup('tl-modulo', 200);
    setup('tl-descricao', 180);
    setup('tl-status', 240);
    setup('tl-duracao', 180);
    setup('tl-agendamento', 180);
    setup('tl-rodar', 160);
}

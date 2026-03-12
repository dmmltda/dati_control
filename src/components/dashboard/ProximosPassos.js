/**
 * ProximosPassos.js — Painel "Minhas Atividades" do Dashboard ⭐
 * Exibe as atividades reais do usuário logado:
 *   - Atividades criadas em "Minhas Atividades" (com ou sem empresa)
 *   - Atividades criadas diretamente em um cliente
 * Fonte: GET /api/activities?assignee=me (mesma API do módulo tasks-board.js)
 *
 * @param {string} containerId - ID do elemento HTML onde renderizar
 */

import { colors, card } from '../../theme/tokens.js';
import { TableManager } from '../../../js/core/table-manager.js';

// ─── Estado interno do painel ────────────────────────────────────────────────
let _container   = null;
let _tm          = null;
let _activities  = [];

const HOJE = new Date();
HOJE.setHours(0, 0, 0, 0);

// ─── Definição de colunas para o TableManager ────────────────────────────────

const COLUMNS = [
    { key: 'title',          label: 'Atividade',      type: 'string', searchable: true,  sortable: true,  filterable: true },
    { key: 'company_name',   label: 'Empresa',         type: 'string', searchable: true,  sortable: true,  filterable: true },
    { key: 'activity_date',  label: 'Data',            type: 'date',   searchable: false, sortable: true,  filterable: true },
    { key: 'displayStatus',  label: 'Status',          type: 'string', searchable: false, sortable: true,  filterable: true, filterType: 'select' },
    { key: 'status',         label: 'Status Ativ.',    type: 'string', searchable: false, sortable: true,  filterable: true, filterType: 'select' },
];

// ─── IDs dos elementos HTML internos ─────────────────────────────────────────

const IDS = {
    table:        'ma-table',
    tbody:        'ma-tbody',
    search:       'ma-search',
    pagination:   'ma-pagination',
    filters:      'ma-active-filters',
    filterStatus: 'ma-filter-status',
    filterActSt:  'ma-filter-act-status',
    summary:      'ma-summary',
};

// ─── Helpers de data/status ──────────────────────────────────────────────────

function _getDisplayStatus(act) {
    if (act.status === 'Concluída' || act.status === 'Cancelada') return act.status;
    if (!act.activity_datetime) return 'Pendente';
    const d = new Date(act.activity_datetime);
    d.setHours(0, 0, 0, 0);
    if (d < HOJE) return 'Atrasada';
    if (d.getTime() === HOJE.getTime()) return 'Hoje';
    return 'Pendente';
}

function _formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
}

function _diffDias(iso) {
    if (!iso) return Infinity;
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    return Math.round((d - HOJE) / (1000 * 60 * 60 * 24));
}

// ─── Badges & estilos ────────────────────────────────────────────────────────

const DISPLAY_STATUS_BADGE = {
    'Atrasada':  { bg: 'rgba(239,68,68,0.15)',   color: colors.danger,    texto: '🔴 Atrasada' },
    'Hoje':      { bg: 'rgba(245,158,11,0.15)',  color: colors.warning,   texto: '🟡 Hoje' },
    'Pendente':  { bg: 'rgba(100,116,139,0.12)', color: colors.textMuted, texto: '⚪ Pendente' },
    'Concluída': { bg: 'rgba(16,185,129,0.15)',  color: colors.success,   texto: '✅ Concluída' },
    'Cancelada': { bg: 'rgba(239,68,68,0.08)',   color: '#94a3b8',        texto: '⛔ Cancelada' },
};

const ACT_STATUS_BADGE = {
    'A Fazer':       { bg: 'rgba(99,102,241,0.12)',  color: '#818cf8' },
    'Em Andamento': { bg: 'rgba(245,158,11,0.12)',  color: colors.warning },
    'Concluída':    { bg: 'rgba(16,185,129,0.12)',  color: colors.success },
    'Cancelada':    { bg: 'rgba(239,68,68,0.12)',   color: colors.danger },
};

function _renderDisplayStatusBadge(ds) {
    const cfg = DISPLAY_STATUS_BADGE[ds] || { bg: '#eee', color: '#666', texto: ds };
    return `<span style="
        background:${cfg.bg};color:${cfg.color};
        font-size:0.72rem;font-weight:700;
        padding:3px 10px;border-radius:9999px;white-space:nowrap;
    ">${cfg.texto}</span>`;
}

function _renderActStatusBadge(s) {
    if (!s) return '—';
    const cfg = ACT_STATUS_BADGE[s] || { bg: 'rgba(255,255,255,0.05)', color: colors.textMuted };
    return `<span style="
        background:${cfg.bg};color:${cfg.color};
        font-size:0.72rem;font-weight:700;border:1px solid ${cfg.color}44;
        padding:2px 8px;border-radius:9999px;white-space:nowrap;
    ">${s}</span>`;
}

const TYPE_ICON = {
    'Comentário':      { icon: 'ph-chat-text',  color: '#64748b' },
    'Reunião':         { icon: 'ph-video',       color: '#6366f1' },
    'Chamados HD':     { icon: 'ph-headset',     color: '#f59e0b' },
    'Chamados CS':     { icon: 'ph-heartbeat',   color: '#10b981' },
    'Ação necessária': { icon: 'ph-lightning',   color: '#ef4444' },
};

function _rowBorderStyle(ds) {
    const map = {
        'Atrasada':  `border-left:3px solid ${colors.danger}`,
        'Hoje':      `border-left:3px solid ${colors.warning}`,
        'Pendente':  `border-left:3px solid transparent`,
        'Concluída': `border-left:3px solid ${colors.success};opacity:0.55`,
        'Cancelada': `border-left:3px solid #475569;opacity:0.45`,
    };
    return map[ds] || 'border-left:3px solid transparent';
}

// ─── Callbacks do TableManager ────────────────────────────────────────────────

function renderRows(data) {
    const tbody = document.getElementById(IDS.tbody);
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align:center;padding:3rem;color:${colors.textMuted};">
                <div style="font-size:2rem;margin-bottom:0.5rem;">📋</div>
                <p style="font-size:0.875rem;">Nenhuma atividade encontrada para este filtro.</p>
              </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.map(act => {
        const cfg = TYPE_ICON[act.activity_type] || { icon: 'ph-activity', color: '#64748b' };
        const company = act.company_name || '';
        return `
        <tr style="${_rowBorderStyle(act.displayStatus)};border-bottom:1px solid ${colors.border};transition:background 120ms;cursor:pointer;"
            onmouseenter="this.style.background='rgba(255,255,255,0.03)'"
            onmouseleave="this.style.background='transparent'"
            onclick="if(window.tasksBoard) window.tasksBoard.openActivityDetail('${act.id}')">
          <td style="padding:0.75rem 1rem;max-width:220px;">
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <span style="flex-shrink:0;width:22px;height:22px;border-radius:6px;background:${cfg.color}18;
                           display:inline-flex;align-items:center;justify-content:center;">
                <i class="ph ${cfg.icon}" style="color:${cfg.color};font-size:0.75rem;"></i>
              </span>
              <span style="font-weight:600;font-size:0.82rem;color:${colors.textMain};
                           white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                    title="${(act.title||'').replace(/"/g,'&quot;')}">${act.title || '—'}</span>
            </div>
          </td>
          <td style="padding:0.75rem 1rem;font-size:0.79rem;color:${colors.textMuted};max-width:140px;
                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${company}">
            ${company
                ? `<i class="ph ph-building-office" style="font-size:0.72rem;margin-right:3px;"></i>${company}`
                : `<span style="opacity:0.5;font-size:0.75rem;font-style:italic;">Sem empresa</span>`}
          </td>
          <td style="padding:0.75rem 1rem;font-size:0.82rem;color:${colors.textMuted};white-space:nowrap;">
            ${act.activity_date}
          </td>
          <td style="padding:0.75rem 1rem;">${_renderDisplayStatusBadge(act.displayStatus)}</td>
          <td style="padding:0.75rem 1rem;">${_renderActStatusBadge(act.status)}</td>
        </tr>`;
    }).join('');
}

function renderPagination(state) {
    const el = document.getElementById(IDS.pagination);
    if (!el) return;
    if (state.totalPages <= 1) { el.innerHTML = ''; return; }

    const { currentPage: cur, totalPages, totalRecords, pageSize } = state;
    const inicio = ((cur - 1) * pageSize) + 1;
    const fim    = Math.min(cur * pageSize, totalRecords);

    el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:0.75rem 0 0;border-top:1px solid ${colors.border};margin-top:0.5rem;">
          <span style="font-size:0.78rem;color:${colors.textMuted};">
            Exibindo ${inicio}–${fim} de ${totalRecords} resultados
          </span>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <button onclick="window._maTable?.prevPage()"
              ${cur === 1 ? 'disabled' : ''}
              style="padding:0.35rem 0.85rem;border-radius:6px;font-size:0.78rem;
                     border:1px solid ${colors.border};
                     background:${cur === 1 ? colors.bgSurface : colors.bgCard};
                     color:${cur === 1 ? colors.textMuted : colors.textMain};
                     cursor:${cur === 1 ? 'not-allowed' : 'pointer'};font-family:inherit;">← Ant</button>
            <span style="padding:0.35rem 0.85rem;border-radius:6px;font-size:0.78rem;
                         background:${colors.primary};color:white;font-weight:600;">
              ${cur} / ${totalPages}
            </span>
            <button onclick="window._maTable?.nextPage()"
              ${cur === totalPages ? 'disabled' : ''}
              style="padding:0.35rem 0.85rem;border-radius:6px;font-size:0.78rem;
                     border:1px solid ${colors.border};
                     background:${cur === totalPages ? colors.bgSurface : colors.bgCard};
                     color:${cur === totalPages ? colors.textMuted : colors.textMain};
                     cursor:${cur === totalPages ? 'not-allowed' : 'pointer'};font-family:inherit;">Próx →</button>
          </div>
        </div>`;
}

function renderActiveFiltersChips(activeFilters, search) {
    const el = document.getElementById(IDS.filters);
    if (!el) return;
    const chips = [];

    if (search) {
        chips.push(`
            <span style="display:inline-flex;align-items:center;gap:5px;
                         padding:3px 10px;border-radius:9999px;
                         background:rgba(91,82,246,0.15);color:${colors.primary};
                         font-size:0.75rem;font-weight:600;">
              🔍 "${search}"
              <button onclick="window._maTable?.setSearch('');document.getElementById('${IDS.search}').value='';"
                style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;
                       width:16px;height:16px;cursor:pointer;color:inherit;font-size:10px;
                       display:inline-flex;align-items:center;justify-content:center;padding:0;">×</button>
            </span>`);
    }

    activeFilters.forEach(f => {
        chips.push(`
            <span style="display:inline-flex;align-items:center;gap:5px;
                         padding:3px 10px;border-radius:9999px;
                         background:rgba(91,82,246,0.12);color:${colors.primary};
                         font-size:0.75rem;font-weight:600;">
              <strong>${f.label}:</strong> ${f.value}
              <button onclick="window._maTable?.setFilter('${f.key}', null);_maSyncSelectUI();"
                style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;
                       width:16px;height:16px;cursor:pointer;color:inherit;font-size:10px;
                       display:inline-flex;align-items:center;justify-content:center;padding:0;">×</button>
            </span>`);
    });

    el.innerHTML = chips.length
        ? `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem;">${chips.join('')}</div>`
        : '';
}

// ─── Sincroniza selects após limpar chip ──────────────────────────────────────

window._maSyncSelectUI = function () {
    const filters = _tm?.filters || {};
    const elDs = document.getElementById(IDS.filterStatus);
    if (elDs) elDs.value = filters.displayStatus || '';
    const elAs = document.getElementById(IDS.filterActSt);
    if (elAs) elAs.value = filters.status || '';
};

// ─── Resumo rápido ────────────────────────────────────────────────────────────

function renderSummary() {
    const el = document.getElementById(IDS.summary);
    if (!el) return;

    const atrasadas = _activities.filter(a => a.displayStatus === 'Atrasada').length;
    const hoje      = _activities.filter(a => a.displayStatus === 'Hoje').length;
    const semana    = _activities.filter(a => {
        const diff = _diffDias(a.activity_datetime);
        return diff >= 0 && diff <= 7 && a.displayStatus !== 'Concluída' && a.displayStatus !== 'Cancelada';
    }).length;

    const badge = (bg, color, txt) => `
        <span style="display:inline-flex;align-items:center;gap:0.4rem;
                     background:${bg};color:${color};
                     font-size:0.78rem;font-weight:700;
                     padding:5px 12px;border-radius:9999px;border:1px solid ${color}33;
                     cursor:pointer;transition:opacity 0.15s;"
              onmouseenter="this.style.opacity='0.8'"
              onmouseleave="this.style.opacity='1'"
        >
          ${txt}
        </span>`;

    el.innerHTML = `
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.25rem;">
          ${badge('rgba(239,68,68,0.1)',  colors.danger,   `🔴 ${atrasadas} Atrasada${atrasadas !== 1 ? 's' : ''}`)}
          ${badge('rgba(245,158,11,0.1)', colors.warning,  `🟡 ${hoje} Vencem Hoje`)}
          ${badge('rgba(91,82,246,0.1)',  colors.primary,  `📅 ${semana} Esta Semana`)}
        </div>`;
}

// ─── Estrutura HTML do painel ────────────────────────────────────────────────

function buildHTML() {
    const statuses   = [...new Set(_activities.map(a => a.displayStatus))].sort();
    const actStatuses = [...new Set(_activities.map(a => a.status).filter(Boolean))].sort();

    const selectStyle = `
        padding:0.45rem 0.75rem;border-radius:8px;font-size:0.8rem;
        border:1px solid ${colors.border};background:${colors.bgCard};
        color:${colors.textMain};font-family:inherit;cursor:pointer;
    `;

    const thStyle = `
        padding:0.6rem 1rem;text-align:left;
        font-size:0.68rem;font-weight:700;color:${colors.textMuted};
        text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;
        cursor:pointer;user-select:none;
    `;

    return `
        <section style="
            background:${colors.bgCard};
            border-radius:${card.borderRadius};
            box-shadow:${card.boxShadow};
            padding:${card.padding};
            border-top:3px solid ${colors.primary};
        ">
          <!-- Cabeçalho -->
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:1.25rem;">
            <div>
              <h2 style="font-size:1.1rem;font-weight:800;color:${colors.textMain};
                         display:flex;align-items:center;gap:0.6rem;margin:0 0 0.2rem;">
                <span style="background:${colors.primary};color:white;width:28px;height:28px;
                             border-radius:8px;display:inline-flex;align-items:center;
                             justify-content:center;font-size:0.9rem;">
                  <i class="ph ph-activity"></i>
                </span>
                Minhas Atividades
                <span style="background:rgba(91,82,246,0.12);color:${colors.primary};
                             font-size:0.68rem;font-weight:700;padding:2px 8px;
                             border-radius:9999px;letter-spacing:0.05em;">PAINEL CENTRAL</span>
              </h2>
              <p style="font-size:0.8rem;color:${colors.textMuted};margin:0;">
                Atividades atribuídas a você — criadas aqui ou vinculadas a um cliente.
              </p>
            </div>
            <button onclick="document.querySelector('[data-view=minhas-tarefas]')?.click()"
              style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.5rem 1rem;
                     border-radius:8px;background:${colors.primary}18;color:${colors.primary};
                     border:1px solid ${colors.primary}30;font-size:0.8rem;font-weight:600;
                     cursor:pointer;transition:background 0.18s;"
              onmouseenter="this.style.background='${colors.primary}28'"
              onmouseleave="this.style.background='${colors.primary}18'">
              <i class="ph ph-arrow-square-out"></i> Ver tudo
            </button>
          </div>

          <!-- Resumo de contagens -->
          <div id="${IDS.summary}"></div>

          <!-- Chips de filtros ativos -->
          <div id="${IDS.filters}"></div>

          <!-- Barra de filtros -->
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;margin-bottom:1rem;">
            <!-- Busca -->
            <div style="position:relative;flex:1;min-width:200px;">
              <input
                id="${IDS.search}"
                type="search"
                placeholder="Buscar atividade, empresa..."
                oninput="window._maTable?.setSearch(this.value)"
                style="${selectStyle}width:100%;box-sizing:border-box;padding-left:2rem;"
              >
              <span style="position:absolute;left:0.6rem;top:50%;transform:translateY(-50%);
                           color:${colors.textMuted};font-size:0.85rem;pointer-events:none;">🔍</span>
            </div>

            <!-- Filtro: Status de prazo -->
            <select id="${IDS.filterStatus}"
              onchange="window._maTable?.setFilter('displayStatus', this.value || null)"
              style="${selectStyle}">
              <option value="">Todos os status</option>
              ${statuses.map(v => `<option value="${v}">${v}</option>`).join('')}
            </select>

            <!-- Filtro: Status da atividade -->
            <select id="${IDS.filterActSt}"
              onchange="window._maTable?.setFilter('status', this.value || null)"
              style="${selectStyle}">
              <option value="">Todas as situações</option>
              ${actStatuses.map(v => `<option value="${v}">${v}</option>`).join('')}
            </select>
          </div>

          <!-- Tabela -->
          <div id="ma-table-wrap" style="overflow-x:auto;overflow-y:auto;max-height:36vh;">
            <table id="${IDS.table}" style="width:100%;border-collapse:collapse;font-family:inherit;">
              <thead>
                <tr style="border-bottom:1px solid ${colors.border};background:${colors.bgSubtle};">
                  <th data-key="title" style="${thStyle}" onclick="window._maTable?.setSort('title')">
                    Atividade <span class="sort-icon">⇅</span>
                  </th>
                  <th data-key="company_name" style="${thStyle}" onclick="window._maTable?.setSort('company_name')">
                    Empresa <span class="sort-icon">⇅</span>
                  </th>
                  <th data-key="activity_date" style="${thStyle}" onclick="window._maTable?.setSort('activity_date')">
                    Data <span class="sort-icon">⇅</span>
                  </th>
                  <th data-key="displayStatus" style="${thStyle}" onclick="window._maTable?.setSort('displayStatus')">
                    Prazo <span class="sort-icon">⇅</span>
                  </th>
                  <th data-key="status" style="${thStyle}" onclick="window._maTable?.setSort('status')">
                    Situação <span class="sort-icon">⇅</span>
                  </th>
                </tr>
              </thead>
              <tbody id="${IDS.tbody}"></tbody>
            </table>
          </div>

          <!-- Estado de carregamento -->
          <div id="ma-loading" style="text-align:center;padding:3rem;color:${colors.textMuted};display:none;">
            <i class="ph ph-spinner" style="font-size:1.5rem;animation:spin 1s linear infinite;display:block;margin-bottom:0.75rem;"></i>
            Carregando atividades...
          </div>

          <!-- Paginação -->
          <div id="${IDS.pagination}"></div>
        </section>
    `;
}

// ─── Busca dados reais da API ─────────────────────────────────────────────────

async function _fetchActivities() {
    // Busca todas as atividades do usuário logado
    // Inclui: criadas por ele, atribuídas a ele — com ou sem empresa vinculada
    const res = await fetch('/api/activities?assignee=me&pageSize=200');
    if (!res.ok) throw new Error('Erro ao carregar atividades');
    return res.json();
}

function _mapActivities(raw) {
    return (raw || []).map(a => ({
        ...a,
        company_name:  a.companies?.Nome_da_empresa || '',
        activity_date: a.activity_datetime ? new Date(a.activity_datetime).toLocaleDateString('pt-BR') : '—',
        displayStatus: _getDisplayStatus(a),
    }));
}

// ─── Refresh silencioso (sem recriar o HTML) ─────────────────────────────────

let _refreshDebounceTimer = null;
let _pollingInterval = null;
let _isRefreshing = false;

/**
 * Atualiza apenas os dados do painel, mantendo filtros e estrutura HTML intactos.
 * Chamado pelo listener de eventos e pelo polling de fallback.
 */
async function _silentRefresh() {
    if (_isRefreshing) return; // evita chamadas simultâneas
    if (!_container || !document.getElementById(IDS.tbody)) return; // painel não visível

    _isRefreshing = true;

    // Indicador visual sutil de atualização no badge do título
    const titleEl = _container.querySelector('h2');
    const refreshDot = document.getElementById('ma-refresh-dot');
    if (refreshDot) refreshDot.style.opacity = '1';

    try {
        const raw = await _fetchActivities();
        const novaLista = _mapActivities(raw);

        // Só re-renderiza se houver mudança real nos dados
        const antes = JSON.stringify(_activities.map(a => `${a.id}:${a.status}:${a.displayStatus}`));
        const depois = JSON.stringify(novaLista.map(a => `${a.id}:${a.status}:${a.displayStatus}`));

        if (antes !== depois) {
            _activities = novaLista;

            // Atualiza selects de filtro (novos valores podem ter surgido)
            const filterStatusEl = document.getElementById(IDS.filterStatus);
            const filterActEl = document.getElementById(IDS.filterActSt);
            const currentDisplayFilter = filterStatusEl?.value || '';
            const currentActFilter = filterActEl?.value || '';

            // Atualiza o TM com os novos dados
            if (_tm) {
                _tm.setData(_activities);
            }

            // Re-renderiza resumo
            renderSummary();

            // Mantém filtros selecionados, se aplicável
            if (filterStatusEl && currentDisplayFilter) filterStatusEl.value = currentDisplayFilter;
            if (filterActEl && currentActFilter) filterActEl.value = currentActFilter;

            console.log('[Dashboard] Minhas Atividades — dados atualizados ✓');
        }
    } catch (e) {
        console.warn('[Dashboard] Minhas Atividades refresh:', e.message);
    } finally {
        _isRefreshing = false;
        if (refreshDot) setTimeout(() => { refreshDot.style.opacity = '0'; }, 800);
    }
}

/**
 * Agenda um refresh com debounce (evita múltiplas chamadas seguidas).
 * Delay de 600ms: suficiente para o banco persistir antes de ler.
 */
function _scheduleRefresh(delay = 600) {
    clearTimeout(_refreshDebounceTimer);
    _refreshDebounceTimer = setTimeout(_silentRefresh, delay);
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Inicializa o painel "Minhas Atividades" no Dashboard.
 * Busca dados reais via API e renderiza com TableManager 2.0.
 * Configura listener de eventos para atualização em tempo real.
 *
 * @param {string} containerId
 * @param {Array}  empresas  - não usado (mantido para compatibilidade de assinatura)
 * @param {Array}  usuarios  - não usado (mantido para compatibilidade)
 */
export async function renderProximosPassos(containerId, empresas, usuarios) {
    _container = document.getElementById(containerId);
    if (!_container) return;

    // Renderiza shell imediato com spinner
    _container.innerHTML = buildHTML();
    document.getElementById('ma-loading').style.display = 'block';

    try {
        const raw = await _fetchActivities();
        _activities = _mapActivities(raw);
    } catch (e) {
        console.error('[Dashboard] Minhas Atividades:', e);
        _activities = [];
    }

    // Esconde spinner
    const loadEl = document.getElementById('ma-loading');
    if (loadEl) loadEl.style.display = 'none';

    // Rebuild HTML agora que temos dados (para popular os selects de filtro)
    _container.innerHTML = buildHTML();

    // Resumo
    renderSummary();

    // TableManager 2.0
    _tm = new TableManager({
        data:     _activities,
        columns:  COLUMNS,
        pageSize: 10,
        tableId:  IDS.table,

        renderRows:       renderRows,
        renderPagination: renderPagination,
        renderFilters:    renderActiveFiltersChips,
    });

    // Expõe globalmente para os event handlers inline
    window._maTable = _tm;

    // ─── 🔔 Listener de eventos em tempo real ────────────────────────────────
    // Remove listener anterior (caso o painel seja re-inicializado)
    window.removeEventListener('journey:activity-changed', _scheduleRefresh);
    window.addEventListener('journey:activity-changed', () => _scheduleRefresh(600));

    // ─── ⏱️  Polling de fallback (atualiza a cada 45s sem interação) ─────────
    if (_pollingInterval) clearInterval(_pollingInterval);
    _pollingInterval = setInterval(() => {
        // Só faz polling se a view do Dashboard estiver visível
        const dashView = document.getElementById('view-dashboard');
        if (dashView && dashView.style.display !== 'none') {
            _silentRefresh();
        }
    }, 45_000);
}


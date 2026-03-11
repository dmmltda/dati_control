/**
 * ProximosPassos.js — Painel Central do Journey ⭐
 * O painel mais importante: mostra o que precisa acontecer hoje por responsável.
 *
 * Tabela gerenciada pelo TableManager 2.0 — motor universal do sistema.
 *
 * @param {string} containerId - ID do elemento HTML onde renderizar
 * @param {Array}  empresas    - lista de empresas com proximoPasso
 * @param {Array}  usuarios    - lista de usuários para o filtro
 */

import { colors, statusColors, card } from '../../theme/tokens.js';
import { initTooltipSystem, showTooltip, hideTooltip } from './Tooltip.js';
import { TableManager } from '../../../js/core/table-manager.js';

// ─── Estado interno do painel ────────────────────────────────────────────────
let _empresas = [];
let _usuarios = [];
let _container = null;

/** @type {TableManager|null} */
let _tm = null;

const HOJE = new Date('2026-03-10');
HOJE.setHours(0, 0, 0, 0);

// ─── Definição de colunas para o TableManager ────────────────────────────────

const COLUMNS = [
    { key: 'empresaNome',    label: 'Empresa',        type: 'string', searchable: true,  sortable: true,  filterable: true },
    { key: 'titulo',         label: 'Próximo Passo',  type: 'string', searchable: true,  sortable: false, filterable: true },
    { key: 'responsaveisStr',label: 'Responsável',    type: 'string', searchable: true,  sortable: true,  filterable: true, filterType: 'select' },
    { key: 'dataVencimento', label: 'Vencimento',     type: 'date',   searchable: false, sortable: true,  filterable: true },
    { key: 'displayStatus',  label: 'Status',         type: 'string', searchable: false, sortable: true,  filterable: true, filterType: 'select' },
    { key: 'empresaStatus',  label: 'Estágio',        type: 'string', searchable: false, sortable: true,  filterable: true, filterType: 'select' },
];

// ─── IDs dos elementos HTML internos ─────────────────────────────────────────

const IDS = {
    table:       'pp-table',
    tbody:       'pp-tbody',
    search:      'pp-search',
    pagination:  'pp-pagination',
    filters:     'pp-active-filters',
    filterStatus:'pp-filter-status',
    filterEstag: 'pp-filter-estagio',
    filterResp:  'pp-filter-resp',
    tabsWrap:    'pp-tabs',
    summary:     'pp-summary',
};

// ─── Helpers de data/status ──────────────────────────────────────────────────

function getDisplayStatus(passo) {
    if (passo.status === 'Concluído') return 'Concluído';
    const venc = new Date(passo.dataVencimento);
    venc.setHours(0, 0, 0, 0);
    if (venc < HOJE) return 'Vencido';
    if (venc.getTime() === HOJE.getTime()) return 'Hoje';
    return 'Pendente';
}

function formatData(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR');
}

function diffDias(iso) {
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    return Math.round((d - HOJE) / (1000 * 60 * 60 * 24));
}

// ─── Extração e normalização dos dados ───────────────────────────────────────

function buildPassos() {
    return _empresas
        .map(e => {
            // ── Dados reais da API ──────────────────────────────────────────────
            // proximoPasso no DB é uma string de data (Data_de_follow_up)
            // O "título" real vem do último followUp com proximoContato definido
            const passObj = e.proximoPasso;

            // Casos: objeto completo (mock) ou string/nulo (API real)
            if (passObj && typeof passObj === 'object' && passObj.titulo !== undefined) {
                // Formato mock — usa direto
                return {
                    ...passObj,
                    empresaNome:    e.nome,
                    empresaStatus:  e.status,
                    displayStatus:  getDisplayStatus(passObj),
                    responsaveisStr: (passObj.responsaveis || []).join(', '),
                };
            }

            // Formato real da API — monta a partir de followUps
            const followUps = Array.isArray(e.followUps) ? e.followUps : [];
            // Pega o follow-up mais recente com próximo contato
            const ultimoFU = followUps
                .filter(f => f.proximoContato)
                .sort((a, b) => new Date(b.data) - new Date(a.data))[0]
                || followUps.sort((a, b) => new Date(b.data) - new Date(a.data))[0];

            // Só aceita data se for formato ISO (YYYY-MM-DD)
            const isISODate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

            const dataVencimento = isISODate(ultimoFU?.proximoContato)
                ? ultimoFU.proximoContato
                : null;

            const titulo = ultimoFU?.conteudo || '—';
            const responsavel = ultimoFU?.usuario || e.responsavel?.nome || null;

            const passo = {
                titulo,
                dataVencimento,
                responsaveis:    responsavel ? [responsavel] : [],
                responsaveisStr: responsavel || '',
                empresaNome:     e.nome,
                empresaStatus:   e.status || 'Ativo',
                displayStatus:   getDisplayStatus({ dataVencimento }),
            };

            return passo;
        })
        // Filtra apenas quem tem algum dado útil
        .filter(p => p.titulo && p.titulo !== '—' || p.dataVencimento);
}

// ─── Badges & estilos ────────────────────────────────────────────────────────

const STATUS_BADGE = {
    'Vencido':   { bg: 'rgba(239,68,68,0.15)',    color: colors.danger,   texto: '🔴 Vencido' },
    'Hoje':      { bg: 'rgba(245,158,11,0.15)',   color: colors.warning,  texto: '🟡 Hoje' },
    'Pendente':  { bg: 'rgba(100,116,139,0.12)',  color: colors.textMuted,texto: '⚪ Pendente' },
    'Concluído': { bg: 'rgba(16,185,129,0.15)',   color: colors.success,  texto: '✅ Concluído' },
};

function renderStatusBadge(displayStatus) {
    const cfg = STATUS_BADGE[displayStatus] || { bg: '#eee', color: '#666', texto: displayStatus };
    return `<span style="
        background:${cfg.bg};color:${cfg.color};
        font-size:0.72rem;font-weight:700;
        padding:3px 10px;border-radius:9999px;white-space:nowrap;
    ">${cfg.texto}</span>`;
}

const ESTAGIO_MAP = {
    'Cliente Ativo':        { bg: 'rgba(16,185,129,0.12)',  color: colors.success },
    'Cliente Inativo':      { bg: 'rgba(239,68,68,0.12)',   color: colors.danger },
    'Cliente Suspenso':     { bg: 'rgba(239,68,68,0.12)',   color: colors.danger },
    'Ativo':                { bg: 'rgba(16,185,129,0.12)',  color: colors.success },
    'Inativo':              { bg: 'rgba(239,68,68,0.12)',   color: colors.danger },
    'Suspenso':             { bg: 'rgba(239,68,68,0.12)',   color: colors.danger },
    'Em Contrato':          { bg: 'rgba(56,189,248,0.12)',  color: '#38bdf8' },
    'Prospect':             { bg: 'rgba(245,158,11,0.12)',  color: colors.warning },
    'Lead':                 { bg: 'rgba(91,82,246,0.12)',   color: colors.primary },
    'Reunião':              { bg: 'rgba(245,158,11,0.12)',  color: colors.accent },
    'Proposta | Andamento': { bg: 'rgba(91,82,246,0.15)',   color: colors.primaryLight },
    'Proposta | Recusada':  { bg: 'rgba(239,68,68,0.12)',   color: colors.danger },
};

function renderEstagioBadge(status) {
    const c = ESTAGIO_MAP[status] || { bg: 'rgba(139,152,180,0.12)', color: colors.textMuted };
    return `<span style="
        background:${c.bg};color:${c.color};
        font-size:0.68rem;font-weight:600;
        padding:2px 8px;border-radius:9999px;
        border:1px solid ${c.color}33;white-space:nowrap;
    ">${status}</span>`;
}

function renderResponsaveis(responsaveis) {
    const lista = responsaveis?.slice(0, 3) ?? [];
    const avatarColors = [colors.primary, colors.accent, colors.success];
    return `
        <div style="display:flex;align-items:center;">
          ${lista.map((nome, i) => {
              const iniciais = nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
              const bg = avatarColors[i % avatarColors.length];
              return `<span
                  data-responsavel-nome="${nome.replace(/"/g, '&quot;')}"
                  style="
                      display:inline-flex;align-items:center;justify-content:center;
                      width:28px;height:28px;border-radius:50%;
                      background:${bg};color:#fff;
                      font-size:0.65rem;font-weight:700;
                      border:2px solid white;
                      margin-left:${i > 0 ? '-6px' : '0'};
                      position:relative;z-index:${10 - i};cursor:default;
                      transition:transform 120ms;
                  "
                  onmouseenter="this.style.transform='scale(1.25)';this.style.zIndex='99'"
                  onmouseleave="this.style.transform='scale(1)';this.style.zIndex='${10 - i}'"
              >${iniciais}</span>`;
          }).join('')}
        </div>
    `;
}

function rowBorderStyle(displayStatus) {
    const map = {
        'Vencido':   `border-left:3px solid ${colors.danger}`,
        'Hoje':      `border-left:3px solid ${colors.warning}`,
        'Pendente':  `border-left:3px solid transparent`,
        'Concluído': `border-left:3px solid ${colors.success};opacity:0.5`,
    };
    return map[displayStatus] || 'border-left:3px solid transparent';
}

// ─── Callbacks do TableManager ────────────────────────────────────────────────

/** Renderiza as linhas da tabela (chamado pelo TM após cada refresh). */
function renderRows(data) {
    const tbody = document.getElementById(IDS.tbody);
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align:center;padding:3rem;color:${colors.textMuted};">
                <div style="font-size:2rem;margin-bottom:0.5rem;">📋</div>
                <p style="font-size:0.875rem;">Nenhum próximo passo encontrado para este filtro.</p>
              </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.map(p => `
        <tr style="${rowBorderStyle(p.displayStatus)};border-bottom:1px solid ${colors.border};transition:background 120ms;"
            onmouseenter="this.style.background='rgba(255,255,255,0.03)'"
            onmouseleave="this.style.background='transparent'">
          <td style="padding:0.9rem 1rem;font-weight:600;font-size:0.82rem;color:${colors.textMain};max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              title="${p.empresaNome}">${p.empresaNome}</td>
          <td style="padding:0.9rem 1rem;font-size:0.82rem;color:${colors.textMuted};max-width:220px;">${p.titulo}</td>
          <td style="padding:0.9rem 1rem;">${renderResponsaveis(p.responsaveis)}</td>
          <td style="padding:0.9rem 1rem;font-size:0.82rem;color:${colors.textMuted};white-space:nowrap;">${formatData(p.dataVencimento)}</td>
          <td style="padding:0.9rem 1rem;">${renderStatusBadge(p.displayStatus)}</td>
          <td style="padding:0.9rem 1rem;">${renderEstagioBadge(p.empresaStatus)}</td>
        </tr>
    `).join('');

    // Re-ativa tooltips nos avatares após renderização
    _attachAvatarTooltips();
}

/** Renderiza os controles de paginação (chamado pelo TM). */
function renderPagination(state) {
    const el = document.getElementById(IDS.pagination);
    if (!el) return;

    if (state.totalPages <= 1) {
        el.innerHTML = '';
        return;
    }

    const { currentPage: cur, totalPages, totalRecords } = state;
    const inicio = ((cur - 1) * _tm._pageSize) + 1;
    const fim    = Math.min(cur * _tm._pageSize, totalRecords);

    el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:1rem 0 0;border-top:1px solid ${colors.border};margin-top:0.5rem;">
          <span style="font-size:0.78rem;color:${colors.textMuted};">
            Exibindo ${inicio}–${fim} de ${totalRecords} resultados
          </span>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <button onclick="window._ppTable?.prevPage()"
              ${cur === 1 ? 'disabled' : ''}
              style="padding:0.4rem 0.9rem;border-radius:6px;font-size:0.8rem;
                     border:1px solid ${colors.border};
                     background:${cur === 1 ? colors.bgSurface : colors.bgCard};
                     color:${cur === 1 ? colors.textMuted : colors.textMain};
                     cursor:${cur === 1 ? 'not-allowed' : 'pointer'};font-family:inherit;">← Anterior</button>
            <span style="padding:0.4rem 0.9rem;border-radius:6px;font-size:0.8rem;
                         background:${colors.primary};color:white;font-weight:600;">
              ${cur} / ${totalPages}
            </span>
            <button onclick="window._ppTable?.nextPage()"
              ${cur === totalPages ? 'disabled' : ''}
              style="padding:0.4rem 0.9rem;border-radius:6px;font-size:0.8rem;
                     border:1px solid ${colors.border};
                     background:${cur === totalPages ? colors.bgSurface : colors.bgCard};
                     color:${cur === totalPages ? colors.textMuted : colors.textMain};
                     cursor:${cur === totalPages ? 'not-allowed' : 'pointer'};font-family:inherit;">Próxima →</button>
          </div>
        </div>`;
}

/** Renderiza os chips de filtros ativos (chips removíveis). */
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
              <button onclick="window._ppTable?.setSearch('');document.getElementById('${IDS.search}').value='';"
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
              <button onclick="window._ppTable?.setFilter('${f.key}', null);_ppSyncSelectUI();"
                style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;
                       width:16px;height:16px;cursor:pointer;color:inherit;font-size:10px;
                       display:inline-flex;align-items:center;justify-content:center;padding:0;">×</button>
            </span>`);
    });

    el.innerHTML = chips.length
        ? `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem;">${chips.join('')}</div>`
        : '';
}

// ─── Sincroniza UI dos selects após limpar via chip ──────────────────────────

window._ppSyncSelectUI = function () {
    const filters = _tm?.filters || {};

    const displayStatus = document.getElementById(IDS.filterStatus);
    if (displayStatus) displayStatus.value = filters.displayStatus || '';

    const estagio = document.getElementById(IDS.filterEstag);
    if (estagio) estagio.value = filters.empresaStatus || '';

    const resp = document.getElementById(IDS.filterResp);
    if (resp) resp.value = filters.responsaveisStr || '';
};

// ─── Resumo rápido (badges de contagem) ──────────────────────────────────────

function renderSummary() {
    const el = document.getElementById(IDS.summary);
    if (!el) return;

    // Usa os dados originais para contar (independente de filtros)
    const todos = buildPassos();
    const vencidos = todos.filter(p => p.displayStatus === 'Vencido').length;
    const hoje     = todos.filter(p => p.displayStatus === 'Hoje').length;
    const semana   = todos.filter(p => {
        const diff = diffDias(p.dataVencimento);
        return diff >= 0 && diff <= 7 && p.displayStatus !== 'Concluído';
    }).length;

    const badge = (bg, color, txt) => `
        <span style="display:inline-flex;align-items:center;gap:0.4rem;
                     background:${bg};color:${color};
                     font-size:0.78rem;font-weight:700;
                     padding:5px 12px;border-radius:9999px;border:1px solid ${color}33;">
          ${txt}
        </span>`;

    el.innerHTML = `
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.25rem;">
          ${badge('rgba(239,68,68,0.1)',  colors.danger,   `🔴 ${vencidos} Vencido${vencidos !== 1 ? 's' : ''}`)}
          ${badge('rgba(245,158,11,0.1)', colors.warning,  `🟡 ${hoje} Vencem Hoje`)}
          ${badge('rgba(91,82,246,0.1)',  colors.primary,  `📅 ${semana} Esta Semana`)}
        </div>`;
}

// ─── Estrutura HTML do painel ────────────────────────────────────────────────

function buildHTML() {
    // Valores únicos para os selects de filtro (calculados uma vez)
    const passos     = buildPassos();
    const statuses   = [...new Set(passos.map(p => p.displayStatus))].sort();
    const estagios   = [...new Set(passos.map(p => p.empresaStatus))].sort();
    const responsáveis = [...new Set(passos.flatMap(p => p.responsaveis || []))].sort();

    const optStatus   = statuses.map(v => `<option value="${v}">${v}</option>`).join('');
    const optEstagio  = estagios.map(v => `<option value="${v}">${v}</option>`).join('');
    const optResp     = responsáveis.map(v => `<option value="${v}">${v}</option>`).join('');

    const selectStyle = `
        padding:0.45rem 0.75rem;border-radius:8px;font-size:0.8rem;
        border:1px solid ${colors.border};background:${colors.bgCard};
        color:${colors.textMain};font-family:inherit;cursor:pointer;
    `;

    const thStyle = `
        padding:0.75rem 1rem;text-align:left;
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
            border-top:3px solid ${colors.accent};
        ">
          <!-- Cabeçalho -->
          <div style="margin-bottom:1.25rem;">
            <h2 style="font-size:1.1rem;font-weight:800;color:${colors.textMain};
                       display:flex;align-items:center;gap:0.6rem;margin:0 0 0.25rem;">
              <span style="background:${colors.accent};color:white;width:28px;height:28px;
                           border-radius:8px;display:inline-flex;align-items:center;
                           justify-content:center;font-size:0.9rem;">&#x26A1;</span>
              Próximos Passos por Responsável
              <span style="background:rgba(232,131,42,0.12);color:${colors.accent};
                           font-size:0.68rem;font-weight:700;padding:2px 8px;
                           border-radius:9999px;letter-spacing:0.05em;">PAINEL CENTRAL</span>
            </h2>
            <p style="font-size:0.8rem;color:${colors.textMuted};margin:0;">
              O que precisa acontecer hoje — e quem é o responsável por fazer acontecer.
            </p>
          </div>

          <!-- Resumo de contagens -->
          <div id="${IDS.summary}"></div>

          <!-- Chips de filtros ativos -->
          <div id="${IDS.filters}"></div>

          <!-- Barra de filtros -->
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;margin-bottom:1rem;">
            <!-- Busca global -->
            <div style="position:relative;flex:1;min-width:200px;">
              <input
                id="${IDS.search}"
                type="search"
                placeholder="Buscar empresa, passo, responsável..."
                oninput="window._ppTable?.setSearch(this.value)"
                style="${selectStyle}width:100%;box-sizing:border-box;padding-left:2rem;"
              >
              <span style="position:absolute;left:0.6rem;top:50%;transform:translateY(-50%);
                           color:${colors.textMuted};font-size:0.85rem;pointer-events:none;">🔍</span>
            </div>

            <!-- Filtro: Status do passo -->
            <select id="${IDS.filterStatus}"
              onchange="window._ppTable?.setFilter('displayStatus', this.value || null)"
              style="${selectStyle}">
              <option value="">Todos os status</option>
              ${optStatus}
            </select>

            <!-- Filtro: Estágio da empresa -->
            <select id="${IDS.filterEstag}"
              onchange="window._ppTable?.setFilter('empresaStatus', this.value || null)"
              style="${selectStyle}">
              <option value="">Todos os estágios</option>
              ${optEstagio}
            </select>

            <!-- Filtro: Responsável -->
            <select id="${IDS.filterResp}"
              onchange="window._ppTable?.setFilter('responsaveisStr', this.value || null)"
              style="${selectStyle}">
              <option value="">Todos os responsáveis</option>
              ${optResp}
            </select>
          </div>

          <!-- Tabela padronizada -->
          <div id="pp-table-wrap" style="overflow-x:auto;overflow-y:auto;max-height:36vh;">
            <table id="${IDS.table}" style="width:100%;border-collapse:collapse;font-family:inherit;">
              <thead>
                <tr style="border-bottom:1px solid ${colors.border};background:${colors.bgSubtle};">
                  <th data-key="empresaNome"    style="${thStyle}" onclick="window._ppTable?.setSort('empresaNome')">
                    Empresa <span class="sort-icon">⇅</span>
                  </th>
                  <th data-key="titulo"         style="${thStyle}">Próximo Passo</th>
                  <th data-key="responsaveisStr"style="${thStyle}" onclick="window._ppTable?.setSort('responsaveisStr')">
                    Responsáveis <span class="sort-icon">⇅</span>
                  </th>
                  <th data-key="dataVencimento" style="${thStyle}" onclick="window._ppTable?.setSort('dataVencimento')">
                    Vencimento <span class="sort-icon">⇅</span>
                  </th>
                  <th data-key="displayStatus"  style="${thStyle}" onclick="window._ppTable?.setSort('displayStatus')">
                    Status <span class="sort-icon">⇅</span>
                  </th>
                  <th data-key="empresaStatus"  style="${thStyle}" onclick="window._ppTable?.setSort('empresaStatus')">
                    Estágio <span class="sort-icon">⇅</span>
                  </th>
                </tr>
              </thead>
              <tbody id="${IDS.tbody}"></tbody>
            </table>
          </div>

          <!-- Paginação -->
          <div id="${IDS.pagination}"></div>
        </section>
    `;
}

// ─── Tooltips nos avatares ────────────────────────────────────────────────────

function _attachAvatarTooltips() {
    if (!_container || _container.dataset.tooltipDelegate) return;
    _container.dataset.tooltipDelegate = '1';
    initTooltipSystem();
    _container.addEventListener('mouseenter', ev => {
        const avatar = ev.target.closest('[data-responsavel-nome]');
        if (!avatar) return;
        showTooltip(ev, { emoji: '👤', titulo: avatar.getAttribute('data-responsavel-nome'), simples: true });
    }, true);
    _container.addEventListener('mouseleave', ev => {
        if (ev.target.closest('[data-responsavel-nome]')) hideTooltip();
    }, true);
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Inicializa o painel de Próximos Passos
 * @param {string} containerId
 * @param {Array}  empresas
 * @param {Array}  usuarios
 */
export function renderProximosPassos(containerId, empresas, usuarios) {
    _container = document.getElementById(containerId);
    if (!_container) return;

    _empresas = empresas;
    _usuarios = usuarios;

    // Monta o HTML estático do painel
    _container.innerHTML = buildHTML();

    // Renderiza resumo estático de contagens
    renderSummary();

    // Inicializa o TableManager 2.0
    const passos = buildPassos();

    _tm = new TableManager({
        data:     passos,
        columns:  COLUMNS,
        pageSize: 15,
        tableId:  IDS.table,

        renderRows: renderRows,
        renderPagination: renderPagination,
        renderFilters: renderActiveFiltersChips,
    });

    // Expõe o TM globalmente para os event handlers inline
    window._ppTable = _tm;
}

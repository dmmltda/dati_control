/**
 * Dashboard.js — Página raiz do Journey Dashboard
 * Usa dados reais de state.companies (carregados via api.getCompanies() no auth.js).
 * HelpDesk e Onboarding usam mock temporariamente até endpoints da API serem criados.
 */

import {
  mockChamados,
  mockOnboardings,
  mockHelpDeskTimeline,
} from '../data/mockData.js';

import { state } from '../../js/modules/state.js';

import { renderKPICards }     from '../components/dashboard/KPICards.js';
import { renderProximosPassos } from '../components/dashboard/ProximosPassos.js';
import { renderSalesFunnel }  from '../components/dashboard/SalesFunnel.js';
import { renderHealthScore }  from '../components/dashboard/HealthScore.js';
import { renderHelpDesk }     from '../components/dashboard/HelpDesk.js';
import { renderOnboarding }   from '../components/dashboard/Onboarding.js';
import { colors } from '../theme/tokens.js';

// ─── Mapa de ordem por departamento ──────────────────────────────────────────
//
// Painel IDs:
//   1 = KPI Cards          → painel-kpi           (largura total)
//   2 = Minhas Atividades  → painel-proximos-passos (largura total)
//   3 = Funil de Vendas    → painel-funil          (metade)
//   4 = Health Score       → painel-health         (metade)
//   5 = Help Desk          → painel-helpdesk       (metade)
//   6 = Onboarding         → painel-onboarding     (metade)
//
// Painéis "largura total" (1 e 2) sempre ocupam linha inteira.
// Painéis "metade" (3-6) são agrupados dois a dois em linhas 50/50.

const PAINEL_ORDER_MAP = {
  'CS':          [4, 5, 6, 3, 1],
  'Help Desk':   [5, 4, 1, 3, 6],
  'Vendas':      [3, 1, 4, 5, 6],
  'Financeiro':  [1, 3, 4, 5, 6],
  'Master':      [1, 3, 4, 5, 6],
  'default':     [1, 3, 4, 5, 6],
};

// Metadados de cada painel (label legível para o toggle UI)
const PAINEIS_META = {
  1: { id: 'painel-kpi',        full: true,  label: 'KPI Cards',        icon: 'ph-chart-bar'     },
  3: { id: 'painel-funil',      full: false, label: 'Funil de Vendas',   icon: 'ph-funnel'        },
  4: { id: 'painel-health',     full: false, label: 'Health Score',      icon: 'ph-heartbeat'     },
  5: { id: 'painel-helpdesk',   full: false, label: 'Help Desk',         icon: 'ph-headset'       },
  6: { id: 'painel-onboarding', full: false, label: 'Onboarding',        icon: 'ph-rocket-launch' },
};

// ─── Visibilidade por painel (localStorage por usuário) ──────────────────────

function _visibilidadeKey() {
  const uid = window.__usuarioAtual?.id || 'anon';
  return `journey_dash_visibility_${uid}`;
}

/** Retorna objeto { 1: true, 2: true, ... } com visibilidade de cada painel */
function _getVisibilidade() {
  try {
    const raw = localStorage.getItem(_visibilidadeKey());
    if (raw) return JSON.parse(raw);
  } catch {}
  // padrão: todos visíveis
  return { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };
}

function _setVisibilidade(vis) {
  try { localStorage.setItem(_visibilidadeKey(), JSON.stringify(vis)); } catch {}
}

/**
 * Retorna a ordem de painéis para o usuário atual.
 * Lê window.__usuarioAtual.department (ou user_type === 'master').
 */
function _getOrdemPaineis() {
  const me = window.__usuarioAtual;
  if (!me) return PAINEL_ORDER_MAP['default'];

  // usuario master → ordem Master
  if (me.user_type === 'master') return PAINEL_ORDER_MAP['Master'];

  const dept = (me.department || '').trim();
  return PAINEL_ORDER_MAP[dept] || PAINEL_ORDER_MAP['default'];
}

/**
 * Retorna apenas os IDs de painéis que o usuário habilitou,
 * mantendo a ordem do departamento.
 */
function _getOrdemVisiveis() {
  const vis = _getVisibilidade();
  return _getOrdemPaineis().filter(id => vis[id] !== false);
}

// ─── Monta o HTML base respeitando a ordem + visibilidade ───────────────────

function injetarEstrutura(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Usa apenas painéis habilitados pelo usuário, na ordem correta do departamento
  const ordem = _getOrdemVisiveis();
  let html = '';
  let i = 0;

  if (ordem.length === 0) {
    html = `
      <div style="text-align:center;padding:4rem 2rem;color:#64748b;">
        <i class="ph ph-eye-slash" style="font-size:3rem;opacity:0.4;"></i>
        <p style="margin-top:1rem;font-size:0.95rem;">Todos os painéis estão ocultos.</p>
        <p style="font-size:0.8rem;opacity:0.6;">Clique em <strong>Painéis</strong> para habilitar.</p>
      </div>`;
    container.innerHTML = html;
    return;
  }

  while (i < ordem.length) {
    const meta = PAINEIS_META[ordem[i]];
    if (!meta) { i++; continue; }

    if (meta.full) {
      html += `<div id="${meta.id}" style="margin-bottom:1.5rem;"></div>\n`;
      i++;
    } else {
      const meta2 = ordem[i + 1] ? PAINEIS_META[ordem[i + 1]] : null;

      if (meta2 && !meta2.full) {
        html += `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem;align-items:stretch;" class="grid-dois-col">
  <div id="${meta.id}"  style="display:flex;flex-direction:column;"></div>
  <div id="${meta2.id}" style="display:flex;flex-direction:column;"></div>
</div>\n`;
        i += 2;
      } else {
        html += `<div id="${meta.id}" style="display:flex;flex-direction:column;margin-bottom:1.5rem;"></div>\n`;
        i++;
      }
    }
  }

  container.innerHTML = html;
}

// ─── Inicialização de todos os painéis na ordem correta ──────────────────────

function iniciarPaineis() {
  // Usa dados reais do state.companies (carregados pela API)
  // Fallback para array vazio se ainda não tiver dados
  const empresas = Array.isArray(state.companies) && state.companies.length > 0
    ? state.companies
    : [];

  // Usuários disponíveis no cache (carregado pelo _dbInicializarMenu)
  const usuarios = window.__usuariosCache || [];

  // Variações mensais — mock até endpoint /api/stats ser criado
  const statsVars = { variacaoMesAnterior: {} };

  // Renderiza cada painel na ordem definida pelo departamento.
  // Cada função verifica se o container existe antes de renderizar —
  // se o painel não está na ordem do departamento, o container não existe e a
  // chamada é simplesmente ignorada (sem erro).

  // Cada painel tem try/catch independente — erro em um não bloqueia os outros
  if (document.getElementById('painel-kpi')) {
    try { renderKPICards('painel-kpi', empresas, statsVars); }
    catch (e) { console.error('[Dashboard] KPI Cards:', e); }
  }


  if (document.getElementById('painel-funil')) {
    try { renderSalesFunnel('painel-funil', empresas); }
    catch (e) { console.error('[Dashboard] Funil de Vendas:', e); }
  }

  if (document.getElementById('painel-health')) {
    try { renderHealthScore('painel-health', empresas); }
    catch (e) { console.error('[Dashboard] Health Score:', e); }
  }

  if (document.getElementById('painel-helpdesk')) {
    try { renderHelpDesk('painel-helpdesk', mockChamados, mockHelpDeskTimeline); }
    catch (e) { console.error('[Dashboard] Help Desk:', e); }
  }

  if (document.getElementById('painel-onboarding')) {
    try { renderOnboarding('painel-onboarding', mockOnboardings); }
    catch (e) { console.error('[Dashboard] Onboarding:', e); }
  }

  const dept = window.__usuarioAtual?.department || '(sem departamento)';
  const type = window.__usuarioAtual?.user_type || '?';
  console.log(`[Dashboard] Painéis renderizados — departamento: ${dept}, user_type: ${type}`);
}

// ─── Botão de visibilidade de painéis (dropdown na top bar) ─────────────────

/**
 * Injeta (ou atualiza) o botão "Painéis" no slot #db-painel-toggle-wrap.
 * O slot deve existir no index.html dentro da top-bar do dashboard.
 */
function injetarBotaoPaineis() {
  const wrap = document.getElementById('db-painel-toggle-wrap');
  if (!wrap) return;

  const vis = _getVisibilidade();
  const ordemDept = _getOrdemPaineis(); // todos os painéis do departamento (para monstrar no dropdown)

  // Conta quantos estão visíveis
  const totalDept   = ordemDept.length;
  const totalAtivos = ordemDept.filter(id => vis[id] !== false).length;

  const isAllActive = totalAtivos === totalDept;
  // Badge compacto se todos visíveis, badge de 'atenção' se faltar algum
  const badgeHtml = isAllActive
    ? `<span style="background:rgba(91,82,246,0.15);color:#a89ef8;border-radius:999px;font-size:0.68rem;font-weight:700;padding:2px 6px;min-width:20px;text-align:center;">${totalAtivos}</span>`
    : `<span style="background:rgba(239,68,68,0.15);color:#f87171;border-radius:999px;font-size:0.68rem;font-weight:700;padding:2px 6px;min-width:30px;text-align:center;">${totalAtivos}/${totalDept}</span>`;

  wrap.innerHTML = `
    <div class="db-painel-dropdown" id="db-painel-dropdown-wrap" style="position:relative;">
      <button
        id="db-painel-btn"
        onclick="window._dbTogglePainelMenu(event)"
        aria-haspopup="true"
        aria-expanded="false"
        title="Mostrar ou ocultar painéis do dashboard"
        style="
          display:flex;align-items:center;gap:0.5rem;
          background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.08); /* Ghost button neutro */
          color:#e2e8f0;border-radius:10px;
          height:36px;box-sizing:border-box;padding:0 0.75rem;cursor:pointer;
          font-size:13px;font-weight:600;
          font-family:'Plus Jakarta Sans',sans-serif;
          transition:background 150ms, border-color 150ms;
          white-space:nowrap;
        "
        onmouseover="this.style.background='rgba(255,255,255,0.06)';this.style.borderColor='rgba(255,255,255,0.15)';"
        onmouseout="this.style.background='rgba(255,255,255,0.025)';this.style.borderColor='rgba(255,255,255,0.08)';">
        <i class="ph ph-layout" style="font-size:14px;color:#818cf8;opacity:0.8;"></i>
        Painéis
        ${badgeHtml}
        <i class="ph ph-caret-down" id="db-painel-caret" style="font-size:10px;opacity:0.5;margin-left:2px;"></i>
      </button>

      <!-- Dropdown menu -->
      <div
        id="db-painel-menu"
        style="
          display:none;position:absolute;top:calc(100% + 6px);right:0;
          background:#171e32;border:1px solid #26314a;border-radius:12px;
          box-shadow:0 8px 32px rgba(0,0,0,0.45);z-index:300;
          min-width:230px;padding:6px 0;overflow:hidden;
          font-family:'Plus Jakarta Sans',sans-serif;
        ">

        <div style="padding:8px 14px 6px;font-size:0.7rem;font-weight:700;color:#5b52f6;letter-spacing:0.06em;text-transform:uppercase;">Painéis visíveis</div>

        ${ordemDept.map(pid => {
          const meta  = PAINEIS_META[pid];
          const ativo = vis[pid] !== false;
          return `
          <button
            onclick="window._dbTogglePainel(${pid})"
            style="
              display:flex;align-items:center;gap:0.7rem;
              width:100%;padding:9px 14px;
              background:transparent;border:none;
              color:${ativo ? '#e2e8f0' : '#64748b'};
              cursor:pointer;font-size:0.83rem;font-weight:500;
              text-align:left;transition:background 0.15s;
            "
            onmouseover="this.style.background='#1d2642';"
            onmouseout="this.style.background='transparent';">
            <!-- Toggle pill -->
            <span style="
              display:inline-flex;align-items:center;
              width:34px;height:18px;border-radius:999px;
              background:${ativo ? '#5b52f6' : '#26314a'};
              transition:background 0.2s;flex-shrink:0;position:relative;
            ">
              <span style="
                position:absolute;width:12px;height:12px;
                border-radius:50%;background:#fff;
                left:${ativo ? '17px' : '3px'};
                transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.4);
              "></span>
            </span>
            <i class="ph ${meta.icon}" style="font-size:14px;opacity:0.8;"></i>
            ${meta.label}
          </button>`;
        }).join('')}

        <div style="border-top:1px solid #26314a;margin:4px 0;"></div>
        <button
          onclick="window._dbResetPaineis()"
          style="
            display:flex;align-items:center;gap:0.6rem;
            width:100%;padding:8px 14px;
            background:transparent;border:none;
            color:#8b98b4;cursor:pointer;font-size:0.78rem;font-weight:500;
            text-align:left;transition:background 0.15s;
          "
          onmouseover="this.style.background='#1d2642';"
          onmouseout="this.style.background='transparent';">
          <i class="ph ph-arrow-counter-clockwise" style="font-size:13px;"></i>
          Restaurar padrão
        </button>
      </div>
    </div>
  `;

  // ── Event handlers globais (definidos 1× no primeiro load) ────────────────
  if (!window._dbPainelHandlersRegistered) {
    window._dbPainelHandlersRegistered = true;

    window._dbTogglePainelMenu = (e) => {
      e.stopPropagation();
      const menu  = document.getElementById('db-painel-menu');
      const caret = document.getElementById('db-painel-caret');
      const btn   = document.getElementById('db-painel-btn');
      if (!menu) return;
      const open = menu.style.display === 'block';
      menu.style.display  = open ? 'none' : 'block';
      if (caret) caret.style.transform = open ? '' : 'rotate(180deg)';
      if (btn) btn.setAttribute('aria-expanded', String(!open));
    };

    window._dbTogglePainel = (painelId) => {
      const vis = _getVisibilidade();
      vis[painelId] = vis[painelId] === false ? true : false;
      _setVisibilidade(vis);
      _recarregarDashboard();
    };

    window._dbResetPaineis = () => {
      _setVisibilidade({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
      _recarregarDashboard();
    };

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('db-painel-dropdown-wrap');
      const menu = document.getElementById('db-painel-menu');
      const btn  = document.getElementById('db-painel-btn');
      const caret = document.getElementById('db-painel-caret');
      if (!wrap || !menu) return;
      if (!wrap.contains(e.target)) {
        menu.style.display = 'none';
        if (caret) caret.style.transform = '';
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

/** Re-renderiza o dashboard inteiro após alteração de visibilidade */
function _recarregarDashboard() {
  const containerId = 'journey-dashboard-root';
  injetarEstrutura(containerId);
  iniciarPaineis();
  injetarBotaoPaineis(); // atualiza contadores no botão
}

// ─── Injeção de CSS responsivo inline ────────────────────────────────────────

function injetarCSS() {

  const style = document.createElement('style');
  style.id = 'journey-dashboard-css';
  style.textContent = `
    #journey-dashboard-root {
      background: transparent;
      padding: 0;
      font-family: 'Plus Jakarta Sans', 'DM Sans', 'Inter', sans-serif;
    }

    /* Herança de fonte sem seletor universal */
    #journey-dashboard-root section,
    #journey-dashboard-root article,
    #journey-dashboard-root div,
    #journey-dashboard-root span,
    #journey-dashboard-root p,
    #journey-dashboard-root h2,
    #journey-dashboard-root button,
    #journey-dashboard-root select,
    #journey-dashboard-root td,
    #journey-dashboard-root th {
      font-family: inherit;
      box-sizing: border-box;
    }

    /* ─── Dark Theme: Painéis ────────────────────────────────────────────────── */
    /* Painéis de conteúdo: fundo dark card */
    #painel-proximos-passos section,
    #painel-funil section,
    #painel-health section,
    #painel-helpdesk section,
    #painel-onboarding section {
      background: #171e32 !important;
      border: 1px solid #26314a !important;
      color: #e2e8f0 !important;
    }

    /* Painéis do grid 50/50: seções ocupam altura total do container */
    #painel-funil,
    #painel-health,
    #painel-helpdesk,
    #painel-onboarding {
      display: flex;
      flex-direction: column;
    }
    #painel-funil > section,
    #painel-health > section,
    #painel-helpdesk > section,
    #painel-onboarding > section {
      flex: 1 !important;
      height: 100% !important;
      box-sizing: border-box !important;
    }

    /* KPI articles: cards individuais com fundo dark */
    #painel-kpi article {
      background: #171e32 !important;
      border: 1px solid #26314a !important;
      color: #e2e8f0 !important;
    }

    /* KPI section wrapper: transparente — cards flutuam no fundo #0f1423 */
    #painel-kpi section {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
    }

    /* ─── Thead Sticky — fundo dark para evitar ver linhas atrás ─────────────── */
    #ma-table-wrap thead tr {
      position: sticky !important;
      top: 0 !important;
      background: #1d2642 !important;
      z-index: 2 !important;
    }
    #painel-health table thead tr {
      background: #1d2642 !important;
    }

    /* ─── Tabela: Scrollbar Dark ─────────────────────────────────────────────── */
    #ma-table-wrap::-webkit-scrollbar { height: 5px; width: 5px; }
    #ma-table-wrap::-webkit-scrollbar-track { background: #1d2642; border-radius: 3px; }
    #ma-table-wrap::-webkit-scrollbar-thumb { background: #26314a; border-radius: 3px; }
    #ma-table-wrap::-webkit-scrollbar-thumb:hover { background: #5b52f6; }

    /* Suaviza transições de hover nos cards */
    article[style*="transition"] { will-change: transform; }

    /* ─── COMPACTAÇÃO GERAL ─────────────────────────────────────────────────── */
    /* Painel Minhas Atividades — tabela compacta */
    #painel-proximos-passos table td,
    #painel-proximos-passos table th {
      padding: 7px 10px !important;
      line-height: 1.4 !important;
    }

    /* Badges de status na tabela */
    #painel-proximos-passos span[style*="border-radius: 9999px"],
    #painel-proximos-passos span[style*="border-radius:9999px"] {
      padding: 2px 7px !important;
    }

    /* Selects dark */
    #painel-proximos-passos select {
      background: #1d2642 !important;
      border-color: #26314a !important;
      color: #e2e8f0 !important;
    }

    /* Título e paragráfo do painel */
    #painel-proximos-passos h2 {
      color: #e2e8f0 !important;
    }
    #painel-proximos-passos p {
      margin: 0 !important;
    }

    /* KPI Cards — compactação e dark border */
    #painel-kpi article {
      padding: 14px 16px !important;
    }

    /* Demais painéis — cor dos títulos e subтítulos */
    #painel-funil h2, #painel-health h2,
    #painel-helpdesk h2, #painel-onboarding h2 {
      color: #e2e8f0 !important;
    }
    #painel-funil p, #painel-health p,
    #painel-helpdesk p, #painel-onboarding p {
      margin-bottom: 0 !important;
      color: #8b98b4 !important;
    }

    /* Seção panels — padding interno reduzido */
    #painel-funil section,
    #painel-health section,
    #painel-helpdesk section,
    #painel-onboarding section,
    #painel-proximos-passos section {
      padding: 16px 18px !important;
    }

    /* Gráfico do Funil — fundo das barras em dark */
    #painel-funil [style*="background:"][style*="18;"] {
      border-radius: 9999px;
    }

    /* Linha 2 e 3: reduz gap entre painéis */
    .grid-dois-col { gap: 0.75rem !important; }
    #painel-kpi { margin-bottom: 0.75rem !important; }
    #painel-proximos-passos { margin-bottom: 0.75rem !important; }

    /* Altura máxima da tabela Minhas Atividades */
    #ma-table-wrap {
      max-height: 36vh !important;
      overflow-y: auto !important;
      overflow-x: auto !important;
    }

    /* ─── FIX DE ROLAGEM ─────────────────────────────────────────────────────── */
    #view-dashboard {
      height: auto !important;
      overflow: visible !important;
      min-height: 0 !important;
    }
    #view-dashboard .top-bar {
      margin-bottom: 0.75rem !important;
      padding-bottom: 0 !important;
    }

    /* ─── Responsividade ────────────────────────────────────────────────────────*/
    @media (min-width: 1280px) {
      .kpi-grid { grid-template-columns: repeat(5, 1fr) !important; }
      .grid-dois-col { grid-template-columns: 1fr 1fr !important; }
    }
    @media (max-width: 1279px) {
      .kpi-grid { grid-template-columns: repeat(3, 1fr) !important; }
      .grid-dois-col { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 767px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
      .grid-dois-col { grid-template-columns: 1fr !important; }
    }
  

    /* @keyframes do painel Minhas Atividades */
    @keyframes ma-fade-in {
      from { opacity: 0; transform: scale(0.88); }
      to   { opacity: 1; transform: scale(1); }
    }
    /* Spinner */
    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
  `;
  // Remove e reinjecta (garante que atualizações do CSS sejam aplicadas)
  const elExistente = document.getElementById('journey-dashboard-css');
  if (elExistente) elExistente.remove();
  document.head.appendChild(style);
}

// ─── Exportação pública ───────────────────────────────────────────────────────

/**
 * Inicializa o Journey Dashboard completo em um container especificado.
 * Chamado pelo módulo principal (app.js ou ui.js) quando a view 'dashboard' fica ativa.
 *
 * @param {string} containerId - ID do elemento HTML raiz onde o dashboard será montado
 */
export function initDashboard(containerId = 'journey-dashboard-root') {
  injetarCSS();
  injetarEstrutura(containerId);
  iniciarPaineis();
  injetarBotaoPaineis();
}

/**
 * Atualiza o dashboard com novos dados (ex: após busca de dados reais da API).
 * Por enquanto use apenas com mockData.
 * @param {string} containerId
 */
export function refreshDashboard(containerId = 'journey-dashboard-root') {
  iniciarPaineis();
}

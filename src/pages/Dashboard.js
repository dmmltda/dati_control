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

// ─── Mete o HTML base do dashboard no container ───────────────────────────────

function injetarEstrutura(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <!-- Faixa de KPIs -->
    <div id="painel-kpi" style="margin-bottom: 1.5rem;"></div>

    <!-- Painel Central: Próximos Passos (largura total) -->
    <div id="painel-proximos-passos" style="margin-bottom: 1.5rem;"></div>

    <!-- Linha 2: Funil + Health Score (50/50) -->
    <div style="
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
      align-items: stretch;
    " class="grid-dois-col">
      <div id="painel-funil"   style="display:flex;flex-direction:column;"></div>
      <div id="painel-health"  style="display:flex;flex-direction:column;"></div>
    </div>

    <!-- Linha 3: Help Desk + Onboarding (50/50) -->
    <div style="
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
      align-items: stretch;
    " class="grid-dois-col">
      <div id="painel-helpdesk"   style="display:flex;flex-direction:column;"></div>
      <div id="painel-onboarding" style="display:flex;flex-direction:column;"></div>
    </div>
  `;
}

// ─── Inicialização de todos os painéis ───────────────────────────────────────

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

  // Cada painel tem try/catch independente — erro em um não bloqueia os outros
  try { renderKPICards('painel-kpi', empresas, statsVars); }
  catch (e) { console.error('[Dashboard] KPI Cards:', e); }

  // renderProximosPassos é agora assíncrona — busca atividades reais via API
  renderProximosPassos('painel-proximos-passos', empresas, usuarios)
    .catch(e => console.error('[Dashboard] Minhas Atividades:', e));

  try { renderSalesFunnel('painel-funil', empresas); }
  catch (e) { console.error('[Dashboard] Funil de Vendas:', e); }

  try { renderHealthScore('painel-health', empresas); }
  catch (e) { console.error('[Dashboard] Health Score:', e); }

  // HelpDesk e Onboarding: mock até endpoints /api/chamados e /api/onboardings
  try { renderHelpDesk('painel-helpdesk', mockChamados, mockHelpDeskTimeline); }
  catch (e) { console.error('[Dashboard] Help Desk:', e); }

  try { renderOnboarding('painel-onboarding', mockOnboardings); }
  catch (e) { console.error('[Dashboard] Onboarding:', e); }
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
}

/**
 * Atualiza o dashboard com novos dados (ex: após busca de dados reais da API).
 * Por enquanto use apenas com mockData.
 * @param {string} containerId
 */
export function refreshDashboard(containerId = 'journey-dashboard-root') {
  iniciarPaineis();
}

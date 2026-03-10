/**
 * Dashboard.jsx — Página raiz do Journey Dashboard
 * Orquestra todos os painéis e passa os dados mockados para cada componente.
 *
 * Estrutura:
 *   1. Importa dados mockados
 *   2. Renderiza a estrutura HTML do dashboard no container principal
 *   3. Inicializa cada painel com seus respectivos dados
 *
 * Para adicionar um novo painel:
 *   1. Crie o arquivo em src/components/dashboard/NovoPainel.js
 *   2. Importe-o aqui com `import { renderNovoPainel } from '../components/dashboard/NovoPainel.js'`
 *   3. Adicione um <div id="painel-novo"> no HTML abaixo
 *   4. Chame `renderNovoPainel('painel-novo', dadosNecessarios)` na função iniciar()
 */

import {
  mockEmpresas,
  mockChamados,
  mockOnboardings,
  mockUsuarios,
  mockStats,
  mockHelpDeskTimeline,
} from '../data/mockData.js';

import { renderKPICards } from '../components/dashboard/KPICards.js';
import { renderProximosPassos } from '../components/dashboard/ProximosPassos.js';
import { renderSalesFunnel } from '../components/dashboard/SalesFunnel.js';
import { renderHealthScore } from '../components/dashboard/HealthScore.js';
import { renderHelpDesk } from '../components/dashboard/HelpDesk.js';
import { renderOnboarding } from '../components/dashboard/Onboarding.js';
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
      align-items: start;
    " class="grid-dois-col">
      <div id="painel-funil"></div>
      <div id="painel-health"></div>
    </div>

    <!-- Linha 3: Help Desk + Onboarding (50/50) -->
    <div style="
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
      align-items: start;
    " class="grid-dois-col">
      <div id="painel-helpdesk"></div>
      <div id="painel-onboarding"></div>
    </div>
  `;
}

// ─── Inicialização de todos os painéis ───────────────────────────────────────

function iniciarPaineis() {
  // Painel 1 — KPI Cards
  renderKPICards('painel-kpi', mockEmpresas, mockStats);

  // Painel 2 — Próximos Passos (painel central)
  renderProximosPassos('painel-proximos-passos', mockEmpresas, mockUsuarios);

  // Painel 3 — Funil de Vendas
  renderSalesFunnel('painel-funil', mockEmpresas);

  // Painel 4 — Health Score
  renderHealthScore('painel-health', mockEmpresas);

  // Painel 5 — Help Desk / Chamados
  renderHelpDesk('painel-helpdesk', mockChamados, mockHelpDeskTimeline);

  // Painel 6 — Onboarding
  renderOnboarding('painel-onboarding', mockOnboardings);
}

// ─── Injeção de CSS responsivo inline ────────────────────────────────────────

function injetarCSS() {
  const style = document.createElement('style');
  style.id = 'journey-dashboard-css';
  style.textContent = `
    /*
     * Reset de fonte para o Dashboard Journey.
     * O app existente usa html { font-size: 20px } — aqui resetamos
     * para 16px dentro do container do dashboard para que rem = 16px.
     */
    #journey-dashboard-root {
      font-size: 16px !important;
      /* Sem background próprio — cada painel card tem seu próprio fundo branco.
         O container é transparente e herda o dark do main-content, assim o
         comportamento de rolagem é idêntico à lista de empresas. */
      background: transparent;
      padding: 0;
    }

    /* Garante que os cards herdem a fonte correta */
    #journey-dashboard-root * {
      font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif !important;
      box-sizing: border-box;
    }

    /* Responsividade: ≥1280px — full grid */
    @media (min-width: 1280px) {
      .kpi-grid {
        grid-template-columns: repeat(5, 1fr) !important;
      }
      .grid-dois-col {
        grid-template-columns: 1fr 1fr !important;
      }
    }

    /* 768px–1279px — sidebar colapsada, 3 colunas KPI */
    @media (max-width: 1279px) {
      .kpi-grid {
        grid-template-columns: repeat(3, 1fr) !important;
      }
      .grid-dois-col {
        grid-template-columns: 1fr !important;
      }
    }

    /* ≤ 767px — 2 colunas KPI, tudo em coluna única */
    @media (max-width: 767px) {
      .kpi-grid {
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .grid-dois-col {
        grid-template-columns: 1fr !important;
      }
    }

    /* Scrollbar customizada para tabelas */
    .table-responsive::-webkit-scrollbar { height: 6px; }
    .table-responsive::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
    .table-responsive::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    .table-responsive::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

    /* Suaviza transições de hover nos cards */
    article[style*="transition"] { will-change: transform; }

    /* ─────────────────────────────────────────────────────────────────────────
     * COMPACTAÇÃO GERAL — override de rem inflados pelo html { font-size: 20px }
     *
     * Cada 1rem = 20px neste app (base incomum). Os componentes foram desenhados
     * com base 16px. A solução é sobrescrever os paddings/font-sizes críticos
     * com px fixo, escopados ao #journey-dashboard-root.
     * ───────────────────────────────────────────────────────────────────────── */

    /* Painel Próximos Passos — tabela compacta */
    #painel-proximos-passos table td,
    #painel-proximos-passos table th {
      padding: 7px 10px !important;
      font-size: 12px !important;
      line-height: 1.4 !important;
    }

    /* Badges de status e estágio na tabela */
    #painel-proximos-passos span[style*="border-radius: 9999px"],
    #painel-proximos-passos span[style*="border-radius:9999px"] {
      padding: 2px 7px !important;
      font-size: 11px !important;
    }

    /* Avatares dos responsáveis */
    #painel-proximos-passos [title] span[style*="border-radius:50%"] {
      width: 22px !important;
      height: 22px !important;
      font-size: 9px !important;
    }

    /* Filtros (tabs + select) */
    #painel-proximos-passos button[onclick*="setTab"],
    #painel-proximos-passos button[onclick*="irPagina"] {
      padding: 4px 10px !important;
      font-size: 11px !important;
    }

    /* Contadores de resumo */
    #painel-proximos-passos > section > div:nth-child(3) span {
      font-size: 11px !important;
      padding: 3px 9px !important;
    }

    /* Título do painel */
    #painel-proximos-passos h2 {
      font-size: 14px !important;
    }
    #painel-proximos-passos p {
      font-size: 11px !important;
      margin: 0 !important;
    }

    /* KPI Cards — reduz o gigantismo dos números */
    #painel-kpi article {
      padding: 14px 16px !important;
    }
    #painel-kpi [style*="font-size: 2"] {
      font-size: 22px !important;
      line-height: 1.1 !important;
    }
    #painel-kpi [style*="font-size: 1.6"] {
      font-size: 22px !important;
    }
    #painel-kpi [style*="font-size: 0.8"] {
      font-size: 11px !important;
    }
    #painel-kpi [style*="font-size: 0.75"] {
      font-size: 11px !important;
    }

    /* Demais painéis — título e subtítulo compactos */
    #painel-funil h2, #painel-health h2,
    #painel-helpdesk h2, #painel-onboarding h2 {
      font-size: 14px !important;
    }
    #painel-funil p, #painel-health p,
    #painel-helpdesk p, #painel-onboarding p {
      font-size: 11px !important;
      margin-bottom: 0 !important;
    }

    /* Seção "section" dos panels — padding interno reduzido */
    #painel-funil section,
    #painel-health section,
    #painel-helpdesk section,
    #painel-onboarding section {
      padding: 16px 18px !important;
    }

    /* Painel Próximos Passos — padding do card */
    #painel-proximos-passos section {
      padding: 16px 18px !important;
    }

    /* Linha 2 e 3: reduz gap entre painéis */
    .grid-dois-col {
      gap: 1rem !important;
    }
    #painel-kpi {
      margin-bottom: 1rem !important;
    }
    #painel-proximos-passos {
      margin-bottom: 1rem !important;
    }


    /* ────────────────────────────────────────────────────────────
     * FIX DE ROLAGEM — padrão igual à lista de empresas
     *
     * Hierarquia de scroll do app:
     *   #app-layout { height: 100vh; overflow: hidden; display: flex }
     *     .sidebar  { flex-shrink: 0 }
     *     .main-content { flex: 1; overflow-y: auto; height: 100% }  ← scroll aqui
     *       #view-dashboard { view-section normal, cresce com conteúdo }
     *
     * Solução: #view-dashboard NÃO define altura — ele apenas cresce.
     * O .main-content (que já tem overflow-y: auto) faz a rolagem.
     * ─────────────────────────────────────────────────────────── */
    #view-dashboard {
      height: auto !important;
      overflow: visible !important;
      min-height: 0 !important;
    }

    /* Margem inferior do top-bar do dashboard */
    #view-dashboard .top-bar {
      margin-bottom: 0.75rem !important;
      padding-bottom: 0 !important;
    }

    /* ─── Dropdown de usuário (Menu Geral) transferido para css/components.css ─── */
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

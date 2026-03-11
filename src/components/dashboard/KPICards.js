/**
 * KPICards.js — Painel 1: Faixa Superior de KPIs
 * Exibe 5 cards com métricas principais da base de clientes.
 *
 * @param {Object} props
 * @param {Array}  props.empresas - lista completa de empresas (mockEmpresas)
 * @param {Object} props.stats   - variações mensais (mockStats)
 * @param {string} props.containerId - ID do elemento HTML onde renderizar
 */

import { colors, kpiColors, card } from '../../theme/tokens.js';
import { initTooltipSystem, showTooltip, hideTooltip, updateTooltipPosition } from './Tooltip.js';

// ─── Ícones SVG inline (Phosphor-style) ──────────────────────────────────────
const icons = {
  building: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21v-8h6v8"/></svg>`,
  check: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
  xcircle: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>`,
  trending: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 9 11l4 4 8-8"/><path d="M14 7h7v7"/></svg>`,
  sparkles: `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-1.912 5.813-5.75 1.32 4.33 3.844L7.23 20.5 12 17.25l4.77 3.25-1.438-6.523 4.33-3.844-5.75-1.32Z"/></svg>`,
  arrowUp: `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
  arrowDn: `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>`,
};

/**
 * Calcula as métricas a partir da lista de empresas
 * @param {Array} empresas
 * @returns {Object} métricas calculadas
 */
// ─── Helper: aceita ambos os formatos de status ───────────────────────────────
// BD real: 'Ativo', 'Inativo', 'Suspenso', 'Prospect', etc.
// Mock:    'Cliente Ativo', 'Cliente Inativo', 'Cliente Suspenso', etc.
function isStatus(empresa, ...valores) {
  const s = (empresa.status || '').toLowerCase().trim();
  return valores.some(v => {
    const vl = v.toLowerCase().trim();
    return s === vl || s === `cliente ${vl}` || s.endsWith(vl);
  });
}

/**
 * Calcula as métricas a partir da lista de empresas
 * @param {Array} empresas
 * @returns {Object} métricas calculadas
 */
function calcularMetricas(empresas) {
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const total     = empresas.length;
  const ativos    = empresas.filter(e => isStatus(e, 'ativo')).length;
  const inativos  = empresas.filter(e => isStatus(e, 'inativo', 'suspenso')).length;
  const leads     = empresas.filter(e =>
    isStatus(e, 'prospect', 'lead', 'reunião', 'reuniao') ||
    (empresa => {
      const s = (empresa.status || '').toLowerCase();
      return s.includes('proposta') || s.includes('qualificado');
    })(e)
  ).length;
  const novosMes  = empresas.filter(e => {
    const d = new Date(e.createdAt);
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  }).length;

  return { total, ativos, inativos, leads, novosMes };
}

/**
 * Renderiza um KPI card individual
 * @param {Object} config - configuração do card
 */
function renderCard({ label, value, variacao, cor, destaque }) {
  const positivo = variacao >= 0;
  const varCor   = positivo ? colors.success : colors.danger;
  const varSinal  = positivo ? '↑' : '↓';
  const varTexto  = `${Math.abs(variacao)}%`;
  const numColor  = destaque ? cor : colors.textMain;

  return `
    <article class="kpi-card" style="
      background: ${colors.bgCard};
      border-radius: ${card.borderRadius};
      box-shadow: ${card.boxShadow};
      padding: 14px 16px;
      border: 1px solid ${colors.border};
      border-top: 2px solid ${cor};
      transition: ${card.transition};
      cursor: default;
      display: flex;
      flex-direction: column;
      gap: 6px;
    " data-kpi-key="${label.toLowerCase().replace(/ /g, '-')}"
       onmouseenter="this.style.transform='${card.hoverTransform}';this.style.boxShadow='0 8px 28px rgba(0,0,0,0.5)';this.style.borderTopColor='${cor}'"
       onmouseleave="this.style.transform='translateY(0)';this.style.boxShadow='${card.boxShadow}';this.style.borderTopColor='${cor}'">

      <!-- Label -->
      <span style="
        font-size: 11px;
        font-weight: 700;
        color: ${colors.textMuted};
        text-transform: uppercase;
        letter-spacing: 0.09em;
      ">${label}</span>

      <!-- Número + variação inline -->
      <div style="display:flex; align-items:baseline; gap:8px;">
        <span style="
          font-size: 28px;
          font-weight: 800;
          color: ${numColor};
          line-height: 1;
          font-variant-numeric: tabular-nums;
        " aria-label="${label}: ${value}">${value}</span>
        <span style="
          display:inline-flex; align-items:center; gap:2px;
          font-size: 12px; font-weight: 700;
          color: ${varCor};
        " title="Variação vs mês anterior">
          ${varSinal}${varTexto}
        </span>
      </div>
    </article>
  `;
}

/**
 * Renderiza todos os KPI cards no container especificado
 * @param {string} containerId - ID do elemento HTML
 * @param {Array}  empresas    - array completo de empresas
 * @param {Object} stats       - { variacaoMesAnterior: {...} }
 */
export function renderKPICards(containerId, empresas, stats) {
  initTooltipSystem();

  const el = document.getElementById(containerId);
  if (!el) return;

  const m = calcularMetricas(empresas);
  const vars = stats?.variacaoMesAnterior || {};

  const hoje = new Date('2026-03-10');
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const cards = [
    {
      label: 'Total de Empresas', value: m.total, variacao: vars.total ?? 0,
      cor: kpiColors.total, destaque: false,
      emoji: '🏢',
      getItems: () => empresas.slice(0, 8).map(e => ({
        nome: e.nome, dotCor: kpiColors.total,
        badge: e.status, badgeBg: 'rgba(15,52,96,0.1)', badgeCor: kpiColors.total,
      })),
    },
    {
      label: 'Clientes Ativos', value: m.ativos, variacao: vars.ativos ?? 0,
      cor: kpiColors.ativos, destaque: false,
      emoji: '✅',
      getItems: () => empresas.filter(e => e.status === 'Cliente Ativo')
        .sort((a, b) => (b.nps ?? 0) - (a.nps ?? 0))
        .slice(0, 8)
        .map(e => ({
          nome: e.nome, dotCor: kpiColors.ativos, nps: e.nps ?? null,
          badge: e.healthScore, badgeBg: 'rgba(16,185,129,0.1)', badgeCor: kpiColors.ativos
        })),
    },
    {
      label: 'Clientes Inativos', value: m.inativos, variacao: vars.inativos ?? 0,
      cor: kpiColors.inativos, destaque: false,
      emoji: '⚠️',
      getItems: () => empresas
        .filter(e => e.status === 'Cliente Inativo' || e.status === 'Cliente Suspenso')
        .slice(0, 8)
        .map(e => ({
          nome: e.nome, dotCor: kpiColors.inativos,
          badge: e.status, badgeBg: 'rgba(239,68,68,0.1)', badgeCor: kpiColors.inativos
        })),
    },
    {
      label: 'Leads no Funil', value: m.leads, variacao: vars.leads ?? 0,
      cor: kpiColors.leads, destaque: true,   // número em laranja como no referencial
      emoji: '🚀',
      getItems: () => empresas
        .filter(e => ['Prospect', 'Lead', 'Reunião', 'Proposta | Andamento'].includes(e.status))
        .slice(0, 8)
        .map(e => ({
          nome: e.nome, dotCor: kpiColors.leads,
          badge: e.status, badgeBg: 'rgba(232,131,42,0.1)', badgeCor: kpiColors.leads
        })),
    },
    {
      label: 'Novos este Mês', value: m.novosMes, variacao: vars.novosMes ?? 0,
      cor: kpiColors.novos, destaque: false,
      emoji: '✨',
      getItems: () => empresas
        .filter(e => { const d = new Date(e.createdAt); return d.getMonth() === mesAtual && d.getFullYear() === anoAtual; })
        .slice(0, 8)
        .map(e => ({
          nome: e.nome, dotCor: kpiColors.novos,
          badge: e.status, badgeBg: 'rgba(245,158,11,0.1)', badgeCor: kpiColors.novos
        })),
    },
  ];

  el.innerHTML = `
    <div style="
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 1rem;
    " class="kpi-grid">
      ${cards.map(renderCard).join('')}
    </div>
  `;

  // Attacha tooltips após o render
  cards.forEach(cardData => {
    const key = cardData.label.toLowerCase().replace(/ /g, '-');
    const artigo = el.querySelector(`[data-kpi-key="${key}"]`);
    if (!artigo) return;

    artigo.style.cursor = 'default';

    artigo.addEventListener('mouseenter', (ev) => {
      showTooltip(ev, {
        emoji: cardData.emoji,
        titulo: cardData.label,
        items: cardData.getItems(),
      });
    });
    artigo.addEventListener('mousemove', (ev) => updateTooltipPosition(ev));
    artigo.addEventListener('mouseleave', () => hideTooltip());
  });
}

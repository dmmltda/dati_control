/**
 * SalesFunnel.js — Painel 3: Funil de Vendas
 * Gráfico de barras horizontal com tooltips ricos no hover de cada barra.
 */

import { colors, funnelColors, card } from '../../theme/tokens.js';
import { initTooltipSystem, showTooltip, hideTooltip, updateTooltipPosition } from './Tooltip.js';

// ─── Configuração das etapas do funil ─────────────────────────────────────────
const ETAPAS_FUNIL = [
  { label: 'Prospects', status: ['Prospect'], emoji: '🎯' },
  { label: 'Leads Qualificados', status: ['Lead'], emoji: '🔍' },
  { label: 'Em Reunião', status: ['Reunião'], emoji: '📅' },
  { label: 'Proposta Enviada', status: ['Proposta | Andamento'], emoji: '📄' },
  { label: 'Clientes Ativos', status: ['Cliente Ativo'], emoji: '✅' },
];

function calcularFunil(empresas) {
  const etapas = ETAPAS_FUNIL.map((etapa) => {
    const empresasDaEtapa = empresas.filter(e => etapa.status.includes(e.status));
    const quantidade = empresasDaEtapa.length;
    const valorTotal = empresasDaEtapa.reduce((acc, e) => acc + (e.valorEstimadoMensal || 0), 0);
    return { ...etapa, quantidade, valorTotal, empresas: empresasDaEtapa };
  });

  return etapas.map((etapa, i) => {
    const anterior = i > 0 ? etapas[i - 1].quantidade : etapa.quantidade;
    const taxa = anterior > 0 ? Math.round((etapa.quantidade / anterior) * 100) : 100;
    return { ...etapa, taxa };
  });
}

function formatarValor(valor) {
  if (valor >= 1000000) return `R$ ${(valor / 1000000).toFixed(1)}M`;
  if (valor >= 1000) return `R$ ${(valor / 1000).toFixed(0)}k`;
  return `R$ ${valor.toLocaleString('pt-BR')}`;
}

// ─── Attach do tooltip às barras após render ──────────────────────────────────

function attachFunnelTooltips(el, dados, funnelCols) {
  const barras = el.querySelectorAll('[data-funil-index]');

  barras.forEach(barra => {
    const idx = parseInt(barra.getAttribute('data-funil-index'), 10);
    const d = dados[idx];
    const cor = funnelCols[idx] || colors.primary;

    // Monta os itens para o tooltip
    const items = d.empresas.map(e => ({
      nome: e.nome,
      dotCor: cor,
      badge: e.responsavel?.nome ? e.responsavel.nome.split(' ')[0] : null,
      badgeBg: `${cor}22`,
      badgeCor: cor,
      nps: e.nps ?? null,
    }));

    barra.style.cursor = 'pointer';

    barra.addEventListener('mouseenter', (ev) => {
      showTooltip(ev, {
        emoji: d.emoji,
        titulo: d.label,
        items,
        stat: d.valorTotal > 0 ? `${formatarValor(d.valorTotal)}/mês` : null,
        statLabel: 'MRR estimado',
      });
    });

    barra.addEventListener('mousemove', (ev) => {
      updateTooltipPosition(ev);
    });

    barra.addEventListener('mouseleave', () => {
      hideTooltip();
    });
  });
}

/**
 * Renderiza o Funil de Vendas no container especificado
 */
export function renderSalesFunnel(containerId, empresas) {
  initTooltipSystem();

  const el = document.getElementById(containerId);
  if (!el) return;

  const dados = calcularFunil(empresas);
  const maxQtd = Math.max(...dados.map(d => d.quantidade), 1);

  el.innerHTML = `
    <section style="
      background: ${colors.bgCard};
      border-radius: ${card.borderRadius};
      box-shadow: ${card.boxShadow};
      padding: ${card.padding};
      height: 100%;
      display: flex;
      flex-direction: column;
    ">
      <!-- Cabeçalho -->
      <div style="margin-bottom: 1.25rem;">
        <h2 style="font-size: 1rem; font-weight: 800; color: ${colors.textMain};
          display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.2rem;">
          <span style="font-size: 1.1rem;">📊</span>
          Funil de Vendas
        </h2>
        <p style="font-size: 0.78rem; color: ${colors.textMuted}; margin: 0;">
          Passe o mouse em cada barra para ver as empresas
        </p>
      </div>

      <!-- Barras horizontais — cada uma com data-funil-index para eventos -->
      <div style="display: flex; flex-direction: column; gap: 0.75rem; flex: 1;">
        ${dados.map((d, i) => {
    const pct = Math.round((d.quantidade / maxQtd) * 100);
    const cor = funnelColors[i] || colors.primary;
    const taxa = i === 0 ? '—' : `${d.taxa}% da etapa anterior`;

    return `
            <div data-funil-index="${i}" style="
              padding: 6px 8px;
              border-radius: 8px;
              transition: background 150ms;
            "
            onmouseenter="this.style.background='${cor}0C'"
            onmouseleave="this.style.background='transparent'">

              <!-- Label e quantidade -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
                <span style="font-size: 0.8rem; font-weight: 600; color: ${colors.textMain}; display:flex; align-items:center; gap:5px;">
                  ${d.emoji} ${d.label}
                </span>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <span style="font-size: 0.72rem; color: ${colors.textMuted};">${taxa}</span>
                  <span style="font-size: 0.85rem; font-weight: 800; color: ${cor}; min-width: 28px; text-align: right;">${d.quantidade}</span>
                </div>
              </div>

              <!-- Barra de progresso -->
              <div style="background: ${cor}18; border-radius: 9999px; height: 9px; overflow: hidden;">
                <div style="
                  width: ${pct}%; height: 100%;
                  background: linear-gradient(90deg, ${cor}, ${cor}cc);
                  border-radius: 9999px;
                  transition: width 700ms cubic-bezier(0.4, 0, 0.2, 1);
                "></div>
              </div>

              <!-- Valor estimado -->
              <div style="margin-top: 0.15rem; font-size: 0.7rem; color: ${colors.textMuted}; text-align: right;">
                ${formatarValor(d.valorTotal)}/mês estimado
              </div>
            </div>
          `;
  }).join('')}
      </div>

      <!-- Total -->
      <div style="margin-top: 1rem; padding-top: 0.75rem;
        border-top: 1px solid ${colors.border};
        display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.75rem; color: ${colors.textMuted};">Total estimado em carteira</span>
        <span style="font-size: 1rem; font-weight: 800; color: ${colors.accent};">
          ${formatarValor(empresas.filter(e => e.status === 'Cliente Ativo').reduce((acc, e) => acc + (e.valorEstimadoMensal || 0), 0))}/mês
        </span>
      </div>
    </section>
  `;

  // Attacha os eventos de tooltip APÓS o render
  attachFunnelTooltips(el, dados, funnelColors);
}

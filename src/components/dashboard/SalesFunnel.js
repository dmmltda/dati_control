/**
 * SalesFunnel.js — Painel 3: Funil de Vendas
 * Gráfico de barras horizontal usando Chart.js (CDN).
 * Exibe contagem e valor estimado por etapa do funil.
 *
 * @param {string} containerId - ID do elemento HTML onde renderizar
 * @param {Array}  empresas    - lista completa de empresas
 */

import { colors, funnelColors, card } from '../../theme/tokens.js';

// ─── Configuração das etapas do funil ─────────────────────────────────────────
const ETAPAS_FUNIL = [
    { label: 'Prospects', status: ['Prospect'] },
    { label: 'Leads Qualificados', status: ['Lead'] },
    { label: 'Em Reunião', status: ['Reunião'] },
    { label: 'Proposta Enviada', status: ['Proposta | Andamento'] },
    { label: 'Clientes Ativos', status: ['Cliente Ativo'] },
];

/**
 * Calcula os dados do funil a partir das empresas
 * @param {Array} empresas
 */
function calcularFunil(empresas) {
    const etapas = ETAPAS_FUNIL.map((etapa, i) => {
        const empresasDaEtapa = empresas.filter(e => etapa.status.includes(e.status));
        const quantidade = empresasDaEtapa.length;
        const valorTotal = empresasDaEtapa.reduce((acc, e) => acc + (e.valorEstimadoMensal || 0), 0);
        return { ...etapa, quantidade, valorTotal };
    });

    // Calcula taxa de conversão para cada etapa vs anterior
    return etapas.map((etapa, i) => {
        const anterior = i > 0 ? etapas[i - 1].quantidade : etapa.quantidade;
        const taxa = anterior > 0 ? Math.round((etapa.quantidade / anterior) * 100) : 100;
        return { ...etapa, taxa };
    });
}

/**
 * Formata valor em R$ (abreviado se grande)
 * @param {number} valor
 */
function formatarValor(valor) {
    if (valor >= 1000000) return `R$ ${(valor / 1000000).toFixed(1)}M`;
    if (valor >= 1000) return `R$ ${(valor / 1000).toFixed(0)}k`;
    return `R$ ${valor.toLocaleString('pt-BR')}`;
}

let _chartInstance = null;

/**
 * Renderiza o Funil de Vendas no container especificado
 * @param {string} containerId
 * @param {Array}  empresas
 */
export function renderSalesFunnel(containerId, empresas) {
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
      <div style="margin-bottom: 1.5rem;">
        <h2 style="
          font-size: 1rem; font-weight: 800; color: ${colors.textMain};
          display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.2rem;
        ">
          <span style="font-size: 1.1rem;">📊</span>
          Funil de Vendas
        </h2>
        <p style="font-size: 0.78rem; color: ${colors.textMuted}; margin: 0;">
          Distribuição de ${empresas.length} registros por etapa
        </p>
      </div>

      <!-- Barras horizontais do funil -->
      <div style="display: flex; flex-direction: column; gap: 0.75rem; flex: 1;">
        ${dados.map((d, i) => {
        const pct = Math.round((d.quantidade / maxQtd) * 100);
        const cor = funnelColors[i] || colors.primary;
        const taxa = i === 0 ? '—' : `${d.taxa}% da etapa anterior`;

        return `
            <div>
              <!-- Label e quantidade -->
              <div style="
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 0.3rem;
              ">
                <span style="font-size: 0.8rem; font-weight: 600; color: ${colors.textMain};">
                  ${d.label}
                </span>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <span style="font-size: 0.72rem; color: ${colors.textMuted};">${taxa}</span>
                  <span style="
                    font-size: 0.85rem; font-weight: 800; color: ${cor};
                    min-width: 28px; text-align: right;
                  ">${d.quantidade}</span>
                </div>
              </div>

              <!-- Barra de progresso -->
              <div style="
                background: ${cor}18; border-radius: 9999px; height: 10px;
                overflow: hidden; position: relative;
              " title="${d.label}: ${d.quantidade} empresas — ${formatarValor(d.valorTotal)}/mês">
                <div style="
                  width: ${pct}%; height: 100%;
                  background: linear-gradient(90deg, ${cor}, ${cor}cc);
                  border-radius: 9999px;
                  transition: width 600ms cubic-bezier(0.4, 0, 0.2, 1);
                "></div>
              </div>

              <!-- Valor estimado -->
              <div style="
                margin-top: 0.2rem; font-size: 0.72rem;
                color: ${colors.textMuted}; text-align: right;
              ">
                ${formatarValor(d.valorTotal)}/mês estimado
              </div>
            </div>
          `;
    }).join('')}
      </div>

      <!-- Totais -->
      <div style="
        margin-top: 1.25rem; padding-top: 1rem;
        border-top: 1px solid ${colors.border};
        display: flex; justify-content: space-between; align-items: center;
      ">
        <span style="font-size: 0.75rem; color: ${colors.textMuted};">
          Total estimado em carteira
        </span>
        <span style="
          font-size: 1rem; font-weight: 800; color: ${colors.accent};
        ">
          ${formatarValor(empresas.filter(e => e.status === 'Cliente Ativo').reduce((acc, e) => acc + (e.valorEstimadoMensal || 0), 0))}/mês
        </span>
      </div>
    </section>
  `;
}

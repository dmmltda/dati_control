/**
 * HealthScore.js — Painel 4: Health Score dos Clientes
 * Gráfico donut (SVG) + tabela dos 5 clientes com menor NPS.
 *
 * @param {string} containerId - ID do elemento HTML onde renderizar
 * @param {Array}  empresas    - lista de empresas (clientes ativos)
 */

import { colors, healthColors, card } from '../../theme/tokens.js';

/**
 * Calcula a distribuição de health score entre clientes ativos
 * @param {Array} empresas
 */
function calcularHealth(empresas) {
    const ativos = empresas.filter(e => e.status === 'Cliente Ativo');
    const total = ativos.length || 1;

    const grupos = {
        'Saudável': ativos.filter(e => e.healthScore === 'Saudável').length,
        'Em Atenção': ativos.filter(e => e.healthScore === 'Em Atenção').length,
        'Em Risco': ativos.filter(e => e.healthScore === 'Em Risco').length,
    };

    return {
        grupos,
        total,
        percentuais: {
            'Saudável': Math.round((grupos['Saudável'] / total) * 100),
            'Em Atenção': Math.round((grupos['Em Atenção'] / total) * 100),
            'Em Risco': Math.round((grupos['Em Risco'] / total) * 100),
        },
    };
}

/**
 * Gera o SVG de donut chart com animação CSS
 * @param {Object} dados - { grupos, percentuais, total }
 */
function renderDonut(dados) {
    const CX = 60, CY = 60, R = 48;
    const circunferencia = 2 * Math.PI * R;

    const segmentos = [
        { label: 'Saudável', count: dados.grupos['Saudável'], cor: healthColors['Saudável'], pct: dados.percentuais['Saudável'] },
        { label: 'Em Atenção', count: dados.grupos['Em Atenção'], cor: healthColors['Em Atenção'], pct: dados.percentuais['Em Atenção'] },
        { label: 'Em Risco', count: dados.grupos['Em Risco'], cor: healthColors['Em Risco'], pct: dados.percentuais['Em Risco'] },
    ];

    let offsetAcumulado = 0;
    const arcs = segmentos.map(seg => {
        const comprimento = (seg.pct / 100) * circunferencia;
        const offset = circunferencia - comprimento;
        const rotation = (offsetAcumulado / 100) * 360 - 90;
        offsetAcumulado += seg.pct;

        return `
      <circle
        cx="${CX}" cy="${CY}" r="${R}"
        fill="none"
        stroke="${seg.cor}"
        stroke-width="14"
        stroke-dasharray="${comprimento} ${circunferencia - comprimento}"
        stroke-dashoffset="${-(offsetAcumulado - seg.pct) / 100 * circunferencia}"
        transform="rotate(-90 ${CX} ${CY})"
        title="${seg.label}: ${seg.count} (${seg.pct}%)"
      />
    `;
    });

    return `
    <div style="position: relative; display: inline-flex;">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-label="Gráfico donut de health score">
        <!-- Track (fundo cinza) -->
        <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${colors.border}" stroke-width="14"/>
        ${arcs.join('')}
      </svg>
      <!-- Centro do donut: total -->
      <div style="
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        text-align: center;
      ">
        <div style="font-size: 1.4rem; font-weight: 800; color: ${colors.textMain}; line-height: 1;">${dados.total}</div>
        <div style="font-size: 0.6rem; color: ${colors.textMuted}; font-weight: 600; text-transform: uppercase;">ativos</div>
      </div>
    </div>
  `;
}

/**
 * Renderiza a legenda ao lado do donut
 * @param {Object} dados
 */
function renderLegenda(dados) {
    return Object.entries(dados.grupos).map(([label, count]) => {
        const cor = healthColors[label];
        const pct = dados.percentuais[label];
        return `
      <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
        <span style="
          width: 12px; height: 12px; border-radius: 50%;
          background: ${cor}; flex-shrink: 0;
        "></span>
        <div style="flex: 1;">
          <div style="font-size: 0.8rem; font-weight: 600; color: ${colors.textMain};">${label}</div>
          <div style="font-size: 0.72rem; color: ${colors.textMuted};">${count} clientes · ${pct}%</div>
        </div>
      </div>
    `;
    }).join('');
}

/**
 * Renderiza a tabela dos 5 clientes com menor NPS
 * @param {Array} empresas
 */
function renderTabelaMinNPS(empresas) {
    const ativos = empresas
        .filter(e => e.status === 'Cliente Ativo' && e.nps !== null && e.nps !== undefined)
        .sort((a, b) => a.nps - b.nps)
        .slice(0, 5);

    if (ativos.length === 0) {
        return `<p style="font-size: 0.82rem; color: ${colors.textMuted}; text-align: center; padding: 1rem;">Sem dados de NPS disponíveis.</p>`;
    }

    const npsColor = (nps) => {
        if (nps >= 7) return colors.success;
        if (nps >= 5) return colors.warning;
        return colors.danger;
    };

    const healthBadge = (hs) => {
        const cor = healthColors[hs] || colors.textMuted;
        const emoji = { 'Saudável': '🟢', 'Em Atenção': '🟡', 'Em Risco': '🔴' }[hs] || '⚪';
        return `<span style="
      background: ${cor}18; color: ${cor};
      font-size: 0.68rem; font-weight: 700;
      padding: 2px 7px; border-radius: 9999px;
    ">${emoji} ${hs}</span>`;
    };

    const rows = ativos.map(e => `
    <tr onmouseenter="this.style.background='#F8FAFC'" onmouseleave="this.style.background='transparent'">
      <td style="padding: 0.65rem 0.75rem; font-size: 0.8rem; font-weight: 600; color: ${colors.textMain}; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${e.nome}">
        ${e.nome}
      </td>
      <td style="padding: 0.65rem 0.75rem; text-align: center;">
        <span style="
          font-size: 1.1rem; font-weight: 800; color: ${npsColor(e.nps)};
        ">${e.nps}</span>
      </td>
      <td style="padding: 0.65rem 0.75rem;">
        ${healthBadge(e.healthScore)}
      </td>
      <td style="padding: 0.65rem 0.75rem; font-size: 0.77rem; color: ${colors.textMuted};">
        ${e.responsavel?.nome || '—'}
      </td>
    </tr>
  `).join('');

    return `
    <div style="overflow-x: auto; margin-top: 0.25rem;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid ${colors.border};">
            <th style="padding: 0.5rem 0.75rem; text-align: left; font-size: 0.68rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase;">Empresa</th>
            <th style="padding: 0.5rem 0.75rem; text-align: center; font-size: 0.68rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase;">NPS</th>
            <th style="padding: 0.5rem 0.75rem; text-align: left; font-size: 0.68rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase;">Saúde</th>
            <th style="padding: 0.5rem 0.75rem; text-align: left; font-size: 0.68rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase;">Responsável</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * Renderiza o painel de Health Score completo
 * @param {string} containerId
 * @param {Array}  empresas
 */
export function renderHealthScore(containerId, empresas) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const dados = calcularHealth(empresas);

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
        <h2 style="
          font-size: 1rem; font-weight: 800; color: ${colors.textMain};
          display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.2rem;
        ">
          <span style="font-size: 1.1rem;">💚</span>
          Health Score
        </h2>
        <p style="font-size: 0.78rem; color: ${colors.textMuted}; margin: 0;">
          Status de saúde dos clientes ativos
        </p>
      </div>

      <!-- Donut + Legenda -->
      <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.5rem;">
        ${renderDonut(dados)}
        <div style="flex: 1;">
          ${renderLegenda(dados)}
        </div>
      </div>

      <!-- Divisor -->
      <div style="border-top: 1px solid ${colors.border}; margin-bottom: 1rem;"></div>

      <!-- Tabela menor NPS -->
      <div>
        <h3 style="
          font-size: 0.82rem; font-weight: 700; color: ${colors.textMain};
          margin: 0 0 0.75rem; display: flex; align-items: center; gap: 0.4rem;
        ">
          ⚠️ Clientes com Menor NPS
        </h3>
        ${renderTabelaMinNPS(empresas)}
      </div>
    </section>
  `;
}

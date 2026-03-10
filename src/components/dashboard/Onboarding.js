/**
 * Onboarding.js — Painel 6: Onboarding de Clientes
 * Visão rápida do progresso de onboarding e clientes com atraso.
 *
 * @param {string} containerId  - ID do elemento HTML onde renderizar
 * @param {Array}  onboardings  - lista de onboardings (mockOnboardings)
 */

import { colors, card } from '../../theme/tokens.js';

/**
 * Renderiza uma ProgressBar inline
 * @param {number} progresso - 0 a 100
 * @param {boolean} atrasado
 */
function renderProgressBar(progresso, atrasado) {
    const cor = atrasado
        ? colors.danger
        : progresso >= 75
            ? colors.success
            : progresso >= 40
                ? colors.warning
                : colors.textMuted;

    return `
    <div style="display: flex; align-items: center; gap: 0.5rem;">
      <div style="
        flex: 1; height: 8px; border-radius: 9999px;
        background: ${cor}20; overflow: hidden;
      ">
        <div style="
          width: ${progresso}%; height: 100%;
          background: ${cor};
          border-radius: 9999px;
          transition: width 500ms ease;
        "></div>
      </div>
      <span style="
        font-size: 0.72rem; font-weight: 700; color: ${cor};
        min-width: 32px; text-align: right;
      ">${progresso}%</span>
    </div>
  `;
}

/**
 * Calcula métricas gerais de onboarding
 * @param {Array} onboardings
 */
function calcularMetricas(onboardings) {
    const total = onboardings.length;
    const atrasados = onboardings.filter(o => o.atrasado).length;
    const progressoMedio = total > 0
        ? Math.round(onboardings.reduce((acc, o) => acc + o.progresso, 0) / total)
        : 0;

    return { total, atrasados, progressoMedio };
}

/**
 * Renderiza a lista de clientes com onboarding atrasado
 * @param {Array} onboardings
 */
function renderListaAtrasados(onboardings) {
    const atrasados = onboardings
        .filter(o => o.atrasado)
        .sort((a, b) => b.diasDesdeInicio - a.diasDesdeInicio);

    if (atrasados.length === 0) {
        return `
      <div style="text-align: center; padding: 1.5rem; color: ${colors.success};">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎉</div>
        <p style="font-size: 0.82rem; font-weight: 600;">Nenhum onboarding atrasado!</p>
      </div>
    `;
    }

    return atrasados.map(o => {
        const critico = o.critico; // > 60 dias
        const bgLinha = critico ? 'rgba(239,68,68,0.05)' : 'transparent';
        const borderS = critico ? `border-left: 3px solid ${colors.danger};` : `border-left: 3px solid transparent;`;

        return `
      <div style="
        padding: 0.85rem 1rem;
        background: ${bgLinha};
        ${borderS}
        border-radius: 0 8px 8px 0;
        margin-bottom: 0.5rem;
        border-bottom: 1px solid ${colors.border};
      ">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; gap: 0.5rem;">
          <!-- Nome + Responsável -->
          <div style="flex: 1; min-width: 0;">
            <div style="
              font-size: 0.82rem; font-weight: 700; color: ${colors.textMain};
              overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            " title="${o.empresa}">${o.empresa}</div>
            <div style="font-size: 0.72rem; color: ${colors.textMuted}; margin-top: 0.1rem;">
              👤 ${o.responsavel}
            </div>
          </div>

          <!-- Dias desde início -->
          <span style="
            background: ${critico ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)'};
            color: ${critico ? colors.danger : colors.warning};
            font-size: 0.68rem; font-weight: 800;
            padding: 3px 8px; border-radius: 9999px;
            flex-shrink: 0;
          ">${o.diasDesdeInicio}d</span>
        </div>

        <!-- Barra de progresso -->
        ${renderProgressBar(o.progresso, true)}

        <!-- Etapas -->
        <div style="font-size: 0.7rem; color: ${colors.textMuted}; margin-top: 0.3rem;">
          ${o.etapasConcluidas} de ${o.etapasTotal} etapas concluídas
        </div>
      </div>
    `;
    }).join('');
}

/**
 * Renderiza o painel de Onboarding completo
 * @param {string} containerId
 * @param {Array}  onboardings
 */
export function renderOnboarding(containerId, onboardings) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const { total, atrasados, progressoMedio } = calcularMetricas(onboardings);

    el.innerHTML = `
    <section style="
      background: ${colors.bgCard};
      border-radius: ${card.borderRadius};
      box-shadow: ${card.boxShadow};
      padding: ${card.padding};
    ">
      <!-- Cabeçalho -->
      <div style="margin-bottom: 1.25rem;">
        <h2 style="
          font-size: 1rem; font-weight: 800; color: ${colors.textMain};
          display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.2rem;
        ">
          <span style="font-size: 1.1rem;">🚀</span>
          Onboarding de Clientes
        </h2>
        <p style="font-size: 0.78rem; color: ${colors.textMuted}; margin: 0;">
          Acompanhamento de clientes em fase de implantação
        </p>
      </div>

      <!-- Métricas do topo -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.25rem;">

        <!-- Em onboarding ativo -->
        <div style="
          background: rgba(15,52,96,0.06);
          border: 1px solid rgba(15,52,96,0.15);
          border-radius: 10px; padding: 1rem; text-align: center;
        ">
          <div style="font-size: 1.5rem; font-weight: 800; color: ${colors.primary};">${total}</div>
          <div style="font-size: 0.7rem; color: ${colors.textMuted}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.15rem;">Em Onboarding</div>
        </div>

        <!-- Atrasados -->
        <div style="
          background: ${atrasados > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)'};
          border: 1px solid ${atrasados > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'};
          border-radius: 10px; padding: 1rem; text-align: center;
        ">
          <div style="font-size: 1.5rem; font-weight: 800; color: ${atrasados > 0 ? colors.danger : colors.success};">${atrasados}</div>
          <div style="font-size: 0.7rem; color: ${colors.textMuted}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.15rem;">Atrasados</div>
        </div>

        <!-- Progresso médio -->
        <div style="
          background: rgba(232,131,42,0.06);
          border: 1px solid rgba(232,131,42,0.15);
          border-radius: 10px; padding: 1rem; text-align: center;
        ">
          <div style="font-size: 1.5rem; font-weight: 800; color: ${colors.accent};">${progressoMedio}%</div>
          <div style="font-size: 0.7rem; color: ${colors.textMuted}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.15rem;">Prog. Médio</div>
        </div>
      </div>

      <!-- Barra de progresso geral -->
      <div style="margin-bottom: 1.25rem;">
        <div style="
          display: flex; justify-content: space-between; margin-bottom: 0.4rem;
          font-size: 0.75rem; font-weight: 600; color: ${colors.textMuted};
        ">
          <span>Progresso Geral</span>
          <span>${progressoMedio}%</span>
        </div>
        ${renderProgressBar(progressoMedio, false)}
      </div>

      <!-- Divisor -->
      <div style="border-top: 1px solid ${colors.border}; margin-bottom: 1rem;"></div>

      <!-- Lista de atrasados -->
      <div>
        <h3 style="
          font-size: 0.82rem; font-weight: 700; color: ${colors.textMain};
          margin: 0 0 0.75rem; display: flex; align-items: center; gap: 0.4rem;
        ">
          ⚠️ Onboardings Atrasados
          ${atrasados > 0 ? `<span style="
            background: rgba(239,68,68,0.15); color: ${colors.danger};
            font-size: 0.68rem; font-weight: 800;
            padding: 1px 7px; border-radius: 9999px;
          ">${atrasados}</span>` : ''}
        </h3>
        <div style="max-height: 260px; overflow-y: auto;">
          ${renderListaAtrasados(onboardings)}
        </div>
      </div>

      <!-- Badge de formulários pendentes (placeholder fase 2) -->
      <div style="
        margin-top: 1rem; padding: 0.65rem 1rem;
        background: rgba(232,131,42,0.08);
        border: 1px solid rgba(232,131,42,0.2);
        border-radius: 8px;
        display: flex; align-items: center; gap: 0.5rem;
      ">
        <span style="font-size: 0.9rem;">📝</span>
        <span style="font-size: 0.78rem; color: ${colors.accent}; font-weight: 600;">
          3 formulários aguardando envio <em style="font-weight: 400; color: ${colors.textMuted};">— integração prevista para fase 2</em>
        </span>
      </div>
    </section>
  `;
}

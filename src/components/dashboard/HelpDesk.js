/**
 * HelpDesk.js — Painel 5: Chamados e Help Desk
 * Mini-cards de status + linha do tempo últimos 7 dias + lista de chamados críticos.
 *
 * @param {string} containerId - ID do elemento HTML onde renderizar
 * @param {Array}  chamados    - lista de chamados (mockChamados)
 * @param {Array}  timeline    - dados dos últimos 7 dias (mockHelpDeskTimeline)
 */

import { colors, card } from '../../theme/tokens.js';

/**
 * Calcula métricas dos chamados
 * @param {Array} chamados
 */
function calcularMetricasChamados(chamados) {
    const abertos = chamados.filter(c => c.status === 'Aberto').length;
    const emAndamento = chamados.filter(c => c.status === 'Em Andamento').length;
    const resolvidos = chamados.filter(c => c.status === 'Resolvido' && c.resolvidoEm);

    let tempoMedio = 0;
    if (resolvidos.length > 0) {
        const totalHoras = resolvidos.reduce((acc, c) => {
            const diff = new Date(c.resolvidoEm) - new Date(c.criadoEm);
            return acc + diff / (1000 * 60 * 60);
        }, 0);
        tempoMedio = Math.round(totalHoras / resolvidos.length);
    }

    return { abertos, emAndamento, tempoMedio };
}

/**
 * Renderiza os 3 mini-cards do bloco A
 * @param {Object} metricas
 */
function renderMiniCards({ abertos, emAndamento, tempoMedio }) {
    const cardDados = [
        {
            label: 'Abertos',
            value: abertos,
            cor: colors.danger,
            bg: 'rgba(239,68,68,0.08)',
            emoji: '🔴',
            sub: 'aguardando atendimento',
        },
        {
            label: 'Em Andamento',
            value: emAndamento,
            cor: colors.warning,
            bg: 'rgba(245,158,11,0.08)',
            emoji: '🟡',
            sub: 'sendo tratados',
        },
        {
            label: 'Tempo Médio',
            value: `${tempoMedio}h`,
            cor: colors.primary,
            bg: 'rgba(15,52,96,0.08)',
            emoji: '⏱️',
            sub: 'para resolução',
        },
    ];

    return cardDados.map(d => `
    <div style="
      background: ${d.bg};
      border: 1px solid ${d.cor}30;
      border-radius: 10px;
      padding: 1rem 1.25rem;
      text-align: center;
      flex: 1;
    ">
      <div style="font-size: 1.4rem; margin-bottom: 0.3rem;">${d.emoji}</div>
      <div style="font-size: 1.6rem; font-weight: 800; color: ${d.cor}; line-height: 1;">${d.value}</div>
      <div style="font-size: 0.72rem; font-weight: 700; color: ${d.cor}; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 0.2rem;">${d.label}</div>
      <div style="font-size: 0.7rem; color: ${colors.textMuted}; margin-top: 0.15rem;">${d.sub}</div>
    </div>
  `).join('');
}

/**
 * Renderiza o gráfico de linha SVG dos últimos 7 dias
 * @param {Array} timeline - [{ dia, abertos, resolvidos }]
 */
function renderLineChart(timeline) {
    if (!timeline || timeline.length === 0) return '';

    const W = 400, H = 100, PAD = 20;
    const INNER_W = W - PAD * 2;
    const INNER_H = H - PAD * 2;

    const maxVal = Math.max(...timeline.map(d => Math.max(d.abertos, d.resolvidos)), 1);

    const toX = (i) => PAD + (i / (timeline.length - 1)) * INNER_W;
    const toY = (v) => PAD + INNER_H - (v / maxVal) * INNER_H;

    // Gera path de linha
    function makePath(key) {
        return timeline.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d[key])}`).join(' ');
    }

    // Gera área preenchida
    function makeArea(key, cor) {
        const pts = timeline.map((d, i) => `${toX(i)},${toY(d[key])}`).join(' ');
        const first = `${toX(0)},${toY(timeline[0][key])}`;
        const last = `${toX(timeline.length - 1)},${toY(timeline[timeline.length - 1][key])}`;
        return `
      <defs>
        <linearGradient id="grad-${key}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cor}" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="${cor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${first} ${pts} ${toX(timeline.length - 1)},${H} ${toX(0)},${H}" fill="url(#grad-${key})"/>
    `;
    }

    // Labels eixo X
    const labels = timeline.map((d, i) => `
    <text x="${toX(i)}" y="${H + 12}" text-anchor="middle" font-size="10" fill="${colors.textMuted}">${d.dia}</text>
  `).join('');

    return `
    <div style="margin: 1rem 0; overflow-x: auto;">
      <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 0.75rem;">
        <h3 style="font-size: 0.82rem; font-weight: 700; color: ${colors.textMain}; margin: 0;">
          📈 Últimos 7 Dias
        </h3>
        <div style="display: flex; gap: 1rem; margin-left: auto;">
          <span style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; color: ${colors.textMuted};">
            <span style="width: 14px; height: 3px; background: ${colors.danger}; border-radius: 2px; display: inline-block;"></span>
            Abertos
          </span>
          <span style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; color: ${colors.textMuted};">
            <span style="width: 14px; height: 3px; background: ${colors.success}; border-radius: 2px; display: inline-block;"></span>
            Resolvidos
          </span>
        </div>
      </div>
      <svg width="100%" viewBox="0 0 ${W} ${H + 20}" style="display: block; overflow: visible;">
        ${makeArea('abertos', colors.danger)}
        ${makeArea('resolvidos', colors.success)}
        <!-- Linha abertos -->
        <path d="${makePath('abertos')}" fill="none" stroke="${colors.danger}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Linha resolvidos -->
        <path d="${makePath('resolvidos')}" fill="none" stroke="${colors.success}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Pontos -->
        ${timeline.map((d, i) => `
          <circle cx="${toX(i)}" cy="${toY(d.abertos)}" r="4" fill="${colors.danger}" stroke="white" stroke-width="2"/>
          <circle cx="${toX(i)}" cy="${toY(d.resolvidos)}" r="4" fill="${colors.success}" stroke="white" stroke-width="2"/>
        `).join('')}
        <!-- Labels X -->
        ${labels}
      </svg>
    </div>
  `;
}

/**
 * Renderiza a lista dos 3 chamados críticos mais antigos
 * @param {Array} chamados
 */
function renderChamadosCriticos(chamados) {
    const abertos = chamados
        .filter(c => c.status === 'Aberto' || c.status === 'Em Andamento')
        .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm))
        .slice(0, 3);

    if (abertos.length === 0) {
        return `
      <div style="text-align: center; padding: 1rem; color: ${colors.success};">
        ✅ Nenhum chamado crítico aberto!
      </div>
    `;
    }

    return abertos.map(c => {
        const critico = c.diasAberto > 5;
        return `
      <div style="
        display: flex; align-items: flex-start; gap: 0.75rem;
        padding: 0.75rem; border-radius: 8px;
        background: ${critico ? 'rgba(239,68,68,0.05)' : 'transparent'};
        border: 1px solid ${critico ? 'rgba(239,68,68,0.2)' : colors.border};
        margin-bottom: 0.6rem;
      ">
        <!-- Dias aberto -->
        <span style="
          background: ${critico ? colors.danger : colors.textMuted};
          color: white; font-size: 0.68rem; font-weight: 700;
          padding: 3px 7px; border-radius: 9999px;
          white-space: nowrap; flex-shrink: 0;
        ">${c.diasAberto}d</span>

        <!-- Info -->
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.8rem; font-weight: 600; color: ${colors.textMain}; 
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.titulo}">
            ${c.titulo}
          </div>
          <div style="font-size: 0.72rem; color: ${colors.textMuted}; margin-top: 0.15rem;">
            ${c.empresa} · ${c.responsavel}
          </div>
        </div>

        <!-- Status -->
        <span style="
          background: ${c.status === 'Aberto' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'};
          color: ${c.status === 'Aberto' ? colors.danger : colors.warning};
          font-size: 0.68rem; font-weight: 700;
          padding: 2px 7px; border-radius: 9999px;
          flex-shrink: 0;
        ">${c.status}</span>
      </div>
    `;
    }).join('');
}

/**
 * Renderiza o painel completo de Help Desk
 * @param {string} containerId
 * @param {Array}  chamados
 * @param {Array}  timeline
 */
export function renderHelpDesk(containerId, chamados, timeline) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const metricas = calcularMetricasChamados(chamados);

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
          <span style="font-size: 1.1rem;">🎧</span>
          Chamados & Help Desk
        </h2>
        <p style="font-size: 0.78rem; color: ${colors.textMuted}; margin: 0;">
          ${chamados.length} chamados no total nos últimos 30 dias
        </p>
      </div>

      <!-- Bloco A: Mini-cards -->
      <div style="display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap;">
        ${renderMiniCards(metricas)}
      </div>

      <!-- Bloco B: Line chart -->
      ${renderLineChart(timeline)}

      <!-- Divisor -->
      <div style="border-top: 1px solid ${colors.border}; margin: 0.75rem 0;"></div>

      <!-- Chamados críticos -->
      <div>
        <h3 style="font-size: 0.82rem; font-weight: 700; color: ${colors.textMain}; margin: 0 0 0.75rem; display: flex; align-items: center; gap: 0.4rem;">
          🚨 Chamados Mais Antigos em Aberto
        </h3>
        ${renderChamadosCriticos(chamados)}
      </div>
    </section>
  `;
}

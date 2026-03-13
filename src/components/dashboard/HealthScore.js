/**
 * HealthScore.js — Painel 4: Health Score dos Clientes
 * Donut SVG + tabela dos 5 clientes com menor NPS.
 * Com tooltip rico no hover de cada segmento do donut e linha da tabela.
 */

import { colors, healthColors, card } from '../../theme/tokens.js';
import { initTooltipSystem, showTooltip, hideTooltip, updateTooltipPosition } from './Tooltip.js';

function calcularHealth(empresas) {
  const s = (e) => (e.status || '').toLowerCase().trim();
  const ativos = empresas.filter(e => s(e) === 'ativo' || s(e) === 'cliente ativo');
  const total = ativos.length || 1;

  const grupos = {
    'Saudável':   ativos.filter(e => e.healthScore === 'Saudável'),
    'Em Atenção': ativos.filter(e => e.healthScore === 'Em Atenção'),
    'Em Risco':   ativos.filter(e => e.healthScore === 'Em Risco'),
  };

  return { grupos, total, ativos };
}

function renderDonut(dados) {
  const CX = 60, CY = 60, R = 48;
  const circunferencia = 2 * Math.PI * R;

  const segmentos = [
    { key: 'Saudável', emoji: '💚', cor: healthColors['Saudável'] },
    { key: 'Em Atenção', emoji: '⚠️', cor: healthColors['Em Atenção'] },
    { key: 'Em Risco', emoji: '🔴', cor: healthColors['Em Risco'] },
  ].map(s => ({
    ...s,
    count: dados.grupos[s.key].length,
    pct: Math.round((dados.grupos[s.key].length / dados.total) * 100),
  }));

  let offsetAcumulado = 0;

  const arcs = segmentos.map(seg => {
    const comprimento = (seg.pct / 100) * circunferencia;
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
        data-health-key="${seg.key}"
        style="cursor:pointer; transition: stroke-width 150ms, opacity 150ms;"
        class="donut-seg"
      />
    `;
  });

  return {
    svg: `
      <div style="position: relative; display: inline-flex;">
        <svg width="120" height="120" viewBox="0 0 120 120" aria-label="Gráfico donut de health score" id="health-donut-svg">
          <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${colors.border}" stroke-width="14"/>
          ${arcs.join('')}
        </svg>
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
          <div style="font-size: 1.4rem; font-weight: 800; color: ${colors.textMain}; line-height: 1;">${dados.total}</div>
          <div style="font-size: 0.6rem; color: ${colors.textMuted}; font-weight: 600; text-transform: uppercase;">ativos</div>
        </div>
      </div>
    `,
    segmentos,
  };
}

function renderLegenda(segmentos) {
  return segmentos.map(seg => {
    const cor = healthColors[seg.key];
    return `
      <div data-health-leg="${seg.key}" style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; cursor: pointer; padding: 3px 5px; border-radius: 6px; transition: background 120ms;">
        <span style="width: 12px; height: 12px; border-radius: 50%; background: ${cor}; flex-shrink: 0;"></span>
        <div style="flex: 1;">
          <div style="font-size: 12.5px; font-weight: 600; color: ${colors.textMain};">${seg.key}</div>
          <div style="font-size: 11px; color: ${colors.textMuted};">${seg.count} clientes · ${seg.pct}%</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTabelaMinNPS(empresas) {
  const s = (e) => (e.status || '').toLowerCase().trim();
  const ativos = empresas
    .filter(e => (s(e) === 'ativo' || s(e) === 'cliente ativo') && e.nps !== null && e.nps !== undefined && e.nps !== '')
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
    return `<span style="background:${cor}18;color:${cor};font-size:11.5px;font-weight:700;padding:2px 7px;border-radius:9999px;">${emoji} ${hs}</span>`;
  };

  const rows = ativos.map(e => `
    <tr data-health-empresa="${e.nome}"
        data-health-score="${JSON.stringify(e.healthScore).replace(/"/g, '&quot;')}"
        data-nps="${e.nps}"
        data-responsavel="${e.responsavel?.nome || '—'}"
        style="cursor:default;"
        onmouseenter="this.style.background='rgba(255,255,255,0.04)'" onmouseleave="this.style.background='transparent'">
      <td style="padding: 0.65rem 0.75rem; font-size: 12.5px; font-weight: 600; color: ${colors.textMain};
        max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${e.nome}">
        ${e.nome}
      </td>
      <td style="padding: 0.65rem 0.75rem; text-align: center;">
        <span style="font-size: 14px; font-weight: 800; color: ${npsColor(e.nps)};">${e.nps}</span>
      </td>
      <td style="padding: 0.65rem 0.75rem;">${healthBadge(e.healthScore)}</td>
      <td style="padding: 0.65rem 0.75rem; font-size: 11.5px; color: ${colors.textMuted};">
        ${e.responsavel?.nome || '—'}
      </td>
    </tr>
  `).join('');

  return `
    <div style="overflow-x: auto; margin-top: 0.25rem;">
      <table id="health-nps-table" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid ${colors.border};">
            <th style="padding: 0.5rem 0.75rem; text-align: left; font-size: 11.5px; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase;">Empresa</th>
            <th style="padding: 0.5rem 0.75rem; text-align: center; font-size: 11.5px; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase;">NPS</th>
            <th style="padding: 0.5rem 0.75rem; text-align: left; font-size: 11.5px; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase;">Saúde</th>
            <th style="padding: 0.5rem 0.75rem; text-align: left; font-size: 11.5px; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase;">Responsável</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ─── Attachment de eventos de tooltip ───────────────────────────────────────

function attachHealthTooltips(el, dados) {
  // ── Segmentos do donut SVG ──────────────────────────────────────────────
  const svgEl = el.querySelector('#health-donut-svg');
  if (svgEl) {
    svgEl.querySelectorAll('.donut-seg').forEach(seg => {
      const key = seg.getAttribute('data-health-key');
      const cor = healthColors[key];
      const empresas = dados.grupos[key] || [];

      const items = empresas
        .sort((a, b) => (a.nps ?? 99) - (b.nps ?? 99))   // NPS mais baixo primeiro
        .map(e => ({
          nome: e.nome,
          dotCor: cor,
          nps: e.nps ?? null,
          badge: e.responsavel?.nome ? e.responsavel.nome.split(' ')[0] : null,
          badgeBg: `${cor}22`,
          badgeCor: cor,
        }));

      const emojiMap = { 'Saudável': '💚', 'Em Atenção': '⚠️', 'Em Risco': '🔴' };

      // Hover: engorda o anel
      seg.addEventListener('mouseenter', (ev) => {
        seg.setAttribute('stroke-width', '18');
        seg.style.opacity = '0.92';
        showTooltip(ev, {
          emoji: emojiMap[key] || '⬤',
          titulo: key,
          items,
        });
      });

      seg.addEventListener('mousemove', (ev) => {
        updateTooltipPosition(ev);
      });

      seg.addEventListener('mouseleave', () => {
        seg.setAttribute('stroke-width', '14');
        seg.style.opacity = '1';
        hideTooltip();
      });
    });
  }

  // ── Legendas (também abrem tooltip) ───────────────────────────────────
  el.querySelectorAll('[data-health-leg]').forEach(leg => {
    const key = leg.getAttribute('data-health-leg');
    const cor = healthColors[key];
    const empresas = dados.grupos[key] || [];
    const emojiMap = { 'Saudável': '💚', 'Em Atenção': '⚠️', 'Em Risco': '🔴' };

    const items = empresas
      .sort((a, b) => (a.nps ?? 99) - (b.nps ?? 99))
      .map(e => ({
        nome: e.nome, dotCor: cor,
        nps: e.nps ?? null,
        badge: e.responsavel?.nome ? e.responsavel.nome.split(' ')[0] : null,
        badgeBg: `${cor}22`, badgeCor: cor,
      }));

    leg.addEventListener('mouseenter', (ev) => {
      leg.style.background = `${cor}12`;
      showTooltip(ev, { emoji: emojiMap[key] || '⬤', titulo: key, items });
    });
    leg.addEventListener('mousemove', (ev) => updateTooltipPosition(ev));
    leg.addEventListener('mouseleave', () => {
      leg.style.background = 'transparent';
      hideTooltip();
    });
  });
}

/**
 * Renderiza o painel Health Score completo
 */
export function renderHealthScore(containerId, empresas) {
  initTooltipSystem();

  const el = document.getElementById(containerId);
  if (!el) return;

  const dados = calcularHealth(empresas);
  const { svg, segmentos } = renderDonut(dados);

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
      <div style="margin-bottom: 1.25rem;">
        <h2 style="font-size: 12.5px; font-weight: 800; color: ${colors.textMain};
          display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.2rem;">
          <span style="font-size: 1.1rem;">💚</span> Health Score
        </h2>
        <p style="font-size: 0.78rem; color: ${colors.textMuted}; margin: 0;">
          Passe o mouse no donut ou nas legendas para ver as empresas
        </p>
      </div>

      <!-- Donut + Legenda -->
      <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.25rem;">
        ${svg}
        <div style="flex: 1;">${renderLegenda(segmentos)}</div>
      </div>

      <div style="border-top: 1px solid ${colors.border}; margin-bottom: 1rem;"></div>

      <div>
        <h3 style="font-size: 12.5px; font-weight: 700; color: ${colors.textMain};
          margin: 0 0 0.75rem; display: flex; align-items: center; gap: 0.4rem;">
          ⚠️ Clientes com Menor NPS
        </h3>
        ${renderTabelaMinNPS(empresas)}
      </div>
    </section>
  `;

  attachHealthTooltips(el, dados);
}

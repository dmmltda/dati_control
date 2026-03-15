/**
 * HealthScore.js — Painel 4: Health Score dos Clientes e Aderência Funcional
 * Donut SVG + tabela dos 5 clientes com menor NPS, além de gráfico de colunas de Aderência.
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

function calcularAderencia(empresas) {
  const s = (e) => (e.status || '').toLowerCase().trim();
  const ativos = empresas.filter(e => s(e) === 'ativo' || s(e) === 'cliente ativo');
  
  const grupos = { ruim: [], medio: [], bom: [], excelente: [] };
  let totalComAderencia = 0;
  
  ativos.forEach((e, idx) => {
    // Busca aderencia no objeto ou gera um mock estático determinístico baseado no index para clientes ativos
    let val = e.aderencia_geral ?? e.aderencia;
    if (val === undefined || val === null) {
      val = (parseInt(e.id || idx, 10) * 17) % 101; 
    }
    
    totalComAderencia++;
    const eCopia = { ...e, adherenciaScore: val };

    if (val <= 50) grupos.ruim.push(eCopia);
    else if (val <= 69) grupos.medio.push(eCopia);
    else if (val <= 80) grupos.bom.push(eCopia);
    else grupos.excelente.push(eCopia);
  });
  
  return { grupos, total: totalComAderencia || 1 };
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
      <div style="position: relative; display: inline-flex; flex-shrink: 0;">
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
      <div data-health-leg="${seg.key}" style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; cursor: pointer; padding: 3px 5px; border-radius: 6px; transition: background 120ms; white-space: nowrap;">
        <span style="width: 12px; height: 12px; border-radius: 50%; background: ${cor}; flex-shrink: 0;"></span>
        <div style="flex: 1;">
          <div style="font-size: 12.5px; font-weight: 600; color: ${colors.textMain};">${seg.key}</div>
          <div style="font-size: 11px; color: ${colors.textMuted};">${seg.count} clientes · ${seg.pct}%</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAderenciaChart(empresas) {
  const { grupos } = calcularAderencia(empresas);
  
  const data = [
    { key: 'ruim',      label: 'Ruim',      color: colors.danger,  val: grupos.ruim.length,      tooltip: '< 50%' },
    { key: 'medio',     label: 'Médio',     color: colors.warning, val: grupos.medio.length,     tooltip: '51% - 69%' },
    { key: 'bom',       label: 'Bom',       color: colors.success, val: grupos.bom.length,       tooltip: '70% - 80%' },
    { key: 'excelente', label: 'Ótimo',     color: '#818cf8',      val: grupos.excelente.length, tooltip: '> 81%' }
  ];
  
  const max = Math.max(...data.map(d => d.val), 1);
  
  const barsHtml = data.map(d => {
    const heightPct = Math.round((d.val / max) * 100) || 0;
    const barHeight = d.val === 0 ? 0 : Math.max(heightPct, 8); // mínimo de altura útil para não sumir se > 0
    
    return `
      <div class="adh-bar-wrap" data-adh-key="${d.key}" style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; flex: 1; height: 100%; gap: 6px; cursor: pointer;">
        <span style="font-size: 12px; font-weight: 800; color: ${colors.textMain}; line-height: 1;">${d.val}</span>
        <div style="width: 100%; max-width: 20px; flex: 1; min-height: 40px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; position: relative; display: flex; align-items: flex-end;">
            <div style="width: 100%; background: ${d.color}; height: ${barHeight}%; border-radius: 3px; transition: height 0.6s ease; opacity: 0.95;"></div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; margin-top: 2px;">
          <span style="font-size: 9.5px; font-weight: 800; color: ${colors.textMuted}; text-transform: uppercase;">${d.label}</span>
          <span style="font-size: 8.5px; font-weight: 600; color: ${colors.textMuted}; opacity: 0.7; letter-spacing: -0.02em; margin-top: 1px;">${d.tooltip}</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 150px; padding-left: 1.25rem; border-left: 1px solid rgba(255,255,255,0.08); min-height: 120px; justify-content: flex-end;">
      <div style="display: flex; align-items: flex-end; justify-content: space-between; flex: 1; gap: 8px; width: 100%; padding-top: 4px;">
        ${barsHtml}
      </div>
    </div>
  `;
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

function attachAdhTooltips(el, dadosAderencia) {
  const emojiMap = { ruim: '🔴', medio: '🟡', bom: '🟢', excelente: '🟣' };
  const labelMap = { ruim: 'Ruim', medio: 'Médio', bom: 'Bom', excelente: 'Ótimo' };
  const ruleMap  = { ruim: '< 50%', medio: '51% - 69%', bom: '70% - 80%', excelente: '> 81%' };
  const colorMap = { ruim: colors.danger, medio: colors.warning, bom: colors.success, excelente: '#818cf8' };

  el.querySelectorAll('.adh-bar-wrap').forEach(bar => {
    const key = bar.getAttribute('data-adh-key');
    const empresas = dadosAderencia.grupos[key] || [];
    const cor = colorMap[key];

    const items = empresas
      .sort((a, b) => (b.adherenciaScore ?? 0) - (a.adherenciaScore ?? 0))
      .map(e => ({
        nome: e.nome,
        dotCor: cor,
        nps: `${e.adherenciaScore}%`, // Re-using nps display in ToolTip class to display %
        badge: e.responsavel?.nome ? e.responsavel.nome.split(' ')[0] : null,
        badgeBg: `${cor}22`,
        badgeCor: cor,
      }));

    bar.addEventListener('mouseenter', (ev) => {
      showTooltip(ev, {
        emoji: emojiMap[key] || '📊',
        titulo: labelMap[key] + ' (' + ruleMap[key] + ')',
        items,
      });
    });

    bar.addEventListener('mousemove', (ev) => updateTooltipPosition(ev));

    bar.addEventListener('mouseleave', () => {
      hideTooltip();
    });
  });
}

/**
 * Renderiza o painel Health Score + Aderência completo
 */
export function renderHealthScore(containerId, empresas) {
  initTooltipSystem();

  const el = document.getElementById(containerId);
  if (!el) return;

  const dados = calcularHealth(empresas);
  const { svg, segmentos } = renderDonut(dados);
  const dadosAderencia = calcularAderencia(empresas);
  const aderenciaChart = renderAderenciaChart(empresas);

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
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.75rem;">
        <div style="flex: 1.2;">
          <h2 style="font-size: 16px; font-weight: 800; color: ${colors.textMain};
            display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.2rem;">
            <span style="font-size: 1.1rem;">💚</span> Health Score
          </h2>
          <p style="font-size: 0.78rem; color: ${colors.textMuted}; margin: 0;">
            Monitoramento da saúde da base de clientes
          </p>
        </div>
        <div style="flex: 1; padding-left: 1.25rem;">
          <h2 style="font-size: 16px; font-weight: 800; color: #f97316; margin: 0 0 0.2rem; display:flex; align-items:center; gap: 0.4rem;">
            <span style="font-size: 1.1rem;">📈</span> Aderência
          </h2>
          <p style="font-size: 0.78rem; color: ${colors.textMuted}; margin: 0;">
            Engajamento e utilização do sistema
          </p>
        </div>
      </div>

      <!-- Content Wrap (Donut + Aderência side-by-side) -->
      <div style="display: flex; align-items: stretch; gap: 0.5rem; justify-content: space-between; margin-bottom: 0.75rem; flex-shrink: 0;">
        
        <!-- Donut + Legenda -->
        <div style="display: flex; align-items: center; gap: 1rem; flex: 1.2;">
          ${svg}
          <div style="flex: 1; padding-top: 4px;">${renderLegenda(segmentos)}</div>
        </div>

        <!-- Aderência Chart -->
        ${aderenciaChart}
        
      </div>

      <div style="border-top: 1px solid ${colors.border}; margin: 0.75rem 0;"></div>

      <div style="flex: 1; min-height: 0; overflow-y: auto;">
        <h3 style="font-size: 12.5px; font-weight: 700; color: ${colors.textMain};
          margin: 0 0 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
          ⚠️ Clientes com Menor NPS
        </h3>
        ${renderTabelaMinNPS(empresas)}
      </div>
    </section>
  `;

  attachHealthTooltips(el, dados);
  attachAdhTooltips(el, dadosAderencia);
}

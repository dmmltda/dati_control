/**
 * Módulo: Relatório de Aderência — aba "Lista" do Customer Success
 * Exibe todos os indicadores (processos + chamados) de uma empresa
 * usando TableManager 2.0.
 *
 * Inclui:
 *  - Coluna Data como primeira coluna
 *  - Filtros em todas as colunas (padrão do sistema)
 *  - 3 gráficos Chart.js vinculados aos filtros:
 *      1. Quantidade de Acessos
 *      2. Quantidade de Usuários que Acessaram
 *      3. % Aderência
 */
import { TableManager } from '../core/table-manager.js';

// ── Instância global exposta para os onclicks do HTML ─────────────────────────
let _tm = null;

// ── Dados base dos indicadores (mock — aguardando integração) ─────────────────
const INDICADORES = [
  // Grupo: Processos
  { grupo: 'Processos', indicador: 'Quantidade de acesso' },
  { grupo: 'Processos', indicador: 'Quantidade de acesso no BI' },
  { grupo: 'Processos', indicador: 'Quantidade de processos' },
  { grupo: 'Processos', indicador: 'Confirmação carga pronta' },
  { grupo: 'Processos', indicador: 'Solicitação de invoice e packing' },
  { grupo: 'Processos', indicador: 'Solicitação original invoice e packing' },
  { grupo: 'Processos', indicador: 'Solicitação de booking' },
  { grupo: 'Processos', indicador: 'Confirmação de saída' },
  { grupo: 'Processos', indicador: 'Solicitação de draft para conferência' },
  { grupo: 'Processos', indicador: 'Extração do mercante' },
  { grupo: 'Processos', indicador: 'Confirmação de chegada' },
  { grupo: 'Processos', indicador: 'Confirmação de presença de carga' },
  { grupo: 'Processos', indicador: 'Obtenção do canal da DI' },
  { grupo: 'Processos', indicador: 'Liberação do Siscomex' },
  { grupo: 'Processos', indicador: 'Espelho de NF' },
  { grupo: 'Processos', indicador: 'Previsão de coleta e entrega' },
  { grupo: 'Processos', indicador: 'Devolução de container vazio' },
  // Grupo: Chamados
  { grupo: 'Chamados', indicador: 'Quantidade de chamados' },
  { grupo: 'Chamados', indicador: 'Solicitante do chamado' },
  { grupo: 'Chamados', indicador: 'Tipo de chamado' },
  { grupo: 'Chamados', indicador: 'Descrição dos chamados' },
  { grupo: 'Chamados', indicador: 'Prazo de Solução' },
  { grupo: 'Chamados', indicador: 'Chamados concluídos' },
];

// Mock de valores: [acessos, usuarios_unicos, realizados, data_iso]
const MOCK_VALORES = [
  [50, 12, 47, '2026-03-01'], [30,  8, 28, '2026-03-01'], [22, 7, 22, '2026-03-01'],
  [18,  5, 16, '2026-03-01'], [15,  5, 13, '2026-03-01'], [15, 4, 12, '2026-03-01'],
  [12,  4, 12, '2026-03-01'], [12,  3, 10, '2026-03-01'], [10, 3,  8, '2026-03-01'],
  [ 8,  3,  8, '2026-03-01'], [ 8,  2,  7, '2026-03-01'], [ 8, 2,  6, '2026-03-01'],
  [ 7,  2,  7, '2026-03-01'], [ 6,  2,  5, '2026-03-01'], [ 6, 2,  6, '2026-03-01'],
  [ 5,  1,  4, '2026-03-01'], [ 4,  1,  4, '2026-03-01'],
  // Chamados
  [24,  6, 24, '2026-03-01'], [24,  5, 20, '2026-03-01'], [24, 5, 22, '2026-03-01'],
  [24,  4, 18, '2026-03-01'], [24,  4, 21, '2026-03-01'], [24, 3, 23, '2026-03-01'],
];

// ── Função de status ──────────────────────────────────────────────────────────
function statusPct(pct) {
  if (pct === null || pct === undefined) return { key: 'none',     label: 'Sem dados' };
  if (pct >= 80)                          return { key: 'verde',    label: 'Excelente' };
  if (pct >= 50)                          return { key: 'amarelo',  label: 'Atenção'   };
  return                                         { key: 'vermelho', label: 'Crítico'   };
}

// ── Instâncias de gráficos Chart.js ───────────────────────────────────────────
let _chartAcessos   = null;
let _chartUsuarios  = null;
let _chartAderencia = null;

// ── Ponto de entrada público ──────────────────────────────────────────────────
export function initAdherenceReport(companyId) {
  const tbody    = document.getElementById('adh-table-body');
  const countEl  = document.getElementById('adh-count');
  const searchEl = document.getElementById('adh-search');
  if (!tbody) return;

  // Monta dados com valores mock
  const tableData = INDICADORES.map((ind, i) => {
    const [acessos, usuarios, realizados, data] = MOCK_VALORES[i] ?? [null, null, null, null];
    const percentual = (acessos && realizados !== null)
      ? Math.round((realizados / acessos) * 100)
      : null;
    return {
      id:         i,
      data:       data || '',
      grupo:      ind.grupo,
      indicador:  ind.indicador,
      acessos,
      usuarios,
      automatico: realizados,
      percentual,
    };
  });

  // ── Renderiza área dos gráficos ───────────────────────────────────────────
  _renderChartsArea(tableData);

  _tm = new TableManager({
    data:     tableData,
    pageSize: tableData.length, // sem paginação — mostra todos
    tableId:  'adh-table',
    columns: [
      { key: 'data',       label: 'Data',        type: 'date',   sortable: true, filterable: true },
      { key: 'grupo',      label: 'Grupo',       type: 'string', sortable: true, searchable: true, filterable: true },
      { key: 'indicador',  label: 'Indicador',   type: 'string', sortable: true, searchable: true, filterable: true },
      { key: 'acessos',    label: 'Acessos',     type: 'number', sortable: true, filterable: true },
      { key: 'usuarios',   label: 'Usuários',    type: 'number', sortable: true, filterable: true },
      { key: 'automatico', label: 'Realizados',  type: 'number', sortable: true, filterable: true },
      { key: 'percentual', label: '% Aderência', type: 'number', sortable: true, filterable: true },
    ],
    renderFilters: () => {
      if (window._adhRenderActiveFilters) {
        window._adhRenderActiveFilters();
      }
    },
    renderRows(data) {
      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:2rem; opacity:.5;">Nenhum indicador encontrado.</td></tr>`;
        if (countEl) {
          countEl.textContent = '0 indicadores';
        }
        _updateCharts(data);
        return;
      }

      tbody.innerHTML = data.map(row => {
        const pct     = row.percentual;
        const st      = statusPct(pct);
        const pctTxt  = pct !== null    ? `${pct}%`        : '<span style="opacity:.35">—</span>';
        const acTxt   = row.acessos    !== null ? row.acessos    : '<span style="opacity:.35">—</span>';
        const userTxt = row.usuarios   !== null ? row.usuarios   : '<span style="opacity:.35">—</span>';
        const realTxt = row.automatico !== null ? row.automatico : '<span style="opacity:.35">—</span>';
        const dataTxt = row.data ? _formatDate(row.data) : '<span style="opacity:.35">—</span>';
        const grupoBadge = `<span class="adh-grupo-badge adh-grupo-${row.grupo === 'Processos' ? 'proc' : 'cham'}">${row.grupo}</span>`;

        return `
          <tr>
            <td style="white-space:nowrap; color:var(--text-muted); font-size:12px; font-weight:500;">${dataTxt}</td>
            <td>${grupoBadge}</td>
            <td style="font-size:13px;">${row.indicador}</td>
            <td style="text-align:center; font-weight:600;">${acTxt}</td>
            <td style="text-align:center; font-weight:600;">${userTxt}</td>
            <td style="text-align:center; font-weight:600;">${realTxt}</td>
            <td style="text-align:center;">
              <span class="adh-pct-badge adh-pct-${st.key}">${pctTxt}</span>
            </td>
            <td style="text-align:center;">
              <span class="adh-dot adh-dot-${st.key}" title="${st.label}"></span>
            </td>
          </tr>`;
      }).join('');

      if (countEl) {
        countEl.textContent = `${data.length} indicador${data.length !== 1 ? 'es' : ''}`;
      }

      // Atualiza gráficos com os dados filtrados
      _updateCharts(data);
    },
  });

  // Expõe globalmente para os onclicks nos headers do HTML
  window._adhTM = _tm;

  // Busca
  if (searchEl) {
    const newSearch = searchEl.cloneNode(true);
    searchEl.parentNode.replaceChild(newSearch, searchEl);
    newSearch.addEventListener('input', e => _tm.setSearch(e.target.value));
  }

  // ── Callbacks de Filtros Globais ───────────────────────────────────────────
  window._adhRenderActiveFilters = function() {
    if (!_tm) return;
    const chipsContainer = document.getElementById('adh-active-chips');
    if (!chipsContainer) return;

    const active = _tm.getActiveFilters();
    if (active.length === 0) {
      chipsContainer.style.display = 'none';
      chipsContainer.innerHTML = '';
      return;
    }

    chipsContainer.style.display = 'flex';
    chipsContainer.innerHTML = `
      <div class="active-filters-chips">
        ${active.map(({ key, label, value }) => `
          <div class="filter-chip">
            <span><strong>${label}:</strong> ${value}</span>
            <i class="ph ph-x-circle" onclick="window._adhClearFilter('${key}')"></i>
          </div>
        `).join('')}
      </div>
      <button class="btn-clear-all-filters" onclick="window._adhClearAllFilters()">
        <i class="ph ph-trash"></i> Limpar Tudo
      </button>
    `;
  };

  window._adhClearFilter = function(key) {
    if (_tm) _tm.setFilter(key, null);
  };

  window._adhClearAllFilters = function() {
    if (_tm) _tm.clearFilters();
    if (searchEl) {
      const el = document.getElementById('adh-search');
      if (el) el.value = '';
    }
  };

  _injectStyles();
}

// ── Formata data ISO → DD/MM/AAAA ─────────────────────────────────────────────
function _formatDate(iso) {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch (e) { return iso; }
}

// ── Renderiza área dos gráficos no DOM ────────────────────────────────────────
function _renderChartsArea(data) {
  const container = document.getElementById('adh-charts-area');
  if (!container) return;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-bottom:1.5rem;">
      <div class="adh-chart-card">
        <div class="adh-chart-header">
          <i class="ph ph-cursor-click" style="color:#818cf8;font-size:1.2rem;"></i>
          <div>
            <div class="adh-chart-title">Quantidade de Acessos</div>
            <div class="adh-chart-subtitle">Total por grupo · filtros aplicados</div>
          </div>
        </div>
        <div style="position:relative; height:155px;">
          <canvas id="chart-adh-acessos"></canvas>
        </div>
      </div>

      <div class="adh-chart-card">
        <div class="adh-chart-header">
          <i class="ph ph-users" style="color:#34d399;font-size:1.2rem;"></i>
          <div>
            <div class="adh-chart-title">Usuários que Acessaram</div>
            <div class="adh-chart-subtitle">Usuários únicos por grupo</div>
          </div>
        </div>
        <div style="position:relative; height:155px;">
          <canvas id="chart-adh-usuarios"></canvas>
        </div>
      </div>

      <div class="adh-chart-card">
        <div class="adh-chart-header">
          <i class="ph ph-chart-pie-slice" style="color:#fbbf24;font-size:1.2rem;"></i>
          <div>
            <div class="adh-chart-title">% Aderência</div>
            <div class="adh-chart-subtitle">Média por grupo</div>
          </div>
        </div>
        <div style="position:relative; height:155px;">
          <canvas id="chart-adh-aderencia"></canvas>
        </div>
      </div>
    </div>
  `;

  _buildCharts(data);
}

// ── Constrói os 3 gráficos com Chart.js ──────────────────────────────────────
function _buildCharts(data) {
  if (!window.Chart) {
    console.warn('[ADH] Chart.js não carregado — gráficos não serão exibidos.');
    return;
  }

  const grupos = [...new Set(data.map(r => r.grupo))];

  // Gráfico 1 — Acessos
  const ctx1 = document.getElementById('chart-adh-acessos');
  if (ctx1) {
    if (_chartAcessos) _chartAcessos.destroy();
    _chartAcessos = new window.Chart(ctx1, {
      type: 'bar',
      data: {
        labels: grupos,
        datasets: [{
          label: 'Acessos',
          data: grupos.map(g => data.filter(r => r.grupo === g).reduce((s, r) => s + (r.acessos || 0), 0)),
          backgroundColor: grupos.map(g => g === 'Processos' ? 'rgba(129,140,248,0.75)' : (g === 'Chamados' ? 'rgba(251,191,36,0.75)' : 'rgba(52,211,153,0.75)')),
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: _barOptions('Acessos'),
    });
  }

  // Gráfico 2 — Usuários únicos
  const ctx2 = document.getElementById('chart-adh-usuarios');
  if (ctx2) {
    if (_chartUsuarios) _chartUsuarios.destroy();
    _chartUsuarios = new window.Chart(ctx2, {
      type: 'bar',
      data: {
        labels: grupos,
        datasets: [{
          label: 'Usuários',
          data: grupos.map(g => data.filter(r => r.grupo === g).reduce((s, r) => s + (r.usuarios || 0), 0)),
          backgroundColor: grupos.map(g => g === 'Processos' ? 'rgba(52,211,153,0.75)' : (g === 'Chamados' ? 'rgba(251,191,36,0.75)' : 'rgba(129,140,248,0.75)')),
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: _barOptions('Usuários'),
    });
  }

  // Gráfico 3 — % Aderência (doughnut)
  const ctx3 = document.getElementById('chart-adh-aderencia');
  if (ctx3) {
    if (_chartAderencia) _chartAderencia.destroy();
    const vals = grupos.map(g => {
      const rows = data.filter(r => r.grupo === g && r.percentual !== null);
      if (!rows.length) return 0;
      return Math.round(rows.reduce((s, r) => s + r.percentual, 0) / rows.length);
    });
    const bgColors = vals.map(v =>
      v >= 80 ? 'rgba(16,185,129,0.8)' :
      v >= 50 ? 'rgba(245,158,11,0.8)' :
               'rgba(239,68,68,0.8)'
    );
    _chartAderencia = new window.Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: grupos.map((g, i) => `${g}: ${vals[i]}%`),
        datasets: [{
          data: vals,
          backgroundColor: bgColors,
          borderWidth: 0,
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: 'rgba(255,255,255,0.55)', font: { size: 11 }, padding: 10, boxWidth: 10, boxHeight: 10 }
          },
          tooltip: {
            callbacks: { label: ctx => `${ctx.label}` },
            backgroundColor: 'rgba(15,23,42,0.95)',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
          }
        }
      }
    });
  }
}

// ── Atualiza gráficos com dados filtrados ─────────────────────────────────────
function _updateCharts(data) {
  if (!window.Chart) return;
  const grupos = [...new Set(data.map(r => r.grupo))];

  if (_chartAcessos) {
    _chartAcessos.data.labels = grupos;
    _chartAcessos.data.datasets[0].data = grupos.map(g =>
      data.filter(r => r.grupo === g).reduce((s, r) => s + (r.acessos || 0), 0)
    );
    _chartAcessos.data.datasets[0].backgroundColor = grupos.map(g => g === 'Processos' ? 'rgba(129,140,248,0.75)' : (g === 'Chamados' ? 'rgba(251,191,36,0.75)' : 'rgba(52,211,153,0.75)'));
    _chartAcessos.update('active');
  }

  if (_chartUsuarios) {
    _chartUsuarios.data.labels = grupos;
    _chartUsuarios.data.datasets[0].data = grupos.map(g =>
      data.filter(r => r.grupo === g).reduce((s, r) => s + (r.usuarios || 0), 0)
    );
    _chartUsuarios.data.datasets[0].backgroundColor = grupos.map(g => g === 'Processos' ? 'rgba(52,211,153,0.75)' : (g === 'Chamados' ? 'rgba(251,191,36,0.75)' : 'rgba(129,140,248,0.75)'));
    _chartUsuarios.update('active');
  }

  if (_chartAderencia) {
    const vals = grupos.map(g => {
      const rows = data.filter(r => r.grupo === g && r.percentual !== null);
      if (!rows.length) return 0;
      return Math.round(rows.reduce((s, r) => s + r.percentual, 0) / rows.length);
    });
    _chartAderencia.data.labels = grupos.map((g, i) => `${g}: ${vals[i]}%`);
    _chartAderencia.data.datasets[0].data = vals;
    _chartAderencia.data.datasets[0].backgroundColor = vals.map(v =>
      v >= 80 ? 'rgba(16,185,129,0.8)' :
      v >= 50 ? 'rgba(245,158,11,0.8)' :
               'rgba(239,68,68,0.8)'
    );
    _chartAderencia.update('active');
  }
}

// ── Opções base dos gráficos de barra ────────────────────────────────────────
function _barOptions(label) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.95)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        callbacks: { label: ctx => `${label}: ${ctx.raw}` }
      }
    },
    scales: {
      x: {
        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
      y: {
        beginAtZero: true,
        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 11 }, precision: 0 },
        grid: { color: 'rgba(255,255,255,0.06)' },
      }
    }
  };
}

// ── CSS injetado dinamicamente ────────────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('adh-report-styles')) return;
  const style = document.createElement('style');
  style.id = 'adh-report-styles';
  style.textContent = `
    .adh-chart-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 12px;
      padding: 1rem 1.25rem;
    }
    .adh-chart-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 0.75rem;
    }
    .adh-chart-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .adh-chart-subtitle {
      font-size: 0.67rem;
      color: var(--text-muted);
      margin-top: 1px;
    }

    .adh-grupo-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .adh-grupo-proc { background: rgba(79,70,229,.15); color: #818cf8; }
    .adh-grupo-cham { background: rgba(245,158,11,.15); color: #f59e0b; }

    .adh-pct-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      min-width: 48px;
      text-align: center;
    }
    .adh-pct-verde    { background: rgba(16,185,129,.15); color: #10b981; }
    .adh-pct-amarelo  { background: rgba(245,158,11,.15); color: #f59e0b; }
    .adh-pct-vermelho { background: rgba(239,68,68,.15);  color: #ef4444; }
    .adh-pct-none     { background: rgba(100,116,139,.1); color: #64748b; }

    .adh-dot {
      display: inline-block;
      width: 10px; height: 10px;
      border-radius: 50%;
    }
    .adh-dot-verde    { background: #10b981; box-shadow: 0 0 6px rgba(16,185,129,.5); }
    .adh-dot-amarelo  { background: #f59e0b; box-shadow: 0 0 6px rgba(245,158,11,.5); }
    .adh-dot-vermelho { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,.5);  }
    .adh-dot-none     { background: #334155; }
  `;
  document.head.appendChild(style);
}

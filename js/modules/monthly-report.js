/**
 * Módulo: Relatório Mensal de Aderência — Visão por empresa
 * Renderiza chamados, help desk e rotinas DATI Import de um mês selecionado.
 *
 * TODO: integrar com DATI Import API
 *   GET /api/client-report?company_id=X&month=YYYY-MM
 *   Retorna: { rotinas: [{ nome, total, automatico, percentual }], aderencia_geral }
 *
 * TODO: adicionar campo duration_minutes em company_tickets
 *   para calcular horas utilizadas de help desk por chamado
 *
 * TODO: adicionar campo classificacao em company_tickets
 *   valores: 'Bug' | 'Suporte' | 'Novo Recurso'
 *
 * TODO: adicionar campo prazo_resolucao_dias em company_tickets
 *   calculado entre data abertura e data fechamento
 *
 * TODO: botão "Enviar relatório" — gerar PDF e enviar via WhatsApp/email
 *   depende de: html-pdf-node ou Puppeteer + whatsapp.js service
 */
import { getAuthToken } from './auth.js';
import { TableManager } from '../core/table-manager.js';


// ── Instâncias de gráficos (para destruir antes de recriar) ──────────────────
const _charts = {};

function destroyChart(key) {
  if (_charts[key]) {
    _charts[key].destroy();
    delete _charts[key];
  }
}

// ── Estado interno ────────────────────────────────────────────────────────────
let _currentCompanyId = null;
let _currentMonth     = null; // YYYY-MM

// ── Utilitários de data ───────────────────────────────────────────────────────
function todayYYYYMM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(yyyyMM) {
  if (!yyyyMM) return '—';
  const [year, month] = yyyyMM.split('-').map(Number);
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[month - 1]}/${year}`;
}

function prevMonth(yyyyMM) {
  const [year, month] = yyyyMM.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(yyyyMM) {
  const [year, month] = yyyyMM.split('-').map(Number);
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Ponto de entrada público ──────────────────────────────────────────────────
export async function initMonthlyReport(companyId) {
  _currentCompanyId = companyId;
  _currentMonth     = todayYYYYMM();

  const section = document.getElementById('tab-monthly-report');
  if (!section) return;

  section.innerHTML = buildSkeleton();
  bindToolbarEvents(section);
  await loadAndRender(section);
}

// ── Skeleton (loading) ────────────────────────────────────────────────────────
function buildSkeleton() {
  return `
    <div id="mr-root" style="padding:0 0 2rem;">
      ${buildToolbar()}
      <div id="mr-body" class="mr-body">
        <div class="mr-loading">
          <div class="mr-spinner"></div>
          <span>Carregando relatório...</span>
        </div>
      </div>
    </div>
    ${buildStyles()}
  `;
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function buildToolbar() {
  const label = formatMonthLabel(_currentMonth || todayYYYYMM());
  return `
    <div class="mr-toolbar">
      <div class="mr-toolbar-left">
        <button id="mr-btn-prev" class="mr-nav-btn" title="Mês anterior">
          <i class="ph ph-caret-left"></i>
        </button>
        <span id="mr-month-label" class="mr-month-label">${label}</span>
        <button id="mr-btn-next" class="mr-nav-btn" title="Próximo mês">
          <i class="ph ph-caret-right"></i>
        </button>
      </div>
      <div class="mr-toolbar-right">
        <button class="mr-action-btn" id="mr-btn-pdf" title="Baixar PDF" disabled>
          <i class="ph ph-download-simple"></i>
          <span>Baixar PDF</span>
        </button>
        <button class="mr-action-btn" id="mr-btn-send" title="Enviar relatório" disabled>
          <i class="ph ph-paper-plane-tilt"></i>
          <span>Enviar</span>
        </button>
      </div>
    </div>
  `;
}

// ── Event bindings ─────────────────────────────────────────────────────────────
function bindToolbarEvents(section) {
  section.addEventListener('click', async (e) => {
    if (e.target.closest('#mr-btn-prev')) {
      _currentMonth = prevMonth(_currentMonth);
      updateMonthLabel();
      await loadAndRender(section);
    }
    if (e.target.closest('#mr-btn-next')) {
      _currentMonth = nextMonth(_currentMonth);
      updateMonthLabel();
      await loadAndRender(section);
    }
  });
}

function updateMonthLabel() {
  const el = document.getElementById('mr-month-label');
  if (el) el.textContent = formatMonthLabel(_currentMonth);
}

// ── API fetch ─────────────────────────────────────────────────────────────────
async function fetchReport(companyId, month) {
  const token = await getAuthToken();
  const url   = `/api/monthly-report/${companyId}?month=${month}`;
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[monthly-report] HTTP ${res.status} ${res.statusText}`, url, body.slice(0, 300));
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
  return res.json();
}

// ── Load & render ─────────────────────────────────────────────────────────────
async function loadAndRender(section) {
  const body = section.querySelector('#mr-body');
  if (!body) return;
  body.innerHTML = `<div class="mr-loading"><div class="mr-spinner"></div><span>Carregando relatório...</span></div>`;

  // Destroi gráficos anteriores
  ['classif', 'solicitante', 'prazo', 'helpdesk-tipo'].forEach(destroyChart);

  try {
    const data = await fetchReport(_currentCompanyId, _currentMonth);
    body.innerHTML = buildFullReport(data);
    requestAnimationFrame(() => {
      renderAllCharts(data);
      initRotinasTable(data.rotinas);
    });
  } catch (err) {
    console.error('[monthly-report] Erro ao carregar:', err);
    body.innerHTML = `
      <div class="mr-error">
        <i class="ph ph-warning-circle"></i>
        <p>Não foi possível carregar o relatório.</p>
        <code style="font-size:11px; opacity:.6; margin-top:0.5rem; display:block; word-break:break-all;">${err.message}</code>
      </div>
    `;
  }
}

// ── Constrói HTML completo do relatório ───────────────────────────────────────
function buildFullReport(data) {
  return `
    ${buildChamadosSection(data.chamados)}
    ${buildHelpdeskSection(data.helpdesk)}
    ${buildRotinasSection(data.rotinas)}
  `;
}

// ──────────────────────────────────────────────────────────────────────────────
// SEÇÃO 1 — CHAMADOS CONCLUÍDOS
// ──────────────────────────────────────────────────────────────────────────────
function buildChamadosSection(c) {
  return `
    <div class="mr-section">
      <div class="mr-section-title">
        <i class="ph ph-ticket"></i> Chamados Concluídos
      </div>

      <div class="mr-kpi-row">
        <div class="mr-card mr-kpi-card">
          <div class="mr-card-label">Total</div>
          <div class="mr-kpi-value">${c.total}</div>
        </div>
        <div class="mr-card mr-kpi-card">
          <div class="mr-card-label">Recorrentes</div>
          <div class="mr-kpi-value">${c.recorrentes}</div>
        </div>

        <div class="mr-card" style="flex:2; min-width:220px;">
          <div class="mr-card-label">Prazo de Resolução</div>
          <div style="margin-top:8px; display:flex; flex-direction:column; gap:10px;">
            ${c.por_prazo.map((p, i) => {
              const maxVal = Math.max(...c.por_prazo.map(x => x.value), 1);
              const pct = Math.round((p.value / maxVal) * 100);
              const colors = ['#10b981', '#f59e0b', '#ef4444'];
              const color  = colors[i] || colors[0];
              return `
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:4px;">
                    <span>${p.label}</span>
                    <span style="font-weight:700; color:var(--text-main);">${p.value}</span>
                  </div>
                  <div style="background:var(--dark-border); border-radius:4px; height:8px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px; transition:width 0.6s ease;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="mr-charts-row" style="margin-top:1rem;">
        <div class="mr-card" style="flex:1; min-width:200px;">
          <div class="mr-card-label">Classificação</div>
          <div style="height:180px; position:relative; margin-top:8px;">
            <canvas id="chart-classif"></canvas>
          </div>
        </div>
        <div class="mr-card" style="flex:2; min-width:220px;">
          <div class="mr-card-label">Por Solicitante</div>
          <div style="height:180px; position:relative; margin-top:8px;">
            <canvas id="chart-solicitante"></canvas>
          </div>
        </div>
      </div>

      ${c.lista && c.lista.length > 0 ? buildTicketsList(c.lista) : ''}
    </div>
  `;
}

function buildTicketsList(lista) {
  return `
    <div class="mr-card" style="margin-top:1rem;">
      <div class="mr-card-label" style="margin-bottom:12px;">Lista de Chamados</div>
      <div style="overflow-x:auto;">
        <table class="mr-table">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Resumo</th>
              <th>Autor</th>
              <th>Data</th>
              <th>Tipo</th>
              <th>Prazo</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(t => `
              <tr>
                <td>${t.link ? `<a href="${escHtml(t.link)}" target="_blank" class="mr-link">${escHtml(t.numero)}</a>` : escHtml(t.numero)}</td>
                <td style="max-width:260px;">${escHtml(t.resumo)}</td>
                <td>${escHtml(t.autor)}</td>
                <td style="white-space:nowrap;">${t.data ? new Date(t.data).toLocaleDateString('pt-BR') : '—'}</td>
                <td><span class="mr-badge-classif mr-badge-${slugify(t.classificacao)}">${escHtml(t.classificacao)}</span></td>
                <td>${t.prazo_dias !== null ? `${t.prazo_dias}d` : '<span style="opacity:.4">—</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────────────
// SEÇÃO 2 — HELP DESK
// ──────────────────────────────────────────────────────────────────────────────
function buildHelpdeskSection(h) {
  const saldoPositivo = h.saldo_minutos >= 0;
  const saldoStyle = saldoPositivo
    ? 'background:rgba(16,185,129,0.1); border-color:#10b981;'
    : 'background:rgba(239,68,68,0.1); border-color:#ef4444;';
  const saldoColor = saldoPositivo ? '#10b981' : '#ef4444';

  return `
    <div class="mr-section">
      <div class="mr-section-title">
        <i class="ph ph-clock-countdown"></i> Help Desk
      </div>

      <div class="mr-kpi-row">
        <div class="mr-card mr-kpi-card" style="background:rgba(16,185,129,0.08); border-color:#10b981;">
          <div class="mr-card-label" style="color:#10b981;">Contratadas</div>
          <div class="mr-kpi-value" style="color:#10b981;">${h.horas_contratadas}h</div>
        </div>
        <div class="mr-card mr-kpi-card" style="background:rgba(245,158,11,0.08); border-color:#f59e0b;">
          <div class="mr-card-label" style="color:#f59e0b;">Utilizadas</div>
          <div class="mr-kpi-value" style="color:#f59e0b;">${h.horas_utilizadas_formatado}</div>
        </div>
        <div class="mr-card mr-kpi-card" style="${saldoStyle}">
          <div class="mr-card-label" style="color:${saldoColor};">Saldo</div>
          <div class="mr-kpi-value" style="color:${saldoColor};">${h.saldo_formatado}</div>
        </div>
      </div>

      <div class="mr-card" style="margin-top:1rem;">
        <div class="mr-card-label">Horas por Tipo</div>
        <div style="height:160px; position:relative; margin-top:12px;">
          <canvas id="chart-helpdesk-tipo"></canvas>
        </div>
      </div>

      <div class="mr-info-box" style="margin-top:0.75rem;">
        <i class="ph ph-info"></i>
        <span>${escHtml(h.observacao)}</span>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────────────
// SEÇÃO 3 — ROTINAS (DATI Import) com TableManager 2.0
// ──────────────────────────────────────────────────────────────────────────────
function buildRotinasSection(r) {
  const aderencia  = r.aderencia_geral;
  const badgeColor = aderencia === null ? '#64748b'
    : aderencia >= 80 ? '#10b981'
    : aderencia >= 50 ? '#f59e0b'
    : '#ef4444';

  return `
    <div class="mr-section">
      <div class="mr-section-title">
        <i class="ph ph-check-circle"></i> % das Rotinas — Aderência DATI Import
      </div>

      <!-- KPI de aderência geral -->
      <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem; flex-wrap:wrap;">
        <div style="font-size:13px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em;">Aderência Geral:</div>
        <div style="font-size:2rem; font-weight:800; color:${badgeColor}; background:rgba(${hexToRgb(badgeColor)},0.12); border:2px solid ${badgeColor}; border-radius:10px; padding:0.2rem 1rem; min-width:90px; text-align:center;">
          ${aderencia !== null ? `${aderencia}%` : '—'}
        </div>
      </div>

      <!-- Banner pendênte de integração -->
      ${r.fonte === 'pendente_integracao' ? `
      <div class="mr-integration-banner" style="margin-bottom:1rem;">
        <i class="ph ph-plug"></i>
        <div>
          <strong>Dados disponíveis após integração com DATI Import</strong>
          <p style="margin:0; font-size:12px; opacity:.7;">Os valores serão preenchidos automaticamente quando a integração estiver ativa.</p>
        </div>
      </div>
      ` : ''}

      <!-- Tabela TableManager 2.0 -->
      <div class="mr-card" style="padding:0; overflow:hidden;">
        <!-- Header da tabela -->
        <div class="mr-rotinas-header">
          <span class="mr-rotinas-title">Rotinas do Processo</span>
          <input
            id="mr-rotinas-search"
            type="text"
            placeholder="Buscar rotina..."
            class="mr-rotinas-search"
          />
        </div>

        <!-- Tabela -->
        <div style="overflow-x:auto;">
          <table id="mr-rotinas-table" class="mr-table mr-rotinas-table">
            <thead>
              <tr>
                <th data-key="nome" class="mr-th-sort" style="min-width:220px;">
                  Rotina <i class="mr-sort-icon ph ph-arrows-down-up"></i>
                </th>
                <th data-key="acessos" class="mr-th-sort" style="text-align:center; width:90px;">
                  Acessos <i class="mr-sort-icon ph ph-arrows-down-up"></i>
                </th>
                <th data-key="automatico" class="mr-th-sort" style="text-align:center; width:110px;">
                  Automações <i class="mr-sort-icon ph ph-arrows-down-up"></i>
                </th>
                <th data-key="percentual" class="mr-th-sort" style="text-align:center; width:120px;">
                  % Automação <i class="mr-sort-icon ph ph-arrows-down-up"></i>
                </th>
                <th style="text-align:center; width:90px;">Status</th>
              </tr>
            </thead>
            <tbody id="mr-rotinas-tbody">
              <tr><td colspan="5" class="mr-table-empty">Carregando...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Rodapé: contagem -->
        <div class="mr-rotinas-footer">
          <span id="mr-rotinas-count"></span>
        </div>
      </div>
    </div>
  `;
}

// Inicializa TableManager 2.0 para as rotinas
function initRotinasTable(r) {
  const tbody   = document.getElementById('mr-rotinas-tbody');
  const countEl = document.getElementById('mr-rotinas-count');
  const searchEl = document.getElementById('mr-rotinas-search');
  if (!tbody) return;

  // Mapeia os itens para o formato que o TM espera
  const tableData = (r.itens || []).map((item, i) => ({
    _idx:       i,
    nome:       item.nome,
    acessos:    item.total,       // API retorna "total", exibido como "Acessos"
    automatico: item.automatico,
    percentual: item.percentual,  // 0-100 ou null
  }));

  const tm = new TableManager({
    data:     tableData,
    pageSize: tableData.length || 17,  // sem paginação — mostra todas
    tableId:  'mr-rotinas-table',
    columns: [
      { key: 'nome',       label: 'Rotina',        type: 'string', sortable: true, searchable: true },
      { key: 'acessos',    label: 'Acessos',       type: 'number', sortable: true },
      { key: 'automatico', label: 'Automações',   type: 'number', sortable: true },
      { key: 'percentual', label: '% Automação',  type: 'number', sortable: true },
    ],
    renderRows(data) {
      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="mr-table-empty">Nenhuma rotina encontrada.</td></tr>`;
        return;
      }
      tbody.innerHTML = data.map(row => {
        const pct    = row.percentual;
        const status = rotinaStatus(pct);
        const pctDisplay = pct !== null ? `${pct}%` : '<span style="opacity:.4">—</span>';
        const acessosDisplay    = row.acessos    !== null ? row.acessos    : '<span style="opacity:.4">—</span>';
        const automaticoDisplay = row.automatico !== null ? row.automatico : '<span style="opacity:.4">—</span>';

        return `
          <tr>
            <td style="font-size:13px;">${escHtml(row.nome)}</td>
            <td style="text-align:center; font-weight:600;">${acessosDisplay}</td>
            <td style="text-align:center; font-weight:600;">${automaticoDisplay}</td>
            <td style="text-align:center;">
              <span class="mr-pct-badge mr-pct-${status.key}">${pctDisplay}</span>
            </td>
            <td style="text-align:center;">
              <span class="mr-status-dot mr-status-${status.key}" title="${status.label}"></span>
            </td>
          </tr>
        `;
      }).join('');

      // Atualiza contagem
      if (countEl) {
        const total = tm.getPaginationState().totalRecords;
        countEl.textContent = `${total} rotina${total !== 1 ? 's' : ''}`;
      }
    },
  });

  // Sort ao clicar nos headers
  const table = document.getElementById('mr-rotinas-table');
  if (table) {
    table.querySelectorAll('th[data-key]').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        tm.setSort(th.dataset.key);
        // Atualiza ícones
        table.querySelectorAll('th[data-key]').forEach(h => {
          const icon = h.querySelector('.mr-sort-icon');
          if (!icon) return;
          const s = tm.getSortState();
          if (h.dataset.key === s.key) {
            icon.className = s.dir === 'asc'
              ? 'mr-sort-icon ph ph-sort-ascending'
              : 'mr-sort-icon ph ph-sort-descending';
          } else {
            icon.className = 'mr-sort-icon ph ph-arrows-down-up';
          }
        });
      });
    });
  }

  // Busca
  if (searchEl) {
    searchEl.addEventListener('input', e => tm.setSearch(e.target.value));
  }

  // Render inicial
  tm.refresh();
}

// Calcula status da rotina pelo percentual
function rotinaStatus(pct) {
  if (pct === null || pct === undefined) return { key: 'none',    label: 'Sem dados' };
  if (pct >= 80)                          return { key: 'verde',   label: 'Excelente' };
  if (pct >= 50)                          return { key: 'amarelo', label: 'Atenção' };
  return                                         { key: 'vermelho', label: 'Crítico' };
}

// ── Renderiza gráficos Chart.js ───────────────────────────────────────────────
function renderAllCharts(data) {
  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } } },
      tooltip: {
        bodyFont: { family: 'Plus Jakarta Sans' },
        titleFont: { family: 'Plus Jakarta Sans' },
      },
    },
    scales: {
      x: { ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans', size: 11 } }, grid: { color: 'rgba(51,65,85,0.4)' } },
      y: { ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans', size: 11 } }, grid: { color: 'rgba(51,65,85,0.4)' } },
    },
  };

  // 1) Classificação (Doughnut)
  const elClassif = document.getElementById('chart-classif');
  if (elClassif) {
    destroyChart('classif');
    _charts['classif'] = new Chart(elClassif, {
      type: 'doughnut',
      data: {
        labels: data.chamados.por_classificacao.map(p => p.label),
        datasets: [{
          data: data.chamados.por_classificacao.map(p => p.value),
          backgroundColor: ['#4f46e5', '#10b981', '#f59e0b'],
          borderWidth: 2,
          borderColor: '#1e293b',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 }, padding: 12 },
          },
          tooltip: { bodyFont: { family: 'Plus Jakarta Sans' }, titleFont: { family: 'Plus Jakarta Sans' } },
        },
      },
    });
  }

  // 2) Solicitante (bar horizontal)
  const elSolic = document.getElementById('chart-solicitante');
  if (elSolic) {
    destroyChart('solicitante');
    const labels = data.chamados.por_solicitante.map(p => p.label);
    const values = data.chamados.por_solicitante.map(p => p.value);
    _charts['solicitante'] = new Chart(elSolic, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Chamados', data: values, backgroundColor: '#4f46e5', borderRadius: 4 }],
      },
      options: {
        ...chartDefaults,
        indexAxis: 'y',
        plugins: { ...chartDefaults.plugins, legend: { display: false } },
        scales: {
          x: { ...chartDefaults.scales.x, ticks: { ...chartDefaults.scales.x.ticks, stepSize: 1 } },
          y: { ...chartDefaults.scales.y },
        },
      },
    });
  }

  // 3) Help Desk por tipo (bar agrupado)
  const elHD = document.getElementById('chart-helpdesk-tipo');
  if (elHD) {
    destroyChart('helpdesk-tipo');
    const tipoLabels = data.helpdesk.por_tipo.map(p => p.label);
    const tipoValues = data.helpdesk.por_tipo.map(p => Math.round(p.value_minutos / 60 * 100) / 100);
    const tipoColors = ['#ef4444', '#10b981', '#4f46e5'];
    _charts['helpdesk-tipo'] = new Chart(elHD, {
      type: 'bar',
      data: {
        labels: tipoLabels,
        datasets: [{
          label: 'Horas utilizadas',
          data: tipoValues,
          backgroundColor: tipoColors,
          borderRadius: 4,
        }],
      },
      options: {
        ...chartDefaults,
        plugins: { ...chartDefaults.plugins, legend: { display: false } },
        scales: {
          x: { ...chartDefaults.scales.x },
          y: {
            ...chartDefaults.scales.y,
            title: {
              display: true,
              text: 'Horas',
              color: '#64748b',
              font: { family: 'Plus Jakarta Sans', size: 11 },
            },
          },
        },
      },
    });
  }
}

// ── CSS embutido (escopo mr-) ─────────────────────────────────────────────────
function buildStyles() {
  return `
    <style id="monthly-report-styles">
      #mr-root { font-family: 'Plus Jakarta Sans', sans-serif; }

      .mr-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0 16px;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .mr-toolbar-left { display: flex; align-items: center; gap: 0.5rem; }
      .mr-toolbar-right { display: flex; align-items: center; gap: 0.5rem; }

      .mr-nav-btn {
        background: var(--dark-surface);
        border: 1px solid var(--dark-border);
        border-radius: 8px;
        color: var(--text-muted);
        cursor: pointer;
        padding: 6px 8px;
        font-size: 14px;
        display: flex; align-items: center;
        transition: background 0.18s, color 0.18s;
      }
      .mr-nav-btn:hover { background: var(--dark-border); color: var(--text-main); }

      .mr-month-label {
        font-size: 15px;
        font-weight: 700;
        color: var(--text-main);
        min-width: 80px;
        text-align: center;
      }

      .mr-action-btn {
        background: var(--dark-surface);
        border: 1px solid var(--dark-border);
        border-radius: 8px;
        color: var(--text-muted);
        cursor: pointer;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 600;
        display: flex; align-items: center; gap: 6px;
        font-family: inherit;
        transition: background 0.18s;
      }
      .mr-action-btn:hover:not(:disabled) { background: var(--dark-border); color: var(--text-main); }
      .mr-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .mr-body { display: flex; flex-direction: column; gap: 1.5rem; }

      .mr-section {
        border-radius: var(--radius-md);
        padding: 1.25rem 0;
      }
      .mr-section-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        border-bottom: 1px solid var(--dark-border);
        padding-bottom: 10px;
      }

      .mr-card {
        background: var(--dark-surface);
        border: 1px solid var(--dark-border);
        border-radius: var(--radius-md);
        box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -1px rgba(0,0,0,.06);
        padding: 20px;
      }
      .mr-card-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .mr-kpi-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
      }
      .mr-kpi-card { text-align: center; }
      .mr-kpi-value {
        font-size: 36px;
        font-weight: 800;
        color: var(--text-main);
        margin-top: 8px;
      }

      .mr-charts-row {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
      }

      .mr-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .mr-table th {
        color: var(--text-muted);
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 6px 10px;
        text-align: left;
        border-bottom: 1px solid var(--dark-border);
      }
      .mr-table td {
        padding: 8px 10px;
        border-bottom: 1px solid rgba(51,65,85,0.3);
        color: var(--text-main);
      }
      .mr-table tr:last-child td { border-bottom: none; }
      .mr-table tr:hover td { background: rgba(79,70,229,0.04); }

      .mr-link { color: var(--primary); text-decoration: none; }
      .mr-link:hover { text-decoration: underline; }

      .mr-badge-classif {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
      }
      .mr-badge-bug { background: rgba(239,68,68,.15); color: #ef4444; }
      .mr-badge-suporte { background: rgba(16,185,129,.15); color: #10b981; }
      .mr-badge-novo-recurso { background: rgba(245,158,11,.15); color: #f59e0b; }

      .mr-info-box {
        display: flex;
        align-items: flex-start;
        gap: 0.6rem;
        background: rgba(79,70,229,0.07);
        border: 1px solid rgba(79,70,229,0.2);
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 12px;
        color: var(--text-muted);
      }
      .mr-info-box i { color: var(--primary); font-size: 14px; flex-shrink: 0; margin-top: 1px; }

      .mr-integration-banner {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        background: rgba(100,116,139,0.08);
        border: 1px solid rgba(100,116,139,0.2);
        border-radius: 8px;
        padding: 12px 16px;
        font-size: 13px;
        color: var(--text-muted);
      }
      .mr-integration-banner i { font-size: 18px; flex-shrink: 0; margin-top: 1px; }

      .mr-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        padding: 3rem;
        color: var(--text-muted);
        font-size: 14px;
      }
      .mr-spinner {
        width: 28px; height: 28px;
        border: 3px solid var(--dark-border);
        border-top-color: var(--primary);
        border-radius: 50%;
        animation: mr-spin 0.8s linear infinite;
      }
      @keyframes mr-spin { to { transform: rotate(360deg); } }

      .mr-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        padding: 3rem;
        color: #ef4444;
        font-size: 14px;
        text-align: center;
      }
      .mr-error i { font-size: 32px; }

      /* ── Tabela de Rotinas (TableManager 2.0) ─────────────────────────── */
      .mr-rotinas-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 12px;
        border-bottom: 1px solid var(--dark-border);
        gap: 1rem;
        flex-wrap: wrap;
      }
      .mr-rotinas-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .mr-rotinas-search {
        background: var(--dark-bg, #0f1423);
        border: 1px solid var(--dark-border);
        border-radius: 8px;
        color: var(--text-main);
        font-family: inherit;
        font-size: 13px;
        padding: 6px 12px;
        outline: none;
        width: 200px;
        transition: border-color 0.18s;
      }
      .mr-rotinas-search::placeholder { color: var(--text-muted); opacity: .6; }
      .mr-rotinas-search:focus { border-color: var(--primary); }

      .mr-rotinas-table th { cursor: default; user-select: none; }
      .mr-th-sort:hover { color: var(--text-main); background: rgba(79,70,229,0.06); }
      .mr-th-sort .mr-sort-icon { font-size: 11px; opacity: .45; margin-left: 4px; vertical-align: middle; }
      .mr-th-sort.sort-asc .mr-sort-icon,
      .mr-th-sort.sort-desc .mr-sort-icon { opacity: 1; color: var(--primary); }

      .mr-rotinas-footer {
        padding: 10px 20px;
        font-size: 12px;
        color: var(--text-muted);
        border-top: 1px solid var(--dark-border);
        text-align: right;
      }

      .mr-table-empty {
        text-align: center;
        color: var(--text-muted);
        padding: 2.5rem !important;
        font-size: 13px;
        opacity: .6;
      }

      /* Badge de percentual */
      .mr-pct-badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 700;
        min-width: 48px;
        text-align: center;
      }
      .mr-pct-verde   { background: rgba(16,185,129,.15); color: #10b981; }
      .mr-pct-amarelo { background: rgba(245,158,11,.15); color: #f59e0b; }
      .mr-pct-vermelho{ background: rgba(239,68,68,.15);  color: #ef4444; }
      .mr-pct-none    { background: rgba(100,116,139,.1); color: #64748b; }

      /* Dot de status */
      .mr-status-dot {
        display: inline-block;
        width: 10px; height: 10px;
        border-radius: 50%;
      }
      .mr-status-verde    { background: #10b981; box-shadow: 0 0 6px rgba(16,185,129,.5); }
      .mr-status-amarelo  { background: #f59e0b; box-shadow: 0 0 6px rgba(245,158,11,.5); }
      .mr-status-vermelho { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,.5);  }
      .mr-status-none     { background: #334155; }
    </style>
  `;
}

// ── Utilitários ────────────────────────────────────────────────────────────────
function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

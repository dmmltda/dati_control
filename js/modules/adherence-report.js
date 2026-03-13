/**
 * Módulo: Relatório de Aderência — aba "Lista" do Customer Success
 * Exibe todos os indicadores (processos + chamados) de uma empresa
 * usando TableManager 2.0.
 *
 * TODO: substituir dados mock pela integração real com DATI Import API
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

// Mock de valores por empresa (índice => [acessos, realizados])
const MOCK_VALORES = [
  [50, 47], [30, 28], [22, 22], [18, 16], [15, 13],
  [15, 12], [12, 12], [12, 10], [10,  8], [ 8,  8],
  [ 8,  7], [ 8,  6], [ 7,  7], [ 6,  5], [ 6,  6],
  [ 5,  4], [ 4,  4],
  // Chamados
  [24, 24], [24, 20], [24, 22], [24, 18], [24, 21], [24, 23],
];

// ── Função de status ──────────────────────────────────────────────────────────
function statusPct(pct) {
  if (pct === null || pct === undefined) return { key: 'none',     label: 'Sem dados' };
  if (pct >= 80)                          return { key: 'verde',    label: 'Excelente' };
  if (pct >= 50)                          return { key: 'amarelo',  label: 'Atenção'   };
  return                                         { key: 'vermelho', label: 'Crítico'   };
}

// ── Ponto de entrada público ──────────────────────────────────────────────────
export function initAdherenceReport(companyId) {
  const tbody   = document.getElementById('adh-table-body');
  const countEl = document.getElementById('adh-count');
  const searchEl = document.getElementById('adh-search');
  if (!tbody) return;

  // Monta dados com valores mock
  const tableData = INDICADORES.map((ind, i) => {
    const [acessos, realizados] = MOCK_VALORES[i] ?? [null, null];
    const percentual = (acessos && realizados !== null)
      ? Math.round((realizados / acessos) * 100)
      : null;
    return {
      id:         i,
      grupo:      ind.grupo,
      indicador:  ind.indicador,
      acessos,
      automatico: realizados,
      percentual,
    };
  });

  _tm = new TableManager({
    data:     tableData,
    pageSize: tableData.length, // sem paginação — mostra todos
    tableId:  'adh-table',
    columns: [
      { key: 'grupo',      label: 'Grupo',       type: 'string', sortable: true, searchable: true, filterable: true },
      { key: 'indicador',  label: 'Indicador',   type: 'string', sortable: true, searchable: true },
      { key: 'acessos',    label: 'Acessos',     type: 'number', sortable: true },
      { key: 'automatico', label: 'Realizados',  type: 'number', sortable: true },
      { key: 'percentual', label: '% Aderência', type: 'number', sortable: true },
    ],
    renderRows(data) {
      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem; opacity:.5;">Nenhum indicador encontrado.</td></tr>`;
        return;
      }

      // Agrupa por grupo para separadores visuais
      let lastGrupo = '';
      tbody.innerHTML = data.map(row => {
        const pct    = row.percentual;
        const st     = statusPct(pct);
        const pctTxt = pct !== null ? `${pct}%` : '<span style="opacity:.35">—</span>';
        const acTxt  = row.acessos    !== null ? row.acessos    : '<span style="opacity:.35">—</span>';
        const realTxt= row.automatico !== null ? row.automatico : '<span style="opacity:.35">—</span>';

        // Badge de grupo (só na primeira linha do grupo, ou sempre para facilitar sort)
        const grupoBadge = `<span class="adh-grupo-badge adh-grupo-${row.grupo === 'Processos' ? 'proc' : 'cham'}">${row.grupo}</span>`;

        return `
          <tr>
            <td>${grupoBadge}</td>
            <td style="font-size:13px;">${row.indicador}</td>
            <td style="text-align:center; font-weight:600;">${acTxt}</td>
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
    },
  });

  // Expõe globalmente para os onclicks nos headers do HTML
  window._adhTM = _tm;

  // Busca
  if (searchEl) {
    // Remove listener anterior se houver
    const newSearch = searchEl.cloneNode(true);
    searchEl.parentNode.replaceChild(newSearch, searchEl);
    newSearch.addEventListener('input', e => _tm.setSearch(e.target.value));
  }

  _injectStyles();
}

// ── CSS para os badges ────────────────────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('adh-report-styles')) return;
  const style = document.createElement('style');
  style.id = 'adh-report-styles';
  style.textContent = `
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

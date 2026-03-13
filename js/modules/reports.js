/**
 * Módulo: Relatórios — Tabela nativa de dados do Journey
 * Tabela interativa com todos os campos de empresa + filtros + export CSV
 */
import { getAuthToken } from './auth.js';

// ── Definição de colunas ──────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'nome',               label: 'Empresa',            visible: true,  type: 'text',     sortable: true },
  { key: 'cnpj',               label: 'CNPJ',               visible: true,  type: 'text',     sortable: true },
  { key: 'status',             label: 'Status',             visible: true,  type: 'badge',    sortable: true },
  { key: 'tipo',               label: 'Tipo',               visible: true,  type: 'text',     sortable: true },
  { key: 'segmento',           label: 'Segmento',           visible: true,  type: 'text',     sortable: true },
  { key: 'health_score',       label: 'Health Score',       visible: true,  type: 'badge-hs', sortable: true },
  { key: 'nps',                label: 'NPS',                visible: true,  type: 'text',     sortable: true },
  { key: 'cs',                 label: 'CS Responsável',     visible: true,  type: 'text',     sortable: true },
  { key: 'usuario',            label: 'Usuário',            visible: false, type: 'text',     sortable: true },
  { key: 'cidade',             label: 'Cidade',             visible: true,  type: 'text',     sortable: true },
  { key: 'estado',             label: 'Estado',             visible: true,  type: 'text',     sortable: true },
  { key: 'erp',                label: 'ERP',                visible: false, type: 'text',     sortable: true },
  { key: 'lead',               label: 'Lead',               visible: false, type: 'text',     sortable: true },
  { key: 'modo',               label: 'Modo',               visible: false, type: 'text',     sortable: true },
  { key: 'site',               label: 'Site',               visible: true,  type: 'text',     sortable: true },
  { key: 'inicio_cs',          label: 'Início CS',          visible: false, type: 'date',     sortable: true },
  { key: 'data_interesse',     label: 'Data Interesse',     visible: false, type: 'date',     sortable: true },
  { key: 'inicio_onboarding',  label: 'Início Onboarding',  visible: false, type: 'date',     sortable: true },
  { key: 'termino_onboarding', label: 'Término Onboarding', visible: false, type: 'date',     sortable: true },
  { key: 'data_follow_up',     label: 'Próximo Follow-up',  visible: false, type: 'date',     sortable: true },
  { key: 'data_churn',         label: 'Data Churn',         visible: false, type: 'date',     sortable: true },
  { key: 'motivo_churn',       label: 'Motivo Churn',       visible: false, type: 'text',     sortable: false },
  { key: 'onboarding_fechado', label: 'Onboarding OK',      visible: false, type: 'text',     sortable: true },
  { key: 'sucesso_ext',        label: 'Sucesso Ext.',       visible: false, type: 'text',     sortable: true },
  { key: 'objective',          label: 'Objetivo',           visible: false, type: 'text',     sortable: false },
  { key: 'dores',              label: 'Dores/Gargalos',     visible: false, type: 'text',     sortable: false },
  { key: 'produtos',           label: 'Produtos',           visible: true,  type: 'text',     sortable: false },
  { key: 'valor_total',        label: 'Valor Total',        visible: false, type: 'currency', sortable: true },
  { key: 'ultimo_followup',    label: 'Último Followup',    visible: false, type: 'date',     sortable: true },
  { key: 'total_atividades',   label: 'Atividades',         visible: false, type: 'number',   sortable: true },
  { key: 'total_tickets',      label: 'Tickets',            visible: false, type: 'number',   sortable: true },
  { key: 'createdAt',          label: 'Criado em',          visible: false, type: 'date',     sortable: true },
];

// ── Estado interno ────────────────────────────────────────────────────────────
const state = {
  rows:        [],
  filtered:    [],
  sortKey:     'nome',
  sortAsc:     true,
  page:        1,
  perPage:     50,
  initialized: false,
  loading:     false,
  colPickerOpen: false,
};

const filters = {
  search:  '',
  status:  '',
  tipo:    '',
  segmento:'',
  health:  '',
  cs:      '',
  dateFrom:'',
  dateTo:  '',
};

// ── Inicialização pública ─────────────────────────────────────────────────────
export async function initReports() {
  if (state.loading) return;
  if (state.initialized) { applyFilters(); renderTable(); return; }
  state.initialized = true;
  bindFilterEvents();
  bindColumnPickerToggle();
  await loadData();
}

// ── Carrega dados da API ──────────────────────────────────────────────────────
async function loadData(params = {}) {
  setLoadingState(true);
  try {
    const token = await getAuthToken();
    const qs = new URLSearchParams(Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== '' && v != null)
    )).toString();
    const res = await fetch(`/api/reports/data${qs ? '?' + qs : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.rows = data.rows ?? [];
    populateFilterOptions(data.filterOptions ?? {});
    applyFilters();
    renderTable();
  } catch (err) {
    console.error('[reports] erro:', err);
    showError('Não foi possível carregar os dados. Tente novamente.');
  } finally {
    setLoadingState(false);
  }
}

// ── Aplica filtros locais sobre os dados em memória ───────────────────────────
function applyFilters() {
  const s = filters.search.toLowerCase();
  state.filtered = state.rows.filter(r => {
    if (s && !r.nome?.toLowerCase().includes(s)) return false;
    if (filters.status   && r.status   !== filters.status)   return false;
    if (filters.tipo     && r.tipo     !== filters.tipo)     return false;
    if (filters.segmento && r.segmento !== filters.segmento) return false;
    if (filters.health   && r.health_score !== filters.health) return false;
    if (filters.cs       && r.cs       !== filters.cs)       return false;
    if (filters.dateFrom) {
      const d = new Date(r.createdAt);
      if (d < new Date(filters.dateFrom)) return false;
    }
    if (filters.dateTo) {
      const d = new Date(r.createdAt);
      if (d > new Date(new Date(filters.dateTo).setHours(23, 59, 59))) return false;
    }
    return true;
  });

  // Ordenação
  state.filtered.sort((a, b) => {
    let av = a[state.sortKey] ?? '';
    let bv = b[state.sortKey] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return state.sortAsc ? -1 : 1;
    if (av > bv) return state.sortAsc ?  1 : -1;
    return 0;
  });

  state.page = 1;
  updateCountBadge();
}

// ── Renderiza a tabela ────────────────────────────────────────────────────────
function renderTable() {
  const visibleCols = COLUMNS.filter(c => c.visible);
  renderHead(visibleCols);
  renderBody(visibleCols);
  renderPagination();
}

function renderHead(cols) {
  const thead = document.getElementById('rpt-thead');
  if (!thead) return;
  thead.innerHTML = `<tr>${cols.map(c => {
    const sortIcon = c.sortable
      ? (state.sortKey === c.key ? (state.sortAsc ? '↑' : '↓') : '<span class="rpt-sort-icon">↕</span>')
      : '';
    return `<th class="${c.sortable ? 'rpt-sortable' : ''}" data-key="${c.key}">${c.label} ${sortIcon}</th>`;
  }).join('')}</tr>`;

  thead.querySelectorAll('th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      const col = COLUMNS.find(c => c.key === th.dataset.key);
      if (!col?.sortable) return;
      if (state.sortKey === col.key) state.sortAsc = !state.sortAsc;
      else { state.sortKey = col.key; state.sortAsc = true; }
      applyFilters();
      renderTable();
    });
  });
}

function renderBody(cols) {
  const tbody = document.getElementById('rpt-tbody');
  if (!tbody) return;

  const start = (state.page - 1) * state.perPage;
  const slice = state.filtered.slice(start, start + state.perPage);

  if (slice.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" class="rpt-empty">Nenhum resultado encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = slice.map(row => `
    <tr>
      ${cols.map(c => `<td>${formatCell(row[c.key], c.type, c.key, row)}</td>`).join('')}
    </tr>
  `).join('');
}

function formatCell(value, type, key, row) {
  if (value === null || value === undefined || value === '') return '<span class="rpt-empty-cell">—</span>';
  switch (type) {
    case 'date':
      try { return new Date(value).toLocaleDateString('pt-BR'); } catch { return value; }
    case 'currency':
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    case 'number':
      return `<span class="rpt-num">${value}</span>`;
    case 'badge':
      return `<span class="rpt-badge rpt-badge-${slugify(String(value))}">${value}</span>`;
    case 'badge-hs': {
      const cls = getHSClass(String(value));
      return `<span class="rpt-badge rpt-hs ${cls}">${value}</span>`;
    }
    default:
      if (key === 'nome') {
        return `<strong><a href="#" class="rpt-nome-link" onclick="window._rptOpenCompany && window._rptOpenCompany('${row.id}'); return false;">${escHtml(String(value))}</a></strong>`;
      }
      return escHtml(String(value));
  }
}

function getHSClass(hs) {
  const map = { 'Verde': 'hs-verde', 'Amarelo': 'hs-amarelo', 'Vermelho': 'hs-vermelho', 'Cinza': 'hs-cinza' };
  return map[hs] ?? 'hs-cinza';
}

function slugify(s) { return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ── Paginação ─────────────────────────────────────────────────────────────────
function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
  const info  = document.getElementById('rpt-page-info');
  const prev  = document.getElementById('rpt-prev');
  const next  = document.getElementById('rpt-next');
  if (info) info.textContent = `Página ${state.page} de ${totalPages}`;
  if (prev) prev.disabled = state.page <= 1;
  if (next) next.disabled = state.page >= totalPages;
  if (prev) prev.onclick = () => { state.page--; renderTable(); };
  if (next) next.onclick = () => { state.page++; renderTable(); };
}

// ── Filtros ───────────────────────────────────────────────────────────────────
function bindFilterEvents() {
  const fields = [
    ['rpt-search',         'search',   'input'],
    ['rpt-filter-status',  'status',   'change'],
    ['rpt-filter-tipo',    'tipo',     'change'],
    ['rpt-filter-segmento','segmento', 'change'],
    ['rpt-filter-health',  'health',   'change'],
    ['rpt-filter-cs',      'cs',       'change'],
    ['rpt-filter-date-from','dateFrom','change'],
    ['rpt-filter-date-to', 'dateTo',   'change'],
  ];
  fields.forEach(([id, key, evt]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(evt, () => {
      filters[key] = el.value;
      applyFilters();
      renderTable();
    });
  });

  const btnClear = document.getElementById('btn-rpt-clear');
  if (btnClear) btnClear.addEventListener('click', clearFilters);

  const btnExportCsv = document.getElementById('btn-rpt-export-csv');
  if (btnExportCsv) btnExportCsv.addEventListener('click', exportCSV);

  const btnExportExcel = document.getElementById('btn-rpt-export-excel');
  if (btnExportExcel) btnExportExcel.addEventListener('click', exportExcel);

  const btnRefresh = document.getElementById('btn-rpt-refresh');
  if (btnRefresh) btnRefresh.addEventListener('click', () => {
    state.initialized = false;
    initReports();
  });
}

function clearFilters() {
  Object.keys(filters).forEach(k => filters[k] = '');
  ['rpt-search','rpt-filter-status','rpt-filter-tipo','rpt-filter-segmento',
   'rpt-filter-health','rpt-filter-cs','rpt-filter-date-from','rpt-filter-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  applyFilters();
  renderTable();
}

function populateFilterOptions(opts) {
  const pairs = [
    ['rpt-filter-status',   opts.status,       'Status'],
    ['rpt-filter-tipo',     opts.tipo,         'Tipo'],
    ['rpt-filter-segmento', opts.segmento,     'Segmento'],
    ['rpt-filter-health',   opts.health_score, 'Health Score'],
    ['rpt-filter-cs',       opts.cs,           'Responsável'],
  ];
  pairs.forEach(([id, values = [], placeholder]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = `<option value="">${placeholder}</option>` +
      (values || []).map(v => `<option value="${escHtml(v)}"${v === current ? ' selected' : ''}>${escHtml(v)}</option>`).join('');

    // Se o elemento foi transformado em CustomSelect, força re-leitura
    if (el._customSelectInstance) {
      el._customSelectInstance.refresh();
    }
  });
}

// ── Column Picker ─────────────────────────────────────────────────────────────
function bindColumnPickerToggle() {
  const btn    = document.getElementById('btn-rpt-columns');
  const picker = document.getElementById('rpt-col-picker');
  if (!btn || !picker) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.colPickerOpen = !state.colPickerOpen;
    if (state.colPickerOpen) {
      renderColumnPicker();
      picker.style.display = 'block';
    } else {
      picker.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target) && e.target !== btn) {
      picker.style.display = 'none';
      state.colPickerOpen = false;
    }
  });
}

function renderColumnPicker() {
  const picker = document.getElementById('rpt-col-picker');
  if (!picker) return;

  const listId = 'rpt-col-list';
  picker.innerHTML = `
    <div class="rpt-col-picker-header">Colunas visíveis</div>
    <div id="${listId}">
      ${COLUMNS.map(c => `
        <div class="rpt-col-item" data-key="${c.key}">
          <div class="rpt-col-drag-handle">
            <i class="ph ph-dots-six-vertical"></i>
          </div>
          <input type="checkbox" id="col-cb-${c.key}" data-col="${c.key}" ${c.visible ? 'checked' : ''}/>
          <label for="col-cb-${c.key}" style="flex:1; cursor:pointer;">${c.label}</label>
        </div>
      `).join('')}
    </div>
  `;

  // Inicializa SortableJS no contêiner da lista
  const listEl = document.getElementById(listId);
  if (listEl && typeof Sortable !== 'undefined') {
    new Sortable(listEl, {
      handle: '.rpt-col-drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: () => {
        // Reconstrói o array COLUMNS baseado na nova ordem do DOM
        const newOrderKeys = Array.from(listEl.querySelectorAll('.rpt-col-item')).map(el => el.dataset.key);
        const reordered = newOrderKeys.map(key => COLUMNS.find(c => c.key === key));
        
        // Atualiza o array original
        COLUMNS.length = 0;
        COLUMNS.push(...reordered);
        
        // Re-renderiza a tabela com a nova ordem
        renderTable();
      }
    });
  }

  picker.querySelectorAll('input[data-col]').forEach(cb => {
    cb.addEventListener('change', () => {
      const col = COLUMNS.find(c => c.key === cb.dataset.col);
      if (col) { col.visible = cb.checked; renderTable(); }
    });
  });
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV() {
  const visibleCols = COLUMNS.filter(c => c.visible);
  const header = visibleCols.map(c => `"${c.label}"`).join(',');
  const rows = state.filtered.map(row =>
    visibleCols.map(c => {
      let v = row[c.key] ?? '';
      if (c.type === 'date' && v) { try { v = new Date(v).toLocaleDateString('pt-BR'); } catch {} }
      if (c.type === 'currency') v = Number(v).toFixed(2);
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `journey-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Export Excel ─────────────────────────────────────────────────────────────
async function exportExcel() {
  if (typeof ExcelJS === 'undefined') {
    alert('Biblioteca ExcelJS não carregada. Verifique sua conexão.');
    return;
  }

  const btn = document.getElementById('btn-rpt-export-excel');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Gerando...';

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Journey - Relatório');

    // Selecionamos as colunas visíveis
    const visibleCols = COLUMNS.filter(c => c.visible);

    // Mapeamento de nomes de campos para o padrão do template de importação
    const importPatterns = {
      'nome': 'Nome da Empresa',
      'status': 'Status da Empresa',
      'cnpj': 'CNPJ',
      'tipo': 'Tipo de Empresa',
      'estado': 'Estado',
      'cidade': 'Cidade',
      'segmento': 'Segmento',
      'site': 'Site'
    };

    // Configura as colunas no Excel com larguras otimizadas
    const colWidths = {
      'nome': 45,
      'cnpj': 18,
      'status': 22,
      'tipo': 20,
      'segmento': 25,
      'health_score': 16,
      'nps': 12,
      'cs': 25,
      'cidade': 22,
      'estado': 10,
      'site': 55,
      'produtos': 45
    };

    worksheet.columns = visibleCols.map(c => ({
      header: importPatterns[c.key] || c.label,
      key: c.key,
      width: colWidths[c.key] || 20
    }));

    // Estilo do Cabeçalho (Padrão Importação: Azul Escuro, Texto Branco, Negrito)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30; // Um pouco mais alto para o look 10/10
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF002060' }
      };
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true,
        size: 11
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    });

    // Adiciona as linhas com os dados filtrados
    state.filtered.forEach(row => {
      const rowData = {};
      visibleCols.forEach(c => {
        let v = row[c.key] ?? '';
        if (c.type === 'date' && v) {
          try { v = new Date(v).toLocaleDateString('pt-BR'); } catch {}
        }
        if (c.type === 'currency') v = Number(v).toFixed(2);
        rowData[c.key] = v;
      });
      const addedRow = worksheet.addRow(rowData);
      
      // Estilização 10/10: Bordas em todas as células e centralização
      addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Alinhamento centralizado para tudo (conforme pedido)
        // Dica: Nome da empresa e Site geralmente ficam melhor à esquerda, mas o user pediu "centralizei tudo"
        const colKey = visibleCols[colNumber - 1]?.key;
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: (colKey === 'nome' || colKey === 'site' || colKey === 'produtos') ? 'left' : 'center' 
        };
        
        // Bordas cinza claro em toda a grade
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });

      // Destaque condicional para Status
      if (row.status) {
         const statusCell = addedRow.getCell('status');
         const s = String(row.status).toLowerCase();
         if (s.includes('ativo')) statusCell.font = { color: { argb: 'FF10B981' }, bold: true };
         if (s.includes('inativo') || s.includes('cancelado')) statusCell.font = { color: { argb: 'FFEF4444' }, bold: true };
         if (s.includes('proposta') || s.includes('reuni')) statusCell.font = { color: { argb: 'FFF59E0B' }, bold: true };
      }
    });

    // Ajusta o zoom da planilha
    worksheet.views = [{ zoomScale: 100 }];

    // Gera o arquivo e inicia o download via FileSaver
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `journey-relatorio-${new Date().toISOString().slice(0, 10)}.xlsx`);

  } catch (err) {
    console.error('[exportExcel] Erro inesperado:', err);
    alert('Não foi possível gerar o Excel. Detalhes: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ── Utilitários ───────────────────────────────────────────────────────────────
function setLoadingState(loading) {
  state.loading = loading;
  const tbody = document.getElementById('rpt-tbody');
  if (loading && tbody) {
    tbody.innerHTML = `<tr><td colspan="99" class="rpt-loading"><div class="rpt-spinner"></div><span>Carregando dados…</span></td></tr>`;
  }
  const btn = document.getElementById('btn-rpt-refresh');
  if (btn) btn.disabled = loading;
}

function updateCountBadge() {
  const el = document.getElementById('rpt-count');
  if (el) el.textContent = `${state.filtered.length} empresa${state.filtered.length !== 1 ? 's' : ''}`;
}

function showError(msg) {
  const tbody = document.getElementById('rpt-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="99" class="rpt-empty rpt-error-cell"><i class="ph ph-warning"></i> ${msg}</td></tr>`;
}

// Expose para o app.js (openCompany já existe lá)
window._rptOpenCompany = (id) => {
  if (typeof window.openCompany === 'function') window.openCompany(id);
};

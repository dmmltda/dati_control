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

// Armazena as opções disponíveis para cada filtro (populado via API)
const filterOptions = {
  status:   [],
  tipo:     [],
  segmento: [],
  health:   [],
  cs:       [],
};

// Labels legíveis para cada chave de filtro
const FILTER_LABELS = {
  status:   'Status',
  tipo:     'Tipo',
  segmento: 'Segmento',
  health:   'Health Score',
  cs:       'Responsável',
};

function bindFilterEvents() {
  // Busca textual
  const searchEl = document.getElementById('rpt-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      filters.search = searchEl.value;
      applyFilters();
      renderTable();
      renderActiveChips();
    });
  }

  const btnExportCsv = document.getElementById('btn-rpt-export-csv');
  if (btnExportCsv) btnExportCsv.addEventListener('click', exportCSV);

  const btnExportExcel = document.getElementById('btn-rpt-export-excel');
  if (btnExportExcel) btnExportExcel.addEventListener('click', exportExcel);

  const btnRefresh = document.getElementById('btn-rpt-refresh');
  if (btnRefresh) btnRefresh.addEventListener('click', () => {
    state.initialized = false;
    initReports();
  });

  // Expõe helpers globais para os onchange/onclick inline no HTML
  window._rptClearFilters = clearFilters;

  // Filtro por data — chamado via onchange inline nos inputs
  window._rptSetDateFilter = function(field, value) {
    filters[field] = value;
    applyFilters();
    renderTable();
    renderActiveChips();
  };
}

// ── Filtro via select nativo (onchange inline no HTML) ────────────────────────
window._rptSetFilter = function(filterKey, value) {
  filters[filterKey] = value;
  applyFilters();
  renderTable();
  renderActiveChips();
};

// Renderiza chips de filtros ativos
function renderActiveChips() {
  const bar = document.getElementById('rpt-active-chips');
  if (!bar) return;

  const chips = [];

  if (filters.search) {
    chips.push(`<span class="filter-chip"><i class="ph ph-magnifying-glass"></i> "${escHtml(filters.search)}" <button class="chip-remove" onclick="window._rptRemoveFilter('search')" title="Remover"><i class="ph ph-x"></i></button></span>`);
  }
  if (filters.status)   chips.push(`<span class="filter-chip">Status: <strong>${escHtml(filters.status)}</strong> <button class="chip-remove" onclick="window._rptRemoveFilter('status')" title="Remover"><i class="ph ph-x"></i></button></span>`);
  if (filters.tipo)     chips.push(`<span class="filter-chip">Tipo: <strong>${escHtml(filters.tipo)}</strong> <button class="chip-remove" onclick="window._rptRemoveFilter('tipo')" title="Remover"><i class="ph ph-x"></i></button></span>`);
  if (filters.segmento) chips.push(`<span class="filter-chip">Segmento: <strong>${escHtml(filters.segmento)}</strong> <button class="chip-remove" onclick="window._rptRemoveFilter('segmento')" title="Remover"><i class="ph ph-x"></i></button></span>`);
  if (filters.health)   chips.push(`<span class="filter-chip">Health: <strong>${escHtml(filters.health)}</strong> <button class="chip-remove" onclick="window._rptRemoveFilter('health')" title="Remover"><i class="ph ph-x"></i></button></span>`);
  if (filters.cs)       chips.push(`<span class="filter-chip">CS: <strong>${escHtml(filters.cs)}</strong> <button class="chip-remove" onclick="window._rptRemoveFilter('cs')" title="Remover"><i class="ph ph-x"></i></button></span>`);
  if (filters.dateFrom || filters.dateTo) {
    const fd = filters.dateFrom ? filters.dateFrom.split('-').reverse().join('/') : '...';
    const td = filters.dateTo   ? filters.dateTo.split('-').reverse().join('/')   : '...';
    chips.push(`<span class="filter-chip">Data: <strong>${fd} - ${td}</strong> <button class="chip-remove" onclick="window._rptRemoveFilter('date')" title="Remover"><i class="ph ph-x"></i></button></span>`);
  }

  if (chips.length > 0) {
    bar.innerHTML = chips.join('');
    bar.style.display = 'flex';
  } else {
    bar.innerHTML = '';
    bar.style.display = 'none';
  }
}

window._rptRemoveFilter = function(key) {
  if (key === 'search') {
    filters.search = '';
    const s = document.getElementById('rpt-search');
    if (s) s.value = '';
  } else if (key === 'date') {
    filters.dateFrom = ''; filters.dateTo = '';
    const f = document.getElementById('rpt-filter-date-from');
    const t = document.getElementById('rpt-filter-date-to');
    if (f) f.value = ''; if (t) t.value = '';
  } else {
    filters[key] = '';
    const elMap = {
      status: 'rpt-filter-status', tipo: 'rpt-filter-tipo',
      segmento: 'rpt-filter-segmento', health: 'rpt-filter-health', cs: 'rpt-filter-cs',
    };
    const el = document.getElementById(elMap[key]);
    if (el) el.value = '';
  }
  applyFilters();
  renderTable();
  renderActiveChips();
};

function clearFilters() {
  Object.keys(filters).forEach(k => filters[k] = '');
  const searchEl = document.getElementById('rpt-search');
  if (searchEl) searchEl.value = '';
  const dateFrom = document.getElementById('rpt-filter-date-from');
  if (dateFrom) dateFrom.value = '';
  const dateTo = document.getElementById('rpt-filter-date-to');
  if (dateTo) dateTo.value = '';
  // Limpa selects nativos
  ['rpt-filter-status','rpt-filter-tipo','rpt-filter-segmento','rpt-filter-health','rpt-filter-cs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  applyFilters();
  renderTable();
  renderActiveChips();
}

function populateFilterOptions(opts) {
  // Armazena para uso futuro
  filterOptions.status   = opts.status       || [];
  filterOptions.tipo     = opts.tipo         || [];
  filterOptions.segmento = opts.segmento     || [];
  filterOptions.health   = opts.health_score || [];
  filterOptions.cs       = opts.cs           || [];

  // Popula os selects nativos
  const pairs = [
    ['rpt-filter-status',   filterOptions.status,   'Status'],
    ['rpt-filter-tipo',     filterOptions.tipo,     'Tipo'],
    ['rpt-filter-segmento', filterOptions.segmento, 'Segmento'],
    ['rpt-filter-health',   filterOptions.health,   'Health Score'],
    ['rpt-filter-cs',       filterOptions.cs,       'Responsável'],
  ];
  pairs.forEach(([id, values, placeholder]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = filters[id.replace('rpt-filter-', '')] || '';
    el.innerHTML = `<option value="">${placeholder}</option>` +
      values.map(v => `<option value="${escHtml(v)}"${v === current ? ' selected' : ''}>${escHtml(v)}</option>`).join('');
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

  // Mostra/oculta botão Limpar filtros
  const hasFilters = Object.values(filters).some(v => v !== '');
  const btnClear = document.getElementById('btn-rpt-clear');
  if (btnClear) btnClear.style.display = hasFilters ? '' : 'none';
}

function showError(msg) {
  const tbody = document.getElementById('rpt-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="99" class="rpt-empty rpt-error-cell"><i class="ph ph-warning"></i> ${msg}</td></tr>`;
}

// Expose para o app.js (openCompany já existe lá)
window._rptOpenCompany = (id) => {
  if (typeof window.openCompany === 'function') window.openCompany(id);
};

// ══════════════════════════════════════════════════════════════════════════════
// ADERÊNCIA MENSAL — Visão de todas as empresas por mês
// ══════════════════════════════════════════════════════════════════════════════

const _adh = {
  month: null,   // YYYY-MM
  data:  [],     // rows da API /api/monthly-report/overview
};

function _adhTodayYYYYMM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function _adhFormatLabel(yyyyMM) {
  if (!yyyyMM) return '—';
  const [year, month] = yyyyMM.split('-').map(Number);
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[month - 1]}/${year}`;
}

function _adhPrev(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _adhNext(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _adhUpdateMonthLabel() {
  const el = document.getElementById('rpt-adh-month-label');
  if (el) el.textContent = _adhFormatLabel(_adh.month);
}

async function _adhFetch() {
  const token = await getAuthToken();
  const res = await fetch(`/api/monthly-report/overview?month=${_adh.month}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function _adhStatusIcon(status) {
  switch (status) {
    case 'verde':    return '<span style="font-size:16px;" title="OK">✅</span>';
    case 'amarelo':  return '<span style="font-size:16px;" title="Atenção">⚠️</span>';
    case 'vermelho': return '<span style="font-size:16px;" title="HD negativo">❌</span>';
    default:         return '<span style="font-size:16px; opacity:.4;" title="Sem dados">—</span>';
  }
}

async function _adhLoad() {
  const tbody = document.getElementById('rpt-adh-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="rpt-loading"><div class="rpt-spinner"></div><span>Carregando...</span></td></tr>`;

  try {
    _adh.data = await _adhFetch();
    _adhRender();
  } catch (err) {
    console.error('[monthly-report/overview]', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="rpt-empty rpt-error-cell"><i class="ph ph-warning"></i> Erro ao carregar aderência mensal.</td></tr>`;
  }
}

function _adhRender() {
  const tbody  = document.getElementById('rpt-adh-tbody');
  if (!tbody) return;

  let rows = [..._adh.data];

  // Filtro CS
  const csFilter = document.getElementById('rpt-adh-filter-cs')?.value || '';
  if (csFilter) rows = rows.filter(r => r.cs === csFilter);

  const hs = document.getElementById('rpt-adh-filter-hs')?.value || '';
  // HS filter não está disponível no endpoint overview ainda, mas se passado
  // na API futura virá no campo health_score

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="rpt-empty">Nenhum dado encontrado para este mês.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="font-weight:600;">${_escHtml(r.nome)}</td>
      <td style="color:var(--text-muted);">${_escHtml(r.cs || '—')}</td>
      <td style="text-align:center;">${r.chamados}</td>
      <td style="text-align:center; font-weight:600;
          color:${r.saldo_hd_minutos >= 0 ? '#10b981' : '#ef4444'};">${_escHtml(r.saldo_hd_formatado)}</td>
      <td style="text-align:center; color:var(--text-muted);">${r.aderencia_geral !== null ? r.aderencia_geral + '%' : '<span style="opacity:.4">—</span>'}</td>
      <td style="text-align:center;">${_adhStatusIcon(r.status)}</td>
      <td style="text-align:center;">
        <button class="btn-ghost btn-sm"
          onclick="window._rptAbrirRelatorio('${r.id}')"
          title="Ver relatório de ${_escHtml(r.nome)}"
          style="font-size:12px; padding:4px 8px;">
          <i class="ph ph-arrow-right"></i> Ver
        </button>
      </td>
    </tr>
  `).join('');

  // Preenche o select de CS dinamicamente
  const csSelect = document.getElementById('rpt-adh-filter-cs');
  if (csSelect && csSelect.options.length === 1) {
    const csSet = new Set(_adh.data.map(r => r.cs).filter(Boolean));
    csSet.forEach(cs => {
      const opt = document.createElement('option');
      opt.value = cs;
      opt.textContent = cs;
      csSelect.appendChild(opt);
    });
  }
}

function _escHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s || '');
  return d.innerHTML;
}

// Navega para a aba Relatório do cliente
window._rptAbrirRelatorio = function(companyId) {
  // 1) Abre o formulário da empresa
  if (typeof window.nav?.openCompanyForm === 'function') {
    window.nav.openCompanyForm(companyId);
  }
  // 2) Aguarda o DOM renderizar e clica no botão da aba Relatório
  setTimeout(() => {
    const btn = document.getElementById('btn-tab-monthly-report');
    if (btn) btn.click();
  }, 400);
};

function _adhInitEventListeners() {
  document.getElementById('rpt-adh-prev')?.addEventListener('click', async () => {
    _adh.month = _adhPrev(_adh.month);
    _adhUpdateMonthLabel();
    await _adhLoad();
  });
  document.getElementById('rpt-adh-next')?.addEventListener('click', async () => {
    _adh.month = _adhNext(_adh.month);
    _adhUpdateMonthLabel();
    await _adhLoad();
  });
  document.getElementById('rpt-adh-refresh')?.addEventListener('click', async () => {
    await _adhLoad();
  });
  document.getElementById('rpt-adh-filter-cs')?.addEventListener('change', _adhRender);
  document.getElementById('rpt-adh-filter-hs')?.addEventListener('change', _adhRender);
}

// ── Tab switcher (Tabela de Empresas | Aderência Mensal) ──────────────────────
let _tabListenersOk = false;
let _adhLoaded = false;

window._rptSwitchTab = function(tab) {
  const panelEmpresas  = document.getElementById('rpt-panel-empresas');
  const panelAderencia = document.getElementById('rpt-panel-aderencia');
  const btnEmpresas    = document.getElementById('rpt-tab-empresas');
  const btnAderencia   = document.getElementById('rpt-tab-aderencia');

  // Mostra / esconde botões do header que fazem sentido só para a tabela
  const headerActions = document.querySelector('.rpt-header-actions');

  if (tab === 'empresas') {
    if (panelEmpresas)  panelEmpresas.style.display  = '';
    if (panelAderencia) panelAderencia.style.display = 'none';
    btnEmpresas?.classList.add('active');
    btnAderencia?.classList.remove('active');
    if (headerActions) headerActions.style.display = '';
  } else {
    if (panelEmpresas)  panelEmpresas.style.display  = 'none';
    if (panelAderencia) panelAderencia.style.display = '';
    btnEmpresas?.classList.remove('active');
    btnAderencia?.classList.add('active');
    if (headerActions) headerActions.style.display = 'none';

    // Inicializa o painel de aderência na primeira vez
    if (!_adhLoaded) {
      _adhLoaded = true;
      _adh.month = _adhTodayYYYYMM();
      _adhUpdateMonthLabel();
      _adhInitEventListeners();
    }
    _adhLoad();
  }
};

// Injeta CSS para as abas de relatório
(function _injectReportTabStyles() {
  if (document.getElementById('rpt-tab-styles')) return;
  const style = document.createElement('style');
  style.id = 'rpt-tab-styles';
  style.textContent = `
    .rpt-tabs-toggle {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--dark-border);
      padding-bottom: 0.75rem;
    }
    .rpt-tab-btn {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 8px 14px;
      border: 1px solid var(--dark-border);
      border-radius: 8px;
      background: var(--dark-surface);
      color: var(--text-muted);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.18s, color 0.18s, border-color 0.18s;
    }
    .rpt-tab-btn.active {
      background: rgba(79,70,229,0.12);
      border-color: var(--primary);
      color: var(--text-main);
    }
    .rpt-tab-btn:hover:not(.active) {
      background: var(--dark-border);
      color: var(--text-main);
    }
    .rpt-adh-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 0.75rem 0;
    }
    /* mr-nav-btn available from monthly-report module — fallback if not loaded */
    .mr-nav-btn {
      background: var(--dark-surface);
      border: 1px solid var(--dark-border);
      border-radius: 8px;
      color: var(--text-muted);
      cursor: pointer;
      padding: 6px 8px;
      font-size: 14px;
      display: inline-flex; align-items: center;
      transition: background 0.18s, color 0.18s;
    }
    .mr-nav-btn:hover { background: var(--dark-border); color: var(--text-main); }
  `;
  document.head.appendChild(style);
})();


/**
 * ============================================================================
 * Módulo: Minhas Atividades (Activities Board)
 * ============================================================================
 * View global de atividades atribuídas ao usuário logado.
 * Suporta visualização Kanban e Lista (TableManager 2.0).
 * ============================================================================
 */

import { TableManager } from '../core/table-manager.js';
import * as utils from './utils.js';
import * as gTimer from '../core/global-timer.js';

// ──────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ──────────────────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS = [
    { key: 'A Fazer',       label: 'A Fazer',      color: '#6366f1', icon: 'ph-list-checks' },
    { key: 'Em Andamento', label: 'Em Andamento',  color: '#f59e0b', icon: 'ph-spinner' },
    { key: 'Concluída',    label: 'Concluída',     color: '#10b981', icon: 'ph-check-circle' },
    { key: 'Cancelada',    label: 'Cancelada',     color: '#64748b', icon: 'ph-x-circle' },
];

const PRIORITY_COLORS = {
    urgente: '#ef4444', alta: '#f97316', 'média': '#f59e0b', baixa: '#64748b',
};

// ── Normaliza o status vindo do banco para um dos 4 valores canônicos do Kanban ─
// Handles: null, case variations, legacy values ("em aberto", "agendada", etc.)
const STATUS_ALIAS = {
    'aberta':       'A Fazer',
    'a fazer':      'A Fazer',
    'em aberto':    'A Fazer',
    'pendente':     'A Fazer',
    'agendada':     'A Fazer',
    'nova':         'A Fazer',
    'em andamento': 'Em Andamento',
    'em progresso': 'Em Andamento',
    'andamento':    'Em Andamento',
    'concluída':    'Concluída',
    'concluida':    'Concluída',
    'finalizada':   'Concluída',
    'cancelada':    'Cancelada',
    'cancelado':    'Cancelada',
    'descartada':   'Cancelada',
};

/**
 * Normaliza qualquer string de status para um dos 4 valores canônicos do Kanban.
 * Valores desconhecidos caem em 'A Fazer' (A Fazer).
 */
function _normalizeStatus(raw) {
    if (!raw) return 'A Fazer';
    const canonical = STATUS_ALIAS[raw.toLowerCase().trim()];
    return canonical || raw; // se já vier correto (ex: 'Em Andamento'), passa direto
}

// ── Constantes para a view Lista ──────────────────────────────────────────────

const TB_TYPE_CONFIG = {
    'Comentário':      { icon: 'ph-chat-text',  color: '#64748b' },
    'Reunião':         { icon: 'ph-video',       color: '#6366f1' },
    'Chamados HD':     { icon: 'ph-headset',     color: '#f59e0b' },
    'Chamados CS':     { icon: 'ph-heartbeat',   color: '#10b981' },
    'Ação necessária': { icon: 'ph-lightning',   color: '#ef4444' },
    'Outros':          { icon: 'ph-activity',    color: '#64748b' },
};

const TB_ACTIVITY_TYPES = ['Comentário','Reunião','Chamados HD','Chamados CS','Ação necessária','Outros'];
const TB_DEPARTMENTS    = ['Comercial','Customer Success','Help Desk','TI','Financeiro','Produto','Operações','Outros'];
const TB_STATUSES       = ['A Fazer','Em Andamento','Concluída','Cancelada'];

// ──────────────────────────────────────────────────────────────────────────────
// ESTADO
// ──────────────────────────────────────────────────────────────────────────────

let _currentView = 'kanban'; // 'kanban' | 'lista'
let _tasks = [];
let _filters = { status: '', priority: '' }; // kanban filters
let _tbManager = null; // TableManager 2.0 para view Lista
let _dragTaskId  = null;  // id da task sendo arrastada

// ──────────────────────────────────────────────────────────────────────────────
// API
// ──────────────────────────────────────────────────────────────────────────────

async function _fetchTasks() {
    // Busca TODAS as atividades do usuário (criadas por ele ou como responsável),
    // independente do tipo — atividades de empresa também aparecem
    const params = new URLSearchParams({ assignee: 'me' });
    if (_filters.status)   params.append('status', _filters.status);
    if (_filters.priority) params.append('priority', _filters.priority);
    const res = await fetch(`/api/activities?${params}`);
    if (!res.ok) throw new Error('Erro ao carregar tarefas');
    return res.json();
}

// ──────────────────────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────────────────────

// Flag para registrar o listener global apenas uma vez
let _activityChangedListenerAdded = false;
let _reloadDebounceTimer = null;

export async function initTasksBoard() {
    _renderShell();
    await _loadAndRender();

    // Escuta mudanças de atividades (da GABI ou de outros módulos) para auto-recarregar
    if (!_activityChangedListenerAdded) {
        _activityChangedListenerAdded = true;
        window.addEventListener('journey:activity-changed', (e) => {
            // Se o evento veio da própria tela (drag-drop, save drawer), ignora para evitar loop
            const source = e.detail?.source;
            if (source === 'gabi') {
                // Aguarda 500ms (debounce) e recarrega se a view ainda estiver ativa
                clearTimeout(_reloadDebounceTimer);
                _reloadDebounceTimer = setTimeout(async () => {
                    const viewEl = document.getElementById('view-minhas-tarefas');
                    if (viewEl && !viewEl.hidden && viewEl.style.display !== 'none') {
                        await _loadAndRender();
                    }
                }, 500);
            }
        });
    }
}

export function switchView(view) {
    _currentView = view;
    document.querySelectorAll('.tb-view-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
    });
    _renderContent(_tasks);
}

function _renderShell() {
    const container = document.getElementById('view-minhas-tarefas');
    if (!container) return;

    container.innerHTML = `
        <div class="top-bar" style="margin-bottom:1.5rem;flex-wrap:wrap;gap:0.75rem;">
            <div>
                <h1 style="margin:0;font-size:1.3rem;font-weight:800;display:flex;align-items:center;gap:0.5rem;">
                    <i class="ph ph-activity" style="color:var(--primary);"></i> Minhas Atividades
                </h1>
                <p style="margin:0;color:var(--text-muted);font-size:0.78rem;">Todas as atividades atribuídas a você — por criação ou responsabilidade.</p>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
                <!-- Filtros kanban -->
                <select id="tb-filter-status" class="input-control" style="min-width:140px;max-width:160px;" onchange="tasksBoard.applyFilter('status', this.value)">
                    <option value="">Fase: todas</option>
                    <option value="A Fazer">A Fazer</option>
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Concluída">Concluída</option>
                    <option value="Cancelada">Cancelada</option>
                </select>
                <select id="tb-filter-priority" class="input-control" style="min-width:140px;max-width:160px;" onchange="tasksBoard.applyFilter('priority', this.value)">
                    <option value="">Prioridade: todas</option>
                    <option value="urgente">Urgente</option>
                    <option value="alta">Alta</option>
                    <option value="média">Média</option>
                    <option value="baixa">Baixa</option>
                </select>
                <!-- Toggle de View -->
                <div style="display:flex;background:rgba(255,255,255,0.05);border:1px solid var(--dark-border);border-radius:8px;overflow:hidden;">
                    <button class="tb-view-btn active" data-view="kanban" onclick="tasksBoard.switchView('kanban')"
                        style="border:none;background:none;padding:0.5rem 1rem;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;color:var(--text-main);">
                        <i class="ph ph-columns"></i> Kanban
                    </button>
                    <button class="tb-view-btn" data-view="lista" onclick="tasksBoard.switchView('lista')"
                        style="border:none;background:none;padding:0.5rem 1rem;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;color:var(--text-main);">
                        <i class="ph ph-list-bullets"></i> Lista
                    </button>
                </div>
                <!-- Nova Atividade -->
                <button class="btn btn-primary" onclick="tasksBoard.openNewActivity()" style="display:flex;align-items:center;gap:0.4rem;white-space:nowrap;">
                    <i class="ph ph-plus"></i> Nova Atividade
                </button>
            </div>
        </div>
        <div id="tb-content" style="min-height:300px;"></div>
    `;
}

async function _loadAndRender() {
    const content = document.getElementById('tb-content');
    if (content) content.innerHTML = `
        <div style="text-align:center;padding:4rem;color:var(--text-muted);">
            <i class="ph ph-spinner" style="font-size:2rem;animation:spin 1s linear infinite;display:block;margin-bottom:1rem;"></i>
            Carregando tarefas...
        </div>`;

    try {
        _tasks = await _fetchTasks();
        _renderContent(_tasks);
    } catch (e) {
        if (content) content.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--danger);">Erro: ${e.message}</div>`;
    }
}

function _renderContent(tasks) {
    if (_currentView === 'kanban') {
        _renderKanban(tasks);
    } else {
        _renderLista(tasks);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// KANBAN
// ──────────────────────────────────────────────────────────────────────────────

function _renderKanban(tasks) {
    const content = document.getElementById('tb-content');
    if (!content) return;

    // Injeta CSS de DnD uma única vez
    if (!document.getElementById('kb-dnd-styles')) {
        const s = document.createElement('style');
        s.id = 'kb-dnd-styles';
        s.textContent = [
            '.kanban-card.kb-dragging{opacity:0.35;transform:scale(0.96) rotate(-1.5deg)!important;box-shadow:0 12px 40px rgba(0,0,0,0.6)!important;cursor:grabbing!important;}',
            '.kanban-dropzone{border:2px solid transparent;border-radius:10px;padding:4px;transition:background 0.18s,border-color 0.18s;}',
            '.kanban-dropzone.kb-drag-over{background:rgba(99,102,241,0.07);border-color:rgba(99,102,241,0.45);}',
            '.kb-drop-hint{display:none!important;}',
            '.kanban-dropzone.kb-drag-over .kb-drop-hint{display:flex!important;}',
        ].join('');
        document.head.appendChild(s);
    }

    const html = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;align-items:start;">
            ${KANBAN_COLUMNS.map(col => {
                const colTasks = tasks.filter(t => _normalizeStatus(t.status) === col.key);
                return `
                <div class="kanban-column glass-panel" style="padding:1rem;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <i class="ph ${col.icon}" style="color:${col.color};font-size:1rem;"></i>
                            <span style="font-weight:700;font-size:0.9rem;">${col.label}</span>
                        </div>
                        <span style="background:${col.color}20;color:${col.color};border:1px solid ${col.color}44;border-radius:20px;padding:0.15rem 0.6rem;font-size:0.75rem;font-weight:700;">${colTasks.length}</span>
                    </div>
                    <div class="kanban-dropzone"
                         data-col="${col.key}"
                         ondragover="window._kbDrag.over(event,this)"
                         ondragleave="window._kbDrag.leave(event,this)"
                         ondrop="window._kbDrag.drop(event,this)"
                         style="display:flex;flex-direction:column;gap:0.75rem;min-height:120px;">
                        ${colTasks.length ? colTasks.map(t => _renderKanbanCard(t)).join('') : `
                            <div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);font-size:0.82rem;border:1px dashed var(--dark-border);border-radius:8px;">
                                <i class="ph ph-tray" style="display:block;font-size:1.5rem;margin-bottom:0.5rem;"></i>
                                Nenhuma atividade
                            </div>`}
                        <div class="kb-drop-hint" style="align-items:center;justify-content:center;gap:0.5rem;padding:0.85rem;border:2px dashed ${col.color}66;border-radius:8px;color:${col.color};font-size:0.8rem;font-weight:600;background:${col.color}08;">
                            <i class="ph ph-arrow-fat-down"></i> Mover para ${col.label}
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>`;

    content.innerHTML = html;
}

function _renderKanbanCard(t) {
    const pc = t.priority ? PRIORITY_COLORS[t.priority] || '#64748b' : null;
    const company = t.companies?.Nome_da_empresa || '';
    const deadline = t.activity_datetime ? new Date(t.activity_datetime).toLocaleDateString('pt-BR') : '';
    const isOverdue = t.activity_datetime && new Date(t.activity_datetime) < new Date() && t.status !== 'Concluída';
    const typeIcon = (TB_TYPE_CONFIG[t.activity_type] || {}).icon || 'ph-activity';
    const typeColor = (TB_TYPE_CONFIG[t.activity_type] || {}).color || '#64748b';

    return `
        <div class="kanban-card"
             draggable="true"
             data-task-id="${t.id}"
             ondragstart="window._kbDrag.start(event,'${t.id}',this)"
             ondragend="window._kbDrag.end(event,this)"
             onclick="if(!window._kbDrag._wasDragged)tasksBoard.openActivityDetail('${t.id}')"
             style="background:rgba(255,255,255,0.04);border:1px solid var(--dark-border);border-radius:10px;padding:0.85rem;position:relative;cursor:grab;transition:background 0.18s,border-color 0.18s,transform 0.18s,box-shadow 0.18s;${pc ? `border-left:3px solid ${pc};` : ''}"
             onmouseover="if(!window._kbDrag._dragging){this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(99,102,241,0.35)';this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.3)';}"
             onmouseout="this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='var(--dark-border)';this.style.transform='';this.style.boxShadow='';">
            ${pc ? `<span style="position:absolute;top:0.6rem;right:0.6rem;background:${pc}20;color:${pc};border:1px solid ${pc}44;border-radius:20px;padding:0.1rem 0.5rem;font-size:0.7rem;font-weight:700;">${t.priority}</span>` : ''}
            <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.35rem;display:flex;align-items:center;gap:0.35rem;">
                <i class="ph ph-building-office"></i>${company || 'Sem empresa'}
            </div>
            <div style="font-weight:600;font-size:0.88rem;line-height:1.4;margin-bottom:0.5rem;margin-right:${pc ? '3rem' : '0'};">${t.title}</div>
            ${deadline ? `
                <div style="font-size:0.75rem;display:flex;align-items:center;gap:0.3rem;color:${isOverdue ? '#ef4444' : 'var(--text-muted)'};">
                    <i class="ph ph-calendar-blank"></i>${deadline}${isOverdue ? ' <span style="color:#ef4444;">· atrasada!</span>' : ''}
                </div>` : ''}
            <div style="margin-top:0.6rem;padding-top:0.55rem;border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:0.69rem;display:flex;align-items:center;gap:0.3rem;color:${typeColor};opacity:0.85;">
                    <i class="ph ${typeIcon}"></i>${t.activity_type || ''}
                </span>
                <span style="font-size:0.69rem;color:rgba(99,102,241,0.7);display:flex;align-items:center;gap:0.25rem;">
                    <i class="ph ph-pencil-simple"></i>editar
                </span>
            </div>
        </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// LISTA — TableManager 2.0 (idêntico a Empresas > Atividades + coluna Empresa)
// ──────────────────────────────────────────────────────────────────────────────

function _tbStatusBg(s) {
    return { 'A Fazer':'rgba(99,102,241,0.12)', 'Em Andamento':'rgba(245,158,11,0.12)', 'Concluída':'rgba(16,185,129,0.12)', 'Cancelada':'rgba(239,68,68,0.12)' }[s] || 'rgba(255,255,255,0.05)';
}
function _tbStatusColor(s) {
    return { 'A Fazer':'#818cf8', 'Em Andamento':'#f59e0b', 'Concluída':'#10b981', 'Cancelada':'#ef4444' }[s] || 'var(--text-muted)';
}
function _tbFmtMin(min) {
    if (!min) return '-';
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function _mapForTable(tasks) {
    return (tasks || []).map(t => ({
        ...t,
        company_name:  t.companies?.Nome_da_empresa || '-',
        activity_date: t.activity_datetime ? new Date(t.activity_datetime).toLocaleDateString('pt-BR') : '-',
        time_spent:    _tbFmtMin(t.time_spent_minutes),
        assignees:     (t.activity_assignees || []).map(r => r.user_nome || r.user_id).join(', ') || '-',
        created_by:    t.created_by_user?.nome || t.created_by_user_id || '-',
        next_step:     t.next_step_title ? `${t.next_step_title}${t.next_step_date ? ' · ' + new Date(t.next_step_date).toLocaleDateString('pt-BR') : ''}` : '-',
    }));
}

function _renderLista(tasks) {
    const content = document.getElementById('tb-content');
    if (!content) return;

    content.innerHTML = `
        <div class="glass-panel" style="padding:1.25rem;">
            <div id="tb-filters-bar" style="margin-bottom:1rem;"></div>
            <div class="table-responsive" style="overflow-x:auto;">
                <table class="company-table" id="tb-list-table" style="min-width:1200px;">
                    <thead>
                        <tr>
                            <th class="sortable-header" data-key="activity_type" style="width:130px;">Tipo</th>
                            <th data-key="company_name" style="width:160px;">Empresa</th>
                            <th class="sortable-header" data-key="title">Título</th>
                            <th data-key="description">Descrição</th>
                            <th class="sortable-header" data-key="department" style="text-align:center;width:130px;">Departamento</th>
                            <th data-key="status" style="text-align:center;width:130px;">Fase da Atividade</th>
                            <th data-key="assignees" style="width:140px;">Responsáveis</th>
                            <th data-key="created_by" style="width:110px;">Criado por</th>
                            <th class="sortable-header" data-key="activity_date" style="text-align:center;width:100px;">Data</th>
                            <th data-key="time_spent" style="text-align:center;width:90px;">Tempo</th>
                            <th data-key="next_step" style="width:160px;">Próximo Passo</th>
                            <th style="text-align:right;width:80px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tb-list-body"></tbody>
                </table>
            </div>
            <div id="tb-pagination" class="pagination-container" style="display:none;"></div>
        </div>`;

    _tbManager = new TableManager({
        data: _mapForTable(tasks),
        columns: [
            { key: 'activity_type', label: 'Tipo',          type: 'string', searchable: true, filterable: true },
            { key: 'company_name',  label: 'Empresa',        type: 'string', searchable: true },
            { key: 'title',         label: 'Título',         type: 'string', searchable: true },
            { key: 'description',   label: 'Descrição',      type: 'string', searchable: true },
            { key: 'department',    label: 'Departamento',   type: 'string', searchable: true, filterable: true },
            { key: 'assignees',     label: 'Responsáveis',   type: 'string', searchable: true },
            { key: 'created_by',    label: 'Criado por',     type: 'string', searchable: true },
            { key: 'activity_date', label: 'Data',           type: 'date',   sortable: true },
            { key: 'time_spent',    label: 'Tempo',          type: 'string' },
            { key: 'next_step',     label: 'Próximo Passo',  type: 'string', searchable: true },
            { key: 'status',        label: 'Fase',         type: 'string', filterable: true },
        ],
        pageSize: 10,
        tableId: 'tb-list-table',
        renderRows:       (rows)  => _tbRenderRows(rows),
        renderPagination: (state) => _tbRenderPagination(state),
        renderFilters:    ()      => _tbRenderActiveChips(),
    });

    _tbRenderFiltersBar();

    const searchEl = document.getElementById('tb-search-input');
    if (searchEl && !searchEl.dataset.tbConn) {
        searchEl.dataset.tbConn = '1';
        searchEl.addEventListener('input', e => { if (_tbManager) _tbManager.setSearch(e.target.value); });
    }
}

function _tbRenderFiltersBar() {
    const bar = document.getElementById('tb-filters-bar');
    if (!bar) return;
    bar.innerHTML = `
        <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
            <div class="search-wrapper" style="flex:1;min-width:220px;">
                <i class="ph ph-magnifying-glass search-icon"></i>
                <input type="text" id="tb-search-input" class="search-input" placeholder="Buscar em atividades...">
            </div>
            <select id="tb-fl-type" class="input-control" style="min-width:160px;max-width:190px;" onchange="tasksBoard.applyListFilter('activity_type',this.value)">
                <option value="">Tipo: todos</option>
                ${TB_ACTIVITY_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
            <select id="tb-fl-dept" class="input-control" style="min-width:150px;max-width:180px;" onchange="tasksBoard.applyListFilter('department',this.value)">
                <option value="">Departamento: todos</option>
                ${TB_DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
            <select id="tb-fl-status" class="input-control" style="min-width:140px;max-width:170px;" onchange="tasksBoard.applyListFilter('status',this.value)">
                <option value="">Fase: todas</option>
                ${TB_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary btn-sm" onclick="tasksBoard.clearListFilters()" title="Limpar filtros">
                <i class="ph ph-funnel-simple-x"></i>
            </button>
        </div>
        <div id="tb-active-chips" class="active-filters-bar" style="display:none;margin-top:0.5rem;"></div>
    `;
}

function _tbRenderRows(rows) {
    const tbody = document.getElementById('tb-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="12">
                <div class="empty-results" style="padding:3rem;text-align:center;">
                    <i class="ph ph-activity" style="font-size:3rem;color:var(--text-muted);display:block;margin-bottom:1rem;"></i>
                    <h3 style="color:var(--text-muted);margin:0 0 0.5rem;">Nenhuma atividade encontrada</h3>
                    <p style="color:var(--text-muted);font-size:0.85rem;">Ajuste os filtros ou clique em <strong>+ Nova Atividade</strong> para começar.</p>
                </div>
            </td></tr>`;
        return;
    }

    rows.forEach(act => {
        const cfg = TB_TYPE_CONFIG[act.activity_type] || { icon: 'ph-activity', color: '#64748b' };
        const statusBadge = act.status
            ? `<span class="badge" style="background:${_tbStatusBg(act.status)};color:${_tbStatusColor(act.status)};border:1px solid currentColor;font-size:0.7rem;">${act.status}</span>`
            : '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <span class="badge" style="background:${cfg.color}18;color:${cfg.color};border:1px solid ${cfg.color}44;white-space:nowrap;gap:0.3rem;">
                    <i class="ph ${cfg.icon}"></i> ${act.activity_type || '-'}
                </span>
            </td>
            <td style="font-size:0.82rem;color:var(--text-muted);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${act.company_name}">${act.company_name}</td>
            <td style="font-weight:600;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${act.title}">${act.title}</td>
            <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-muted);font-size:0.82rem;">${act.description || '-'}</td>
            <td style="text-align:center;">${act.department ? `<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text-main);font-size:0.75rem;">${act.department}</span>` : '-'}</td>
            <td style="text-align:center;">${statusBadge}</td>
            <td style="font-size:0.82rem;color:var(--text-muted);">${act.assignees}</td>
            <td style="font-size:0.82rem;color:var(--text-muted);">${act.created_by}</td>
            <td style="text-align:center;white-space:nowrap;font-size:0.82rem;">${act.activity_date}</td>
            <td style="text-align:center;">${act.time_spent !== '-' ? `<span class="badge" style="background:rgba(99,102,241,0.1);color:#818cf8;border:1px solid rgba(99,102,241,0.3);font-size:0.75rem;"><i class="ph ph-clock"></i> ${act.time_spent}</span>` : '-'}</td>
            <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.82rem;color:var(--secondary);" title="${act.next_step}">${act.next_step}</td>
            <td style="text-align:right;">
                <div class="actions">
                    <button type="button" class="btn btn-secondary btn-icon" onclick="tasksBoard.openActivityDetail('${act.id}')" title="Ver/Editar"><i class="ph ph-pencil-simple"></i></button>
                    <button type="button" class="btn btn-danger btn-icon" onclick="tasksBoard.deleteActivity('${act.id}')" title="Excluir"><i class="ph ph-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function _tbRenderPagination({ currentPage, totalPages, pageSize, totalRecords, hasPrev, hasNext }) {
    const container = document.getElementById('tb-pagination');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; container.style.display = 'none'; return; }

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) pages.push(i);
    }
    const items = []; let prev = 0;
    for (const p of pages) { if (p - prev > 1) items.push('...'); items.push(p); prev = p; }
    const start = Math.min((currentPage - 1) * pageSize + 1, totalRecords);
    const end   = Math.min(currentPage * pageSize, totalRecords);

    container.style.display = 'flex';
    container.innerHTML = `
        <div class="pagination">
            <button class="pagination-btn" id="tb-prev-btn" ${!hasPrev ? 'disabled' : ''}><i class="ph ph-caret-left"></i></button>
            ${items.map(item => item === '...'
                ? `<span class="pagination-dots">···</span>`
                : `<button class="pagination-page ${item === currentPage ? 'active' : ''}" data-tb-page="${item}">${item}</button>`
            ).join('')}
            <button class="pagination-btn" id="tb-next-btn" ${!hasNext ? 'disabled' : ''}><i class="ph ph-caret-right"></i></button>
        </div>
        <div class="pagination-info">${start}–${end} de <strong>${totalRecords}</strong> registros &nbsp;·&nbsp; Página ${currentPage} de ${totalPages}</div>
    `;

    if (!container.dataset.tbPagConn) {
        container.dataset.tbPagConn = '1';
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-tb-page],#tb-prev-btn,#tb-next-btn');
            if (!btn || !_tbManager) return;
            if (btn.id === 'tb-prev-btn')      _tbManager.prevPage();
            else if (btn.id === 'tb-next-btn') _tbManager.nextPage();
            else if (btn.dataset.tbPage)       _tbManager.goToPage(parseInt(btn.dataset.tbPage));
        });
    }
}

function _tbRenderActiveChips() {
    if (!_tbManager) return;
    const chips = document.getElementById('tb-active-chips');
    if (!chips) return;
    const active = _tbManager.getActiveFilters();
    if (!active.length) { chips.style.display = 'none'; chips.innerHTML = ''; return; }
    chips.style.display = 'flex';
    chips.innerHTML = active.map(({ key, label, value }) => `
        <div class="filter-chip">
            <span><strong>${label}:</strong> ${value}</span>
            <i class="ph ph-x-circle" onclick="tasksBoard.clearListFilter('${key}')"></i>
        </div>
    `).join('') + `<button class="btn-clear-all-filters" onclick="tasksBoard.clearListFilters()"><i class="ph ph-trash"></i> Limpar Tudo</button>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// FILTROS (Kanban)
// ──────────────────────────────────────────────────────────────────────────────

export async function applyFilter(key, value) {
    _filters[key] = value;
    await _loadAndRender();
}

// ──────────────────────────────────────────────────────────────────────────────
// FILTROS (Lista — TableManager)
// ──────────────────────────────────────────────────────────────────────────────

export function applyListFilter(key, value) {
    if (_tbManager) _tbManager.setFilter(key, value);
}

export function clearListFilter(key) {
    if (!_tbManager) return;
    _tbManager.setFilter(key, '');
    const map = { activity_type: 'tb-fl-type', department: 'tb-fl-dept', status: 'tb-fl-status' };
    const el = document.getElementById(map[key]);
    if (el) el.value = '';
}

export function clearListFilters() {
    if (!_tbManager) return;
    _tbManager.clearFilters();
    ['tb-fl-type', 'tb-fl-dept', 'tb-fl-status'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const s = document.getElementById('tb-search-input'); if (s) s.value = '';
}

export async function deleteActivity(id) {
    if (!confirm('Excluir esta atividade? Esta ação não pode ser desfeita.')) return;
    try {
        const r = await fetch(`/api/activities/${id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error('Erro ao excluir');
        utils.showToast('Atividade excluída.', 'success');
        // Notifica outros painéis (Dashboard, aba de cliente) da exclusão
        window.dispatchEvent(new CustomEvent('journey:activity-changed', {
            detail: { action: 'delete', id }
        }));
        await _loadAndRender();
    } catch (e) { utils.showToast(e.message, 'error'); }
}

// ──────────────────────────────────────────────────────────────────────────────
// DETAIL DRAWER
// ──────────────────────────────────────────────────────────────────────────────

export function openActivityDetail(id, defaultTab = 'info') {
    const task = _tasks.find(t => t.id === id);
    if (!task) return;
    _renderDetailDrawer(task, defaultTab);
}

function _renderDetailDrawer(t, defaultTab = 'info') {
    document.getElementById('tb-drawer-overlay')?.remove();

    const TYPES    = ['Comentário','Reunião','Chamados HD','Chamados CS','Ação necessária','Outros'];
    const DEPTS    = ['Comercial','Customer Success','Help Desk','TI','Financeiro','Produto','Operações'];
    const STATUSES = ['A Fazer','Em Andamento','Concluída','Cancelada'];
    const STATUS_COLORS = { 'A Fazer':'#6366f1','Em Andamento':'#f59e0b','Concluída':'#10b981','Cancelada':'#64748b' };

    const sc  = STATUS_COLORS[t.status] || '#6366f1';
    const pc  = t.priority ? (PRIORITY_COLORS[t.priority] || '#64748b') : null;
    const isOverdue = t.activity_datetime && new Date(t.activity_datetime) < new Date() && t.status !== 'Concluída';
    const dtLocal = t.activity_datetime ? new Date(t.activity_datetime).toISOString().slice(0, 16) : '';
    const company = t.companies?.Nome_da_empresa || '';
    const assignees = (t.activity_assignees || []).map(a => a.user_nome || a.user_id).join(', ');
    const nextStep = t.next_step_title || '';
    const nextStepDate = t.next_step_date ? new Date(t.next_step_date).toISOString().slice(0, 10) : '';
    const nextStepResp = (t.activity_next_step_responsibles || []).map(r => r.user_id).join(', ');
    const reminderAt = t.reminder_at ? new Date(t.reminder_at).toISOString().slice(0, 16) : '';
    const googleMeet = t.google_meet_link || '';
    const timeMin = t.time_spent_minutes || 0;

    // ── Timer state — usa GlobalTimer para persistência ──────────────────────
    const _gt = gTimer.getTimerState();
    const _sameActivity = _gt.activityId === t.id;
    // Segundos iniciais: se o timer global está ativo para ESTA atividade, usa ele;
    // senão usa o tempo salvo no banco
    let _timerSec   = _sameActivity ? _gt.sec : (timeMin * 60);
    let _timerState = _sameActivity ? _gt.state : 'idle'; // 'idle'|'running'|'paused'
    function _fmtTimer(s) {
        return gTimer.fmtTimer(s);
    }
    // Listener para atualizar o display quando o tick global disparar
    function _onTick(e) {
        _timerSec = e.detail.sec;
        const el = document.getElementById('td-timer-display');
        if (el) el.textContent = _fmtTimer(_timerSec);
    }
    window.addEventListener('journey:timer-tick', _onTick);

    const overlay = document.createElement('div');
    overlay.id = 'tb-drawer-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:8500;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);overflow-y:auto;';

    overlay.innerHTML = `
    <style>
      #tb-act-card { animation:tbSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
      @keyframes tbSlideUp { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
      .tb-card-tab { padding:0.5rem 1rem;border:none;background:none;cursor:pointer;font-size:0.81rem;font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;transition:all 0.18s;white-space:nowrap;display:flex;align-items:center;gap:0.3rem; }
      .tb-card-tab.active { color:${sc};border-bottom-color:${sc}; }
      .tb-card-tab:hover:not(.active) { color:var(--text-main);background:rgba(255,255,255,0.03); }
      .tb-card-panel { display:none; }
      .tb-card-panel.active { display:block;animation:fadeIn 0.2s ease; }
      @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
      .tb-section-lbl { font-size:0.67rem;font-weight:700;letter-spacing:0.09em;color:var(--text-muted);text-transform:uppercase;margin:0 0 0.7rem;display:flex;align-items:center;gap:0.4rem; }
      .tb-section-lbl::after { content:'';flex:1;height:1px;background:var(--dark-border,rgba(255,255,255,0.07)); }
      .tb-field label { font-size:0.72rem;color:var(--text-muted);font-weight:500;display:block;margin-bottom:0.3rem; }
      .tb-badge { display:inline-flex;align-items:center;gap:0.3rem;padding:0.18rem 0.7rem;border-radius:20px;font-size:0.71rem;font-weight:700;border-width:1px;border-style:solid; }
      .tb-chip { display:inline-flex;align-items:center;gap:0.3rem;padding:0.15rem 0.6rem;border-radius:6px;font-size:0.74rem;background:rgba(255,255,255,0.05);border:1px solid var(--dark-border);color:var(--text-muted); }
      #td-save-btn { transition:all 0.2s; }
      #td-save-btn:hover:not(:disabled) { transform:translateY(-1px);box-shadow:0 4px 18px rgba(99,102,241,0.45); }
      #td-delete-btn { transition:all 0.2s; }
      #td-delete-btn:hover { box-shadow:0 4px 14px rgba(239,68,68,0.3); }
    </style>

    <div id="tb-act-card" style="width:100%;max-width:780px;background:var(--glass-bg,#0f1623);border:1px solid ${sc}30;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;max-height:92vh;box-shadow:0 32px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04);">

      <!-- ═══ HEADER ═══ -->
      <div style="background:linear-gradient(135deg,${sc}15 0%,transparent 55%);border-bottom:1px solid ${sc}25;padding:1.4rem 1.8rem 0;flex-shrink:0;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1rem;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;margin-bottom:0.7rem;">
              <span class="tb-badge" style="background:${sc}18;color:${sc};border-color:${sc}40;">
                <span style="width:6px;height:6px;border-radius:50%;background:${sc};display:inline-block;"></span>
                ${t.status || 'A Fazer'}
              </span>
              ${pc ? `<span class="tb-badge" style="background:${pc}18;color:${pc};border-color:${pc}40;">${t.priority}</span>` : ''}
              ${isOverdue ? `<span class="tb-badge" style="background:#ef444415;color:#ef4444;border-color:#ef444440;"><i class="ph ph-warning-circle"></i> Atrasada</span>` : ''}
              ${t.activity_type ? `<span class="tb-chip"><i class="ph ${(TB_TYPE_CONFIG[t.activity_type]||{icon:'ph-activity'}).icon}" style="color:${(TB_TYPE_CONFIG[t.activity_type]||{color:'#64748b'}).color};"></i>${t.activity_type}</span>` : ''}
            </div>
            <h2 style="margin:0 0 0.5rem;font-size:1.3rem;font-weight:800;line-height:1.3;word-break:break-word;">${utils.escapeHtml ? utils.escapeHtml(t.title) : t.title}</h2>
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
              ${company ? `<span class="tb-chip"><i class="ph ph-building-office"></i>${company}</span>` : ''}
              ${t.department ? `<span class="tb-chip"><i class="ph ph-buildings"></i>${t.department}</span>` : ''}
              ${t.activity_datetime ? `<span class="tb-chip" style="${isOverdue ? 'color:#ef4444;border-color:#ef444450;' : ''}"><i class="ph ph-calendar-blank"></i>${new Date(t.activity_datetime).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>` : ''}
              ${timeMin ? `<span class="tb-chip" style="color:#818cf8;border-color:rgba(99,102,241,0.3);"><i class="ph ph-clock"></i>${_tbFmtMin(timeMin)}</span>` : ''}
            </div>
          </div>
          <button id="tb-drawer-close" style="flex-shrink:0;background:rgba(255,255,255,0.05);border:1px solid var(--dark-border);border-radius:8px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);transition:all 0.18s;" onmouseover="this.style.background='rgba(255,255,255,0.1)';this.style.color='white'" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='var(--text-muted)'">
            <i class="ph ph-x"></i>
          </button>
        </div>

        <!-- TABS -->
        <div style="display:flex;border-bottom:1px solid var(--dark-border);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
          <button class="tb-card-tab ${defaultTab==='info'?'active':''}" data-tab="info"><i class="ph ph-list-dashes"></i>Informações</button>
          <button class="tb-card-tab ${defaultTab==='tempo'?'active':''}" data-tab="tempo"><i class="ph ph-clock"></i>Tempo</button>
          <button class="tb-card-tab ${defaultTab==='proximo'?'active':''}" data-tab="proximo"><i class="ph ph-arrow-right-dashed"></i>Próximo Passo</button>
          <button class="tb-card-tab ${defaultTab==='lembrete'?'active':''}" data-tab="lembrete"><i class="ph ph-bell"></i>Lembrete</button>
        </div>
      </div>

      <!-- ═══ BODY ═══ -->
      <div style="flex:1;overflow-y:auto;padding:1.5rem 1.8rem;" id="tb-card-body">

        <!-- ─── TAB: INFO ─── -->
        <div class="tb-card-panel ${defaultTab==='info'?'active':''}" id="tb-tab-info">

          <div class="tb-section-lbl"><i class="ph ph-sliders" style="color:${sc};"></i>Configurações</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1.2rem;">
            <div class="input-group tb-field">
              <label>Tipo de Atividade</label>
              <select id="td-type" class="input-control">
                ${TYPES.map(tp => `<option value="${tp}" ${t.activity_type===tp?'selected':''}>${tp}</option>`).join('')}
              </select>
            </div>
            <div class="input-group tb-field">
              <label>Departamento</label>
              <select id="td-dept" class="input-control">
                <option value="">—</option>
                ${DEPTS.map(d => `<option value="${d}" ${t.department===d?'selected':''}>${d}</option>`).join('')}
              </select>
            </div>
            <div class="input-group tb-field">
              <label>Fase da Atividade</label>
              <select id="td-status" class="input-control">
                ${STATUSES.map(s => `<option value="${s}" ${(t.status||'A Fazer')===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="input-group tb-field">
              <label>Prioridade</label>
              <select id="td-priority" class="input-control">
                <option value="">Sem prioridade</option>
                ${['baixa','média','alta','urgente'].map(p=>`<option value="${p}" ${t.priority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
              </select>
            </div>
            <div class="input-group tb-field">
              <label><i class="ph ph-calendar-blank" style="color:${sc};"></i> Data e Horário</label>
              <input type="datetime-local" id="td-datetime" class="input-control" value="${dtLocal}">
            </div>
          </div>

          <div class="tb-section-lbl"><i class="ph ph-text-align-left" style="color:${sc};"></i>Conteúdo</div>
          <div class="input-group tb-field" style="margin-bottom:0.85rem;">
            <label>Título</label>
            <input type="text" id="td-title" class="input-control" value="${(t.title||'').replace(/"/g,'&quot;')}" style="font-weight:600;font-size:1rem;">
          </div>
          <div class="input-group tb-field" style="margin-bottom:1.25rem;">
            <label>Descrição</label>
            <textarea id="td-desc" class="input-control" rows="4" style="resize:vertical;">${t.description||''}</textarea>
          </div>

          <div class="tb-section-lbl"><i class="ph ph-users" style="color:${sc};"></i>Pessoas</div>
          <div class="input-group tb-field" style="margin-bottom:0.85rem;">
            <label>Responsáveis pela Atividade</label>
            <input type="text" id="td-assignees" class="input-control" value="${assignees.replace(/"/g,'&quot;')}" placeholder="Separados por vírgula">
            <span style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;display:block;">Separe múltiplos nomes por vírgula</span>
          </div>

          <div class="tb-section-lbl"><i class="ph ph-link" style="color:${sc};"></i>Links</div>
          <div class="input-group tb-field">
            <label><i class="ph ph-video" style="color:#6366f1;"></i> Google Meet Link</label>
            <input type="url" id="td-meet-link" class="input-control" placeholder="https://meet.google.com/xxx" value="${googleMeet}">
          </div>
        </div>

        <!-- ─── TAB: TEMPO ─── -->
        <div class="tb-card-panel ${defaultTab==='tempo'?'active':''}" id="tb-tab-tempo">
          <div class="tb-section-lbl"><i class="ph ph-timer" style="color:#6366f1;"></i>Cronômetro</div>
          <div style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(99,102,241,0.02));border:1px solid rgba(99,102,241,0.18);border-radius:12px;padding:1.4rem;margin-bottom:1.2rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
              <div>
                <div style="font-size:0.73rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.4rem;">Tempo Trabalhado</div>
                <div id="td-timer-display" style="font-size:2rem;font-weight:800;font-family:monospace;letter-spacing:0.08em;color:#818cf8;">${_fmtTimer(_timerSec)}</div>
              </div>
              <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                <button type="button" id="td-timer-start" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:0.4rem;"><i class="ph ph-play"></i> Iniciar</button>
                <button type="button" id="td-timer-pause" class="btn btn-secondary btn-sm" style="display:none;align-items:center;gap:0.4rem;"><i class="ph ph-pause"></i> Pausar</button>
                <button type="button" id="td-timer-resume" class="btn btn-secondary btn-sm" style="display:none;align-items:center;gap:0.4rem;"><i class="ph ph-play"></i> Retomar</button>
                <button type="button" id="td-timer-stop" class="btn btn-danger btn-sm" style="display:none;align-items:center;gap:0.4rem;"><i class="ph ph-stop"></i> Finalizar</button>
              </div>
            </div>
          </div>

          <div class="tb-section-lbl"><i class="ph ph-pencil-simple" style="color:#6366f1;"></i>Ou informe manualmente</div>
          <div class="input-group tb-field">
            <label>Tempo em minutos — ex: 90 = 1h30min</label>
            <input type="number" id="td-time-min" class="input-control" min="0" placeholder="ex: 30" value="${timeMin||''}">
          </div>
          ${timeMin ? `<div style="margin-top:0.6rem;padding:0.55rem 0.85rem;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.18);border-radius:8px;font-size:0.82rem;color:#818cf8;display:flex;align-items:center;gap:0.4rem;"><i class="ph ph-clock"></i> Tempo salvo: <strong>${_tbFmtMin(timeMin)}</strong></div>` : ''}
        </div>

        <!-- ─── TAB: PRÓXIMO PASSO ─── -->
        <div class="tb-card-panel" id="tb-tab-proximo">
          <div class="tb-section-lbl"><i class="ph ph-arrow-right-dashed" style="color:#10b981;"></i>Próximo Passo</div>
          <div style="background:linear-gradient(135deg,rgba(16,185,129,0.06),rgba(16,185,129,0.01));border:1px solid rgba(16,185,129,0.15);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:0.8rem;">
              <div class="input-group tb-field" style="margin-bottom:0;">
                <label>Título do Próximo Passo</label>
                <input type="text" id="td-next-step" class="input-control" value="${nextStep.replace(/"/g,'&quot;')}" placeholder="O que fazer a seguir?">
              </div>
              <div class="input-group tb-field" style="margin-bottom:0;">
                <label>Data do Próximo Passo</label>
                <input type="date" id="td-next-step-date" class="input-control" value="${nextStepDate}">
              </div>
            </div>
            <div class="input-group tb-field" style="margin-bottom:0;">
              <label>Responsáveis do Próximo Passo</label>
              <input type="text" id="td-next-step-resp" class="input-control" value="${nextStepResp.replace(/"/g,'&quot;')}" placeholder="Nomes, separados por vírgula">
            </div>
          </div>

          ${nextStep ? `
          <div style="padding:1rem;background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.18);border-radius:10px;">
            <div style="font-weight:700;color:#10b981;margin-bottom:0.35rem;font-size:0.82rem;"><i class="ph ph-check-circle"></i> Próximo passo atual</div>
            <div style="color:var(--text-main);font-size:0.9rem;">${nextStep}</div>
            ${nextStepDate ? `<div style="color:var(--text-muted);margin-top:0.3rem;font-size:0.78rem;"><i class="ph ph-calendar"></i> Prazo: ${new Date(nextStepDate+'T12:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
            ${nextStepResp ? `<div style="color:var(--text-muted);margin-top:0.25rem;font-size:0.78rem;"><i class="ph ph-user"></i> ${nextStepResp}</div>` : ''}
          </div>` : `
          <div style="text-align:center;padding:2.5rem;color:var(--text-muted);border:1px dashed var(--dark-border);border-radius:10px;">
            <i class="ph ph-arrow-right-dashed" style="font-size:2.2rem;display:block;margin-bottom:0.5rem;opacity:0.4;"></i>
            Nenhum próximo passo definido ainda
          </div>`}
        </div>

        <!-- ─── TAB: LEMBRETE ─── -->
        <div class="tb-card-panel" id="tb-tab-lembrete">
          <div class="tb-section-lbl"><i class="ph ph-bell" style="color:#f59e0b;"></i>Lembrete</div>
          <div style="background:linear-gradient(135deg,rgba(245,158,11,0.07),rgba(245,158,11,0.01));border:1px solid rgba(245,158,11,0.15);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;">
            <div style="display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:end;">
              <div class="input-group tb-field" style="margin-bottom:0;">
                <label>Data e Hora do Lembrete</label>
                <input type="datetime-local" id="td-reminder-at" class="input-control" value="${reminderAt}">
              </div>
              <div style="display:flex;flex-direction:column;gap:0.6rem;padding-bottom:2px;">
                <label style="display:flex;align-items:center;gap:0.45rem;cursor:pointer;font-size:0.84rem;white-space:nowrap;">
                  <input type="checkbox" id="td-reminder-email" ${t.reminder_email?'checked':''} style="width:15px;height:15px;accent-color:var(--primary,#6366f1);cursor:pointer;">
                  <i class="ph ph-envelope" style="color:#6366f1;"></i> Por e-mail
                </label>
                <label style="display:flex;align-items:center;gap:0.45rem;cursor:pointer;font-size:0.84rem;white-space:nowrap;">
                  <input type="checkbox" id="td-reminder-wpp" ${t.reminder_whatsapp?'checked':''} style="width:15px;height:15px;accent-color:#25d366;cursor:pointer;">
                  <i class="ph ph-whatsapp-logo" style="color:#25d366;"></i> Por WhatsApp
                </label>
              </div>
            </div>
          </div>

          ${reminderAt ? `
          <div style="padding:1rem 1.1rem;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:10px;display:flex;align-items:center;gap:0.85rem;">
            <i class="ph ph-bell-ringing" style="font-size:1.6rem;color:#f59e0b;flex-shrink:0;"></i>
            <div>
              <div style="font-size:0.73rem;color:var(--text-muted);">Lembrete agendado para</div>
              <div style="font-weight:700;color:#f59e0b;font-size:1rem;">${new Date(reminderAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.15rem;display:flex;gap:0.5rem;">
                ${t.reminder_email ? '<span><i class="ph ph-envelope"></i> E-mail</span>' : ''}
                ${t.reminder_whatsapp ? '<span><i class="ph ph-whatsapp-logo"></i> WhatsApp</span>' : ''}
              </div>
            </div>
          </div>` : `
          <div style="text-align:center;padding:2.5rem;color:var(--text-muted);border:1px dashed var(--dark-border);border-radius:10px;">
            <i class="ph ph-bell-slash" style="font-size:2.2rem;display:block;margin-bottom:0.5rem;opacity:0.4;"></i>
            Nenhum lembrete configurado
          </div>`}
        </div>
      </div>

      <!-- ═══ FOOTER ═══ -->
      <div style="padding:1rem 1.8rem;border-top:1px solid var(--dark-border);display:flex;align-items:center;justify-content:space-between;gap:0.75rem;background:rgba(0,0,0,0.25);flex-shrink:0;">
        <button id="td-delete-btn" style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.22);border-radius:8px;padding:0.55rem 1rem;cursor:pointer;color:#ef4444;font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(239,68,68,0.07)'">
          <i class="ph ph-trash"></i> Excluir
        </button>
        <div style="display:flex;gap:0.6rem;align-items:center;">
          <button id="td-cancel-btn" class="btn btn-secondary" style="font-size:0.82rem;">Cancelar</button>
          <button id="td-save-btn" class="btn btn-primary" style="font-size:0.82rem;display:flex;align-items:center;gap:0.45rem;padding:0.55rem 1.25rem;">
            <i class="ph ph-floppy-disk"></i> Salvar Alterações
          </button>
        </div>
      </div>
    </div>`;

    document.body.appendChild(overlay);

    // ── Fixa min-height igual à aba Informações para todas as abas ─────────────
    requestAnimationFrame(() => {
        const body    = document.getElementById('tb-card-body');
        const infoTab = document.getElementById('tb-tab-info');
        if (body && infoTab) {
            const infoH = infoTab.scrollHeight;
            body.style.minHeight = infoH + 'px';
        }
    });

    // ── tabs ──────────────────────────────────────────────────────────────────
    overlay.querySelectorAll('.tb-card-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.querySelectorAll('.tb-card-tab').forEach(b => b.classList.remove('active'));
            overlay.querySelectorAll('.tb-card-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            overlay.querySelector(`#tb-tab-${btn.dataset.tab}`)?.classList.add('active');
        });
    });

    // ── close ─────────────────────────────────────────────────────────────────
    function _closeCard() {
        // NÃO para o timer — apenas remove o listener do display
        window.removeEventListener('journey:timer-tick', _onTick);
        overlay.style.opacity = '0'; overlay.style.transition = 'opacity 0.18s';
        setTimeout(() => overlay.remove(), 200);
    }
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeCard(); });
    document.getElementById('tb-drawer-close').addEventListener('click', _closeCard);
    document.getElementById('td-cancel-btn').addEventListener('click', _closeCard);
    function _onEsc(e) { if (e.key === 'Escape') { _closeCard(); document.removeEventListener('keydown', _onEsc); } }
    document.addEventListener('keydown', _onEsc);

    // ── timer controls (GlobalTimer) ──────────────────────────────────────────
    function _syncBtnVisibility() {
        const gt = gTimer.getTimerState();
        const active = gt.activityId === t.id;
        const isRunning = active && gt.state === 'running';
        const isPaused  = active && gt.state === 'paused';
        const isIdle    = !active || gt.state === 'idle';
        const el = id => document.getElementById(id);
        el('td-timer-start')?.style.setProperty('display',  isIdle    ? 'flex'   : 'none');
        el('td-timer-pause')?.style.setProperty('display',  isRunning ? 'flex'   : 'none');
        el('td-timer-resume')?.style.setProperty('display', isPaused  ? 'flex'   : 'none');
        el('td-timer-stop')?.style.setProperty('display',   (!isIdle) ? 'flex'   : 'none');
        // Atualiza display imediatamente
        const disp = el('td-timer-display');
        if (disp) disp.textContent = _fmtTimer(active ? gt.sec : _timerSec);
    }
    // Sincroniza botões imediatamente ao abrir o drawer
    _syncBtnVisibility();

    document.getElementById('td-timer-start').addEventListener('click', () => {
        if (gTimer.getTimerState().state !== 'idle') return;
        // Verifica se há timer de OUTRA atividade rodando
        const activeGt = gTimer.getTimerState();
        if (activeGt.activityId && activeGt.activityId !== t.id) {
            if (!confirm('Já existe um cronômetro rodando para outra atividade. Deseja parar aquele e iniciar este?')) return;
            gTimer.stopTimer();
        }
        _timerState = 'running';
        const alreadySec = _timerSec; // tempo que já havia no banco
        gTimer.startTimer(t.id, t.title, alreadySec);
        _syncBtnVisibility();
    });
    document.getElementById('td-timer-pause').addEventListener('click', () => {
        const gt = gTimer.getTimerState();
        if (gt.activityId !== t.id || gt.state !== 'running') return;
        _timerState = 'paused';
        gTimer.pauseTimer();
        _syncBtnVisibility();
    });
    document.getElementById('td-timer-resume').addEventListener('click', () => {
        const gt = gTimer.getTimerState();
        if (gt.activityId !== t.id || gt.state !== 'paused') return;
        _timerState = 'running';
        gTimer.resumeTimer();
        _syncBtnVisibility();
    });
    document.getElementById('td-timer-stop').addEventListener('click', () => {
        const gt = gTimer.getTimerState();
        if (gt.activityId !== t.id) return;
        const totalSec = gTimer.stopTimer();
        _timerSec  = totalSec;
        _timerState = 'idle';
        const minEl = document.getElementById('td-time-min');
        if (minEl) minEl.value = Math.ceil(totalSec / 60);
        const disp = document.getElementById('td-timer-display');
        if (disp) disp.textContent = _fmtTimer(totalSec);
        _syncBtnVisibility();
        utils.showToast(`Tempo registrado: ${_tbFmtMin(Math.ceil(totalSec / 60))}`, 'success');
    });

    // ── delete ────────────────────────────────────────────────────────────────
    document.getElementById('td-delete-btn').addEventListener('click', async () => {
        if (!confirm(`Excluir a atividade "${t.title}"?`)) return;
        try {
            const r = await fetch(`/api/activities/${t.id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('Erro ao excluir');
            utils.showToast('Atividade excluída.', 'success');
            window.dispatchEvent(new CustomEvent('journey:activity-changed', { detail: { action: 'delete', id } }));
            _closeCard(); await _loadAndRender();
        } catch (err) { utils.showToast(err.message, 'error'); }
    });

    // ── save ──────────────────────────────────────────────────────────────────
    document.getElementById('td-save-btn').addEventListener('click', async () => {
        const saveBtn = document.getElementById('td-save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Salvando...';

        const timeManual = parseInt(document.getElementById('td-time-min')?.value || '0');
        const timeSpent  = timeManual > 0 ? timeManual : (_timerSec > 0 ? Math.ceil(_timerSec/60) : null);

        try {
            const payload = {
                activity_type:     document.getElementById('td-type').value,
                department:        document.getElementById('td-dept').value || null,
                status:            document.getElementById('td-status').value || null,
                priority:          document.getElementById('td-priority').value || null,
                activity_datetime: document.getElementById('td-datetime').value ? new Date(document.getElementById('td-datetime').value).toISOString() : null,
                title:             document.getElementById('td-title').value.trim(),
                description:       document.getElementById('td-desc').value.trim() || null,
                assignees:         (document.getElementById('td-assignees').value||'').split(',').map(s=>s.trim()).filter(Boolean),
                time_spent_minutes: timeSpent,
                next_step_title:   document.getElementById('td-next-step').value.trim() || null,
                next_step_date:    document.getElementById('td-next-step-date').value ? new Date(document.getElementById('td-next-step-date').value).toISOString() : null,
                next_step_responsibles: (document.getElementById('td-next-step-resp').value||'').split(',').map(s=>s.trim()).filter(Boolean),
                google_meet_link:  document.getElementById('td-meet-link')?.value?.trim() || null,
                reminder_at:       document.getElementById('td-reminder-at').value ? new Date(document.getElementById('td-reminder-at').value).toISOString() : null,
                reminder_email:    document.getElementById('td-reminder-email').checked,
                reminder_whatsapp: document.getElementById('td-reminder-wpp').checked,
            };
            if (!payload.title) {
                utils.showToast('O título é obrigatório.', 'error');
                saveBtn.disabled = false; saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Alterações';
                return;
            }
            const r = await fetch(`/api/activities/${t.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            if (!r.ok) { const err = await r.json().catch(() => ({ error: 'Erro desconhecido' })); throw new Error(err.error); }
            utils.showToast('Atividade atualizada!', 'success');
            window.dispatchEvent(new CustomEvent('journey:activity-changed', { detail: { action: 'update', id: t.id } }));
            _closeCard(); await _loadAndRender();
        } catch (err) {
            utils.showToast(err.message, 'error');
            saveBtn.disabled = false; saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Alterações';
        }
    });
}




// ──────────────────────────────────────────────────────────────────────────────
// CRIAR NOVA ATIVIDADE
// ──────────────────────────────────────────────────────────────────────────────

export function openNewActivity() {
    _openSimpleActivityModal();
}

function _openSimpleActivityModal() {
    const existing = document.getElementById('tb-activity-modal-overlay');
    if (existing) existing.remove();

    const TYPES   = ['Comentário','Reunião','Chamados HD','Chamados CS','Ação necessária','Outros'];
    const DEPTS   = ['Comercial','Customer Success','Help Desk','TI','Financeiro','Produto','Operações'];
    const STATUSES = ['A Fazer','Em Andamento','Concluída','Cancelada'];

    const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const overlay = document.createElement('div');
    overlay.id = 'tb-activity-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9000;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;';
    overlay.innerHTML = `
        <div class="glass-panel" style="width:100%;max-width:680px;padding:2rem;border-radius:var(--radius);max-height:90vh;overflow-y:auto;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;">
                <h2 style="margin:0;font-size:1.2rem;"><i class="ph ph-activity" style="color:var(--primary);margin-right:0.5rem;"></i>+ Nova Atividade</h2>
                <button type="button" onclick="document.getElementById('tb-activity-modal-overlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.4rem;"><i class="ph ph-x"></i></button>
            </div>
            <form id="tb-activity-form">
                <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.75rem;padding-bottom:0.4rem;border-bottom:1px solid var(--dark-border);">Informações Obrigatórias</div>
                <div class="grid-2" style="margin-bottom:1rem;">
                    <div class="input-group">
                        <label>Tipo de Atividade *</label>
                        <select id="tb-modal-type" class="input-control" required>
                            <option value="">Selecione...</option>
                            ${TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Departamento *</label>
                        <select id="tb-modal-dept" class="input-control" required>
                            <option value="">Selecione...</option>
                            ${DEPTS.map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="input-group" style="margin-bottom:1rem;">
                    <label>Título *</label>
                    <input type="text" id="tb-modal-title" class="input-control" required placeholder="Título da atividade">
                </div>
                <div class="input-group" style="margin-bottom:1rem;">
                    <label>Descrição *</label>
                    <textarea id="tb-modal-desc" class="input-control" rows="3" required placeholder="Descreva a atividade..."></textarea>
                </div>
                <div class="grid-2" style="margin-bottom:1rem;">
                    <div class="input-group">
                        <label>Responsáveis *</label>
                        <input type="text" id="tb-modal-assignees" class="input-control" required placeholder="Nome dos responsáveis">
                        <span style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;display:block;">Separe por vírgula</span>
                    </div>
                    <div class="input-group">
                        <label>Data e Horário *</label>
                        <input type="datetime-local" id="tb-modal-datetime" class="input-control" required value="${nowLocal}">
                    </div>
                </div>
                <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin:1rem 0 0.75rem;padding-bottom:0.4rem;border-bottom:1px solid var(--dark-border);">Informações Opcionais</div>
                <div class="input-group" style="margin-bottom:1rem;position:relative;">
                    <label style="display:flex;align-items:center;gap:0.4rem;">
                        <i class="ph ph-building-office" style="color:var(--text-muted);"></i>
                        Empresa
                        <span style="font-size:0.7rem;background:rgba(255,255,255,0.06);border:1px solid var(--dark-border);border-radius:20px;padding:0.1rem 0.5rem;color:var(--text-muted);">opcional</span>
                    </label>
                    <div style="position:relative;">
                        <input type="text" id="tb-modal-company-search" class="input-control" placeholder="Buscar empresa..." autocomplete="off" style="padding-right:2rem;">
                        <i class="ph ph-magnifying-glass" style="position:absolute;right:0.7rem;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;font-size:0.9rem;"></i>
                    </div>
                    <div id="tb-company-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--glass-bg,#1a2035);border:1px solid var(--dark-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:200px;overflow-y:auto;margin-top:2px;"></div>
                    <input type="hidden" id="tb-modal-company-id">
                    <span style="font-size:0.72rem;color:var(--text-muted);margin-top:0.25rem;display:block;">A atividade pode existir sem empresa vinculada</span>
                </div>
                <div class="grid-2" style="margin-bottom:1rem;">
                    <div class="input-group">
                        <label>Status</label>
                        <select id="tb-modal-status" class="input-control">
                            <option value="">Selecione...</option>
                            ${STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Prioridade</label>
                        <select id="tb-modal-priority" class="input-control">
                            <option value="">Sem prioridade</option>
                            <option value="baixa">Baixa</option>
                            <option value="média">Média</option>
                            <option value="alta">Alta</option>
                            <option value="urgente">Urgente</option>
                        </select>
                    </div>
                </div>
                <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1rem;">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('tb-activity-modal-overlay').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-primary"><i class="ph ph-floppy-disk"></i> Salvar Atividade</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);

    // Autocomplete empresa
    let _debounceTimer = null;
    const searchInput = document.getElementById('tb-modal-company-search');
    const dropdown    = document.getElementById('tb-company-dropdown');
    const hiddenId    = document.getElementById('tb-modal-company-id');

    async function _fetchCompanies(query) {
        try {
            const res = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}&limit=12`);
            if (!res.ok) return;
            const companies = await res.json();
            if (!companies.length) { dropdown.style.display = 'none'; return; }
            dropdown.innerHTML = companies.map(c => `
                <div class="tb-co-opt" data-id="${c.id}" data-name="${c.Nome_da_empresa}"
                    style="padding:0.55rem 0.85rem;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:0.5rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <i class="ph ph-building-office" style="color:var(--primary);flex-shrink:0;"></i>
                    <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.Nome_da_empresa}</span>
                    ${c.Status ? `<span style="font-size:0.7rem;color:var(--text-muted);">${c.Status}</span>` : ''}
                </div>`).join('');
            dropdown.style.display = 'block';
            dropdown.querySelectorAll('.tb-co-opt').forEach(el => {
                el.addEventListener('mouseover', () => el.style.background = 'rgba(99,102,241,0.12)');
                el.addEventListener('mouseout',  () => el.style.background = '');
                el.addEventListener('mousedown', e => {
                    e.preventDefault();
                    hiddenId.value = el.dataset.id;
                    searchInput.value = el.dataset.name;
                    dropdown.style.display = 'none';
                });
            });
        } catch { dropdown.style.display = 'none'; }
    }

    searchInput.addEventListener('focus',  () => { if (!hiddenId.value) _fetchCompanies(''); });
    searchInput.addEventListener('input',  () => { hiddenId.value = ''; clearTimeout(_debounceTimer); _debounceTimer = setTimeout(() => _fetchCompanies(searchInput.value), 250); });
    searchInput.addEventListener('blur',   () => { setTimeout(() => { dropdown.style.display = 'none'; }, 200); });

    // Submit
    document.getElementById('tb-activity-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type      = document.getElementById('tb-modal-type').value;
        const dept      = document.getElementById('tb-modal-dept').value;
        const title     = document.getElementById('tb-modal-title').value.trim();
        const desc      = document.getElementById('tb-modal-desc').value.trim();
        const assignees = document.getElementById('tb-modal-assignees').value.trim();
        const datetime  = document.getElementById('tb-modal-datetime').value;
        const status    = document.getElementById('tb-modal-status').value || null;
        const priority  = document.getElementById('tb-modal-priority').value || null;
        const companyId = document.getElementById('tb-modal-company-id').value || null;

        if (!type || !dept || !title || !desc || !assignees || !datetime) {
            alert('Preencha todos os campos obrigatórios (*)'); return;
        }

        const submitBtn = e.target.querySelector('[type=submit]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Salvando...';

        try {
            const res = await fetch('/api/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activity_type: type, title, description: desc, department: dept,
                    activity_datetime: new Date(datetime).toISOString(),
                    status, priority,
                    company_id: companyId,
                    assignees: assignees.split(',').map(s => s.trim()).filter(Boolean),
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
                throw new Error(err.error || 'Erro ao criar atividade');
            }
            overlay.remove();
            window.dispatchEvent(new CustomEvent('journey:activity-changed', { detail: { action: 'create' } }));
            await _loadAndRender();
        } catch (err) {
            alert(err.message);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Atividade';
        }
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// DRAG-AND-DROP — handlers expostos no window para uso inline
// ──────────────────────────────────────────────────────────────────────────────

window._kbDrag = {
    _dragging:   false,
    _wasDragged: false,

    start(event, taskId, cardEl) {
        _dragTaskId      = taskId;
        this._dragging   = true;
        this._wasDragged = false;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', taskId);
        setTimeout(() => cardEl && cardEl.classList.add('kb-dragging'), 0);
    },

    end(event, cardEl) {
        this._dragging = false;
        if (cardEl) cardEl.classList.remove('kb-dragging');
        document.querySelectorAll('.kanban-dropzone').forEach(z => z.classList.remove('kb-drag-over'));
        this._wasDragged = true;
        setTimeout(() => { this._wasDragged = false; _dragTaskId = null; }, 250);
    },

    over(event, zoneEl) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const task = _tasks.find(t => t.id === _dragTaskId);
        const targetCol = zoneEl.dataset.col;
        if (task && (task.status || 'A Fazer') !== targetCol) {
            zoneEl.classList.add('kb-drag-over');
        }
    },

    leave(event, zoneEl) {
        if (!zoneEl.contains(event.relatedTarget)) {
            zoneEl.classList.remove('kb-drag-over');
        }
    },

    async drop(event, zoneEl) {
        event.preventDefault();
        zoneEl.classList.remove('kb-drag-over');
        const taskId    = _dragTaskId || event.dataTransfer.getData('text/plain');
        const newStatus = zoneEl.dataset.col;
        if (!taskId || !newStatus) return;
        const task = _tasks.find(t => t.id === taskId);
        if (!task) return;
        const oldStatus = task.status || 'A Fazer';
        if (oldStatus === newStatus) return;

        // Optimistic UI
        task.status = newStatus;
        _renderContent(_tasks);

        try {
            const r = await fetch(`/api/activities/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!r.ok) throw new Error('Erro ao atualizar status');
            const col = KANBAN_COLUMNS.find(c => c.key === newStatus);
            utils.showToast(`Movido para "${col ? col.label : newStatus}" ✓`, 'success');
            window.dispatchEvent(new CustomEvent('journey:activity-changed', { detail: { action: 'update', id: taskId } }));
        } catch (err) {
            // Rollback
            task.status = oldStatus;
            _renderContent(_tasks);
            utils.showToast(err.message, 'error');
        }
    },
};

// ──────────────────────────────────────────────────────────────────────────────
// WINDOW EXPORT
// ──────────────────────────────────────────────────────────────────────────────

window.tasksBoard = {
    initTasksBoard, switchView, applyFilter, openNewActivity, openActivityDetail,
    applyListFilter, clearListFilter, clearListFilters, deleteActivity,
};

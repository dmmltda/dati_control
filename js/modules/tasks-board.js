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
import { confirmar } from './confirmar.js';

// ──────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ──────────────────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS = [
    { key: 'A Fazer',      label: 'A Fazer',      color: '#6366f1', icon: 'ph-list-checks',
      ttTitle: 'Atividades pendentes',   ttDesc: 'Tarefas criadas aguardando início. Arraste para "Em Andamento" ao começar a trabalhar.', ttColIdx: 0 },
    { key: 'Em Andamento', label: 'Em Andamento', color: '#f59e0b', icon: 'ph-spinner',
      ttTitle: 'Em execução agora',      ttDesc: 'Atividades sendo trabalhadas ativamente. Use o cronômetro para registrar o tempo gasto.', ttColIdx: 1 },
    { key: 'Concluída',   label: 'Concluída',    color: '#10b981', icon: 'ph-check-circle',
      ttTitle: 'Finalizadas com sucesso',ttDesc: 'Atividades concluídas. Arraste qualquer cartão aqui para marcá-lo como pronto.', ttColIdx: 2 },
    { key: 'Cancelada',   label: 'Cancelada',    color: '#64748b', icon: 'ph-x-circle',
      ttTitle: 'Descartadas',            ttDesc: 'Atividades canceladas. Útil para manter o histórico de decisões da equipe.', ttColIdx: 3 },
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
    'Ação necessária': { icon: 'ph-lightning',   color: '#f97316' },
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
let _filters = { status: '', priority: '', prazo: '', search: '', dateFrom: '', dateTo: '' }; // global filters
let _tbManager = null; // TableManager 2.0 para view Lista
let _dragTaskId  = null;  // id da task sendo arrastada
let _columnSorts = {};    // { [colKey]: 'newest'|'oldest'|'alpha'|'deadline' }

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

    // Garante padding correto (a view agora usa display:block com scroll normal)
    // O header sticky compensa com margin negativa para sangrar até as bordas
    container.style.padding = '0';

    container.innerHTML = `
        <!-- ── Header fixo (flex-shrink:0 via CSS): título + filtros ── -->
        <div id="tb-sticky-header">

        <!-- Cabeçalho: título + subtítulo + call-to-action à extrema direita -->
        <div style="margin-bottom:1.429rem;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
            <div>
                <h2 style="margin:0 0 0.429rem;font-size:1.571rem;font-weight:600;display:flex;align-items:center;gap:0.571rem;">
                    <i class="ph ph-activity" style="color:var(--primary);"></i> Minhas Atividades
                </h2>
                <p style="margin:0;color:var(--text-muted);font-size:0.857rem;">Todas as atividades atribuídas a você — por criação ou responsabilidade.</p>
            </div>
            ${(window.canDo && !window.canDo('company_edit.activities'))
                ? `<button type="button" class="btn btn-primary btn-new-company" disabled style="white-space:nowrap;flex-shrink:0;opacity:0.6;cursor:not-allowed;pointer-events:auto;" data-th-title="MODO SOMENTE LEITURA" data-th-tooltip="Você não tem permissão para criar atividades." onclick="event.stopPropagation(); event.preventDefault();">
                       <i class="ph ph-plus"></i> Nova Atividade
                   </button>`
                : `<button type="button" class="btn btn-primary btn-new-company" onclick="tasksBoard.openNewActivity()" style="white-space:nowrap;flex-shrink:0;">
                       <i class="ph ph-plus"></i> Nova Atividade
                   </button>`
            }
        </div>
        <!-- Filtros + Toggle na mesma linha -->
        <div class="glass-panel" style="position:relative; z-index:1000; display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;padding:0.75rem 1rem;flex-wrap:wrap;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:0.75rem;flex:1;flex-wrap:wrap;">
                
                <div class="search-wrapper"
                     data-th-tooltip="Busca simultânea em todos os campos:&#10;• Título da atividade&#10;• Empresa vinculada&#10;• Tipo (Reunião, Comentário...)&#10;• Prioridade e status&#10;• Responsáveis e criador&#10;• Data no formato DD/MM/AAAA&#10;&#10;Não diferencia maiúsculas/minúsculas. Busca parcial: &quot;reun&quot; encontra &quot;Reunião&quot;."
                     data-th-title="BUSCAR EM ATIVIDADES"
                     style="width:280px;max-width:300px; padding:0 0.6rem; border-radius:var(--radius-sm); height:32px; min-height:32px; border:1px solid var(--dark-border); background:rgba(15,23,42,0.6); align-items:center;">
                    <i class="ph ph-magnifying-glass search-icon" style="font-size:1rem; margin-right:0.4rem;"></i>
                    <input type="text" id="tb-global-search" class="search-input" placeholder="Localizar em atividades..." style="padding:0; height:100%; font-size:0.85rem;">
                </div>

                <select id="tb-filter-status" class="input-control" data-icon="ph-funnel-simple" data-prefix="Status:"
                    data-th-title="FILTRAR POR STATUS"
                    data-th-tooltip="Filtra as atividades pela fase atual:&#10;• A Fazer — pendentes, não iniciadas&#10;• Em Andamento — em execução&#10;• Concluída — finalizadas&#10;• Cancelada — descartadas&#10;&#10;Selecione &quot;Status&quot; para ver todas."
                    style="width:145px;flex-shrink:0;" onchange="tasksBoard.applyFilter('status', this.value)">
                    <option value="">Status</option>
                    <option value="A Fazer">A Fazer</option>
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Concluída">Concluída</option>
                    <option value="Cancelada">Cancelada</option>
                </select>

                <select id="tb-filter-prazo" class="input-control" data-icon="ph-calendar-blank" data-prefix="Prazo:"
                    data-th-title="FILTRAR POR PRAZO"
                    data-th-tooltip="Filtra as atividades pela data/prazo configurado:&#10;• Atrasadas — prazo anterior à data de hoje&#10;• Hoje — prazo para o dia atual&#10;• Próximos dias — prazo após hoje&#10;• Sem prazo — não possuem data definida&#10;&#10;Selecione &quot;Prazo&quot; para ver todas."
                    style="width:145px;flex-shrink:0;" onchange="tasksBoard.applyFilter('prazo', this.value)">
                    <option value="">Prazo</option>
                    <option value="atrasado">Atrasadas</option>
                    <option value="hoje">Hoje</option>
                    <option value="futuro">Próximos dias</option>
                    <option value="sem_prazo">Sem prazo</option>
                </select>

                <select id="tb-filter-priority" class="input-control" data-icon="ph-arrow-up" data-prefix="Prioridade:"
                    data-th-title="FILTRAR POR PRIORIDADE"
                    data-th-tooltip="Filtra as atividades pelo nível de urgência:&#10;• Urgente — requer atenção imediata&#10;• Alta — execução hoje&#10;• Média — esta semana&#10;• Baixa — quando possível&#10;&#10;Selecione &quot;Prioridade&quot; para ver todas."
                    style="width:145px;flex-shrink:0;" onchange="tasksBoard.applyFilter('priority', this.value)">
                    <option value="">Prioridade</option>
                    <option value="urgente">Urgente</option>
                    <option value="alta">Alta</option>
                    <option value="média">Média</option>
                    <option value="baixa">Baixa</option>
                </select>

                <!-- Intervalo de datas — mesmo componente do Relatórios -->
                <div class="rpt-date-range" style="height:32px;" id="tb-date-range-wrap">
                    <input type="date" id="tb-filter-date-from"
                        title="Data inicial"
                        style="min-width:120px;"
                        onchange="tasksBoard.applyFilter('dateFrom', this.value)">
                    <span>até</span>
                    <input type="date" id="tb-filter-date-to"
                        title="Data final"
                        style="min-width:120px;"
                        onchange="tasksBoard.applyFilter('dateTo', this.value)">
                </div>

                <!-- Limpar Filtros -->
                <button type="button" class="btn-ghost btn-sm" onclick="tasksBoard.clearAllFilters()" title="Limpar todos os filtros"
                    style="height:32px;white-space:nowrap;flex-shrink:0;">
                    <i class="ph ph-x"></i> Limpar
                </button>

            </div>

            <!-- Toggle de View (alinhado à direita) -->
            <div style="display:flex;background:rgba(255,255,255,0.05);border:1px solid var(--dark-border);border-radius:var(--radius-sm);overflow:visible;flex-shrink:0; height:32px;">
                <div class="vcw" id="vcw-kb-view-kanban" style="position:relative;display:flex;height:100%;">
                    <button class="tb-view-btn active" data-view="kanban" onclick="tasksBoard.switchView('kanban')"
                        style="border:none;background:none;padding:0 0.9rem;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:0.4rem;color:var(--text-main); height:100%;">
                        <i class="ph ph-columns"></i> Kanban
                    </button>
                    <div class="vtt-tooltip" id="vct-kb-view-kanban" style="top:calc(100% + 8px);bottom:auto;right:0;left:auto;transform-origin:top right;z-index:9999;">
                        <div class="vtt-video-container" id="vcvc-kb-view-kanban"><canvas class="vtt-canvas" id="vcc-kb-view-kanban" width="300" height="169"></canvas></div>
                        <div class="vtt-body"><div class="vtt-label">Tutorial · 0:10</div><div class="vtt-title">Visão Kanban</div><div class="vtt-desc">Visualização em colunas por status. Suporta arrastar e soltar (drag and drop) para atualizar o andamento das atividades rapidamente.</div><div class="vtt-cta"><span class="vtt-link">Ativar visão Kanban →</span><span class="vtt-time" id="vctm-kb-view-kanban">0:00</span></div></div>
                        <div class="vtt-arrow" style="right:30px;left:auto;top:-5px;transform:rotate(45deg);"></div>
                    </div>
                </div>
                <div style="width:1px; background:var(--dark-border); height:100%;"></div>
                <div class="vcw" id="vcw-kb-view-lista" style="position:relative;display:flex;height:100%;">
                    <button class="tb-view-btn" data-view="lista" onclick="tasksBoard.switchView('lista')"
                        style="border:none;background:none;padding:0 0.9rem;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:0.4rem;color:var(--text-main); height:100%;">
                        <i class="ph ph-list-bullets"></i> Lista
                    </button>
                    <div class="vtt-tooltip" id="vct-kb-view-lista" style="top:calc(100% + 8px);bottom:auto;right:0;left:auto;transform-origin:top right;z-index:9999;">
                        <div class="vtt-video-container" id="vcvc-kb-view-lista"><canvas class="vtt-canvas" id="vcc-kb-view-lista" width="300" height="169"></canvas></div>
                        <div class="vtt-body"><div class="vtt-label">Tutorial · 0:10</div><div class="vtt-title">Visão Lista</div><div class="vtt-desc">Visualização em tabela. Ideal para gerenciar grandes volumes de dados, com suporte a ordenação por colunas e paginação.</div><div class="vtt-cta"><span class="vtt-link">Ativar visão Lista →</span><span class="vtt-time" id="vctm-kb-view-lista">0:00</span></div></div>
                        <div class="vtt-arrow" style="right:25px;left:auto;top:-5px;transform:rotate(45deg);"></div>
                    </div>
                </div>
            </div>
        </div>

        </div><!-- /tb-sticky-header -->

        <!-- Conteúdo Kanban/Lista — rola abaixo do sticky header -->
        <div id="tb-content" style="padding:1.5rem 2rem;"></div>
    `;

    const searchEl = document.getElementById('tb-global-search');
    if (searchEl) {
        if (_filters.search) searchEl.value = _filters.search;
        searchEl.addEventListener('input', e => {
            _filters.search = e.target.value;
            if (_currentView === 'lista' && _tbManager) {
                _tbManager.setSearch(_filters.search);
            } else if (_currentView === 'kanban') {
                _renderKanban(_tasks);
            }
        });
    }

    // Restaura valores dos inputs de intervalo de datas após re-render do shell
    const fromEl = document.getElementById('tb-filter-date-from');
    const toEl   = document.getElementById('tb-filter-date-to');
    if (fromEl && _filters.dateFrom) fromEl.value = _filters.dateFrom;
    if (toEl   && _filters.dateTo)   toEl.value   = _filters.dateTo;

    // Aplica o Flatpickr premium nos inputs de data recém-criados
    if (window.ui?.initGlobalPickers) {
        setTimeout(() => window.ui.initGlobalPickers(), 50);
    }

    // IntersectionObserver: borda/sombra no header quando conteúdo está rolando
    const stickyEl = document.getElementById('tb-sticky-header');
    const contentEl = document.getElementById('tb-content');
    if (stickyEl && contentEl) {
        contentEl.addEventListener('scroll', () => {
            stickyEl.classList.toggle('is-stuck', contentEl.scrollTop > 4);
        }, { passive: true });
    }

    _initViewToggleTooltips();
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
// KANBAN — ordenação por coluna
// ──────────────────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
    { value: 'newest',   label: 'Data de criação (mais recente primeiro)', icon: 'ph-sort-descending' },
    { value: 'oldest',   label: 'Data de criação (mais antigo primeiro)',  icon: 'ph-sort-ascending'  },
    { value: 'alpha',    label: 'Nome do cartão (em ordem alfabética)',    icon: 'ph-text-aa'         },
    { value: 'deadline', label: 'Data de entrega',                          icon: 'ph-calendar-blank'  },
];

function _sortColTasks(tasks, sortKey) {
    const arr = [...tasks];
    switch (sortKey) {
        case 'oldest':
            return arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        case 'alpha':
            return arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR'));
        case 'deadline':
            return arr.sort((a, b) => {
                const da = a.activity_datetime ? new Date(a.activity_datetime) : null;
                const db = b.activity_datetime ? new Date(b.activity_datetime) : null;
                if (!da && !db) return 0;
                if (!da) return 1;
                if (!db) return -1;
                return da - db;
            });
        case 'newest':
        default:
            return arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }
}

export function openColumnSort(colKey, btnEl) {
    if (!document.getElementById('kb-sort-styles')) {
        const s = document.createElement('style');
        s.id = 'kb-sort-styles';
        s.textContent = `
            .kb-sort-popover {
                position:absolute; top:calc(100% + 6px); right:0; z-index:9999;
                background:#1a2236; border:1px solid rgba(255,255,255,0.1);
                border-radius:12px; padding:0.5rem 0; min-width:280px;
                box-shadow:0 16px 48px rgba(0,0,0,0.5); animation:kbSortIn 0.18s ease;
            }
            @keyframes kbSortIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
            .kb-sort-popover-header {
                display:flex; align-items:center; justify-content:space-between;
                padding:0.6rem 1rem 0.5rem; border-bottom:1px solid rgba(255,255,255,0.07);
                margin-bottom:0.25rem;
            }
            .kb-sort-popover-title { font-size:0.8rem; font-weight:700; color:var(--text-muted); letter-spacing:0.04em; text-transform:uppercase; }
            .kb-sort-popover-close { background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:1rem; padding:0; line-height:1; display:flex; align-items:center; }
            .kb-sort-popover-close:hover { color:var(--text-main); }
            .kb-sort-option {
                display:flex; align-items:center; gap:0.6rem;
                padding:0.65rem 1rem; font-size:0.875rem; color:var(--text-main);
                cursor:pointer; transition:background 0.15s; border:none; background:none; width:100%; text-align:left;
            }
            .kb-sort-option:hover { background:rgba(255,255,255,0.05); }
            .kb-sort-option.active { color:#6366f1; background:rgba(99,102,241,0.08); }
            .kb-sort-option i { font-size:1rem; flex-shrink:0; }
            .kb-sort-back { display:flex; align-items:center; gap:0.4rem; background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:0.82rem; padding:0; }
            .kb-sort-back:hover { color:var(--text-main); }
        `;
        document.head.appendChild(s);
    }

    document.querySelectorAll('.kb-sort-popover').forEach(el => el.remove());

    const currentSort = _columnSorts[colKey] || 'newest';
    const popover = document.createElement('div');
    popover.className = 'kb-sort-popover';
    popover.innerHTML = `
        <div class="kb-sort-popover-header">
            <button class="kb-sort-back" onclick="tasksBoard.closeColumnSort()">
                <i class="ph ph-caret-left"></i>
            </button>
            <span class="kb-sort-popover-title">Ordenar lista</span>
            <button class="kb-sort-popover-close" onclick="tasksBoard.closeColumnSort()">
                <i class="ph ph-x"></i>
            </button>
        </div>
        ${SORT_OPTIONS.map(opt => `
            <button class="kb-sort-option ${currentSort === opt.value ? 'active' : ''}"
                onclick="tasksBoard.setColumnSort('${colKey}', '${opt.value}')">
                <i class="ph ${opt.icon}"></i>
                ${opt.label}
                ${currentSort === opt.value ? '<i class="ph ph-check" style="margin-left:auto;color:#6366f1;"></i>' : ''}
            </button>
        `).join('')}
    `;

    const anchor = btnEl.closest('[data-col-sort-anchor]');
    if (anchor) {
        anchor.appendChild(popover);
    } else {
        btnEl.appendChild(popover);
    }

    setTimeout(() => {
        document.addEventListener('click', _closeSortOutside, { once: true, capture: true });
    }, 0);
}

function _closeSortOutside(e) {
    if (!e.target.closest('.kb-sort-popover')) {
        document.querySelectorAll('.kb-sort-popover').forEach(el => el.remove());
    } else {
        document.addEventListener('click', _closeSortOutside, { once: true, capture: true });
    }
}

export function closeColumnSort() {
    document.querySelectorAll('.kb-sort-popover').forEach(el => el.remove());
}

export function setColumnSort(colKey, sortValue) {
    _columnSorts[colKey] = sortValue;
    document.querySelectorAll('.kb-sort-popover').forEach(el => el.remove());
    _renderKanban(_tasks);
}

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
                const colTasks = tasks.filter(t => {
                    if (_normalizeStatus(t.status) !== col.key) return false;
                    
                    if (_filters.priority && t.priority !== _filters.priority) return false;
                    
                    if (_filters.prazo) {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const tDt = t.activity_datetime ? new Date(t.activity_datetime) : null;
                        if (tDt) tDt.setHours(0,0,0,0);
                        
                        if (_filters.prazo === 'sem_prazo' && tDt) return false;
                        if (_filters.prazo !== 'sem_prazo') {
                            if (!tDt) return false;
                            if (_filters.prazo === 'atrasado' && tDt >= today) return false;
                            if (_filters.prazo === 'hoje' && tDt.getTime() !== today.getTime()) return false;
                            if (_filters.prazo === 'futuro' && tDt <= today) return false;
                        }
                    }

                    // Filtro por intervalo de datas (dateFrom / dateTo)
                    if (_filters.dateFrom || _filters.dateTo) {
                        const tDtRaw = t.activity_datetime ? new Date(t.activity_datetime) : null;
                        if (!tDtRaw) return false;
                        const tDay = new Date(tDtRaw); tDay.setHours(0,0,0,0);
                        if (_filters.dateFrom) {
                            const from = new Date(_filters.dateFrom + 'T00:00:00');
                            if (tDay < from) return false;
                        }
                        if (_filters.dateTo) {
                            const to = new Date(_filters.dateTo + 'T23:59:59');
                            if (tDay > to) return false;
                        }
                    }

                    if (_filters.search) {
                        const q = _filters.search.toLowerCase();
                        const dateString = t.activity_datetime ? new Date(t.activity_datetime).toLocaleDateString('pt-BR') : '';
                        const isOverdue = t.activity_datetime && new Date(t.activity_datetime) < new Date() && t.status !== 'Concluída';
                        const searchableText = [
                            t.title,
                            t.description,
                            t.companies?.Nome_da_empresa,
                            t.activity_type,
                            t.priority,
                            t.next_step_title,
                            t.department,
                            t.created_by_user?.nome,
                            dateString,
                            isOverdue ? 'atrasada' : '',
                            ...(t.activity_assignees || []).map(a => a.user_nome || a.user_id),
                            ...(t.activity_next_step_responsibles || []).map(r => r.user_nome || r.user_id)
                        ].filter(Boolean).join(' ').toLowerCase();
                        return searchableText.includes(q);
                    }
                    return true;
                });
                const sortedColTasks = _sortColTasks(colTasks, _columnSorts[col.key]);
                return `
                <div class="kanban-column glass-panel" style="padding:0; position:relative; z-index:${100 - col.ttColIdx};">
                    <div data-col-sort-anchor style="display:flex; align-items:center; justify-content:space-between; padding:0.75rem 1rem; border-bottom:1px solid rgba(255,255,255,0.06); border-top-left-radius:var(--radius-md); border-top-right-radius:var(--radius-md); position:relative;">
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <i class="ph ${col.icon}" style="color:${col.color};font-size:1rem;"></i>
                            <span style="font-weight:700;font-size:0.9rem;">${col.label}</span>
                            <!-- VTT canvas tooltip trigger -->
                            <span class="vcw" id="vcw-kb-${col.ttColIdx}" style="position:relative;display:inline-flex;">
                              <span class="th-info-btn" id="vcb-kb-${col.ttColIdx}" style="cursor:help;">
                                <i class="ph ph-info"></i><span class="th-pulse"></span>
                              </span>
                              <div class="vtt-tooltip" id="vct-kb-${col.ttColIdx}" style="top:calc(100% + 8px);bottom:auto;${col.ttColIdx < 2 ? 'left:0;right:auto;transform-origin:top left;' : 'right:0;left:auto;transform-origin:top right;'}z-index:9999;">
                                <div class="vtt-video-container" id="vcvc-kb-${col.ttColIdx}"><canvas class="vtt-canvas" id="vcc-kb-${col.ttColIdx}" width="300" height="169"></canvas></div>
                                <div class="vtt-body"><div class="vtt-label">Tutorial · 0:15</div><div class="vtt-title">${col.ttTitle}</div><div class="vtt-desc">${col.ttDesc}</div><div class="vtt-cta"><span class="vtt-link">Ver documentação →</span><span class="vtt-time" id="vctm-kb-${col.ttColIdx}">0:00</span></div></div>
                                <div class="vtt-arrow" style="${col.ttColIdx < 2 ? 'left:12px;right:auto;' : 'right:12px;left:auto;'}top:-5px;transform:rotate(45deg);"></div>
                              </div>
                            </span>
                        </div>
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <span style="background:${col.color}20;color:${col.color};border:1px solid ${col.color}44;border-radius:20px;padding:0.15rem 0.6rem;font-size:0.75rem;font-weight:700;">${colTasks.length}</span>
                            <button
                                onclick="event.stopPropagation(); tasksBoard.openColumnSort('${col.key}', this)"
                                title="Ordenar lista"
                                style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:3px 5px;border-radius:6px;display:flex;align-items:center;transition:background 0.15s,color 0.15s;"
                                onmouseover="this.style.background='rgba(255,255,255,0.08)';this.style.color='var(--text-main)';"
                                onmouseout="this.style.background='none';this.style.color='var(--text-muted)';"
                            ><i class="ph ph-sort-descending" style="font-size:1rem;"></i></button>
                        </div>
                    </div>
                    <div class="kanban-dropzone"
                         data-col="${col.key}"
                         ondragover="window._kbDrag.over(event,this)"
                         ondragleave="window._kbDrag.leave(event,this)"
                         ondrop="window._kbDrag.drop(event,this)"
                         style="display:flex;flex-direction:column;gap:0.75rem;min-height:120px; padding:1rem;">
                        ${sortedColTasks.length ? sortedColTasks.map(t => _renderKanbanCard(t)).join('') : `
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
    // Wire up canvas tooltips after render
    requestAnimationFrame(() => _initKanbanColumnTooltips());
}

function _renderKanbanCard(t) {
    const pc = t.priority ? PRIORITY_COLORS[t.priority] || '#64748b' : null;
    const company = t.companies?.Nome_da_empresa || '';
    const deadline = t.activity_datetime ? new Date(t.activity_datetime).toLocaleDateString('pt-BR') : '';
    const isOverdue = t.activity_datetime && new Date(t.activity_datetime) < new Date() && t.status !== 'Concluída';
    const typeIcon = (TB_TYPE_CONFIG[t.activity_type] || {}).icon || 'ph-activity';
    const typeColor = (TB_TYPE_CONFIG[t.activity_type] || {}).color || '#64748b';

    // Badge: próximo passo atribuído (mas não criou a atividade)
    const meId = window.__usuarioAtual?.id;
    const isNextStepResp = meId && (t.activity_next_step_responsibles || []).some(r => r.user_id === meId);
    const isCreator      = meId && t.created_by_user_id === meId;
    const showNSBadge    = isNextStepResp && !isCreator;

    const canEdit = window.canDo && window.canDo('company_edit.activities');
    const dragProps = canEdit ? `draggable="true" ondragstart="window._kbDrag.start(event,'${t.id}',this)" ondragend="window._kbDrag.end(event,this)"` : '';
    const cursorStyle = canEdit ? 'cursor:grab;' : 'cursor:pointer;';

    return `
        <div class="kanban-card"
             ${dragProps}
             data-task-id="${t.id}"
             onclick="if(!window._kbDrag._wasDragged)tasksBoard.openActivityDetail('${t.id}')"
             style="background:rgba(255,255,255,0.04);border:1px solid var(--dark-border);border-radius:10px;padding:0.85rem;position:relative;${cursorStyle}transition:background 0.18s,border-color 0.18s,transform 0.18s,box-shadow 0.18s;${pc ? `border-left:3px solid ${pc};` : ''}"
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
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    ${showNSBadge ? `
                    <span title="Você é responsável pelo próximo passo"
                        style="display:inline-flex;align-items:center;gap:0.2rem;font-size:0.67rem;font-weight:700;color:#10b981;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);border-radius:20px;padding:0.08rem 0.45rem;">
                        <i class="ph ph-arrow-right" style="font-size:0.7rem;"></i> NS
                    </span>` : ''}
                    <span style="font-size:0.69rem;color:rgba(99,102,241,0.7);display:flex;align-items:center;gap:0.25rem;">
                        <i class="ph ph-pencil-simple"></i>editar
                    </span>
                </div>
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
        <div class="glass-panel" style="display:flex; flex-direction:column; flex:1; min-height:0; padding:0; margin-bottom:0.5rem; overflow:hidden;">
            <div class="table-responsive" style="flex:1; overflow:auto; min-height:0; padding:1.25rem;">
                <table class="company-table" id="tb-list-table" style="min-width:1200px;">
                    <thead style="position:sticky; top:-1.25rem; z-index:10; background:var(--glass-bg, #0f1623); box-shadow:0 1px 0 rgba(255,255,255,0.06);">
                        <tr>
                            <th class="sortable-header" data-key="activity_type" style="width:130px;">Tipo <span class="th-info-btn" data-th-title="TIPO DE ATIVIDADE" data-th-tooltip="Categoria da interação: Comentário (nota interna), Reunião, Chamados HD (suporte técnico), Chamados CS (sucesso do cliente), Ação necessária (urgente)."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th data-key="company_name" style="width:160px;">Empresa <span class="th-info-btn" data-th-title="EMPRESA VINCULADA" data-th-tooltip="Empresa associada a esta atividade. Atividades sem vínculo de empresa aparecem como traço."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th class="sortable-header" data-key="title">Título <span class="th-info-btn" data-th-title="TÍTULO DA ATIVIDADE" data-th-tooltip="Nome conciso da atividade. Clique no ícone de edição nas Ações para ver e editar todos os detalhes."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th data-key="description">Descrição <span class="th-info-btn" data-th-title="DESCRIÇÃO" data-th-tooltip="Detalhamento do que foi feito ou discutido. Campo livre para contexto adicional."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th class="sortable-header" data-key="department" style="text-align:center;width:130px;">Departamento <span class="th-info-btn" data-th-title="DEPARTAMENTO EXECUTOR" data-th-tooltip="Área da DATI responsável pela atividade: Comercial, Customer Success, Help Desk, TI, Financeiro, Produto ou Operações."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th data-key="status" style="text-align:center;width:130px;">Fase da Atividade <span class="th-info-btn" data-th-title="FASE DA ATIVIDADE" data-th-tooltip="Estado atual: A Fazer (pendente), Em Andamento (em execução), Concluída (finalizada), Cancelada (descartada)."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th data-key="assignees" style="width:140px;">Responsáveis <span class="th-info-btn" data-th-title="RESPONSÁVEIS" data-th-tooltip="Colaboradores DATI que participaram ou são responsáveis por executar esta atividade."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th data-key="created_by" style="width:110px;">Criado por <span class="th-info-btn" data-th-title="CRIADO POR" data-th-tooltip="Usuário DATI que registrou esta atividade no sistema."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th class="sortable-header" data-key="activity_date" style="text-align:center;width:100px;">Data <span class="th-info-btn" data-th-title="DATA DA ATIVIDADE" data-th-tooltip="Quando a atividade ocorreu ou está agendada. Clique para ordenar cronologicamente. Atividades com prazo vencido aparecem em vermelho."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th data-key="time_spent" style="text-align:center;width:90px;">Tempo <span class="th-info-btn" data-th-title="TEMPO GASTO" data-th-tooltip="Duração da atividade registrada via cronômetro ou manualmente. Usado para controle de produtividade e SLA."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th data-key="next_step" style="width:160px;">Próximo Passo <span class="th-info-btn" data-th-title="PRÓXIMO PASSO" data-th-tooltip="Ação definida para avançar o relacionamento após esta atividade. Inclui título e data do próximo passo quando configurado."><i class="ph ph-info"></i><span class="th-pulse"></span></span></th>
                            <th style="text-align:right;width:80px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tb-list-body"></tbody>
                </table>
            </div>
            <div id="tb-pagination" class="pagination-container" style="display:none; flex-shrink:0; padding:0.875rem 1.25rem; border-top:1px solid rgba(255,255,255,0.06);"></div>
        </div>`;

    // Aplica filtros de prazo, prioridade e intervalo de datas antes do TableManager
    const filteredTasks = tasks.filter(t => {
        if (_filters.status && _normalizeStatus(t.status) !== _filters.status) return false;
        if (_filters.priority && t.priority !== _filters.priority) return false;

        if (_filters.prazo) {
            const today = new Date(); today.setHours(0,0,0,0);
            const tDt = t.activity_datetime ? new Date(t.activity_datetime) : null;
            if (tDt) tDt.setHours(0,0,0,0);
            if (_filters.prazo === 'sem_prazo' && tDt) return false;
            if (_filters.prazo !== 'sem_prazo') {
                if (!tDt) return false;
                if (_filters.prazo === 'atrasado' && tDt >= today) return false;
                if (_filters.prazo === 'hoje' && tDt.getTime() !== today.getTime()) return false;
                if (_filters.prazo === 'futuro' && tDt <= today) return false;
            }
        }

        if (_filters.dateFrom || _filters.dateTo) {
            const tDtRaw = t.activity_datetime ? new Date(t.activity_datetime) : null;
            if (!tDtRaw) return false;
            const tDay = new Date(tDtRaw); tDay.setHours(0,0,0,0);
            if (_filters.dateFrom) {
                const from = new Date(_filters.dateFrom + 'T00:00:00');
                if (tDay < from) return false;
            }
            if (_filters.dateTo) {
                const to = new Date(_filters.dateTo + 'T23:59:59');
                if (tDay > to) return false;
            }
        }

        return true;
    });

    _tbManager = new TableManager({
        data: _mapForTable(filteredTasks),
        columns: [
            { key: 'activity_type', label: 'Tipo',          type: 'string', searchable: true, filterable: false },
            { key: 'company_name',  label: 'Empresa',        type: 'string', searchable: true },
            { key: 'title',         label: 'Título',         type: 'string', searchable: true },
            { key: 'description',   label: 'Descrição',      type: 'string', searchable: true },
            { key: 'department',    label: 'Departamento',   type: 'string', searchable: true, filterable: false },
            { key: 'assignees',     label: 'Responsáveis',   type: 'string', searchable: true },
            { key: 'created_by',    label: 'Criado por',     type: 'string', searchable: true },
            { key: 'activity_date', label: 'Data',           type: 'date',   sortable: true },
            { key: 'time_spent',    label: 'Tempo',          type: 'string' },
            { key: 'next_step',     label: 'Próximo Passo',  type: 'string', searchable: true },
            { key: 'status',        label: 'Fase',         type: 'string', filterable: false },
        ],
        pageSize: 10,
        tableId: 'tb-list-table',
        renderRows:       (rows)  => _tbRenderRows(rows),
        renderPagination: (state) => _tbRenderPagination(state),
    });

    if (_filters.search) {
        _tbManager.setSearch(_filters.search);
    }
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
                    <button type="button" class="btn btn-secondary btn-icon" onclick="tasksBoard.openActivityDetail('${act.id}')" title="${(window.canDo && !window.canDo('company_edit.activities')) ? 'Ver Detalhes' : 'Ver/Editar'}"><i class="ph ${(window.canDo && !window.canDo('company_edit.activities')) ? 'ph-eye' : 'ph-pencil-simple'}"></i></button>
                    ${(window.canDo && !window.canDo('company_edit.activities')) ? 
                        `<button type="button" class="btn btn-danger btn-icon" disabled style="opacity:0.6;cursor:not-allowed;pointer-events:auto;" data-th-title="MODO SOMENTE LEITURA" data-th-tooltip="Você não tem permissão para excluir atividades." onclick="event.stopPropagation(); event.preventDefault();"><i class="ph ph-trash"></i></button>`
                    : `<button type="button" class="btn btn-danger btn-icon" onclick="tasksBoard.deleteActivity('${act.id}')" title="Excluir"><i class="ph ph-trash"></i></button>` }
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

// ──────────────────────────────────────────────────────────────────────────────
// FILTROS GLOBAIS
// ──────────────────────────────────────────────────────────────────────────────

export async function applyFilter(key, value) {
    _filters[key] = value;
    await _loadAndRender();
}

export async function clearAllFilters() {
    // Zera estado
    _filters = { status: '', priority: '', prazo: '', search: '', dateFrom: '', dateTo: '' };

    // Sincroniza elementos da UI
    const ids = {
        'tb-filter-status':    '',
        'tb-filter-prazo':     '',
        'tb-filter-priority':  '',
        'tb-filter-date-from': '',
        'tb-filter-date-to':   '',
        'tb-global-search':    '',
    };
    Object.entries(ids).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    // Limpa o TableManager também (se estiver na view lista)
    if (_tbManager) _tbManager.clearFilters?.();

    await _loadAndRender();
}

export function deleteActivity(id) {
    confirmar('Excluir esta atividade? Esta ação não pode ser desfeita.', async () => {
        try {
            const r = await fetch(`/api/activities/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('Erro ao excluir');
            utils.showToast('Atividade excuída.', 'success');
            // Notifica outros painéis (Dashboard, aba de cliente) da exclusão
            window.dispatchEvent(new CustomEvent('journey:activity-changed', {
                detail: { action: 'delete', id }
            }));
            await _loadAndRender();
        } catch (e) { utils.showToast(e.message, 'error'); }
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// DETAIL DRAWER
// ──────────────────────────────────────────────────────────────────────────────

export function openActivityDetail(id, defaultTab = 'info') {
    const task = _tasks.find(t => t.id === id);
    if (!task) return;
    _renderDetailDrawer(task, defaultTab);
}

// Helper: converte [EMAIL_LOG:uuid] na descrição em botão clicável para abrir a thread
function _renderDescWithEmailLink(desc) {
    if (!desc) return '';
    const EMAIL_RE = /\[EMAIL_LOG:([a-zA-Z0-9\-]+)\]/g;
    const hasLink = EMAIL_RE.test(desc);
    const safe = desc.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const EMAIL_RE2 = /\[EMAIL_LOG:([a-zA-Z0-9\-]+)\]/g;
    if (!hasLink) {
        const lines = safe.split('\n').slice(0, 6);
        return `<div style="background:rgba(0,0,0,0.15);padding:0.75rem 1rem;border-radius:8px;border:1px solid var(--dark-border);font-size:0.85rem;line-height:1.6;color:var(--text-muted);white-space:pre-wrap;max-height:120px;overflow-y:auto;">${lines.map(l=>l.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')).join('\n')}</div>`;
    }
    const rendered = safe
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(EMAIL_RE2, (_, id) => `<button type="button" onclick="window.navigateToEmail('${id}')" style="display:inline-flex;align-items:center;gap:0.4rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);color:#818cf8;padding:0.3rem 0.8rem;border-radius:6px;font-size:0.82rem;cursor:pointer;font-weight:600;margin:0.25rem 0;transition:background 0.18s;" onmouseover="this.style.background='rgba(99,102,241,0.3)'" onmouseout="this.style.background='rgba(99,102,241,0.15)'"><i class="ph ph-eye"></i> Ver E-mail Completo (Thread)</button>`);
    return `<div style="background:rgba(0,0,0,0.15);padding:0.75rem 1rem;border-radius:8px;border:1px solid var(--dark-border);font-size:0.85rem;line-height:1.8;color:var(--text-muted);white-space:pre-wrap;max-height:150px;overflow-y:auto;">${rendered}</div>`;
}

function _renderDetailDrawer(t, defaultTab = 'info', isCreateMode = false, onAfterSave = null) {
    document.getElementById('tb-drawer-overlay')?.remove();

    const TYPES    = ['Comentário','Reunião','Chamados HD','Chamados CS','Ação necessária','Outros'];
    const STATUSES = ['A Fazer','Em Andamento','Concluída','Cancelada'];
    const STATUS_COLORS = { 'A Fazer':'#6366f1','Em Andamento':'#f59e0b','Concluída':'#10b981','Cancelada':'#64748b' };
    const isReuniao = t.activity_type === 'Reunião';

    const sc  = isCreateMode ? '#6366f1' : (STATUS_COLORS[t.status] || '#6366f1');
    const pc  = t.priority ? (PRIORITY_COLORS[t.priority] || '#64748b') : null;
    const isOverdue = !isCreateMode && t.activity_datetime && new Date(t.activity_datetime) < new Date() && t.status !== 'Concluída';
    const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const dtLocal = isCreateMode ? nowLocal : (t.activity_datetime ? new Date(t.activity_datetime).toISOString().slice(0, 16) : '');
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
      .tb-badge { display:inline-flex;align-items:center;gap:0.28rem;padding:0.13rem 0.55rem;border-radius:6px;font-size:0.69rem;font-weight:600;border-width:1px;border-style:solid;letter-spacing:0.01em; }
      .tb-chip { display:inline-flex;align-items:center;gap:0.28rem;padding:0.13rem 0.55rem;border-radius:6px;font-size:0.72rem;background:rgba(255,255,255,0.04);border:1px solid var(--dark-border);color:var(--text-muted); }
      #td-save-btn { transition:all 0.2s; }
      #td-save-btn:hover:not(:disabled) { transform:translateY(-1px);box-shadow:0 4px 18px rgba(99,102,241,0.45); }
      #td-delete-btn { transition:all 0.2s; }
      #td-delete-btn:hover { box-shadow:0 4px 14px rgba(239,68,68,0.3); }
      @keyframes tbBellRing {
        0%,100%{transform:rotate(0deg)}
        10%{transform:rotate(14deg)}
        20%{transform:rotate(-10deg)}
        30%{transform:rotate(8deg)}
        40%{transform:rotate(-6deg)}
        50%{transform:rotate(4deg)}
        60%{transform:rotate(0deg)}
      }
      .tb-bell-btn { background:none;border:none;cursor:pointer;padding:0.1rem 0.3rem;color:#a855f7;opacity:0.8;font-size:0.88rem;display:inline-flex;align-items:center;border-radius:4px;transition:opacity 0.15s,background 0.15s;line-height:1; }
      .tb-bell-btn i { animation:tbBellRing 3s ease-in-out infinite; display:inline-block;transform-origin:top center; }
      .tb-bell-btn:hover { opacity:1;background:rgba(168,85,247,0.12); }
    </style>

    <div id="tb-act-card" style="width:100%;max-width:780px;background:var(--glass-bg,#0f1623);border:1px solid ${sc}30;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;max-height:92vh;box-shadow:0 32px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04);">

      <!-- ═══ HEADER ═══ -->
      <div style="background:linear-gradient(135deg,${sc}12 0%,transparent 60%);border-bottom:1px solid ${sc}20;padding:1.25rem 1.8rem 0;flex-shrink:0;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1rem;">
          <div style="flex:1;min-width:0;">

            <!-- Contexto discreto no topo: empresa · próximo passo (ou ícone vazio) -->
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.55rem;">
              ${company ? `<span style="font-size:0.72rem;color:var(--text-muted);font-weight:500;display:flex;align-items:center;gap:0.25rem;"><i class="ph ph-building-office" style="opacity:0.6;"></i>${company}</span>` : '<span style="font-size:0.72rem;color:#ef4444;opacity:0.75;display:flex;align-items:center;gap:0.25rem;"><i class="ph ph-warning"></i>Sem vínculo empresa</span>'}
              <span style="color:var(--dark-border);font-size:0.65rem;">·</span>
              ${(() => {
                if (nextStepDate) {
                  const nsd = new Date(nextStepDate + 'T12:00:00');
                  const isNsdOverdue = nsd < new Date();
                  const nsdFmt = nsd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  return isNsdOverdue
                    ? `<span style="font-size:0.72rem;color:#f87171;display:flex;align-items:center;gap:0.25rem;font-weight:500;" title="Próximo passo atrasado"><i class="ph ph-calendar-blank"></i>${nsdFmt}</span>`
                    : `<span style="font-size:0.72rem;color:#34d399;display:flex;align-items:center;gap:0.25rem;font-weight:500;" title="Próximo passo no prazo"><i class="ph ph-calendar-blank"></i>${nsdFmt}</span>`;
                }
                return `<span style="font-size:0.72rem;color:var(--text-muted);display:flex;align-items:center;gap:0.25rem;opacity:0.4;" title="Sem próximo passo configurado"><i class="ph ph-calendar-blank"></i>—</span>`;
              })()}
              ${timeMin ? `<span style="color:var(--dark-border);font-size:0.65rem;">·</span><span style="font-size:0.72rem;color:var(--text-muted);display:flex;align-items:center;gap:0.25rem;"><i class="ph ph-clock" style="opacity:0.6;"></i>${_tbFmtMin(timeMin)}</span>` : ''}
            </div>

            <!-- Título hero -->
            <h2 style="margin:0 0 0.65rem;font-size:1.2rem;font-weight:800;line-height:1.3;word-break:break-word;">${utils.escapeHtml ? utils.escapeHtml(t.title) : t.title}</h2>

            <!-- Linha de badges coesos: status · prioridade -->
            <div style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">
              <span class="tb-badge" style="background:${sc}18;color:${sc};border-color:${sc}44;">
                <span style="width:5px;height:5px;border-radius:50%;background:${sc};display:inline-block;flex-shrink:0;"></span>
                ${t.status || 'A Fazer'}
              </span>
              ${pc ? `<span class="tb-badge" style="background:${pc}15;color:${pc};border-color:${pc}35;">${t.priority}</span>` : ''}
              ${reminderAt ? `<button class="tb-bell-btn" id="tb-header-bell" title="Lembrete agendado — clique para ver"><i class="ph ph-bell-ringing"></i></button>` : ''}
            </div>

          </div>
          <button id="tb-drawer-close" style="flex-shrink:0;background:rgba(255,255,255,0.05);border:1px solid var(--dark-border);border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);transition:all 0.18s;font-size:0.9rem;" onmouseover="this.style.background='rgba(255,255,255,0.1)';this.style.color='white'" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='var(--text-muted)'">
            <i class="ph ph-x"></i>
          </button>
        </div>

        <!-- TABS -->
        <div style="display:flex;border-bottom:1px solid var(--dark-border);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
          <button class="tb-card-tab ${defaultTab==='info'?'active':''}" data-tab="info"><i class="ph ph-list-dashes"></i>Informações</button>
          <button class="tb-card-tab ${defaultTab==='tempo'?'active':''}" data-tab="tempo"><i class="ph ph-clock"></i>Tempo</button>
          <button class="tb-card-tab tb-tab-reuniao" data-tab="reuniao" style="display:${isReuniao?'flex':'none'}"><i class="ph ph-video-camera"></i>Reunião</button>
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
              <label>Data e Horário</label>
              <input type="datetime-local" id="td-datetime" class="input-control" value="${dtLocal}">
            </div>
          </div>

          <div class="tb-section-lbl"><i class="ph ph-building-office" style="color:${sc};"></i>Cliente Vinculado</div>
          <div class="input-group tb-field" style="margin-bottom:1.2rem;position:relative;">
            <div style="position:relative;">
              <input type="text" id="td-company-search" class="input-control" placeholder="Buscar empresa..." autocomplete="off" value="${company}" style="padding-right:2rem;">
              <i class="ph ph-magnifying-glass" style="position:absolute;right:0.7rem;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;font-size:0.9rem;"></i>
            </div>
            <div id="td-company-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:var(--glass-bg,#1a2035);border:1px solid var(--dark-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:180px;overflow-y:auto;margin-top:2px;"></div>
            <input type="hidden" id="td-company-id" value="${t.company_id||t.companies?.id||''}">
            ${company ? `<span style="font-size:0.72rem;color:#818cf8;margin-top:0.3rem;display:flex;align-items:center;gap:0.3rem;"><i class="ph ph-check-circle"></i>Vinculado: ${company}</span>` : '<span style="font-size:0.72rem;color:#ef4444;margin-top:0.3rem;display:block;">⚠ Nenhum cliente vinculado</span>'}
          </div>

          <div class="tb-section-lbl"><i class="ph ph-text-align-left" style="color:${sc};"></i>Conteúdo</div>
          <div class="input-group tb-field" style="margin-bottom:0.85rem;">
            <label>Título</label>
            <input type="text" id="td-title" class="input-control" value="${(t.title||'').replace(/"/g,'&quot;')}" style="font-weight:600;font-size:1rem;">
          </div>
          <div class="input-group tb-field" style="margin-bottom:1.25rem;">
            <label>Descrição</label>
            ${_renderDescWithEmailLink(t.description || '')}
            <textarea id="td-desc" class="input-control" rows="4" style="resize:vertical;margin-top:0.5rem;font-size:0.82rem;">${t.description||''}</textarea>
          </div>

          <div class="tb-section-lbl"><i class="ph ph-users" style="color:${sc};"></i>Participantes</div>
          <div class="tb-field" style="margin-bottom:1.2rem;">
            <label style="font-size:0.72rem;color:var(--text-muted);font-weight:500;display:block;margin-bottom:0.5rem;">Quem participou desta atividade?</label>
            <div style="margin-bottom:0.35rem;">
              <span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">Adicionar via:</span>
            </div>
            <div style="display:flex;gap:0.4rem;margin-bottom:0.3rem;flex-wrap:wrap;">
              <button type="button" class="td-part-mode-btn active" data-mode="user" style="padding:0.3rem 0.75rem;border-radius:20px;border:1px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.15);color:#818cf8;font-size:0.78rem;cursor:pointer;font-weight:600;transition:all 0.15s;"><i class="ph ph-at"></i> @usuário</button>
              <button type="button" class="td-part-mode-btn" data-mode="email" style="padding:0.3rem 0.75rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-envelope"></i> E-mail</button>
              <button type="button" class="td-part-mode-btn" data-mode="whatsapp" style="padding:0.3rem 0.75rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-whatsapp-logo"></i> WhatsApp</button>
            </div>
            <div style="font-size:0.68rem;color:var(--text-muted);opacity:0.65;margin-bottom:0.5rem;">Combine tipos livremente — usuário + e-mail + WhatsApp</div>
            <div style="display:flex;gap:0.5rem;position:relative;">
              <input type="text" id="td-part-input" class="input-control" placeholder="Buscar usuário..." autocomplete="off" style="flex:1;">
              <div id="td-part-dropdown" style="display:none;position:absolute;top:100%;left:0;right:3rem;z-index:200;background:var(--glass-bg,#1a2035);border:1px solid var(--dark-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:160px;overflow-y:auto;margin-top:2px;"></div>
              <button type="button" id="td-part-add-btn" style="padding:0.45rem 0.8rem;border-radius:8px;border:1px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.1);color:#818cf8;cursor:pointer;font-size:0.82rem;white-space:nowrap;"><i class="ph ph-plus"></i></button>
            </div>
            <div id="td-participants-chips" style="margin-top:0.55rem;display:flex;flex-wrap:wrap;gap:0.35rem;">
              ${(t.activity_assignees||[]).map(a=>`
                <span class="td-part-chip" data-id="${a.user_id||a.id||''}" data-type="user" style="display:inline-flex;align-items:center;gap:0.35rem;padding:0.22rem 0.6rem;border-radius:20px;font-size:0.76rem;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);color:#818cf8;">
                  <i class="ph ph-user"></i>${a.user_nome||a.user_id||''}
                  <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;margin-left:2px;font-size:0.9rem;">×</button>
                </span>`).join('')}
            </div>
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

          <!-- Tabela de sessões de tempo -->
          <div style="margin-top:1.2rem;">
            <div class="tb-section-lbl"><i class="ph ph-list-checks" style="color:#6366f1;"></i>Sessões Registradas</div>
            <div id="td-time-logs-wrap" style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:0.81rem;" id="td-time-logs-table">
                <thead>
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
                    <th style="text-align:left;padding:0.45rem 0.6rem;color:var(--text-muted);font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;">Data</th>
                    <th style="text-align:left;padding:0.45rem 0.6rem;color:var(--text-muted);font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;">Hora</th>
                    <th style="text-align:left;padding:0.45rem 0.6rem;color:var(--text-muted);font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;">Duração</th>
                    <th style="text-align:left;padding:0.45rem 0.6rem;color:var(--text-muted);font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;">Assunto</th>
                    <th style="width:32px;"></th>
                  </tr>
                </thead>
                <tbody id="td-time-logs-body">
                  <tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.8rem;"><i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Carregando...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ─── TAB: REUNIÃO (condicional) ─── -->
        <div class="tb-card-panel" id="tb-tab-reuniao">
          <div class="tb-section-lbl"><i class="ph ph-video-camera" style="color:#6366f1;"></i>Google Meet</div>
          <div style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(99,102,241,0.02));border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:1.25rem;margin-bottom:1.2rem;">
            <div class="input-group tb-field" style="margin-bottom:0.9rem;">
              <label><i class="ph ph-link" style="color:#818cf8;"></i> Link Google Meet</label>
              <input type="url" id="td-meet-link" class="input-control" placeholder="https://meet.google.com/xxx" value="${t.google_meet_link||''}">
            </div>
            <div class="input-group tb-field" style="margin-bottom:0;">
              <label><i class="ph ph-record" style="color:#ef4444;"></i> URL da Gravação</label>
              <input type="url" id="td-recording-url" class="input-control" placeholder="Link da gravação (Drive, cloud...)" value="${t.recording_url||''}">
            </div>
          </div>
          <div class="tb-section-lbl"><i class="ph ph-bell" style="color:#6366f1;"></i>Notificações</div>
          <div style="display:flex;flex-direction:column;gap:0.6rem;">
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.84rem;padding:0.5rem 0.75rem;border-radius:8px;border:1px solid ${t.send_invite_email?'rgba(99,102,241,0.35)':'var(--dark-border)'};background:${t.send_invite_email?'rgba(99,102,241,0.08)':'transparent'};transition:all 0.15s;" id="td-invite-lbl">
              <input type="checkbox" id="td-send-invite" ${t.send_invite_email?'checked':''} style="accent-color:#6366f1;"> <i class="ph ph-envelope"></i> Enviar convite por e-mail
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.84rem;padding:0.5rem 0.75rem;border-radius:8px;border:1px solid ${t.send_summary_email?'rgba(16,185,129,0.35)':'var(--dark-border)'};background:${t.send_summary_email?'rgba(16,185,129,0.08)':'transparent'};transition:all 0.15s;" id="td-summary-lbl">
              <input type="checkbox" id="td-send-summary" ${t.send_summary_email?'checked':''} style="accent-color:#10b981;"> <i class="ph ph-receipt"></i> Enviar resumo ao concluir
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.84rem;padding:0.5rem 0.75rem;border-radius:8px;border:1px solid ${t.send_recording_email?'rgba(239,68,68,0.35)':'var(--dark-border)'};background:${t.send_recording_email?'rgba(239,68,68,0.08)':'transparent'};transition:all 0.15s;" id="td-recording-lbl">
              <input type="checkbox" id="td-send-recording" ${t.send_recording_email?'checked':''} style="accent-color:#ef4444;"> <i class="ph ph-record"></i> Avisar sobre gravação disponível
            </label>
          </div>
        </div>

        <!-- ─── TAB: PRÓXIMO PASSO ─── -->
        <div class="tb-card-panel" id="tb-tab-proximo">

          <!-- Contextual hint -->
          <div style="display:flex;align-items:flex-start;gap:0.55rem;padding:0.65rem 0.85rem;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.13);border-radius:8px;margin-bottom:1.1rem;font-size:0.79rem;color:var(--text-muted);line-height:1.45;">
            <i class="ph ph-lightbulb" style="color:#10b981;font-size:1rem;flex-shrink:0;margin-top:1px;"></i>
            <span>Defina a <strong style="color:var(--text-main);">ação que deve ocorrer após esta atividade</strong> — como um follow-up, envio de proposta ou nova reunião. Salvo junto com "Salvar Alterações".</span>
          </div>

          <!-- Form -->
          <div style="background:linear-gradient(135deg,rgba(16,185,129,0.06),rgba(16,185,129,0.01));border:1px solid rgba(16,185,129,0.15);border-radius:12px;padding:1.2rem;">
            <div class="input-group tb-field" style="margin-bottom:0.8rem;">
              <label style="font-weight:600;">O que fazer a seguir?</label>
              <input type="text" id="td-next-step" class="input-control" value="${nextStep.replace(/"/g,'&quot;')}" placeholder="Ex: Ligar na segunda, Enviar proposta, Agendar demo...">
            </div>
            <div class="input-group tb-field" style="margin-bottom:0.8rem;">
              <label>Prazo</label>
              <input type="date" id="td-next-step-date" class="input-control" value="${nextStepDate}">
            </div>
            <div class="tb-field">
              <label style="font-size:0.72rem;color:var(--text-muted);font-weight:500;display:block;margin-bottom:0.5rem;">Quem executa?</label>
              <div style="margin-bottom:0.35rem;">
                <span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">Adicionar via:</span>
              </div>
              <div style="display:flex;gap:0.4rem;margin-bottom:0.3rem;flex-wrap:wrap;">
                <button type="button" class="td-nxt-mode-btn active" data-mode="user" style="padding:0.28rem 0.65rem;border-radius:20px;border:1px solid rgba(16,185,129,0.5);background:rgba(16,185,129,0.12);color:#10b981;font-size:0.76rem;cursor:pointer;font-weight:600;transition:all 0.15s;"><i class="ph ph-at"></i> @usuário</button>
                <button type="button" class="td-nxt-mode-btn" data-mode="email" style="padding:0.28rem 0.65rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.76rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-envelope"></i> E-mail</button>
                <button type="button" class="td-nxt-mode-btn" data-mode="whatsapp" style="padding:0.28rem 0.65rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.76rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-whatsapp-logo"></i> WhatsApp</button>
              </div>
              <div style="font-size:0.68rem;color:var(--text-muted);opacity:0.65;margin-bottom:0.5rem;">Combine tipos livremente — usuário + e-mail + WhatsApp</div>
              <div style="display:flex;gap:0.5rem;position:relative;">
                <input type="text" id="td-nxt-input" class="input-control" placeholder="Buscar usuário..." autocomplete="off" style="flex:1;">
                <div id="td-nxt-dropdown" style="display:none;position:absolute;top:100%;left:0;right:3rem;z-index:200;background:var(--glass-bg,#1a2035);border:1px solid var(--dark-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:150px;overflow-y:auto;margin-top:2px;"></div>
                <button type="button" id="td-nxt-add-btn" style="padding:0.45rem 0.8rem;border-radius:8px;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.1);color:#10b981;cursor:pointer;font-size:0.82rem;"><i class="ph ph-plus"></i></button>
              </div>
              <div id="td-nxt-chips" style="margin-top:0.55rem;display:flex;flex-wrap:wrap;gap:0.35rem;">
                ${(t.activity_next_step_responsibles||[]).map(r=>`
                  <span class="td-nxt-chip" data-id="${r.user_id||r.id||''}" data-type="user" style="display:inline-flex;align-items:center;gap:0.35rem;padding:0.22rem 0.6rem;border-radius:20px;font-size:0.76rem;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#10b981;">
                    <i class="ph ph-user"></i>${r.user_id||''}
                    <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;margin-left:2px;font-size:0.9rem;">×</button>
                  </span>`).join('')}
              </div>
            </div>
          </div>

          <!-- Preview do salvo (apenas quando há dado) -->
          ${nextStep ? `
          <div style="margin-top:0.9rem;padding:0.7rem 0.9rem;background:rgba(16,185,129,0.05);border-left:3px solid #10b981;border-radius:0 8px 8px 0;display:flex;align-items:flex-start;gap:0.55rem;">
            <i class="ph ph-check-circle" style="color:#10b981;flex-shrink:0;margin-top:2px;"></i>
            <div style="flex:1;font-size:0.82rem;">
              <div style="font-weight:600;color:var(--text-main);">${nextStep}</div>
              <div style="color:var(--text-muted);margin-top:0.2rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
                ${nextStepDate ? `<span><i class="ph ph-calendar"></i> ${new Date(nextStepDate+'T12:00:00').toLocaleDateString('pt-BR')}</span>` : ''}
                ${nextStepResp ? `<span><i class="ph ph-user"></i> ${nextStepResp}</span>` : ''}
              </div>
            </div>
            <span style="font-size:0.7rem;color:#10b981;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Salvo</span>
          </div>` : ''}
        </div>

        <!-- ─── TAB: LEMBRETE ─── -->
        <div class="tb-card-panel" id="tb-tab-lembrete" data-activity-dt="${dtLocal}">

          <!-- Contextual hint -->
          <div style="display:flex;align-items:flex-start;gap:0.55rem;padding:0.65rem 0.85rem;background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.13);border-radius:8px;margin-bottom:1.1rem;font-size:0.79rem;color:var(--text-muted);line-height:1.45;">
            <i class="ph ph-bell" style="color:#f59e0b;font-size:1rem;flex-shrink:0;margin-top:1px;"></i>
            <span>Receba uma notificação para não esquecer de agir. O lembrete é enviado no horário que você definir abaixo.</span>
          </div>

          <!-- Quick presets -->
          <div style="margin-bottom:0.9rem;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;">Lembrar com antecedência</div>
            <div style="display:flex;gap:0.45rem;flex-wrap:wrap;" id="td-reminder-presets">
              <button type="button" class="tb-reminder-preset" data-offset="-15" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.07);color:#f59e0b;font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">15 min antes</button>
              <button type="button" class="tb-reminder-preset" data-offset="-60" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.07);color:#f59e0b;font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">1 hora antes</button>
              <button type="button" class="tb-reminder-preset" data-offset="-1440" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.07);color:#f59e0b;font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">1 dia antes</button>
              <button type="button" class="tb-reminder-preset" data-offset="0" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.07);color:#f59e0b;font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">Na data</button>
              <button type="button" class="tb-reminder-preset" data-offset="custom" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">Personalizado</button>
            </div>
          </div>

          <!-- Datetime input + channels -->
          <div style="background:linear-gradient(135deg,rgba(245,158,11,0.07),rgba(245,158,11,0.01));border:1px solid rgba(245,158,11,0.15);border-radius:12px;padding:1.2rem;margin-bottom:1rem;">
            <div class="input-group tb-field" style="margin-bottom:0.9rem;">
              <label>Data e Hora do Lembrete</label>
              <input type="datetime-local" id="td-reminder-at" class="input-control" value="${reminderAt}">
            </div>
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;">Notificar por</div>
              <div style="display:flex;gap:1rem;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:0.45rem;cursor:pointer;font-size:0.84rem;padding:0.4rem 0.8rem;border-radius:8px;border:1px solid ${t.reminder_email?'rgba(99,102,241,0.35)':'var(--dark-border)'};background:${t.reminder_email?'rgba(99,102,241,0.08)':'transparent'};transition:all 0.15s;" id="td-email-label">
                  <input type="checkbox" id="td-reminder-email" ${t.reminder_email?'checked':''} style="width:14px;height:14px;accent-color:var(--primary,#6366f1);cursor:pointer;">
                  <i class="ph ph-envelope" style="color:#6366f1;"></i> E-mail
                </label>
                <label style="display:flex;align-items:center;gap:0.45rem;cursor:pointer;font-size:0.84rem;padding:0.4rem 0.8rem;border-radius:8px;border:1px solid ${t.reminder_whatsapp?'rgba(37,211,102,0.35)':'var(--dark-border)'};background:${t.reminder_whatsapp?'rgba(37,211,102,0.08)':'transparent'};transition:all 0.15s;" id="td-wpp-label">
                  <input type="checkbox" id="td-reminder-wpp" ${t.reminder_whatsapp?'checked':''} style="width:14px;height:14px;accent-color:#25d366;cursor:pointer;">
                  <i class="ph ph-whatsapp-logo" style="color:#25d366;"></i> WhatsApp
                </label>
              </div>
            </div>
          </div>

          <!-- Confirmação quando lembrete está salvo -->
          ${reminderAt ? `
          <div style="padding:0.85rem 1rem;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.18);border-radius:10px;display:flex;align-items:center;gap:0.75rem;">
            <i class="ph ph-bell-ringing" style="font-size:1.5rem;color:#f59e0b;flex-shrink:0;"></i>
            <div style="flex:1;">
              <div style="font-size:0.72rem;color:var(--text-muted);">Lembrete agendado para</div>
              <div style="font-weight:700;color:#f59e0b;font-size:0.95rem;">${new Date(reminderAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</div>
              <div style="font-size:0.74rem;color:var(--text-muted);margin-top:0.15rem;display:flex;gap:0.5rem;">
                ${t.reminder_email ? '<span><i class="ph ph-envelope"></i> E-mail</span>' : ''}
                ${t.reminder_whatsapp ? '<span><i class="ph ph-whatsapp-logo"></i> WhatsApp</span>' : ''}
              </div>
            </div>
            <span style="font-size:0.7rem;color:#f59e0b;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Salvo</span>
          </div>` : ''}
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
            // Carregar sess\u00f5es ao abrir aba Tempo
            if (btn.dataset.tab === 'tempo') _loadTimeLogs(t.id);
        });
    });

    // ── fun\u00e7\u00e3o: carregar e renderizar tabela de sess\u00f5es ─────────────────────────
    async function _loadTimeLogs(activityId) {
        const tbody = document.getElementById('td-time-logs-body');
        if (!tbody) return;
        try {
            const res = await fetch(`/api/activities/${activityId}/time-logs`);
            if (!res.ok) throw new Error('Erro ao buscar sess\u00f5es');
            const logs = await res.json();

            if (!logs || logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:1.2rem;color:var(--text-muted);font-size:0.8rem;"><i class="ph ph-clock-countdown" style="font-size:1.4rem;display:block;margin:0 auto 0.4rem;"></i>Nenhuma sess\u00e3o registrada ainda.</td></tr>`;
                return;
            }

            tbody.innerHTML = logs.map(log => {
                const dt = new Date(log.started_at);
                const dateFmt = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const timeFmt = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const h = Math.floor(log.duration_minutes / 60);
                const m = log.duration_minutes % 60;
                const durFmt = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`;
                const subj = log.subject ? log.subject.replace(/"/g, '&quot;') : '';
                return `<tr data-log-id="${log.id}" style="border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
                  <td style="padding:0.45rem 0.6rem;color:var(--text-main);white-space:nowrap;">${dateFmt}</td>
                  <td style="padding:0.45rem 0.6rem;color:var(--text-muted);white-space:nowrap;">${timeFmt}</td>
                  <td style="padding:0.45rem 0.6rem;white-space:nowrap;">
                    <span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.15rem 0.5rem;border-radius:5px;background:rgba(99,102,241,0.1);color:#818cf8;font-size:0.78rem;font-weight:600;border:1px solid rgba(99,102,241,0.25);">
                      <i class="ph ph-clock"></i>${durFmt}
                    </span>
                  </td>
                  <td style="padding:0.35rem 0.6rem;">
                    <input type="text" class="td-tl-subject" data-log-id="${log.id}"
                      value="${subj}"
                      placeholder="Adicionar assunto..."
                      style="background:transparent;border:1px solid transparent;border-radius:5px;padding:0.2rem 0.45rem;font-size:0.81rem;color:var(--text-main);width:100%;min-width:120px;transition:all 0.15s;outline:none;"
                      onfocus="this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='rgba(99,102,241,0.35)';"
                      onblur="this.style.background='transparent';this.style.borderColor='transparent';">
                  </td>
                  <td style="padding:0.35rem 0.3rem;text-align:center;">
                    <button type="button" class="td-tl-del" data-log-id="${log.id}"
                      style="background:none;border:none;cursor:pointer;color:rgba(239,68,68,0.5);font-size:0.9rem;padding:0.15rem 0.3rem;border-radius:4px;transition:all 0.15s;line-height:1;"
                      title="Remover sess\u00e3o"
                      onmouseover="this.style.color='#ef4444';this.style.background='rgba(239,68,68,0.08)';"
                      onmouseout="this.style.color='rgba(239,68,68,0.5)';this.style.background='none';">
                      <i class="ph ph-trash"></i>
                    </button>
                  </td>
                </tr>`;
            }).join('');

            // Editar assunto (debounced)
            let _subDebT = null;
            tbody.querySelectorAll('.td-tl-subject').forEach(inp => {
                inp.addEventListener('input', () => {
                    clearTimeout(_subDebT);
                    _subDebT = setTimeout(async () => {
                        try {
                            await fetch(`/api/activities/time-logs/${inp.dataset.logId}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ subject: inp.value }),
                            });
                        } catch(e) { console.warn('[time-log] erro ao salvar assunto', e); }
                    }, 600);
                });
            });

            // Excluir sessão — confirmação inline (sem confirm() para não fechar overlay)
            tbody.querySelectorAll('.td-tl-del').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const logId = btn.dataset.logId;
                    const td = btn.closest('td');
                    if (!td) return;

                    // Já está em modo confirmação?
                    if (btn.dataset.confirming === '1') return;
                    btn.dataset.confirming = '1';

                    // Guarda o conteúdo original e mostra mini-confirmação
                    const origHtml = td.innerHTML;
                    td.innerHTML = `
                        <div style="display:flex;align-items:center;gap:0.4rem;white-space:nowrap;">
                            <span style="font-size:0.75rem;color:var(--text-muted);">Remover?</span>
                            <button type="button" id="tl-confirm-yes-${logId}" style="padding:0.15rem 0.5rem;border-radius:4px;border:1px solid rgba(239,68,68,0.5);background:rgba(239,68,68,0.12);color:#ef4444;font-size:0.75rem;cursor:pointer;font-weight:600;">Sim</button>
                            <button type="button" id="tl-confirm-no-${logId}" style="padding:0.15rem 0.5rem;border-radius:4px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.75rem;cursor:pointer;">Não</button>
                        </div>`;

                    // Cancelar
                    document.getElementById(`tl-confirm-no-${logId}`)?.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        _loadTimeLogs(activityId); // re-renderiza com listeners frescos
                    });


                    // Confirmar
                    document.getElementById(`tl-confirm-yes-${logId}`)?.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        try {
                            await fetch(`/api/activities/time-logs/${logId}`, { method: 'DELETE' });
                            _loadTimeLogs(activityId);
                        } catch(err) { utils.showToast('Erro ao remover sessão', 'error'); }
                    });
                });
            });


        } catch(e) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:1rem;color:#ef4444;font-size:0.8rem;">Erro ao carregar sess\u00f5es.</td></tr>`;
        }
    }

    // Carregar imediatamente se aba Tempo for a padr\u00e3o
    if (defaultTab === 'tempo') _loadTimeLogs(t.id);



    // ── toggle tab Reunião quando tipo muda ───────────────────────────────────
    document.getElementById('td-type')?.addEventListener('change', (e) => {
        const tabBtn = overlay.querySelector('.tb-tab-reuniao');
        if (tabBtn) tabBtn.style.display = e.target.value === 'Reunião' ? 'flex' : 'none';
    });

    // ── Autocomplete empresa ──────────────────────────────────────────────────
    (function() {
        let _debT = null;
        const srch = document.getElementById('td-company-search');
        const drop = document.getElementById('td-company-dropdown');
        const hid  = document.getElementById('td-company-id');
        if (!srch || !drop) return;
        async function _fetchCo(q) {
            try {
                const res = await fetch(`/api/companies/search?q=${encodeURIComponent(q)}&limit=10`);
                if (!res.ok) return;
                const list = await res.json();
                if (!list.length) { drop.style.display='none'; return; }
                drop.innerHTML = list.map(c=>`
                    <div class="td-co-opt" data-id="${c.id}" data-name="${c.Nome_da_empresa}"
                        style="padding:0.5rem 0.85rem;cursor:pointer;font-size:0.84rem;display:flex;align-items:center;gap:0.5rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <i class="ph ph-building-office" style="color:var(--primary);flex-shrink:0;"></i>
                        <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.Nome_da_empresa}</span>
                        ${c.Status?`<span style="font-size:0.7rem;color:var(--text-muted);">${c.Status}</span>`:''}
                    </div>`).join('');
                drop.style.display='block';
                drop.querySelectorAll('.td-co-opt').forEach(el=>{
                    el.addEventListener('mouseover',()=>el.style.background='rgba(99,102,241,0.12)');
                    el.addEventListener('mouseout',()=>el.style.background='');
                    el.addEventListener('mousedown',ev=>{ ev.preventDefault(); hid.value=el.dataset.id; srch.value=el.dataset.name; drop.style.display='none'; });
                });
            } catch { drop.style.display='none'; }
        }
        srch.addEventListener('focus', ()=>{ if(!hid.value) _fetchCo(''); });
        srch.addEventListener('input', ()=>{ hid.value=''; clearTimeout(_debT); _debT=setTimeout(()=>_fetchCo(srch.value),250); });
        srch.addEventListener('blur',  ()=>{ setTimeout(()=>drop.style.display='none',200); });
    })();

    // ── Componente Participantes ──────────────────────────────────────────────
    (function() {
        let _partMode = 'user', _usuarios = [], _debT = null;
        fetch('/api/usuarios').then(r=>r.ok?r.json():[]).then(l=>{ _usuarios=l; }).catch(()=>{});

        overlay.querySelectorAll('.td-part-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _partMode = btn.dataset.mode;
                overlay.querySelectorAll('.td-part-mode-btn').forEach(b => {
                    const on = b.dataset.mode === _partMode;
                    b.style.background = on?'rgba(99,102,241,0.15)':'transparent';
                    b.style.borderColor = on?'rgba(99,102,241,0.5)':'var(--dark-border)';
                    b.style.color = on?'#818cf8':'var(--text-muted)';
                    b.style.fontWeight = on?'600':'500';
                });
                const inp = overlay.querySelector('#td-part-input');
                if(inp){ 
                    inp.placeholder = {user:'Buscar usuário...', email:'Ex: fulano@email.com', whatsapp:'Ex: 11999998888'}[_partMode]||''; 
                    inp.value=''; 
                }
                const drop = overlay.querySelector('#td-part-dropdown');
                if(drop) drop.style.display='none';
            });
        });

        const partInput = overlay.querySelector('#td-part-input');
        const partDrop  = overlay.querySelector('#td-part-dropdown');
        if (partInput && partDrop) {
            const showDrop = q => {
                if(_partMode!=='user'){ partDrop.style.display='none'; return; }
                const m = _usuarios.filter(u=>u.nome.toLowerCase().includes(q.toLowerCase())).slice(0,6);
                if(!m.length){ partDrop.style.display='none'; return; }
                partDrop.innerHTML = m.map(u=>`<div class="tdpu-opt" data-id="${u.id}" data-nome="${u.nome}" style="padding:0.45rem 0.75rem;cursor:pointer;font-size:0.83rem;display:flex;align-items:center;gap:0.5rem;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="width:26px;height:26px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:700;flex-shrink:0;">${u.nome[0]}</span>${u.nome}</div>`).join('');
                partDrop.style.display='block';
                partDrop.querySelectorAll('.tdpu-opt').forEach(el=>{
                    el.addEventListener('mouseover',()=>el.style.background='rgba(99,102,241,0.1)');
                    el.addEventListener('mouseout',()=>el.style.background='');
                    el.addEventListener('mousedown',ev=>{ev.preventDefault();addPartChip(el.dataset.id,el.dataset.nome,'user');partInput.value='';partDrop.style.display='none';});
                });
            };
            partInput.addEventListener('input',()=>{ clearTimeout(_debT); _debT=setTimeout(()=>showDrop(partInput.value),200); });
            partInput.addEventListener('focus',()=>{ if(_partMode==='user') showDrop(partInput.value); });
            partInput.addEventListener('blur', ()=>{ setTimeout(()=>partDrop.style.display='none',200); });

            // Suporte ao Enter no input de participantes
            partInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const v = partInput.value.trim();
                    if (v) {
                        addPartChip(v, v, _partMode);
                        partInput.value = '';
                        partDrop.style.display = 'none';
                    }
                }
            });
        }

        function addPartChip(id, label, type) {
            const chips = document.getElementById('td-participants-chips'); if(!chips) return;
            const icons = {user:'ph-user',email:'ph-envelope',whatsapp:'ph-whatsapp-logo'};
            const styles = {user:'rgba(99,102,241,0.12)|rgba(99,102,241,0.3)|#818cf8',email:'rgba(6,182,212,0.12)|rgba(6,182,212,0.3)|#22d3ee',whatsapp:'rgba(37,211,102,0.1)|rgba(37,211,102,0.3)|#25d366'};
            const [bg,bdr,clr] = (styles[type]||styles.user).split('|');
            const sp = document.createElement('span');
            sp.className='td-part-chip'; sp.dataset.id=id; sp.dataset.type=type;
            sp.style.cssText=`display:inline-flex;align-items:center;gap:0.35rem;padding:0.22rem 0.6rem;border-radius:20px;font-size:0.76rem;background:${bg};border:1px solid ${bdr};color:${clr};`;
            sp.innerHTML=`<i class="ph ${icons[type]||'ph-user'}"></i>${label}<button type="button" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;margin-left:2px;font-size:0.9rem;">×</button>`;
            sp.querySelector('button').addEventListener('click',()=>sp.remove());
            chips.appendChild(sp);
        }

        overlay.querySelector('#td-part-add-btn')?.addEventListener('click',()=>{
            const v = overlay.querySelector('#td-part-input')?.value?.trim(); 
            if(!v) return;
            addPartChip(v, v, _partMode); 
            const inp = overlay.querySelector('#td-part-input');
            if (inp) inp.value='';
        });
    })();

    // ── Componente Quem Executa (Próximo Passo) ───────────────────────────────
    (function() {
        let _nxtMode = 'user', _usuarios = [], _debT = null;
        fetch('/api/usuarios').then(r=>r.ok?r.json():[]).then(l=>{ _usuarios=l; }).catch(()=>{});

        overlay.querySelectorAll('.td-nxt-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _nxtMode = btn.dataset.mode;
                overlay.querySelectorAll('.td-nxt-mode-btn').forEach(b => {
                    const on = b.dataset.mode === _nxtMode;
                    b.style.background = on?'rgba(16,185,129,0.12)':'transparent';
                    b.style.borderColor = on?'rgba(16,185,129,0.5)':'var(--dark-border)';
                    b.style.color = on?'#10b981':'var(--text-muted)';
                    b.style.fontWeight = on?'600':'500';
                });
                const inp = overlay.querySelector('#td-nxt-input');
                if(inp){ 
                    inp.placeholder = {user:'Buscar usuário...', email:'Ex: fulano@email.com', whatsapp:'Ex: 11999998888'}[_nxtMode]||''; 
                    inp.value=''; 
                }
                const drop = overlay.querySelector('#td-nxt-dropdown');
                if(drop) drop.style.display='none';
            });
        });

        const nxtInput = overlay.querySelector('#td-nxt-input');
        const nxtDrop  = overlay.querySelector('#td-nxt-dropdown');
        if (nxtInput && nxtDrop) {
            const showDrop = q => {
                if(_nxtMode!=='user'){ nxtDrop.style.display='none'; return; }
                const m = _usuarios.filter(u=>u.nome.toLowerCase().includes(q.toLowerCase())).slice(0,5);
                if(!m.length){ nxtDrop.style.display='none'; return; }
                nxtDrop.innerHTML = m.map(u=>`<div class="tdnu-opt" data-id="${u.id}" data-nome="${u.nome}" style="padding:0.42rem 0.7rem;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.45rem;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="width:24px;height:24px;border-radius:50%;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.67rem;font-weight:700;flex-shrink:0;">${u.nome[0]}</span>${u.nome}</div>`).join('');
                nxtDrop.style.display='block';
                nxtDrop.querySelectorAll('.tdnu-opt').forEach(el=>{
                    el.addEventListener('mouseover',()=>el.style.background='rgba(16,185,129,0.1)');
                    el.addEventListener('mouseout',()=>el.style.background='');
                    el.addEventListener('mousedown',ev=>{ev.preventDefault();addNxtChip(el.dataset.id,el.dataset.nome,'user');nxtInput.value='';nxtDrop.style.display='none';});
                });
            };
            nxtInput.addEventListener('input',()=>{ clearTimeout(_debT); _debT=setTimeout(()=>showDrop(nxtInput.value),200); });
            nxtInput.addEventListener('focus',()=>{ if(_nxtMode==='user') showDrop(nxtInput.value); });
            nxtInput.addEventListener('blur', ()=>{ setTimeout(()=>nxtDrop.style.display='none',200); });

            // Suporte ao Enter no input de próximo passo
            nxtInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const v = nxtInput.value.trim();
                    if (v) {
                        addNxtChip(v, v, _nxtMode);
                        nxtInput.value = '';
                        nxtDrop.style.display = 'none';
                    }
                }
            });
        }

        function addNxtChip(id, label, type) {
            const chips = document.getElementById('td-nxt-chips'); if(!chips) return;
            const icons = {user:'ph-user',email:'ph-envelope',whatsapp:'ph-whatsapp-logo'};
            const styles = {user:'rgba(16,185,129,0.12)|rgba(16,185,129,0.3)|#10b981',email:'rgba(6,182,212,0.12)|rgba(6,182,212,0.3)|#22d3ee',whatsapp:'rgba(37,211,102,0.1)|rgba(37,211,102,0.3)|#25d366'};
            const [bg,bdr,clr] = (styles[type]||styles.user).split('|');
            const sp = document.createElement('span');
            sp.className='td-nxt-chip'; sp.dataset.id=id; sp.dataset.type=type;
            sp.style.cssText=`display:inline-flex;align-items:center;gap:0.35rem;padding:0.22rem 0.6rem;border-radius:20px;font-size:0.76rem;background:${bg};border:1px solid ${bdr};color:${clr};`;
            sp.innerHTML=`<i class="ph ${icons[type]||'ph-user'}"></i>${label}<button type="button" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;margin-left:2px;font-size:0.9rem;">×</button>`;
            sp.querySelector('button').addEventListener('click',()=>sp.remove());
            chips.appendChild(sp);
        }

        overlay.querySelector('#td-nxt-add-btn')?.addEventListener('click',()=>{
            const v = overlay.querySelector('#td-nxt-input')?.value?.trim(); 
            if(!v) return;
            addNxtChip(v, v, _nxtMode); 
            const inp = overlay.querySelector('#td-nxt-input');
            if (inp) inp.value='';
        });
    })();

    // ── reminder presets ──────────────────────────────────────────────────────
    overlay.querySelectorAll('.tb-reminder-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const reminderInput = document.getElementById('td-reminder-at');
            const offset = btn.dataset.offset;
            if (offset === 'custom') { reminderInput.focus(); return; }
            const tabEl = document.getElementById('tb-tab-lembrete');
            const actDt = tabEl?.dataset.activityDt;
            const base = actDt ? new Date(actDt) : new Date();
            base.setMinutes(base.getMinutes() + parseInt(offset, 10));
            const iso = new Date(base.getTime() - base.getTimezoneOffset()*60000).toISOString().slice(0,16);
            reminderInput.value = iso;
        });
        btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.75'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    });

    // ── reminder channel toggle style ─────────────────────────────────────────
    ['td-reminder-email','td-reminder-wpp'].forEach(id => {
        const chk = document.getElementById(id);
        const lbl = document.getElementById(id === 'td-reminder-email' ? 'td-email-label' : 'td-wpp-label');
        if (!chk || !lbl) return;
        const [borderOn, bgOn] = id === 'td-reminder-email'
            ? ['rgba(99,102,241,0.35)','rgba(99,102,241,0.08)']
            : ['rgba(37,211,102,0.35)','rgba(37,211,102,0.08)'];
        chk.addEventListener('change', () => {
            lbl.style.borderColor = chk.checked ? borderOn : 'var(--dark-border)';
            lbl.style.background  = chk.checked ? bgOn     : 'transparent';
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

    // ── sino do header → aba Lembrete ─────────────────────────────────────────
    document.getElementById('tb-header-bell')?.addEventListener('click', () => {
        const tabBtn = overlay.querySelector('[data-tab="lembrete"]');
        if (tabBtn) tabBtn.click();
    });

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
    document.getElementById('td-timer-stop').addEventListener('click', async () => {
        const gt = gTimer.getTimerState();
        if (gt.activityId !== t.id) return;
        const sessionStartedAt = gt.sessionStartedAt
            ? new Date(gt.sessionStartedAt).toISOString()
            : new Date(Date.now() - gt.sec * 1000).toISOString();
        const totalSec = gTimer.stopTimer();
        _timerSec  = totalSec;
        _timerState = 'idle';
        const durMin = Math.ceil(totalSec / 60);
        const minEl = document.getElementById('td-time-min');
        if (minEl) minEl.value = durMin;
        const disp = document.getElementById('td-timer-display');
        if (disp) disp.textContent = _fmtTimer(totalSec);
        _syncBtnVisibility();
        utils.showToast(`Tempo registrado: ${_tbFmtMin(durMin)}`, 'success');
        // Criar sessão no banco
        if (durMin > 0) {
            try {
                await fetch(`/api/activities/${t.id}/time-logs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        started_at: sessionStartedAt instanceof Date ? sessionStartedAt.toISOString() : new Date(sessionStartedAt).toISOString(),
                        duration_minutes: durMin,
                        subject: '',
                    }),
                });
                _loadTimeLogs(t.id);
            } catch(e) { console.warn('[time-log] erro ao salvar sessão', e); }
        }
    });

    // ── delete (somente modo edição) ──────────────────────────────────────────
    if (!isCreateMode) {
        document.getElementById('td-delete-btn')?.addEventListener('click', () => {
            confirmar(`Excluir a atividade "${t.title}"?`, async () => {
                try {
                    const r = await fetch(`/api/activities/${t.id}`, { method: 'DELETE' });
                    if (!r.ok) throw new Error('Erro ao excluir');
                    utils.showToast('Atividade excuída.', 'success');
                    window.dispatchEvent(new CustomEvent('journey:activity-changed', { detail: { action: 'delete', id } }));
                    _closeCard(); await _loadAndRender();
                } catch (err) { utils.showToast(err.message, 'error'); }
            });
        });
    }

    // ── save ──────────────────────────────────────────────────────────────────
    document.getElementById('td-save-btn').addEventListener('click', async () => {
        const saveBtn = document.getElementById('td-save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Salvando...';

        const timeManual = parseInt(document.getElementById('td-time-min')?.value || '0');
        const timeSpent  = timeManual > 0 ? timeManual : (_timerSec > 0 ? Math.ceil(_timerSec/60) : null);

        // Coleta participantes dos chips — envia user_id para tipo 'user', string bruta para email/whatsapp
        const participantChips = [...document.querySelectorAll('.td-part-chip')];
        const assigneeIds = participantChips
            .map(ch => ({ id: ch.dataset.id, type: ch.dataset.type }))
            .map(a => a.id)  // para tipo user: Clerk ID; para email/whatsapp: a string digitada
            .filter(Boolean);

        // Coleta responsáveis do próximo passo — idem
        const nxtChips = [...document.querySelectorAll('.td-nxt-chip')];
        const nxtResp = nxtChips
            .map(ch => ch.dataset.id)
            .filter(Boolean);

        // Empresa
        const companyId = document.getElementById('td-company-id')?.value || null;

        const titleVal = document.getElementById('td-title').value.trim();
        if (!titleVal) {
            utils.showToast('O título é obrigatório.', 'error');
            saveBtn.disabled = false;
            saveBtn.innerHTML = isCreateMode ? '<i class="ph ph-plus"></i> Criar Atividade' : '<i class="ph ph-floppy-disk"></i> Salvar Alterações';
            return;
        }

        try {
            const payload = {
                activity_type:     document.getElementById('td-type').value,
                status:            document.getElementById('td-status').value || null,
                priority:          document.getElementById('td-priority').value || null,
                activity_datetime: document.getElementById('td-datetime').value ? new Date(document.getElementById('td-datetime').value).toISOString() : null,
                title:             titleVal,
                description:       document.getElementById('td-desc').value.trim() || null,
                assignees:         assigneeIds,
                company_id:        companyId,
                time_spent_minutes: timeSpent,
                next_step_title:   document.getElementById('td-next-step')?.value?.trim() || null,
                next_step_date:    document.getElementById('td-next-step-date')?.value ? new Date(document.getElementById('td-next-step-date').value).toISOString() : null,
                next_step_responsibles: nxtResp,
                google_meet_link:  document.getElementById('td-meet-link')?.value?.trim() || null,
                recording_url:     document.getElementById('td-recording-url')?.value?.trim() || null,
                send_invite_email: document.getElementById('td-send-invite')?.checked || false,
                send_summary_email: document.getElementById('td-send-summary')?.checked || false,
                send_recording_email: document.getElementById('td-send-recording')?.checked || false,
                reminder_at:       document.getElementById('td-reminder-at').value ? new Date(document.getElementById('td-reminder-at').value).toISOString() : null,
                reminder_email:    document.getElementById('td-reminder-email').checked,
                reminder_whatsapp: document.getElementById('td-reminder-wpp').checked,
            };

            let r;
            if (isCreateMode) {
                r = await fetch('/api/activities', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
                });
            } else {
                r = await fetch(`/api/activities/${t.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
                });
            }

            if (!r.ok) { const err = await r.json().catch(() => ({ error: 'Erro desconhecido' })); throw new Error(err.error); }
            const savedActivity = await r.json().catch(() => null);

            utils.showToast(isCreateMode ? 'Atividade criada!' : 'Atividade atualizada!', 'success');
            window.dispatchEvent(new CustomEvent('journey:activity-changed', { detail: { action: isCreateMode ? 'create' : 'update', id: savedActivity?.id || t.id } }));
            _closeCard();
            if (onAfterSave) { await onAfterSave(savedActivity); } else { await _loadAndRender(); }
        } catch (err) {
            utils.showToast(err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.innerHTML = isCreateMode ? '<i class="ph ph-plus"></i> Criar Atividade' : '<i class="ph ph-floppy-disk"></i> Salvar Alterações';
        }
    });

    // ── Permissões de Edição ──────────────────────────────────────────────────
    const podeEditar = isCreateMode || (window.canDo ? window.canDo('company_edit.activities') : true);
    if (!podeEditar) {
        const cardBody = document.getElementById('tb-card-body');
        if (cardBody) {
            const blockOverlay = document.createElement('div');
            blockOverlay.style.cssText = 'position:absolute; inset:0; z-index:10; pointer-events:none; background:rgba(0,0,0,0);';
            cardBody.style.position = 'relative';
            cardBody.appendChild(blockOverlay);
            
            const banner = document.createElement('div');
            banner.className = 'edit-lock-banner';
            banner.style.cssText = `
                display:flex; align-items:center; gap:0.6rem;
                padding:0.6rem 1.8rem; font-size:0.75rem; 
                background:rgba(239,68,68,0.06); color:#ef4444; 
                border-bottom:1px solid rgba(239,68,68,0.22);
                border-top:1px solid rgba(239,68,68,0.22);
            `;
            banner.innerHTML = `<i class="ph ph-lock-key" style="font-size:1.1rem;"></i> <span>Modo somente leitura — você não tem permissão para editar atividades.</span>`;
            cardBody.parentElement.insertBefore(banner, cardBody);
        }

        const campos = Array.from(overlay.querySelectorAll('input, select, textarea, button:not(#tb-drawer-close):not(.tb-card-tab):not(#td-cancel-btn):not(#tb-header-bell)'));
        campos.forEach(el => {
            if (el.id === 'td-save-btn' || el.id === 'td-delete-btn') {
                el.disabled = true;
                el.style.opacity = '0.38';
                el.style.cursor = 'not-allowed';
                el.style.pointerEvents = 'auto'; // let hover for tooltip
                el.setAttribute('data-th-title', 'SEM PERMISSÃO');
                el.setAttribute('data-th-tooltip', 'Você não tem permissão para editar informações nesta seção.');
            } else {
                if (!el.disabled) {
                    el.disabled = true;
                    el.style.opacity = '0.6';
                }
                const targetTooltip = el.closest('.input-group') || el.closest('.tb-field') || el.parentElement;
                if (targetTooltip) {
                    targetTooltip.setAttribute('data-th-title', 'BLOQUEADO');
                    targetTooltip.setAttribute('data-th-tooltip', 'Você não tem permissão para salvar ou alterar estes campos.');
                    targetTooltip.style.cursor = 'not-allowed';
                }
            }
        });
    }
}




// ──────────────────────────────────────────────────────────────────────────────
// CRIAR NOVA ATIVIDADE
// ──────────────────────────────────────────────────────────────────────────────

export function openNewActivity() {
    const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    // Cria um objeto esqueleto que representa uma atividade vazia
    const skeleton = {
        id: null,
        title: '',
        description: '',
        activity_type: '',
        status: 'A Fazer',
        priority: null,
        activity_datetime: nowLocal + ':00.000Z', // placeholder — será sobrescrito pelo field
        companies: null,
        activity_assignees: [],
        activity_next_step_responsibles: [],
        next_step_title: '',
        next_step_date: null,
        reminder_at: null,
        reminder_email: false,
        reminder_whatsapp: false,
        google_meet_link: '',
        recording_url: '',
        send_invite_email: false,
        send_summary_email: false,
        send_recording_email: false,
        time_spent_minutes: 0,
    };
    _renderDetailDrawer(skeleton, 'info', true /* isCreateMode */);
}

function _openSimpleActivityModal() {
    const existing = document.getElementById('tb-activity-modal-overlay');
    if (existing) existing.remove();

    const TYPES   = ['Comentário','Reunião','Chamados HD','Chamados CS','Ação necessária','Outros'];
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
                <div class="input-group" style="margin-bottom:1rem;">
                    <label>Tipo de Atividade *</label>
                    <select id="tb-modal-type" class="input-control" required>
                        <option value="">Selecione...</option>
                        ${TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                </div>
                <div class="input-group" style="margin-bottom:1rem;">
                    <label>Título *</label>
                    <input type="text" id="tb-modal-title" class="input-control" required placeholder="Título da atividade">
                </div>
                <div class="input-group" style="margin-bottom:1rem;">
                    <label>Descrição *</label>
                    <textarea id="tb-modal-desc" class="input-control" rows="3" required placeholder="Descreva a atividade..."></textarea>
                </div>
                <div class="input-group" style="margin-bottom:1rem;">
                    <label>Data e Horário *</label>
                    <input type="datetime-local" id="tb-modal-datetime" class="input-control" required value="${nowLocal}">
                </div>
                <div class="input-group" style="margin-bottom:1rem;position:relative;">
                    <label style="display:flex;align-items:center;gap:0.4rem;">
                        <i class="ph ph-building-office" style="color:var(--primary);"></i>
                        Cliente Vinculado *
                    </label>
                    <div style="position:relative;">
                        <input type="text" id="tb-modal-company-search" class="input-control" placeholder="Buscar empresa..." autocomplete="off" style="padding-right:2rem;">
                        <i class="ph ph-magnifying-glass" style="position:absolute;right:0.7rem;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;font-size:0.9rem;"></i>
                    </div>
                    <div id="tb-company-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--glass-bg,#1a2035);border:1px solid var(--dark-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:200px;overflow-y:auto;margin-top:2px;"></div>
                    <input type="hidden" id="tb-modal-company-id">
                    <span id="tb-modal-company-hint" style="font-size:0.72rem;color:var(--text-muted);margin-top:0.25rem;display:block;">Digite para buscar o cliente desta atividade</span>
                </div>

                <div class="input-group" style="margin-bottom:1rem;">
                    <label>Participantes *</label>
                    <div style="display:flex;gap:0.4rem;margin-bottom:0.6rem;" id="tb-modal-part-modes">
                        <button type="button" class="tbm-part-mode active" data-mode="user" style="padding:0.28rem 0.65rem;border-radius:20px;border:1px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.15);color:#818cf8;font-size:0.76rem;cursor:pointer;font-weight:600;transition:all 0.15s;"><i class="ph ph-at"></i> @usuário</button>
                        <button type="button" class="tbm-part-mode" data-mode="email" style="padding:0.28rem 0.65rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.76rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-envelope"></i> E-mail</button>
                        <button type="button" class="tbm-part-mode" data-mode="whatsapp" style="padding:0.28rem 0.65rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.76rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-whatsapp-logo"></i> WhatsApp</button>
                    </div>
                    <div style="display:flex;gap:0.5rem;position:relative;">
                        <input type="text" id="tb-modal-part-input" class="input-control" placeholder="Buscar usuário..." autocomplete="off" style="flex:1;">
                        <div id="tb-modal-part-dropdown" style="display:none;position:absolute;top:100%;left:0;right:3rem;z-index:200;background:var(--glass-bg,#1a2035);border:1px solid var(--dark-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:150px;overflow-y:auto;margin-top:2px;"></div>
                        <button type="button" id="tb-modal-part-add" style="padding:0.45rem 0.8rem;border-radius:8px;border:1px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.1);color:#818cf8;cursor:pointer;font-size:0.82rem;"><i class="ph ph-plus"></i></button>
                    </div>
                    <div id="tb-modal-part-chips" style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.35rem;"></div>
                </div>

                <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin:1rem 0 0.75rem;padding-bottom:0.4rem;border-bottom:1px solid var(--dark-border);">Informações Opcionais</div>
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
                    const hint = document.getElementById('tb-modal-company-hint');
                    if(hint){ hint.textContent='✅ Vinculado: '+el.dataset.name; hint.style.color='#10b981'; }
                });
            });
        } catch { dropdown.style.display = 'none'; }
    }

    searchInput.addEventListener('focus',  () => { if (!hiddenId.value) _fetchCompanies(''); });
    searchInput.addEventListener('input',  () => { hiddenId.value = ''; clearTimeout(_debounceTimer); _debounceTimer = setTimeout(() => _fetchCompanies(searchInput.value), 250); });
    searchInput.addEventListener('blur',   () => { setTimeout(() => { dropdown.style.display = 'none'; }, 200); });

    // Participantes no modal
    let _mPartMode = 'user', _mUsuarios = [], _mDebT = null;
    fetch('/api/usuarios').then(r=>r.ok?r.json():[]).then(l=>{ _mUsuarios=l; }).catch(()=>{});

    overlay.querySelectorAll('.tbm-part-mode').forEach(btn => {
        btn.addEventListener('click', () => {
            _mPartMode = btn.dataset.mode;
            overlay.querySelectorAll('.tbm-part-mode').forEach(b => {
                const on = b.dataset.mode === _mPartMode;
                b.style.background = on?'rgba(99,102,241,0.15)':'transparent';
                b.style.borderColor = on?'rgba(99,102,241,0.5)':'var(--dark-border)';
                b.style.color = on?'#818cf8':'var(--text-muted)'; b.style.fontWeight=on?'600':'500';
            });
            const inp = document.getElementById('tb-modal-part-input');
            if(inp){ inp.placeholder={user:'Buscar usuário...',email:'Ex: fulano@email.com',whatsapp:'Ex: 11999998888'}[_mPartMode]||''; inp.value=''; }
            const drop = document.getElementById('tb-modal-part-dropdown');
            if(drop) drop.style.display='none';
        });
    });

    const mPartInput = document.getElementById('tb-modal-part-input');
    const mPartDrop  = document.getElementById('tb-modal-part-dropdown');
    if(mPartInput && mPartDrop) {
        const mShowDrop = q => {
            if(_mPartMode!=='user'){ mPartDrop.style.display='none'; return; }
            const m = _mUsuarios.filter(u=>u.nome.toLowerCase().includes(q.toLowerCase())).slice(0,6);
            if(!m.length){ mPartDrop.style.display='none'; return; }
            mPartDrop.innerHTML = m.map(u=>`<div class="tbmp-opt" data-id="${u.id}" data-nome="${u.nome}" style="padding:0.42rem 0.7rem;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.45rem;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.67rem;font-weight:700;flex-shrink:0;">${u.nome[0]}</span>${u.nome}</div>`).join('');
            mPartDrop.style.display='block';
            mPartDrop.querySelectorAll('.tbmp-opt').forEach(el=>{
                el.addEventListener('mouseover',()=>el.style.background='rgba(99,102,241,0.1)');
                el.addEventListener('mouseout',()=>el.style.background='');
                el.addEventListener('mousedown',ev=>{ev.preventDefault();mAddChip(el.dataset.id,el.dataset.nome,'user');mPartInput.value='';mPartDrop.style.display='none';});
            });
        };
        mPartInput.addEventListener('input',()=>{clearTimeout(_mDebT);_mDebT=setTimeout(()=>mShowDrop(mPartInput.value),200);});
        mPartInput.addEventListener('focus',()=>{ if(_mPartMode==='user') mShowDrop(mPartInput.value); });
        mPartInput.addEventListener('blur', ()=>{ setTimeout(()=>mPartDrop.style.display='none',200); });
    }

    function mAddChip(id, label, type) {
        const chips = document.getElementById('tb-modal-part-chips'); if(!chips) return;
        const icons = {user:'ph-user',email:'ph-envelope',whatsapp:'ph-whatsapp-logo'};
        const styles = {user:'rgba(99,102,241,0.12)|rgba(99,102,241,0.3)|#818cf8',email:'rgba(6,182,212,0.12)|rgba(6,182,212,0.3)|#22d3ee',whatsapp:'rgba(37,211,102,0.1)|rgba(37,211,102,0.3)|#25d366'};
        const [bg,bdr,clr] = (styles[type]||styles.user).split('|');
        const sp = document.createElement('span');
        sp.dataset.id=id; sp.dataset.type=type;
        sp.style.cssText=`display:inline-flex;align-items:center;gap:0.35rem;padding:0.22rem 0.6rem;border-radius:20px;font-size:0.76rem;background:${bg};border:1px solid ${bdr};color:${clr};`;
        sp.innerHTML=`<i class="ph ${icons[type]}"></i>${label}<button type="button" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;margin-left:2px;font-size:0.9rem;">×</button>`;
        sp.querySelector('button').addEventListener('click',()=>sp.remove());
        chips.appendChild(sp);
    }

    document.getElementById('tb-modal-part-add')?.addEventListener('click',()=>{
        const v=document.getElementById('tb-modal-part-input')?.value?.trim(); if(!v) return;
        mAddChip(v,v,_mPartMode); document.getElementById('tb-modal-part-input').value='';
    });

    // Submit
    document.getElementById('tb-activity-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type      = document.getElementById('tb-modal-type').value;
        const title     = document.getElementById('tb-modal-title').value.trim();
        const desc      = document.getElementById('tb-modal-desc').value.trim();
        const datetime  = document.getElementById('tb-modal-datetime').value;
        const status    = document.getElementById('tb-modal-status').value || null;
        const priority  = document.getElementById('tb-modal-priority').value || null;
        const companyId = document.getElementById('tb-modal-company-id').value || null;

        // Coleta participantes dos chips
        const partChips = [...document.querySelectorAll('#tb-modal-part-chips > span')];
        const assigneeNames = partChips.map(ch => {
            const nodes = [...ch.childNodes].filter(n=>n.nodeType===3);
            return nodes.map(n=>n.textContent.trim()).join('');
        }).filter(Boolean);

        if (!type || !title || !desc || !datetime) {
            utils.showToast('Preencha todos os campos obrigatórios (*)', 'error'); return;
        }

        const submitBtn = e.target.querySelector('[type=submit]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Salvando...';

        try {
            const res = await fetch('/api/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activity_type: type, title, description: desc,
                    activity_datetime: new Date(datetime).toISOString(),
                    status, priority,
                    company_id: companyId,
                    assignees: assigneeNames,
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
            utils.showToast(err.message, 'error');
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
    initTasksBoard, switchView, applyFilter, clearAllFilters, openNewActivity, openActivityDetail,
    deleteActivity, openColumnSort, closeColumnSort, setColumnSort,
    // Exposto para uso em outros módulos (activities.js) — mesmo modal exato
    renderActivityModal: (activity, isCreateMode = false, defaultTab = 'info', onAfterSave = null) => {
        // Permite sobrescrever o callback pós-save para outros módulos
        _renderDetailDrawer(activity, defaultTab, isCreateMode, onAfterSave);
    },
};

// ──────────────────────────────────────────────────────────────────────────────
// KANBAN COLUMN VTT CANVAS TOOLTIPS
// ──────────────────────────────────────────────────────────────────────────────

function _initKanbanColumnTooltips() {
    const W=300, H=169;
    const KB_COLS=[
        { label:'A Fazer',     color:'#818cf8' },
        { label:'Em And.',     color:'#f59e0b' },
        { label:'Concluída',   color:'#10b981' },
        { label:'Cancelada',   color:'#ef4444' },
    ];
    const COL_W=(W-24)/4, COL_GAP=4, COL_X0=12;

    function init(el){ const DPR=window.devicePixelRatio||1; el.width=300*DPR; el.height=169*DPR; el.style.width='300px'; el.style.height='169px'; const ctx=el.getContext('2d'); ctx.scale(DPR,DPR); return ctx; }
    function lerp(a,b,t){ return a+(b-a)*t; }
    function prog(f,s,e){ return Math.max(0,Math.min(1,(f-s)/(e-s)||0)); }

    function drawCursor(ctx,x,y,sc,pressing){
        ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=2; ctx.shadowOffsetX=1; ctx.shadowOffsetY=1;
        ctx.fillStyle=pressing?'rgba(200,200,200,0.95)':'rgba(255,255,255,0.97)';
        ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=0.7;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,11); ctx.lineTo(2.4,8.6);
        ctx.lineTo(4,12.4); ctx.lineTo(5.6,11.7); ctx.lineTo(4.1,7.9); ctx.lineTo(6.8,7.9);
        ctx.closePath(); ctx.fill(); ctx.shadowColor='transparent'; ctx.stroke(); ctx.restore();
    }

    function drawBoard(ctx, highlightIdx, movingCard, movingCardX, movingCardY) {
        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);

        KB_COLS.forEach((col,i)=>{
            const cx=COL_X0+i*(COL_W+COL_GAP);
            const isHL=i===highlightIdx;

            // Column bg
            ctx.fillStyle=isHL?col.color+'1e':'#141824';
            ctx.beginPath(); ctx.roundRect(cx,8,COL_W,H-16,5); ctx.fill();
            ctx.strokeStyle=isHL?col.color+'88':'#252c3d'; ctx.lineWidth=isHL?1:0.5;
            ctx.beginPath(); ctx.roundRect(cx,8,COL_W,H-16,5); ctx.stroke();

            // Header bar
            ctx.fillStyle=col.color+(isHL?'33':'1a');
            ctx.beginPath(); ctx.roundRect(cx,8,COL_W,16,5); ctx.fill();
            ctx.fillStyle=col.color; ctx.font='bold 4.5px system-ui'; ctx.textAlign='center';
            ctx.fillText(col.label,cx+COL_W/2,18.5); ctx.textAlign='left';

            // Static cards
            const cardCounts=[2,1,2,1];
            for(let j=0;j<cardCounts[i];j++){
                const cy=28+j*20;
                // Skip area when moving card
                if(movingCard && i===highlightIdx && j===cardCounts[i]-1) continue;
                ctx.fillStyle=isHL?'rgba(255,255,255,0.08)':'#1e2436';
                ctx.beginPath(); ctx.roundRect(cx+4,cy,COL_W-8,14,3); ctx.fill();
                ctx.strokeStyle=isHL?col.color+'44':'#252c3d'; ctx.lineWidth=0.5; ctx.stroke();
                const barW=(COL_W-12)*[0.8,0.6,0.7,0.75,0.5][j*2+i%3]||0.6;
                ctx.fillStyle=isHL?col.color+'66':'#3e4a5c'; ctx.fillRect(cx+7,cy+4,barW,3.5);
                ctx.fillStyle='#252c3d'; ctx.fillRect(cx+7,cy+9,barW*0.55,2.5);
            }
        });

        // Moving card floating above board
        if(movingCard){
            ctx.save();
            ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=8; ctx.shadowOffsetY=4;
            ctx.fillStyle=KB_COLS[highlightIdx].color+'22';
            ctx.beginPath(); ctx.roundRect(movingCardX,movingCardY,COL_W-4,14,3); ctx.fill();
            ctx.strokeStyle=KB_COLS[highlightIdx].color; ctx.lineWidth=1; ctx.stroke();
            ctx.shadowColor='transparent';
            ctx.fillStyle=KB_COLS[highlightIdx].color+'aa'; ctx.fillRect(movingCardX+4,movingCardY+4,(COL_W-16)*0.8,3.5);
            ctx.restore();
        }
    }

    function makeKanbanDrawer(canvasEl, colIdx) {
        const ctx = init(canvasEl);
        const targetCX = COL_X0 + colIdx*(COL_W+COL_GAP)+4;
        const targetCY = 28 + (['A Fazer','Em Andamento'].includes(KB_COLS[colIdx].label)?2:1)*20;
        // Start card from left column (or right for rightmost)
        const startCX = colIdx > 0 ? COL_X0+4 : COL_X0+(COL_W+COL_GAP)+4;
        const startCY = 28;

        return function drawFrame(f) {
            ctx.clearRect(0,0,W,H);
            const moving = f >= 60 && f < 360;
            const landed = f >= 360;
            let cardX=startCX, cardY=startCY;
            if(f>=60 && f<300){ const t=prog(f,60,300); cardX=lerp(startCX,targetCX,t); cardY=lerp(startCY,targetCY,t); }
            else if(f>=300){ cardX=targetCX; cardY=targetCY; }
            drawBoard(ctx, colIdx, moving||landed, cardX, cardY);

            // Cursor
            let cx,cy,pressing=false;
            if(f<40){ cx=startCX+8; cy=startCY+3; }
            else if(f<60){ const t=prog(f,40,60); cx=lerp(startCX+8,startCX+8,t); cy=lerp(startCY+3,startCY-2,t); pressing=true; }
            else if(f<300){ cx=lerp(startCX+8,targetCX+8,prog(f,60,300)); cy=lerp(startCY-2,targetCY-2,prog(f,60,300)); }
            else if(f<360){ cx=targetCX+8; cy=targetCY-2; pressing=false; }
            else if(f<400){ cx=targetCX+8; cy=targetCY-2+prog(f,360,400)*8; pressing=false; }
            else{ cx=targetCX+8; cy=targetCY+8; }
            drawCursor(ctx,cx,cy,pressing?0.85:1,pressing);
        };
    }

    // Wire all 4 columns
    for(let i=0;i<4;i++){
        const triggerEl = document.getElementById(`vcb-kb-${i}`);
        const tooltipEl = document.getElementById(`vct-kb-${i}`);
        const canvasEl  = document.getElementById(`vcc-kb-${i}`);
        const wrapEl    = document.getElementById(`vcw-kb-${i}`);
        if(!triggerEl||!tooltipEl||!canvasEl||!wrapEl) continue;

        const drawFrame = makeKanbanDrawer(canvasEl, i);
        let animId=null, frame=0, visible=false;

        function startAnim(idxCapture){ return function(){ frame=0; if(animId)cancelAnimationFrame(animId); (function tick(){ drawFrame(frame); frame=(frame+1)%540; animId=requestAnimationFrame(tick); })(); }; }
        function stopAnim(){ if(animId){cancelAnimationFrame(animId);animId=null;} }
        function show(wt,tt,ca,fi){
            return function(){ if(visible) return; visible=true;
                document.querySelectorAll('.vtt-tooltip.vtt-visible').forEach(t=>t.classList.remove('vtt-visible'));
                tt.classList.add('vtt-visible'); startAnim(fi)()();
                window._vttPulse?.seen(`kb-${fi}`); };
        }
        function hide(tt){ return function(e){ if(!document.getElementById(`vcw-kb-${tt._idx}`).contains(e.relatedTarget)){ visible=false; tt.classList.remove('vtt-visible'); stopAnim(); drawFrame(0); } }; }

        const _show = show(wrapEl,tooltipEl,canvasEl,i);
        tooltipEl._idx = i;
        const _hide = hide(tooltipEl);

        wrapEl.addEventListener('mouseenter', _show);
        wrapEl.addEventListener('mouseleave', (e)=>{ if(!wrapEl.contains(e.relatedTarget)){ visible=false; tooltipEl.classList.remove('vtt-visible'); stopAnim(); drawFrame(0); } });
        drawFrame(0);
        window._vttPulse?.add(wrapEl, `kb-${i}`);
    }
}

function _initViewToggleTooltips() {
    const W=300, H=169;
    function init(el){ const DPR=window.devicePixelRatio||1; el.width=W*DPR; el.height=H*DPR; el.style.width=W+'px'; el.style.height=H+'px'; const ctx=el.getContext('2d'); ctx.scale(DPR,DPR); return ctx; }
    function prog(f,s,e){ return Math.max(0,Math.min(1,(f-s)/(e-s)||0)); }
    function ease(t){ return t<.5 ? 2*t*t : -1+(4-2*t)*t; }

    // Kanban View Toggle Animation
    function drawKanbanToggle(ctx, f) {
        ctx.clearRect(0,0,W,H);
        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
        const cw=60, cg=12, y=30, ch=100;
        const cols = ['#6366f1','#f59e0b','#10b981'];
        cols.forEach((color, i) => {
            const x = 50 + i*(cw+cg);
            ctx.fillStyle='#141824'; ctx.beginPath(); ctx.roundRect(x,y,cw,ch,4); ctx.fill();
            ctx.strokeStyle=color+'44'; ctx.lineWidth=1; ctx.stroke();
            ctx.fillStyle=color+'33'; ctx.beginPath(); ctx.roundRect(x,y,cw,12,4); ctx.fill();
            for(let j=0; j<(i===1?1:2); j++){
                if(i===0 && j===1 && f>=40 && f<140) continue; // Moving card
                ctx.fillStyle='rgba(255,255,255,0.06)';
                ctx.beginPath(); ctx.roundRect(x+4,y+18+j*18,cw-8,14,2); ctx.fill();
            }
        });

        // Moving card logic
        if(f>=40 && f<200){
            const t = ease(prog(f,40,140));
            const x = 50 + 4 + t*(cw+cg);
            const cy = y + 18 + 18;
            ctx.save();
            ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=6; ctx.shadowOffsetY=3;
            ctx.fillStyle='rgba(150,150,200,0.2)';
            ctx.beginPath(); ctx.roundRect(x,cy,cw-8,14,2); ctx.fill();
            ctx.strokeStyle='#6366f1'; ctx.lineWidth=1; ctx.stroke();
            ctx.restore();
            // Cursor
            const cx = x + (cw-8)/2; const cy2 = cy + 7;
            ctx.save(); ctx.translate(cx,cy2); ctx.scale(0.8,0.8);
            ctx.fillStyle=f<140?'rgba(200,200,200,0.95)':'rgba(255,255,255,0.97)';
            ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=1;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,11); ctx.lineTo(2.4,8.6); ctx.lineTo(4,12.4); ctx.lineTo(5.6,11.7); ctx.lineTo(4.1,7.9); ctx.lineTo(6.8,7.9); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
        }
    }

    // Lista View Toggle Animation
    function drawListaToggle(ctx, f) {
        ctx.clearRect(0,0,W,H);
        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
        const y0=30;
        // Header
        ctx.fillStyle='#141824'; ctx.beginPath(); ctx.roundRect(20,y0,W-40,14,3); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1; ctx.stroke();

        ctx.fillStyle='rgba(255,255,255,0.3)';
        [25, 70, 150, 230].forEach(tx => ctx.fillRect(tx,y0+5,20,4));

        // Rows
        for(let i=0; i<4; i++){
            const y = y0 + 18 + i*16;
            const highlighted = (i===1 && f>=60 && f<160);
            ctx.fillStyle=highlighted?'rgba(99,102,241,0.1)':'transparent';
            ctx.beginPath(); ctx.roundRect(20,y,W-40,14,3); ctx.fill();
            if(highlighted){ ctx.strokeStyle='#6366f1'; ctx.stroke(); }
            
            ctx.fillStyle=highlighted?'#818cf8':'rgba(255,255,255,0.6)';
            ctx.fillRect(25,y+5, 30+Math.sin(i)*10,4);
            ctx.fillStyle=highlighted?'#c7d2fe':'rgba(255,255,255,0.4)';
            ctx.fillRect(70,y+5, 50+Math.cos(i)*20,3);
            ctx.fillRect(150,y+5, 40,3);
            ctx.fillRect(230,y+5, 25,3);
        }

        // Cursor hovers over row 1
        if(f>=20 && f<200){
            let cx=150, cy=100;
            if(f<60){ const t=ease(prog(f,20,60)); cx=lerp(150, W/2, t); cy=lerp(100, y0+18+16+7, t); }
            else if(f<160){ cx=W/2; cy=y0+18+16+7; }
            else{ const t=ease(prog(f,160,200)); cx=lerp(W/2,150,t); cy=lerp(y0+18+16+7,100,t); }
            
            ctx.save(); ctx.translate(cx,cy); ctx.scale(0.8,0.8);
            ctx.fillStyle=(f>=60&&f<160)?'rgba(200,200,200,0.95)':'rgba(255,255,255,0.97)';
            ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=1;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,11); ctx.lineTo(2.4,8.6); ctx.lineTo(4,12.4); ctx.lineTo(5.6,11.7); ctx.lineTo(4.1,7.9); ctx.lineTo(6.8,7.9); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
        }
    }

    function setup(id, drawerFunction, maxFrames) {
        const wrap = document.getElementById(`vcw-kb-view-${id}`);
        const tooltip = document.getElementById(`vct-kb-view-${id}`);
        const canvas = document.getElementById(`vcc-kb-view-${id}`);
        if(!wrap || !tooltip || !canvas) return;

        const ctx = init(canvas);
        let animId=null, frame=0, visible=false;

        function startAnim() { frame=0; if(animId)cancelAnimationFrame(animId); (function tick(){ drawerFunction(ctx,frame); frame=(frame+1)%maxFrames; animId=requestAnimationFrame(tick); })(); }
        function stopAnim()  { if(animId){cancelAnimationFrame(animId);animId=null;} }

        wrap.addEventListener('mouseenter', () => {
            if(visible) return; visible=true;
            document.querySelectorAll('.vtt-tooltip.vtt-visible').forEach(t=>t.classList.remove('vtt-visible'));
            tooltip.classList.add('vtt-visible'); startAnim();
            window._vttPulse?.seen(`kb-view-${id}`);
        });
        wrap.addEventListener('mouseleave', (e) => {
            if(!wrap.contains(e.relatedTarget)){ visible=false; tooltip.classList.remove('vtt-visible'); stopAnim(); drawerFunction(ctx,0); }
        });
        drawerFunction(ctx,0);
        window._vttPulse?.add(wrap, `kb-view-${id}`);
    }

    setup('kanban', drawKanbanToggle, 240);
    setup('lista', drawListaToggle, 240);
    function lerp(a,b,t){ return a+(b-a)*t; }
}

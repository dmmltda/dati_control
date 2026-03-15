/**
 * ============================================================================
 * Módulo Atividades — Journey
 * ============================================================================
 * Timeline operacional da empresa. Registra todas as interações de todos
 * os departamentos.
 *
 * REGRA: Toda listagem usa TableManager 2.0 (js/core/table-manager.js).
 * ============================================================================
 */

import { TableManager } from '../core/table-manager.js';
import { state } from './state.js';
import * as utils from './utils.js';
import { confirmar } from './confirmar.js';

// ──────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ──────────────────────────────────────────────────────────────────────────────

export const ACTIVITY_TYPES = [
    'Comentário',
    'Reunião',
    'Chamados HD',
    'Chamados CS',
    'Ação necessária',
];

export const ACTIVITY_DEPARTMENTS = [
    'Comercial',
    'Customer Success',
    'Help Desk',
    'TI',
    'Financeiro',
    'Produto',
    'Operações',
    'Outros',
];

export const ACTIVITY_STATUSES = [
    'A Fazer',
    'Em Andamento',
    'Concluída',
    'Cancelada',
];

const ACTIVITY_TYPE_CONFIG = {
    'Comentário': { icon: 'ph-chat-text', color: '#64748b' },
    'Reunião': { icon: 'ph-video', color: '#6366f1' },
    'Chamados HD': { icon: 'ph-headset', color: '#f59e0b' },
    'Chamados CS': { icon: 'ph-heartbeat', color: '#10b981' },
    'Ação necessária': { icon: 'ph-lightning', color: '#f97316' },
};

export const ACTIVITY_PRIORITIES = ['baixa', 'média', 'alta', 'urgente'];

const PRIORITY_CONFIG = {
    baixa:   { label: 'Baixa',   color: '#64748b', bg: 'rgba(100,116,139,0.12)', icon: 'ph-arrow-down' },
    'média': { label: 'Média',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: 'ph-arrows-horizontal' },
    alta:    { label: 'Alta',    color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: 'ph-arrow-up' },
    urgente: { label: 'Urgente', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: 'ph-warning' },
};

const STATUS_COLORS = { 
    'A Fazer':      '#6366f1',
    'Em Andamento': '#f59e0b',
    'Concluída':    '#10b981',
    'Cancelada':    '#64748b' 
};

// ──────────────────────────────────────────────────────────────────────────────
// ESTADO DO MÓDULO
// ──────────────────────────────────────────────────────────────────────────────

let _manager = null;
let _currentCompanyId = null;
let _timerInterval = null;
let _timerSeconds = 0;
let _timerState = 'idle';
let _editingActivityId = null;
let _usuarios = []; // lista de usuários para @mentions
let _pendingAttachments = []; // arquivos pendentes de upload

// ──────────────────────────────────────────────────────────────────────────────
// API
// ──────────────────────────────────────────────────────────────────────────────

async function fetchActivities(companyId) {
    const res = await fetch(`/api/companies/${companyId}/activities`);
    if (!res.ok) throw new Error('Erro ao carregar atividades');
    return res.json();
}

async function createActivity(companyId, payload) {
    const res = await fetch(`/api/companies/${companyId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || 'Erro ao criar atividade');
    }
    return res.json();
}

async function updateActivity(activityId, payload) {
    const res = await fetch(`/api/activities/${activityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || 'Erro ao atualizar atividade');
    }
    return res.json();
}

async function _deleteActivityApi(activityId) {
    const res = await fetch(`/api/activities/${activityId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao excluir atividade');
}

// ──────────────────────────────────────────────────────────────────────────────
// INICIALIZAÇÃO DA ABA
// ──────────────────────────────────────────────────────────────────────────────

async function _loadUsuarios() {
    try {
        const res = await fetch('/api/usuarios');
        if (res.ok) _usuarios = await res.json();
    } catch (e) { console.warn('[Atividades] Não foi possível carregar usuários:', e.message); }
}

export async function initActivitiesTab(companyId) {
    _currentCompanyId = companyId;
    _manager = null;

    _renderFiltersBar();
    _renderTableSkeleton();
    _loadUsuarios();

    try {
        const data = await fetchActivities(companyId);
        _buildManager(data);
    } catch (e) {
        console.error('[Atividades]', e);
        const tbody = document.getElementById('activities-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--danger);padding:2rem;">${e.message}</td></tr>`;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// BUILDER DO TABLEMANAGER 2.0
// ──────────────────────────────────────────────────────────────────────────────

function _buildManager(data) {
    const mapped = _mapActivities(data);

    _manager = new TableManager({
        data: mapped,
        columns: [
            { key: 'activity_type', label: 'Tipo', type: 'string', searchable: true, filterable: true },
            { key: 'title', label: 'Título', type: 'string', searchable: true },
            { key: 'description', label: 'Descrição', type: 'string', searchable: true },
            { key: 'department', label: 'Departamento', type: 'string', searchable: true, filterable: true },
            { key: 'status', label: 'Fase da Atividade', type: 'string', filterable: true },
            { key: 'assignees', label: 'Responsáveis', type: 'string', searchable: true },
            { key: 'created_by', label: 'Criado por', type: 'string', searchable: true },
            { key: 'activity_date', label: 'Data', type: 'date', sortable: true },
            { key: 'time_spent', label: 'Tempo', type: 'string' },
            { key: 'next_step', label: 'Próximo Passo', type: 'string', searchable: true },
        ],
        pageSize: 10,
        tableId: 'activities-table',

        renderRows: (rows) => _renderRows(rows),

        renderPagination: (state) => _renderPagination(state),

        renderFilters: () => _renderActiveFiltersChips(),
    });

    // Conectar busca
    const searchInput = document.getElementById('search-activities');
    if (searchInput && !searchInput.dataset.actConnected) {
        searchInput.dataset.actConnected = '1';
        searchInput.addEventListener('input', (e) => {
            if (_manager) _manager.setSearch(e.target.value);
        });
    }
}

function _mapActivities(data) {
    return (data || []).map(a => ({
        ...a,
        activity_date: a.activity_datetime ? new Date(a.activity_datetime).toLocaleDateString('pt-BR') : '-',
        time_spent: a.time_spent_minutes ? _formatMinutes(a.time_spent_minutes) : '-',
        assignees: (a.activity_assignees || []).map(r => r.user_nome || r.user_id).join(', ') || '-',
        created_by: a.created_by_user?.nome || a.created_by_user_id || '-',
        next_step: a.next_step_title ? `${a.next_step_title}${a.next_step_date ? ' · ' + new Date(a.next_step_date).toLocaleDateString('pt-BR') : ''}` : '-',
        priority: a.priority || null,
    }));
}

function _formatMinutes(min) {
    if (!min) return '-';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
}

// ──────────────────────────────────────────────────────────────────────────────
// RENDER ROWS
// ──────────────────────────────────────────────────────────────────────────────

function _renderRows(rows) {
    const tbody = document.getElementById('activities-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11">
                    <div class="empty-results" style="padding:3rem;text-align:center;">
                        <i class="ph ph-activity" style="font-size:3rem;color:var(--text-muted);display:block;margin-bottom:1rem;"></i>
                        <h3 style="color:var(--text-muted);margin:0 0 0.5rem;">Nenhuma atividade registrada</h3>
                        <p style="color:var(--text-muted);font-size:0.85rem;">Clique em <strong>+ Nova Atividade</strong> para começar.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    rows.forEach(act => {
        const cfg = ACTIVITY_TYPE_CONFIG[act.activity_type] || { icon: 'ph-activity', color: '#64748b' };

        const statusBadge = act.status
            ? `<span class="badge" style="background:${_statusBg(act.status)};color:${_statusColor(act.status)};border:1px solid currentColor;font-size:0.7rem;">${act.status}</span>`
            : '-';

        const tr = document.createElement('tr');
        tr.style.cssText = 'cursor:pointer;transition:background 0.15s;';
        tr.addEventListener('mouseenter', () => tr.style.background = 'rgba(99,102,241,0.06)');
        tr.addEventListener('mouseleave', () => tr.style.background = '');
        tr.addEventListener('click', (e) => {
            if (e.target.closest('button')) return; // don't open card if clicking action buttons
            activities.openActivityCard(act.id);
        });
        tr.innerHTML = `
            <td>
                <span class="badge" style="background:${cfg.color}18;color:${cfg.color};border:1px solid ${cfg.color}44;white-space:nowrap;gap:0.3rem;">
                    <i class="ph ${cfg.icon}"></i>
                    ${act.activity_type}
                </span>
            </td>
            <td style="font-weight:600;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${act.title}">${act.title}</td>
            <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-muted);font-size:0.82rem;" title="${act.description || ''}">${act.description || '-'}</td>
            <td style="text-align:center;">
                ${act.department ? `<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text-main);font-size:0.75rem;">${act.department}</span>` : '-'}
            </td>
            <td style="font-size:0.82rem;color:var(--text-muted);">${act.assignees}</td>
            <td style="font-size:0.82rem;color:var(--text-muted);">${act.created_by}</td>
            <td style="text-align:center;white-space:nowrap;font-size:0.82rem;">${act.activity_date}</td>
            <td style="text-align:center;">
                ${act.time_spent !== '-'
                ? `<span class="badge" style="background:rgba(99,102,241,0.1);color:#818cf8;border:1px solid rgba(99,102,241,0.3);font-size:0.75rem;"><i class="ph ph-clock"></i> ${act.time_spent}</span>`
                : '-'
            }
            </td>
            <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.82rem;color:var(--secondary);" title="${act.next_step}">${act.next_step}</td>
            <td style="text-align:center;">${statusBadge}</td>
            <td style="text-align:right;">
                <div class="actions">
                    <button type="button" class="btn btn-secondary btn-icon" onclick="activities.openActivityCard('${act.id}')" title="Ver detalhes">
                        <i class="ph ph-arrow-square-out"></i>
                    </button>
                    ${(window.canDo && !window.canDo('company_edit.activities')) ? 
                        `<button type="button" class="btn btn-danger btn-icon" disabled style="opacity:0.6;cursor:not-allowed;pointer-events:auto;" data-th-title="MODO SOMENTE LEITURA" data-th-tooltip="Você não tem permissão para excluir atividades." onclick="event.stopPropagation(); event.preventDefault();"><i class="ph ph-trash"></i></button>`
                    : `<button type="button" class="btn btn-danger btn-icon" onclick="activities.deleteActivity('${act.id}')" title="Excluir"><i class="ph ph-trash"></i></button>`}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function _statusBg(s) {
    const m = { 'A Fazer': 'rgba(99,102,241,0.12)', 'Em Andamento': 'rgba(245,158,11,0.12)', 'Concluída': 'rgba(16,185,129,0.12)', 'Cancelada': 'rgba(100,116,139,0.12)' };
    return m[s] || 'rgba(255,255,255,0.05)';
}
function _statusColor(s) {
    const m = { 'A Fazer': '#818cf8', 'Em Andamento': '#f59e0b', 'Concluída': '#10b981', 'Cancelada': '#64748b' };
    return m[s] || 'var(--text-muted)';
}

// ──────────────────────────────────────────────────────────────────────────────
// RENDER PAGINAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

function _renderPagination({ currentPage, totalPages, pageSize, totalRecords, hasPrev, hasNext }) {
    const container = document.getElementById('pagination-activities');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) pages.push(i);
    }
    const pageItems = [];
    let prev = 0;
    for (const p of pages) {
        if (p - prev > 1) pageItems.push('...');
        pageItems.push(p);
        prev = p;
    }

    const start = Math.min((currentPage - 1) * pageSize + 1, totalRecords);
    const end = Math.min(currentPage * pageSize, totalRecords);

    container.style.display = 'flex';
    container.innerHTML = `
        <div class="pagination">
            <button class="pagination-btn" id="act-prev-btn" ${!hasPrev ? 'disabled' : ''}>
                <i class="ph ph-caret-left"></i>
            </button>
            ${pageItems.map(item =>
        item === '...'
            ? `<span class="pagination-dots">···</span>`
            : `<button class="pagination-page ${item === currentPage ? 'active' : ''}" data-act-page="${item}">${item}</button>`
    ).join('')}
            <button class="pagination-btn" id="act-next-btn" ${!hasNext ? 'disabled' : ''}>
                <i class="ph ph-caret-right"></i>
            </button>
        </div>
        <div class="pagination-info">${start}–${end} de <strong>${totalRecords}</strong> registros &nbsp;·&nbsp; Página ${currentPage} de ${totalPages}</div>
    `;

    // Delegação de eventos
    if (!container.dataset.actPagConnected) {
        container.dataset.actPagConnected = '1';
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act-page], #act-prev-btn, #act-next-btn');
            if (!btn || !_manager) return;
            if (btn.id === 'act-prev-btn') _manager.prevPage();
            else if (btn.id === 'act-next-btn') _manager.nextPage();
            else if (btn.dataset.actPage) _manager.goToPage(parseInt(btn.dataset.actPage));
        });
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// FILTROS
// ──────────────────────────────────────────────────────────────────────────────

function _renderFiltersBar() {
    const bar = document.getElementById('activities-filters-bar');
    if (!bar) return;

    bar.className = 'rpt-filters';
    bar.style.cssText = '';

    bar.innerHTML = `
        <div class="rpt-filter-search" style="flex:1;min-width:200px;max-width:340px;">
            <i class="ph ph-magnifying-glass"></i>
            <input type="text" id="search-activities" placeholder="Buscar em atividades..." autocomplete="off">
        </div>

        <div class="act-filter-select-wrap">
            <i class="ph ph-activity" style="color:var(--text-muted);font-size:0.9rem;flex-shrink:0;"></i>
            <select id="filter-act-type" onchange="activities.applyFilter('activity_type', this.value)">
                <option value="">Tipo</option>
                ${ACTIVITY_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
            <i class="ph ph-caret-down" style="color:var(--text-muted);font-size:0.75rem;flex-shrink:0;pointer-events:none;"></i>
        </div>

        <div class="act-filter-select-wrap">
            <i class="ph ph-buildings" style="color:var(--text-muted);font-size:0.9rem;flex-shrink:0;"></i>
            <select id="filter-act-dept" onchange="activities.applyFilter('department', this.value)">
                <option value="">Departamento</option>
                ${ACTIVITY_DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
            <i class="ph ph-caret-down" style="color:var(--text-muted);font-size:0.75rem;flex-shrink:0;pointer-events:none;"></i>
        </div>

        <div class="act-filter-select-wrap">
            <i class="ph ph-flag" style="color:var(--text-muted);font-size:0.9rem;flex-shrink:0;"></i>
            <select id="filter-act-status" onchange="activities.applyFilter('status', this.value)">
                <option value="">Fase</option>
                ${ACTIVITY_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <i class="ph ph-caret-down" style="color:var(--text-muted);font-size:0.75rem;flex-shrink:0;pointer-events:none;"></i>
        </div>

        <button type="button" class="btn-ghost btn-sm" onclick="activities.clearAllFilters()" title="Limpar filtros">
            <i class="ph ph-x"></i> Limpar
        </button>

        <div id="activities-active-chips" class="active-filters-bar" style="display:none;flex-basis:100%;margin-top:0;padding-top:0.5rem;"></div>
    `;

    // Conectar busca
    const searchInput = document.getElementById('search-activities');
    if (searchInput && !searchInput.dataset.actConnected) {
        searchInput.dataset.actConnected = '1';
        searchInput.addEventListener('input', (e) => {
            if (_manager) _manager.setSearch(e.target.value);
        });
    }
}

function _renderActiveFiltersChips() {
    if (!_manager) return;
    const chips = document.getElementById('activities-active-chips');
    if (!chips) return;

    const active = _manager.getActiveFilters();
    if (active.length === 0) {
        chips.style.display = 'none';
        chips.innerHTML = '';
        return;
    }

    chips.style.display = 'flex';
    chips.innerHTML = active.map(({ key, label, value }) => `
        <div class="filter-chip">
            <span><strong>${label}:</strong> ${value}</span>
            <i class="ph ph-x-circle" onclick="activities.clearFilter('${key}')"></i>
        </div>
    `).join('') + `
        <button class="btn-clear-all-filters" onclick="activities.clearAllFilters()">
            <i class="ph ph-trash"></i> Limpar Tudo
        </button>
    `;
}

function _renderTableSkeleton() {
    const tbody = document.getElementById('activities-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:3rem;color:var(--text-muted);">
        <i class="ph ph-spinner" style="animation:spin 1s linear infinite;font-size:1.5rem;"></i>
        <br><span style="font-size:0.85rem;margin-top:0.5rem;display:block;">Carregando atividades...</span>
    </td></tr>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// MODAL DE CRIAÇÃO / EDIÇÃO
// ──────────────────────────────────────────────────────────────────────────────

export function openCreateModal() {
    try {
        if (!window.tasksBoard?.renderActivityModal) {
            utils.showToast('Módulo de atividades não carregado.', 'error');
            return;
        }
        // Objeto vazio com company_id pré-definida para o contexto da empresa
        const emptyActivity = {
            id: null,
            title: '',
            activity_type: '',
            status: 'A Fazer',
            priority: null,
            activity_datetime: null,
            description: '',
            activity_assignees: [],
            company_id: _currentCompanyId,
            companies: null,
            time_spent_minutes: 0,
            next_step_title: null,
            next_step_date: null,
            activity_next_step_responsibles: [],
            google_meet_link: null,
            reminder_at: null,
            reminder_email: false,
            reminder_whatsapp: false,
            notify_on_assign: false,
        };
        window.tasksBoard.renderActivityModal(
            emptyActivity,
            true, // isCreateMode
            'info',
            async () => { await _reloadActivities(); }
        );
    } catch(err) {
        console.error('[openCreateModal] ERRO:', err);
        utils.showToast('Erro ao abrir formulário: ' + err.message, 'error');
    }
}

export async function openEditModal(activityId) {
    const activity = _manager?._originalData?.find(a => a.id === activityId);
    if (!activity) {
        utils.showToast('Atividade não encontrada.', 'error');
        return;
    }
    if (!window.tasksBoard?.renderActivityModal) {
        utils.showToast('Módulo de atividades não carregado.', 'error');
        return;
    }
    window.tasksBoard.renderActivityModal(
        activity,
        false, // isCreateMode
        'info',
        async () => { await _reloadActivities(); }
    );
}

function _showModal({ title, submitLabel, prefill }) {
    const existing = document.getElementById('activity-modal-overlay');
    if (existing) existing.remove();

    const assigneesValue = prefill ? (prefill.activity_assignees || []).map(r => r.user_nome || r.user_id).join(', ') : '';
    const nextStepResp = prefill ? (prefill.activity_next_step_responsibles || []).map(r => r.user_id).join(', ') : '';
    const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const dtValue = prefill?.activity_datetime ? new Date(prefill.activity_datetime).toISOString().slice(0, 16) : nowLocal;
    const nextDtValue = prefill?.next_step_date ? new Date(prefill.next_step_date).toISOString().slice(0, 10) : '';

    const overlay = document.createElement('div');
    overlay.id = 'activity-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9000;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;';

    overlay.innerHTML = `
        <div class="glass-panel" style="width:100%;max-width:720px;padding:2rem;border-radius:var(--radius);max-height:90vh;overflow-y:auto;position:relative;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;">
                <h2 style="margin:0;font-size:1.2rem;"><i class="ph ph-activity" style="color:var(--primary);margin-right:0.5rem;"></i>${title}</h2>
                <button type="button" class="btn btn-icon" onclick="document.getElementById('activity-modal-overlay').remove(); activities.resetTimer();" style="color:var(--text-muted);">
                    <i class="ph ph-x" style="font-size:1.2rem;"></i>
                </button>
            </div>

            <form id="activity-modal-form">
                <!-- ── Campos Obrigatórios ── -->
                <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.75rem;padding-bottom:0.4rem;border-bottom:1px solid var(--dark-border);">
                    Informações Obrigatórias
                </div>

                <div class="grid-2" style="margin-bottom:1rem;">
                    <div class="input-group">
                        <label>Tipo de Atividade * <span class="th-info-btn" data-th-title="TIPO DE ATIVIDADE" data-th-tooltip="Categoria da interação: Comentário (nota interna), Reunião, Chamados HD (suporte técnico), Chamados CS (sucesso do cliente), Ação necessária (urgente)."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <select id="modal-act-type" class="input-control" required>
                            <option value="">Selecione...</option>
                            ${ACTIVITY_TYPES.map(t => `<option value="${t}" ${prefill?.activity_type === t ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Departamento * <span class="th-info-btn" data-th-title="DEPARTAMENTO EXECUTOR" data-th-tooltip="Qual área da DATI executou esta atividade: Comercial, Customer Success, Help Desk, TI, Financeiro, Produto ou Operações."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <select id="modal-act-dept" class="input-control" required>
                            <option value="">Selecione...</option>
                            ${ACTIVITY_DEPARTMENTS.map(d => `<option value="${d}" ${prefill?.department === d ? 'selected' : ''}>${d}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="input-group" style="margin-bottom:1rem;">
                    <label>Título * <span class="th-info-btn" data-th-title="TÍTULO DA ATIVIDADE" data-th-tooltip="Nome conciso da atividade. Será exibido na timeline e na coluna Título da tabela. Ex: 'Reunião de onboarding com gerente de comex'."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                    <input type="text" id="modal-act-title" class="input-control" required placeholder="Título da atividade" value="${prefill?.title || ''}">
                </div>

                <div class="input-group" style="margin-bottom:1rem;">
                    <label>Descrição * <span class="th-info-btn" data-th-title="DESCRIÇÃO" data-th-tooltip="Detalhamento do que foi discutido, decidido ou executado. Fica visível na timeline completa da empresa."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                    <textarea id="modal-act-desc" class="input-control" rows="3" required placeholder="Descreva a atividade...">${prefill?.description || ''}</textarea>
                </div>

                <div class="grid-2" style="margin-bottom:1rem;">
                    <div class="input-group">
                        <label>Responsáveis * <span class="th-info-btn" data-th-title="RESPONSÁVEIS" data-th-tooltip="Colaboradores DATI que participaram ou são responsáveis. Separe vários nomes por vírgula."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <input type="text" id="modal-act-assignees" class="input-control" required placeholder="Nome dos responsáveis" value="${assigneesValue}">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.35rem;">
                            <span style="font-size:0.73rem;color:var(--text-muted);">Separe por vírgula</span>
                            <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.75rem;cursor:pointer;color:var(--primary);font-weight:600;">
                                <input type="checkbox" id="modal-act-notify-assign" ${prefill?.notify_on_assign ? 'checked' : ''} style="width:13px;height:13px;accent-color:var(--primary);">
                                Notificar por e-mail
                            </label>
                        </div>
                    </div>
                    <div class="input-group">
                        <label>Data e Horário * <span class="th-info-btn" data-th-title="DATA E HORÁRIO" data-th-tooltip="Quando a atividade ocorreu ou está agendada. Usado para ordenar a timeline cronologicamente."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <input type="datetime-local" id="modal-act-datetime" class="input-control" required value="${dtValue}">
                    </div>
                </div>

                <!-- ── Campos Opcionais ── -->
                <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin:1.25rem 0 0.75rem;padding-bottom:0.4rem;border-bottom:1px solid var(--dark-border);">
                    Informações Opcionais
                </div>

                <div class="grid-2" style="margin-bottom:1rem;">
                    <div class="input-group">
                        <label>Fase da Atividade <span class="th-info-btn" data-th-title="FASE DA ATIVIDADE" data-th-tooltip="Estado: A fazer, Em andamento, Concluída, Cancelada."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <select id="modal-act-status" class="input-control">
                            <option value="">Selecione...</option>
                            ${ACTIVITY_STATUSES.map(s => `<option value="${s}" ${prefill?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Prioridade <span class="th-info-btn" data-th-title="PRIORIDADE" data-th-tooltip="Nível de urgência: Urgente = requer atenção imediata, Alta = hoje, Média = esta semana, Baixa = quando possível."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <select id="modal-act-priority" class="input-control">
                            <option value="">Sem prioridade</option>
                            ${ACTIVITY_PRIORITIES.map(p => `<option value="${p}" ${prefill?.priority===p?'selected':''}>${PRIORITY_CONFIG[p]?.label||p}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="grid-1" style="margin-bottom:1rem;">
                    <div class="input-group">
                        <label>Google Meet Link  <i class="ph ph-video" style="color:#6366f1;"></i></label>
                        <input type="url" id="modal-act-meet-link" class="input-control" placeholder="https://meet.google.com/xxx" value="${prefill?.google_meet_link||''}">
                    </div>
                </div>

                <!-- Configurações de Reunião (Condicional) -->
                <div id="modal-sec-meeting-opts" style="display:${prefill?.activity_type === 'Reunião' ? 'block' : 'none'}; background:rgba(99,102,241,0.05); border:1px solid rgba(99,102,241,0.15); border-radius:12px; padding:1.25rem; margin-bottom:1rem;">
                    <div style="font-weight:700; font-size:0.75rem; color:#818cf8; text-transform:uppercase; margin-bottom:0.85rem; letter-spacing:0.05em; display:flex; align-items:center; gap:0.4rem;">
                        <i class="ph ph-video-camera"></i> Configurações de Reunião
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div style="display:flex; flex-direction:column; gap:0.6rem;">
                            <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer; font-size:0.8rem;">
                                <input type="checkbox" id="modal-act-send-invite" ${prefill?.send_invite_email ? 'checked' : ''} style="accent-color:#6366f1;">
                                Enviar Convite por e-mail
                            </label>
                            <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer; font-size:0.8rem;">
                                <input type="checkbox" id="modal-act-send-summary" ${prefill?.send_summary_email ? 'checked' : ''} style="accent-color:#10b981;">
                                Enviar Resumo ao concluir
                            </label>
                            <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer; font-size:0.8rem;">
                                <input type="checkbox" id="modal-act-send-recording" ${prefill?.send_recording_email ? 'checked' : ''} style="accent-color:#ef4444;">
                                Avisar sobre Gravação disponível
                            </label>
                        </div>
                        <div class="input-group" style="margin-bottom:0;">
                            <label style="font-size:0.75rem;">URL do Vídeo da Gravação</label>
                            <input type="url" id="modal-act-recording-url" class="input-control" placeholder="Link da gravação (ex: cloud/drive)" value="${prefill?.recording_url || ''}">
                        </div>
                    </div>
                </div>

                <!-- Timer de Tempo Trabalhado -->
                <div class="glass-panel" style="padding:1rem;margin-bottom:1rem;border:1px solid var(--dark-border);">
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
                        <div>
                            <div style="font-weight:600;margin-bottom:0.25rem;"><i class="ph ph-clock" style="color:var(--primary);"></i> Tempo Trabalhado</div>
                            <div id="timer-display" style="font-size:1.6rem;font-weight:700;font-family:monospace;letter-spacing:0.08em;color:var(--text-main);">00:00:00</div>
                        </div>
                        <div style="display:flex;gap:0.5rem;align-items:center;">
                            <button type="button" id="timer-start-btn" class="btn btn-primary btn-sm" onclick="activities.timerStart()" title="Iniciar cronômetro">
                                <i class="ph ph-play"></i> Iniciar
                            </button>
                            <button type="button" id="timer-pause-btn" class="btn btn-secondary btn-sm" onclick="activities.timerPause()" title="Pausar cronômetro" style="display:none;">
                                <i class="ph ph-pause"></i> Pausar
                            </button>
                            <button type="button" id="timer-resume-btn" class="btn btn-secondary btn-sm" onclick="activities.timerResume()" title="Retomar" style="display:none;">
                                <i class="ph ph-play"></i> Retomar
                            </button>
                            <button type="button" id="timer-stop-btn" class="btn btn-danger btn-sm" onclick="activities.timerStop()" title="Finalizar e salvar tempo" style="display:none;">
                                <i class="ph ph-stop"></i> Fim
                            </button>
                        </div>
                    </div>
                    <div class="input-group" style="margin-top:0.75rem;margin-bottom:0;">
                        <label style="font-size:0.78rem;">Ou informe manualmente (minutos) <span class="th-info-btn" data-th-title="TEMPO MANUAL" data-th-tooltip="Use o cronômetro acima ou insira manualmente o tempo em minutos. Ex: 90 = 1h30min. Será exibido na coluna Tempo da tabela."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <input type="number" id="modal-act-time-min" class="input-control" min="0" placeholder="ex: 30" value="${prefill?.time_spent_minutes || ''}">
                    </div>
                </div>

                <!-- Próximo Passo -->
                <div class="glass-panel" style="padding:1rem;margin-bottom:1.5rem;border:1px solid var(--dark-border);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
                        <div style="font-weight:600;"><i class="ph ph-arrow-right-dashed" style="color:var(--secondary);"></i> Próximo Passo</div>
                        <label id="modal-wrapper-next-reminder" style="display:${nextDtValue ? 'flex' : 'none'}; align-items:center; gap:0.35rem; font-size:0.75rem; cursor:pointer; color:var(--secondary); font-weight:600;">
                            <input type="checkbox" id="modal-act-next-reminder" ${prefill?.next_step_reminder_email ? 'checked' : ''} style="width:13px;height:13px;accent-color:var(--secondary);">
                            Lembrar por e-mail (1 dia antes)
                        </label>
                    </div>
                    <div class="grid-2" style="margin-bottom:0.75rem;">
                        <div class="input-group" style="margin-bottom:0;">
                            <label>Título do Próximo Passo <span class="th-info-btn" data-th-title="PRÓXIMO PASSO" data-th-tooltip="Ação concreta a ser realizada após esta atividade. Aparecerá na coluna 'Próximo Passo' na tabela de Empresas e de Atividades."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                            <input type="text" id="modal-act-next-title" class="input-control" placeholder="O que fazer a seguir?" value="${prefill?.next_step_title || ''}">
                        </div>
                        <div class="input-group" style="margin-bottom:0;">
                            <label>Data do Próximo Passo <span class="th-info-btn" data-th-title="DATA DO PRÓXIMO PASSO" data-th-tooltip="Prazo para execução do próximo passo. Aparecerá ao lado do título na coluna Próximo Passo."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                            <input type="date" id="modal-act-next-date" class="input-control" value="${nextDtValue}">
                        </div>
                    </div>
                    <div class="input-group" style="margin-bottom:0;">
                        <label>Responsáveis do Próximo Passo <span class="th-info-btn" data-th-title="RESPONSÁVEIS DO PRÓXIMO PASSO" data-th-tooltip="Quem irá executar o próximo passo. Pode ser diferente dos responsáveis pela atividade atual. Separe por vírgula."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <input type="text" id="modal-act-next-resp" class="input-control" placeholder="Nomes, separados por vírgula" value="${nextStepResp}">
                    </div>
                </div>

                <!-- Lembrete -->
                <div class="glass-panel" style="padding:1rem;margin-bottom:1rem;border:1px solid var(--dark-border);">
                    <div style="font-weight:600;margin-bottom:0.75rem;"><i class="ph ph-bell" style="color:#f59e0b;"></i> Lembrete</div>
                    <div class="grid-2" style="margin-bottom:0.5rem;">
                        <div class="input-group" style="margin-bottom:0;">
                            <label style="font-size:0.78rem;">Data e hora do lembrete</label>
                            <input type="datetime-local" id="modal-act-reminder-at" class="input-control" value="${prefill?.reminder_at ? new Date(prefill.reminder_at).toISOString().slice(0,16) : ''}">
                        </div>
                        <div class="input-group" style="margin-bottom:0;display:flex;flex-direction:column;justify-content:flex-end;gap:0.4rem;">
                            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;font-size:0.85rem;">
                                <input type="checkbox" id="modal-act-reminder-email" ${prefill?.reminder_email?'checked':''}> Por e-mail
                            </label>
                            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;font-size:0.85rem;">
                                <input type="checkbox" id="modal-act-reminder-wpp" ${prefill?.reminder_whatsapp?'checked':''}> Por WhatsApp
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Anexos -->
                <div class="glass-panel" style="padding:1rem;margin-bottom:1.5rem;border:1px solid var(--dark-border);">
                    <div style="font-weight:600;margin-bottom:0.75rem;"><i class="ph ph-paperclip" style="color:var(--primary);"></i> Anexos</div>
                    <div id="act-dropzone" style="border:2px dashed var(--dark-border);border-radius:8px;padding:1.25rem;text-align:center;cursor:pointer;transition:border-color 0.2s;color:var(--text-muted);font-size:0.85rem;"
                        ondragover="event.preventDefault(); this.style.borderColor='var(--primary)';"
                        ondragleave="this.style.borderColor='var(--dark-border)';"
                        ondrop="event.preventDefault(); this.style.borderColor='var(--dark-border)'; [...event.dataTransfer.files].forEach(f => activities._addFile(f));">
                        <i class="ph ph-upload-simple" style="font-size:1.5rem;display:block;margin-bottom:0.4rem;"></i>
                        Arraste arquivos ou <label for="act-file-input" style="color:var(--primary);cursor:pointer;">clique aqui</label>
                        <input type="file" id="act-file-input" multiple style="display:none;" onchange="[...this.files].forEach(f => activities._addFile(f)); this.value=''">
                    </div>
                    <div id="pending-attachments-list" style="margin-top:0.5rem;display:flex;flex-direction:column;gap:0.3rem;"></div>
                </div>
                <!-- Ações -->
                <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('activity-modal-overlay').remove(); activities.resetTimer();">
                        Cancelar
                    </button>
                    <button type="submit" class="btn btn-primary">
                        <i class="ph ph-floppy-disk"></i> ${submitLabel}
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    // Inicializar @mention autocomplete
    const descTA = document.getElementById('modal-act-desc');
    if (descTA) _initMentionAutocomplete(descTA);

    // Listeners condicionais
    document.getElementById('modal-act-type').addEventListener('change', (e) => {
        const sec = document.getElementById('modal-sec-meeting-opts');
        if (sec) sec.style.display = e.target.value === 'Reunião' ? 'block' : 'none';
    });

    document.getElementById('modal-act-next-date').addEventListener('input', (e) => {
        const wrapper = document.getElementById('modal-wrapper-next-reminder');
        if (wrapper) wrapper.style.display = e.target.value ? 'flex' : 'none';
    });

    // Reset pending attachments
    _pendingAttachments = [];

    // Se tinha tempo gravado
    if (prefill?.time_spent_minutes) {
        _timerSeconds = prefill.time_spent_minutes * 60;
        _updateTimerDisplay();
    } else {
        _timerSeconds = 0;
        _updateTimerDisplay();
    }

    // Form submit
    document.getElementById('activity-modal-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await _handleModalSubmit();
    });
}

async function _handleModalSubmit() {
    const type = document.getElementById('modal-act-type')?.value;
    const dept = document.getElementById('modal-act-dept')?.value;
    const title = document.getElementById('modal-act-title')?.value?.trim();
    const desc = document.getElementById('modal-act-desc')?.value?.trim();
    const assignees = document.getElementById('modal-act-assignees')?.value?.trim();
    const datetime = document.getElementById('modal-act-datetime')?.value;

    if (!type || !dept || !title || !desc || !assignees || !datetime) {
        utils.showToast('Preencha todos os campos obrigatórios (*)', 'error');
        return;
    }

    const status = document.getElementById('modal-act-status')?.value || null;
    const priority = document.getElementById('modal-act-priority')?.value || null;
    const timeMinInput = parseInt(document.getElementById('modal-act-time-min')?.value || '0');
    const timeMin = timeMinInput > 0 ? timeMinInput : (_timerSeconds > 0 ? Math.ceil(_timerSeconds / 60) : null);
    const nextTitle = document.getElementById('modal-act-next-title')?.value?.trim() || null;
    const nextDate = document.getElementById('modal-act-next-date')?.value || null;
    const nextResp = document.getElementById('modal-act-next-resp')?.value?.trim() || null;
    const reminderAt = document.getElementById('modal-act-reminder-at')?.value || null;
    const reminderEmail = document.getElementById('modal-act-reminder-email')?.checked || false;
    const reminderWhatsapp = document.getElementById('modal-act-reminder-wpp')?.checked || false;
    const googleMeetLink = document.getElementById('modal-act-meet-link')?.value?.trim() || null;

    // Novos campos
    const notifyOnAssign = document.getElementById('modal-act-notify-assign')?.checked || false;
    const sendInviteEmail = document.getElementById('modal-act-send-invite')?.checked || false;
    const sendSummaryEmail = document.getElementById('modal-act-send-summary')?.checked || false;
    const sendRecordingEmail = document.getElementById('modal-act-send-recording')?.checked || false;
    const recordingUrl = document.getElementById('modal-act-recording-url')?.value?.trim() || null;
    const nextStepReminderEmail = document.getElementById('modal-act-next-reminder')?.checked || false;

    const assigneeList = assignees.split(',').map(s => s.trim()).filter(Boolean);
    const nextRespList = nextResp ? nextResp.split(',').map(s => s.trim()).filter(Boolean) : [];
    const mentions = _extractMentions(desc);

    const payload = {
        activity_type: type,
        title,
        description: desc,
        department: dept,
        activity_datetime: datetime ? new Date(datetime).toISOString() : null,
        status,
        priority,
        time_spent_minutes: timeMin,
        next_step_title: nextTitle,
        next_step_date: nextDate ? new Date(nextDate).toISOString() : null,
        assignees: assigneeList,
        next_step_responsibles: nextRespList,
        mentions,
        reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null,
        reminder_email: reminderEmail,
        reminder_whatsapp: reminderWhatsapp,
        google_meet_link: googleMeetLink,
        // Novos campos
        notify_on_assign: notifyOnAssign,
        send_invite_email: sendInviteEmail,
        send_summary_email: sendSummaryEmail,
        send_recording_email: sendRecordingEmail,
        recording_url: recordingUrl,
        next_step_reminder_email: nextStepReminderEmail,
    };

    try {
        let savedActivity;
        if (_editingActivityId) {
            savedActivity = await updateActivity(_editingActivityId, payload);
            utils.showToast('Atividade atualizada!', 'success');
        } else {
            savedActivity = await createActivity(_currentCompanyId, payload);
            utils.showToast('Atividade criada!', 'success');
        }

        // 🔔 Notifica outros painéis (Dashboard, Minhas Atividades) para atualizar em tempo real
        window.dispatchEvent(new CustomEvent('journey:activity-changed', {
            detail: { action: _editingActivityId ? 'update' : 'create', id: savedActivity?.id }
        }));

        // Upload de anexos pendentes
        if (_pendingAttachments.length > 0) {
            await _uploadPendingAttachments(savedActivity.id);
        }

        document.getElementById('activity-modal-overlay')?.remove();
        resetTimer();
        _pendingAttachments = [];
        await _reloadActivities();
    } catch (err) {
        utils.showToast(err.message, 'error');
    }
}

// ── Mentions ──────────────────────────────────────────────────────────────────
function _extractMentions(text) {
    const re = /@\[([^:]+):([^\]]+)\]/g;
    const ids = [];
    let m;
    while ((m = re.exec(text)) !== null) ids.push(m[1]);
    return [...new Set(ids)];
}

function _initMentionAutocomplete(textarea) {
    let dropEl = null;
    textarea.addEventListener('input', () => {
        const val = textarea.value;
        const pos = textarea.selectionStart;
        const before = val.slice(0, pos);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1 || before.slice(atIdx).includes(' ')) { _hideMention(dropEl); return; }
        const query = before.slice(atIdx + 1).toLowerCase();
        const matches = _usuarios.filter(u => u.nome.toLowerCase().includes(query)).slice(0, 6);
        if (!matches.length) { _hideMention(dropEl); return; }
        if (!dropEl) {
            dropEl = document.createElement('div');
            dropEl.className = 'mention-dropdown';
            dropEl.style.cssText = 'position:absolute;background:var(--glass-bg,#1e293b);border:1px solid var(--dark-border);border-radius:8px;z-index:9999;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
            textarea.parentElement.style.position = 'relative';
            textarea.parentElement.appendChild(dropEl);
        }
        dropEl.innerHTML = matches.map(u =>
            `<div class="mention-item" style="padding:0.5rem 0.75rem;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:0.5rem;" data-uid="${u.id}" data-nome="${u.nome}">
                <span style="width:28px;height:28px;border-radius:50%;background:var(--primary,#6366f1);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;flex-shrink:0;">${u.avatar || u.nome[0]}</span>
                ${u.nome}
            </div>`
        ).join('');
        dropEl.style.display = 'block';
        dropEl.querySelectorAll('.mention-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                _insertMention(textarea, atIdx, pos, item.dataset.uid, item.dataset.nome);
                _hideMention(dropEl); dropEl = null;
            });
            item.addEventListener('mouseover', () => item.style.background = 'rgba(255,255,255,0.07)');
            item.addEventListener('mouseout', () => item.style.background = '');
        });
    });
    textarea.addEventListener('blur', () => setTimeout(() => { _hideMention(dropEl); dropEl = null; }, 150));
}

function _hideMention(el) { if (el) el.style.display = 'none'; }

function _insertMention(textarea, atIdx, pos, uid, nome) {
    const val = textarea.value;
    textarea.value = val.slice(0, atIdx) + `@[${uid}:${nome}]` + val.slice(pos);
}

// ── Attachments ───────────────────────────────────────────────────────────────
function _addPendingAttachment(file) {
    _pendingAttachments.push(file);
    _renderPendingAttachments();
}

function _renderPendingAttachments() {
    const container = document.getElementById('pending-attachments-list');
    if (!container) return;
    if (!_pendingAttachments.length) { container.innerHTML = ''; return; }
    container.innerHTML = _pendingAttachments.map((f, i) =>
        `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;background:rgba(255,255,255,0.05);border-radius:6px;font-size:0.8rem;">
            <i class="ph ph-file" style="color:var(--primary);"></i>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
            <span style="color:var(--text-muted);flex-shrink:0;">${(f.size/1024).toFixed(0)}KB</span>
            <button type="button" onclick="activities._removePendingAttachment(${i})" style="background:none;border:none;cursor:pointer;color:var(--danger);padding:0;"><i class="ph ph-x"></i></button>
        </div>`
    ).join('');
}

export function _removePendingAttachment(i) {
    _pendingAttachments.splice(i, 1);
    _renderPendingAttachments();
}

async function _uploadPendingAttachments(activityId) {
    for (const file of _pendingAttachments) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/activities/${activityId}/attachments`, { method: 'POST', body: fd });
        if (!res.ok) console.warn('[Attachment upload] Falhou para', file.name);
    }
}

async function _reloadActivities() {
    try {
        const data = await fetchActivities(_currentCompanyId);
        if (_manager) {
            _manager.setData(_mapActivities(data));
        } else {
            _buildManager(data);
        }
    } catch (e) {
        console.error('[Atividades] Reload error:', e);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// TIMER
// ──────────────────────────────────────────────────────────────────────────────

export function timerStart() {
    if (_timerState !== 'idle') return;
    _timerState = 'running';
    _timerInterval = setInterval(() => {
        _timerSeconds++;
        _updateTimerDisplay();
    }, 1000);
    document.getElementById('timer-start-btn')?.style.setProperty('display', 'none');
    document.getElementById('timer-pause-btn')?.style.removeProperty('display');
    document.getElementById('timer-stop-btn')?.style.removeProperty('display');
}

export function timerPause() {
    if (_timerState !== 'running') return;
    _timerState = 'paused';
    clearInterval(_timerInterval);
    document.getElementById('timer-pause-btn')?.style.setProperty('display', 'none');
    document.getElementById('timer-resume-btn')?.style.removeProperty('display');
}

export function timerResume() {
    if (_timerState !== 'paused') return;
    _timerState = 'running';
    _timerInterval = setInterval(() => {
        _timerSeconds++;
        _updateTimerDisplay();
    }, 1000);
    document.getElementById('timer-resume-btn')?.style.setProperty('display', 'none');
    document.getElementById('timer-pause-btn')?.style.removeProperty('display');
}

export function timerStop() {
    clearInterval(_timerInterval);
    _timerState = 'idle';
    // Preenche o campo manual com minutos calculados
    const minEl = document.getElementById('modal-act-time-min');
    if (minEl) minEl.value = Math.ceil(_timerSeconds / 60);

    document.getElementById('timer-start-btn')?.style.setProperty('display', 'none');
    document.getElementById('timer-pause-btn')?.style.setProperty('display', 'none');
    document.getElementById('timer-resume-btn')?.style.setProperty('display', 'none');
    document.getElementById('timer-stop-btn')?.style.setProperty('display', 'none');

    utils.showToast(`Tempo registrado: ${_formatMinutes(Math.ceil(_timerSeconds / 60))}`, 'success');
}

export function resetTimer() {
    clearInterval(_timerInterval);
    _timerState = 'idle';
    _timerSeconds = 0;
    _updateTimerDisplay();
}

function _timerReset() {
    resetTimer();
}

function _updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    if (!el) return;
    const h = Math.floor(_timerSeconds / 3600);
    const m = Math.floor((_timerSeconds % 3600) / 60);
    const s = _timerSeconds % 60;
    el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// API PÚBLICA — chamada via window.activities
// ──────────────────────────────────────────────────────────────────────────────

export function applyFilter(key, value) {
    if (_manager) _manager.setFilter(key, value);
}

export function clearFilter(key) {
    if (_manager) {
        _manager.setFilter(key, '');
        // Limpar select correspondente se existir
        const map = { activity_type: 'filter-act-type', department: 'filter-act-dept', status: 'filter-act-status' };
        const elId = map[key];
        if (elId) {
            const el = document.getElementById(elId);
            if (el) el.value = '';
        }
    }
}

export function clearAllFilters() {
    if (_manager) {
        _manager.clearFilters();
        ['filter-act-type', 'filter-act-dept', 'filter-act-status'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const search = document.getElementById('search-activities');
        if (search) search.value = '';
    }
}

export function deleteActivity(activityId) {
    confirmar('Deseja excluir esta atividade?', async () => {
        try {
            await _deleteActivityApi(activityId);
            utils.showToast('Atividade excuída!', 'success');
            // Notifica outros painéis (Dashboard, Minhas Atividades) da exclusão
            window.dispatchEvent(new CustomEvent('journey:activity-changed', {
                detail: { action: 'delete', id: activityId }
            }));
            await _reloadActivities();
        } catch (e) {
            utils.showToast(e.message, 'error');
        }
    });
}

/**
 * Inicia uma reunião Google Meet para a atividade informada.
 * - Se Google Meet não estiver configurado no backend, exibe toast de erro amigável.
 * - Se sucesso: abre o link em nova aba e atualiza o card sem reload da página.
 *
 * @param {string} activityId
 */
export async function startMeeting(activityId) {
    try {
        utils.showToast('Criando sala de reunião...', 'info');

        const res = await fetch('/api/google-meet/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activityId }),
        });

        const data = await res.json();

        if (!res.ok) {
            const msg = data.error || 'Erro ao criar reunião Google Meet.';
            // Mensagem amigável para quem não configurou o Google
            if (res.status === 503) {
                utils.showToast('Integração Google Meet não configurada. Configure GOOGLE_SERVICE_ACCOUNT_JSON no servidor.', 'error');
            } else {
                utils.showToast(msg, 'error');
            }
            return;
        }

        const meetLink = data.meetLink;

        // Abre o link em nova aba
        window.open(meetLink, '_blank', 'noopener,noreferrer');

        utils.showToast('Reunião criada! Sala aberta em nova aba.', 'success');

        // Atualiza o botão no card aberto sem fechar o overlay
        const initBtn = document.getElementById('adc-meet-start-btn');
        const enterBtn = document.getElementById('adc-meet-enter-btn');
        if (initBtn) {
            initBtn.style.display = 'none';
        }
        if (enterBtn) {
            enterBtn.style.display = 'inline-flex';
            enterBtn.href = meetLink;
        }

        // Atualiza o chip no header do card
        const meetChip = document.getElementById('adc-meet-chip');
        if (meetChip) {
            meetChip.href = meetLink;
            meetChip.style.display = 'inline-flex';
        }

        // Atualiza os dados na memória do manager para refletir o novo link
        if (_manager?._originalData) {
            const act = _manager._originalData.find(a => a.id === activityId);
            if (act) act.google_meet_link = meetLink;
        }

    } catch (err) {
        utils.showToast('Erro ao comunicar com o servidor. Tente novamente.', 'error');
        console.error('[startMeeting]', err);
    }
}

// Expor _addFile para o dropzone inline
export function _addFile(file) { _addPendingAttachment(file); }

// ──────────────────────────────────────────────────────────────────────────────
// CARD DE DETALHES DA ATIVIDADE (abre ao clicar na linha)
// ──────────────────────────────────────────────────────────────────────────────

export async function openActivityCard(activityId) {
    try {
        let act = _manager?._originalData?.find(a => a.id === activityId);
        
        if (!act) {
            // Se não encontrou no manager local, tenta buscar na API
            utils.showToast('Carregando detalhes...', 'info');
            try {
                const res = await fetch(`/api/activities/${activityId}`);
                if (res.ok) {
                    act = await res.json();
                }
            } catch (fetchErr) {
                console.warn('[openActivityCard] Falha ao buscar via API:', fetchErr);
            }
        }

        if (!act) { 
            utils.showToast('Atividade não encontrada.', 'error'); 
            return; 
        }

        if (!window.tasksBoard?.renderActivityModal) {
            // No módulo de atividades, se não temos o renderActivityModal do outro módulo,
            // podemos usar a nossa própria implementação interna
            _renderActivityDetailCard(act);
            return;
        }
        
        window.tasksBoard.renderActivityModal(
            act,
            false, // isCreateMode (edição)
            'info',
            async () => { 
                await _reloadActivities();
                window.dispatchEvent(new CustomEvent('journey:activity-changed', {
                    detail: { action: 'update', id: activityId }
                }));
            }
        );
    } catch(err) {
        console.error('[openActivityCard] ERRO:', err);
        utils.showToast('Erro ao abrir atividade: ' + err.message, 'error');
    }
}

// a = null → modo criação; a = objeto → modo edição
function _renderActivityDetailCard(a, companyIdForCreate) {
    document.getElementById('act-detail-card-overlay')?.remove();

    const isCreateMode = !a;
    if (isCreateMode) a = { status: 'A Fazer', activity_assignees: [], activity_next_step_responsibles: [] };

    const STATUS_COLORS = { 'A Fazer':'#6366f1','Em Andamento':'#f59e0b','Concluída':'#10b981','Cancelada':'#64748b' };
    const sc  = STATUS_COLORS[a.status] || '#6366f1';
    const pc  = a.priority ? (PRIORITY_CONFIG[a.priority]?.color || '#64748b') : null;
    const cfg = ACTIVITY_TYPE_CONFIG[a.activity_type] || { icon:'ph-activity', color:'#64748b' };
    const isReuniao = a.activity_type === 'Reunião';
    const isOverdue = !isCreateMode && a.activity_datetime && new Date(a.activity_datetime) < new Date() && a.status !== 'Concluída';

    const nowLocal    = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16);
    const dtLocal     = isCreateMode ? nowLocal : (a.activity_datetime ? new Date(a.activity_datetime).toISOString().slice(0,16) : '');
    const nextStepResp = (a.activity_next_step_responsibles || []).map(r => r.user_id).join(', ');
    const nextDt      = a.next_step_date ? new Date(a.next_step_date).toISOString().slice(0,10) : '';
    const reminderAt  = a.reminder_at ? new Date(a.reminder_at).toISOString().slice(0,16) : '';
    const timeMin     = a.time_spent_minutes || 0;

    // timer local
    let _tSec = timeMin * 60, _tState = 'idle', _tIv = null;
    const _fmtT = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    const _fmtM = m => { if(!m) return '-'; const h=Math.floor(m/60),r=m%60; return h>0?`${h}h ${r}min`:`${r}min`; };

    const overlay = document.createElement('div');
    overlay.id = 'act-detail-card-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9100;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);overflow-y:auto;';

    overlay.innerHTML = `
    <style>
      #act-detail-card { animation:actCardIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both; }
      @keyframes actCardIn { from{opacity:0;transform:translateY(22px) scale(0.96)} to{opacity:1;transform:none} }
      .adc-tab { padding:0.5rem 1.05rem;border:none;background:none;cursor:pointer;font-size:0.81rem;font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;transition:all 0.18s;display:flex;align-items:center;gap:0.3rem;white-space:nowrap; }
      .adc-tab.active { color:${sc};border-bottom-color:${sc}; }
      .adc-tab:hover:not(.active) { color:var(--text-main); }
      .adc-panel { display:none; }
      .adc-panel.active { display:block;animation:adcFadeIn 0.2s ease; }
      @keyframes adcFadeIn { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
      .adc-sec { font-size:0.67rem;font-weight:700;letter-spacing:0.09em;color:var(--text-muted);text-transform:uppercase;margin:0 0 0.75rem;display:flex;align-items:center;gap:0.4rem; }
      .adc-sec::after { content:'';flex:1;height:1px;background:rgba(255,255,255,0.07); }
      .adc-chip { display:inline-flex;align-items:center;gap:0.28rem;padding:0.13rem 0.55rem;border-radius:6px;font-size:0.72rem;background:rgba(255,255,255,0.04);border:1px solid var(--dark-border,rgba(255,255,255,0.08));color:var(--text-muted); }
      .adc-badge { display:inline-flex;align-items:center;gap:0.28rem;padding:0.13rem 0.55rem;border-radius:6px;font-size:0.69rem;font-weight:600;border-width:1px;border-style:solid;letter-spacing:0.01em; }
      #act-detail-card .input-group label { font-size:0.72rem;color:var(--text-muted);margin-bottom:0.3rem;font-weight:500;display:block; }
      #adc-save-btn { transition:all 0.2s; }
      #adc-save-btn:hover:not(:disabled) { transform:translateY(-1px);box-shadow:0 4px 20px rgba(99,102,241,0.5); }
    </style>

    <div id="act-detail-card" style="width:100%;max-width:820px;background:var(--glass-bg,#0c1220);border:1px solid ${sc}28;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;max-height:94vh;box-shadow:0 40px 100px rgba(0,0,0,0.75),0 0 0 1px rgba(255,255,255,0.04);">

      <!-- HEADER -->
      <div style="background:linear-gradient(135deg,${sc}12 0%,transparent 60%);border-bottom:1px solid ${sc}20;padding:1.5rem 2rem 0;flex-shrink:0;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1rem;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;margin-bottom:0.55rem;">
              <span class="adc-badge" style="background:${sc}18;color:${sc};border-color:${sc}44;">
                <span style="width:5px;height:5px;border-radius:50%;background:${sc};display:inline-block;flex-shrink:0;"></span>
                ${a.status||'A Fazer'}
              </span>
              ${pc ? `<span class="adc-badge" style="background:${pc}15;color:${pc};border-color:${pc}35;">${PRIORITY_CONFIG[a.priority]?.label||a.priority}</span>` : ''}
              ${isOverdue ? `<span class="adc-badge" style="background:#ef444415;color:#ef4444;border-color:#ef444438;"><i class="ph ph-warning-circle"></i> Atrasada</span>` : ''}
              ${!isCreateMode && a.activity_type ? `<span class="adc-chip"><i class="ph ${cfg.icon}" style="color:${cfg.color};"></i>${a.activity_type}</span>` : ''}
            </div>
            <h2 style="margin:0 0 0.65rem;font-size:1.2rem;font-weight:800;line-height:1.3;word-break:break-word;">${(a.title||'').replace(/</g,'&lt;')}</h2>
            <div style="display:flex;align-items:center;gap:0.55rem;flex-wrap:wrap;">
              ${a.activity_datetime ? `<span class="adc-chip" style="${isOverdue?'color:#ef4444;border-color:#ef444445;':''}"><i class="ph ph-calendar-blank"></i>${new Date(a.activity_datetime).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>` : ''}
              ${timeMin ? `<span class="adc-chip" style="color:#818cf8;border-color:rgba(99,102,241,0.3);"><i class="ph ph-clock"></i>${_fmtM(timeMin)}</span>` : ''}
              ${a.google_meet_link ? `<a href="${a.google_meet_link}" target="_blank" style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.13rem 0.55rem;border-radius:6px;font-size:0.72rem;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#818cf8;text-decoration:none;"><i class="ph ph-video"></i>Meet</a>` : ''}
            </div>
          </div>
          <button id="adc-close" style="flex-shrink:0;background:rgba(255,255,255,0.05);border:1px solid var(--dark-border);border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);transition:all 0.18s;font-size:0.9rem;" onmouseover="this.style.background='rgba(255,255,255,0.1)';this.style.color='white'" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='var(--text-muted)'">
            <i class="ph ph-x"></i>
          </button>
        </div>

        <div style="display:flex;border-bottom:1px solid var(--dark-border);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
          <button class="adc-tab active" data-tab="info"><i class="ph ph-list-dashes"></i>Informações</button>
          <button class="adc-tab" data-tab="tempo"><i class="ph ph-clock"></i>Tempo</button>
          <button class="adc-tab adc-tab-reuniao" data-tab="reuniao" style="display:${isReuniao?'flex':'none'}"><i class="ph ph-video-camera"></i>Reunião</button>
          <button class="adc-tab" data-tab="proximo"><i class="ph ph-arrow-right-dashed"></i>Próximo Passo</button>
          <button class="adc-tab" data-tab="lembrete"><i class="ph ph-bell"></i>Lembrete</button>
        </div>
      </div>

      <!-- BODY -->
      <div style="flex:1;overflow-y:auto;padding:1.5rem 2rem;">

        <!-- TAB: INFORMAÇÕES -->
        <div class="adc-panel active" id="adc-tab-info">
          <div class="adc-sec"><i class="ph ph-sliders" style="color:${sc};"></i>Configurações</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.85rem;margin-bottom:1.25rem;">
            <div class="input-group">
              <label>Tipo de Atividade</label>
              <select id="adc-type" class="input-control">
                ${ACTIVITY_TYPES.map(t=>`<option value="${t}" ${a.activity_type===t?'selected':''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="input-group">
              <label>Fase da Atividade</label>
              <select id="adc-status" class="input-control">
                ${ACTIVITY_STATUSES.map(s=>`<option value="${s}" ${(a.status||'A Fazer')===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="input-group">
              <label>Prioridade</label>
              <select id="adc-priority" class="input-control">
                <option value="">Sem prioridade</option>
                ${ACTIVITY_PRIORITIES.map(p=>`<option value="${p}" ${a.priority===p?'selected':''}>${PRIORITY_CONFIG[p]?.label||p}</option>`).join('')}
              </select>
            </div>
            <div class="input-group">
              <label><i class="ph ph-calendar" style="color:${sc};"></i> Data e Horário</label>
              <input type="datetime-local" id="adc-datetime" class="input-control" value="${dtLocal}">
            </div>
          </div>

          <div class="adc-sec"><i class="ph ph-building-office" style="color:${sc};"></i>Cliente Vinculado</div>
          <div class="input-group" style="margin-bottom:1.2rem;position:relative;">
            <div style="position:relative;">
              <input type="text" id="adc-company-search" class="input-control" placeholder="Buscar empresa..." autocomplete="off" value="${a.companies?.Nome_da_empresa || ''}" style="padding-right:2rem;">
              <i class="ph ph-magnifying-glass" style="position:absolute;right:0.7rem;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;font-size:0.9rem;"></i>
            </div>
            <div id="adc-company-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:var(--glass-bg,#1a2035);border:1px solid var(--dark-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:180px;overflow-y:auto;margin-top:2px;"></div>
            <input type="hidden" id="adc-company-id" value="${a.company_id||a.companies?.id||companyIdForCreate||''}">
            ${(a.companies?.Nome_da_empresa) ? `<span style="font-size:0.72rem;color:#818cf8;margin-top:0.3rem;display:flex;align-items:center;gap:0.3rem;"><i class="ph ph-check-circle"></i>Vinculado: ${a.companies.Nome_da_empresa}</span>` : '<span style="font-size:0.72rem;color:#ef4444;margin-top:0.3rem;display:block;">\u26a0 Nenhum cliente vinculado</span>'}
          </div>

          <div class="adc-sec"><i class="ph ph-text-align-left" style="color:${sc};"></i>Conteúdo</div>
          <div class="input-group" style="margin-bottom:0.85rem;">
            <label>Título</label>
            <input type="text" id="adc-title" class="input-control" value="${(a.title||'').replace(/"/g,'&quot;')}" style="font-weight:600;font-size:1rem;">
          </div>
          <div class="input-group" style="margin-bottom:1.25rem;">
            <label>Descrição</label>
            <textarea id="adc-desc" class="input-control" rows="4" style="resize:vertical;">${a.description||''}</textarea>
          </div>

          <div class="adc-sec"><i class="ph ph-users" style="color:${sc};"></i>Participantes</div>
          <div style="margin-bottom:1.2rem;">
            <label style="font-size:0.72rem;color:var(--text-muted);font-weight:500;display:block;margin-bottom:0.5rem;">Quem participou desta atividade?</label>
            <div style="margin-bottom:0.3rem;"><span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">ADICIONAR VIA:</span></div>
            <div style="display:flex;gap:0.4rem;margin-bottom:0.3rem;flex-wrap:wrap;">
              <button type="button" class="adc-part-mode active" data-mode="user" style="padding:0.3rem 0.75rem;border-radius:20px;border:1px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.15);color:#818cf8;font-size:0.78rem;cursor:pointer;font-weight:600;transition:all 0.15s;"><i class="ph ph-at"></i> @usuário</button>
              <button type="button" class="adc-part-mode" data-mode="email" style="padding:0.3rem 0.75rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-envelope"></i> E-mail</button>
              <button type="button" class="adc-part-mode" data-mode="whatsapp" style="padding:0.3rem 0.75rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-whatsapp-logo"></i> WhatsApp</button>
            </div>
            <div style="font-size:0.68rem;color:var(--text-muted);opacity:0.65;margin-bottom:0.5rem;">Combine tipos livremente — usuário + e-mail + WhatsApp</div>
            <div style="display:flex;gap:0.5rem;position:relative;">
              <input type="text" id="adc-part-input" class="input-control" placeholder="Buscar usuário..." autocomplete="off" style="flex:1;">
              <div id="adc-part-dropdown" style="display:none;position:absolute;top:100%;left:0;right:3rem;z-index:200;background:var(--glass-bg,#1a2035);border:1px solid var(--dark-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:160px;overflow-y:auto;margin-top:2px;"></div>
              <button type="button" id="adc-part-add" style="padding:0.45rem 0.8rem;border-radius:8px;border:1px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.1);color:#818cf8;cursor:pointer;font-size:0.82rem;"><i class="ph ph-plus"></i></button>
            </div>
            <div id="adc-participants-chips" style="margin-top:0.55rem;display:flex;flex-wrap:wrap;gap:0.35rem;">
              ${(a.activity_assignees||[]).map(r=>`<span class="adc-part-chip" data-id="${r.user_id||r.id||''}" data-type="user" style="display:inline-flex;align-items:center;gap:0.35rem;padding:0.22rem 0.6rem;border-radius:20px;font-size:0.76rem;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);color:#818cf8;"><i class="ph ph-user"></i>${r.user_nome||r.user_id||''}<button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;margin-left:2px;font-size:0.9rem;">×</button></span>`).join('')}
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:0.5rem;">
              <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.75rem;cursor:pointer;color:var(--primary);font-weight:600;">
                <input type="checkbox" id="adc-notify-assign" ${a.notify_on_assign ? 'checked' : ''} style="width:13px;height:13px;accent-color:var(--primary);">
                Notificar responsáveis por e-mail
              </label>
            </div>
          </div>
        </div>

        <!-- TAB: REUNIÃO -->
        <div class="adc-panel" id="adc-tab-reuniao">
          <div class="adc-sec"><i class="ph ph-video-camera" style="color:#6366f1;"></i>Google Meet</div>
          <div style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(99,102,241,0.02));border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:1.5rem;margin-bottom:1.25rem;">
            ${a.activity_type === 'Reunião' ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:1.2rem;">
              <div>
                <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.7rem;">Sala de Reunião</div>
                ${a.google_meet_link
                  ? `<a id="adc-meet-enter-btn" href="${a.google_meet_link}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.65rem 1.3rem;border-radius:10px;background:rgba(99,102,241,0.14);border:1.5px solid rgba(99,102,241,0.4);color:#818cf8;font-weight:700;text-decoration:none;font-size:0.9rem;transition:all 0.2s;"
                       onmouseover="this.style.background='rgba(99,102,241,0.25)'" onmouseout="this.style.background='rgba(99,102,241,0.14)'">
                      <i class="ph ph-video-camera" style="font-size:1.1rem;"></i> Entrar na Reunião
                    </a>
                    <button id="adc-meet-start-btn" style="display:none;"></button>`
                  : `<button id="adc-meet-start-btn" onclick="activities.startMeeting('${a.id}')"
                       style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.65rem 1.3rem;border-radius:10px;background:rgba(99,102,241,0.14);border:1.5px solid rgba(99,102,241,0.4);color:#818cf8;font-weight:700;font-size:0.9rem;cursor:pointer;transition:all 0.2s;"
                       onmouseover="this.style.background='rgba(99,102,241,0.25)'" onmouseout="this.style.background='rgba(99,102,241,0.14)'">
                      <i class="ph ph-video-camera" style="font-size:1.1rem;"></i> Iniciar Reunião
                    </button>
                    <a id="adc-meet-enter-btn" href="#" target="_blank" rel="noopener noreferrer" style="display:none;"></a>`
                }
              </div>
              <div style="display:flex; flex-direction:column; gap:0.5rem;">
                <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Notificações Automatizadas</div>
                <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;font-size:0.78rem;">
                  <input type="checkbox" id="adc-send-invite" ${a.send_invite_email ? 'checked' : ''} style="accent-color:#6366f1;"> Convite por e-mail
                </label>
                <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;font-size:0.78rem;">
                  <input type="checkbox" id="adc-send-summary" ${a.send_summary_email ? 'checked' : ''} style="accent-color:#10b981;"> Resumo ao concluir
                </label>
                <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;font-size:0.78rem;">
                  <input type="checkbox" id="adc-send-recording" ${a.send_recording_email ? 'checked' : ''} style="accent-color:#ef4444;"> Aviso de gravação
                </label>
              </div>
            </div>
            <div class="input-group" style="margin-bottom:1rem;">
                <label style="font-size:0.75rem;"><i class="ph ph-link" style="color:#818cf8;"></i> Link Google Meet</label>
                <input type="url" id="adc-meet-link" class="input-control" placeholder="https://meet.google.com/xxx" value="${a.google_meet_link||''}">
            </div>
            <div class="input-group" style="margin-bottom:1rem;">
                <label style="font-size:0.75rem;">URL do Vídeo da Gravação</label>
                <input type="url" id="adc-recording-url" class="input-control" placeholder="Link da gravação" value="${a.recording_url || ''}">
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);display:flex;align-items:flex-start;gap:0.45rem;">
              <i class="ph ph-info" style="flex-shrink:0;margin-top:0.1rem;"></i>
              ${a.google_meet_link
                ? `Link ativo: <a href="${a.google_meet_link}" target="_blank" style="color:#818cf8;word-break:break-all;">${a.google_meet_link}</a>`
                : 'Clique em <strong style="color:#818cf8;">Iniciar Reunião</strong> para criar uma sala. O link será salvo automaticamente nesta atividade.'}
            </div>` : `
            <div style="text-align:center;padding:2rem;color:var(--text-muted)">
              <i class="ph ph-video-camera-slash" style="font-size:2.5rem;display:block;margin-bottom:0.5rem;opacity:0.35;"></i>
              Integração Google Meet disponível apenas para atividades do tipo <strong>Reunião</strong>.
            </div>`}
          </div>

          ${(() => {
            const recs = (a.activity_attachments || []).filter(att => att.file_type === 'meet_recording');
            if (!recs.length) return '';
            return `
            <div class="adc-sec" style="margin-top:0.5rem;"><i class="ph ph-record" style="color:#ef4444;"></i>Gravações</div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              ${recs.map(rec => `
              <div class="meet-recording-card" style="display:flex;align-items:center;gap:0.85rem;padding:0.85rem 1rem;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:10px;">
                <i class="ph ph-record" style="font-size:1.4rem;color:#ef4444;flex-shrink:0;"></i>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:0.84rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${rec.file_name}">${rec.file_name}</div>
                  <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem;">Gravação da Reunião${rec.file_size ? ' · ' + (rec.file_size/1024/1024).toFixed(1) + ' MB' : ''}</div>
                </div>
                <a href="${rec.file_url}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-primary" style="flex-shrink:0;display:inline-flex;align-items:center;gap:0.35rem;padding:0.35rem 0.85rem;font-size:0.78rem;">
                  <i class="ph ph-play-circle"></i> Assistir
                </a>
              </div>`).join('')}
            </div>`;
          })()}
        </div>

        <!-- TAB: TEMPO -->
        <div class="adc-panel" id="adc-tab-tempo">
          <div class="adc-sec"><i class="ph ph-timer" style="color:#6366f1;"></i>Cronômetro</div>
          <div style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(99,102,241,0.02));border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:1.5rem;margin-bottom:1.2rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
              <div>
                <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.35rem;">Tempo Trabalhado</div>
                <div id="adc-timer-display" style="font-size:2.2rem;font-weight:800;font-family:monospace;letter-spacing:0.08em;color:#818cf8;">${_fmtT(_tSec)}</div>
              </div>
              <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                <button type="button" id="adc-timer-start" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:0.4rem;"><i class="ph ph-play"></i> Iniciar</button>
                <button type="button" id="adc-timer-pause" class="btn btn-secondary btn-sm" style="display:none;align-items:center;gap:0.4rem;"><i class="ph ph-pause"></i> Pausar</button>
                <button type="button" id="adc-timer-resume" class="btn btn-secondary btn-sm" style="display:none;align-items:center;gap:0.4rem;"><i class="ph ph-play"></i> Retomar</button>
                <button type="button" id="adc-timer-stop" class="btn btn-danger btn-sm" style="display:none;align-items:center;gap:0.4rem;"><i class="ph ph-stop"></i> Finalizar</button>
              </div>
            </div>
          </div>
          <div class="adc-sec"><i class="ph ph-pencil-simple" style="color:#6366f1;"></i>Ou informe manualmente</div>
          <div class="input-group">
            <label>Tempo em minutos — ex: 90 = 1h30min</label>
            <input type="number" id="adc-time-min" class="input-control" min="0" placeholder="ex: 30" value="${timeMin||''}">
          </div>
          ${timeMin ? `<div style="margin-top:0.6rem;padding:0.55rem 0.85rem;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.18);border-radius:8px;font-size:0.82rem;color:#818cf8;display:flex;align-items:center;gap:0.4rem;"><i class="ph ph-clock"></i> Tempo salvo: <strong>${_fmtM(timeMin)}</strong></div>` : ''}
        </div>

        <!-- TAB: PRÓXIMO PASSO -->
        <div class="adc-panel" id="adc-tab-proximo">

          <!-- Contextual hint -->
          <div style="display:flex;align-items:flex-start;gap:0.55rem;padding:0.65rem 0.85rem;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.13);border-radius:8px;margin-bottom:1.1rem;font-size:0.79rem;color:var(--text-muted);line-height:1.45;">
            <i class="ph ph-lightbulb" style="color:#10b981;font-size:1rem;flex-shrink:0;margin-top:1px;"></i>
            <span>Defina a <strong style="color:var(--text-main);">ação que deve ocorrer após esta atividade</strong> — como um follow-up, envio de proposta ou nova reunião. Salvo junto com "Salvar Alterações".</span>
          </div>

          <!-- Form -->
          <div style="background:linear-gradient(135deg,rgba(16,185,129,0.06),rgba(16,185,129,0.01));border:1px solid rgba(16,185,129,0.15);border-radius:12px;padding:1.2rem;">
            <div class="input-group" style="margin-bottom:0.8rem;">
              <label style="font-weight:600;">O que fazer a seguir?</label>
              <input type="text" id="adc-next-title" class="input-control" value="${(a.next_step_title||'').replace(/"/g,'&quot;')}" placeholder="Ex: Ligar na segunda, Enviar proposta, Agendar demo...">
            </div>
            <div class="input-group" style="margin-bottom:0.8rem;">
              <label>Prazo</label>
              <input type="date" id="adc-next-date" class="input-control" value="${nextDt}">
              <label id="adc-wrapper-next-reminder" style="display:${nextDt ? 'flex' : 'none'}; align-items:center; gap:0.35rem; font-size:0.72rem; cursor:pointer; color:#10b981; font-weight:600; margin-top:0.4rem;">
                <input type="checkbox" id="adc-next-reminder" ${a.next_step_reminder_email ? 'checked' : ''} style="width:13px;height:13px;accent-color:#10b981;">
                Lembrar por e-mail (1 dia antes)
              </label>
            </div>
            <div style="margin-bottom:0;">
              <label style="font-size:0.72rem;color:var(--text-muted);font-weight:500;display:block;margin-bottom:0.5rem;">Quem executa?</label>
              <div style="margin-bottom:0.35rem;"><span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">Adicionar via:</span></div>
              <div style="display:flex;gap:0.4rem;margin-bottom:0.3rem;flex-wrap:wrap;">
                <button type="button" class="adc-nxt-mode active" data-mode="user" style="padding:0.28rem 0.65rem;border-radius:20px;border:1px solid rgba(16,185,129,0.5);background:rgba(16,185,129,0.12);color:#10b981;font-size:0.76rem;cursor:pointer;font-weight:600;transition:all 0.15s;"><i class="ph ph-at"></i> @usuário</button>
                <button type="button" class="adc-nxt-mode" data-mode="email" style="padding:0.28rem 0.65rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.76rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-envelope"></i> E-mail</button>
                <button type="button" class="adc-nxt-mode" data-mode="whatsapp" style="padding:0.28rem 0.65rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.76rem;cursor:pointer;font-weight:500;transition:all 0.15s;"><i class="ph ph-whatsapp-logo"></i> WhatsApp</button>
              </div>
              <div style="font-size:0.68rem;color:var(--text-muted);opacity:0.65;margin-bottom:0.5rem;">Combine tipos livremente — usuário + e-mail + WhatsApp</div>
              <div style="display:flex;gap:0.5rem;position:relative;">
                <input type="text" id="adc-nxt-input" class="input-control" placeholder="Buscar usuário..." autocomplete="off" style="flex:1;">
                <div id="adc-nxt-dropdown" style="display:none;position:absolute;top:100%;left:0;right:3rem;z-index:200;background:var(--glass-bg,#1a2035);border:1px solid var(--dark-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-height:150px;overflow-y:auto;margin-top:2px;"></div>
                <button type="button" id="adc-nxt-add-btn" style="padding:0.45rem 0.8rem;border-radius:8px;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.1);color:#10b981;cursor:pointer;font-size:0.82rem;"><i class="ph ph-plus"></i></button>
              </div>
              <div id="adc-nxt-chips" style="margin-top:0.55rem;display:flex;flex-wrap:wrap;gap:0.35rem;">
                ${(a.activity_next_step_responsibles||[]).map(r=>`
                  <span class="adc-nxt-chip" data-id="${r.user_id||r.id||''}" data-type="user" style="display:inline-flex;align-items:center;gap:0.35rem;padding:0.22rem 0.6rem;border-radius:20px;font-size:0.76rem;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#10b981;">
                    <i class="ph ph-user"></i>${r.user_nome||r.user_id||''}
                    <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;margin-left:2px;font-size:0.9rem;">&times;</button>
                  </span>`).join('')}
              </div>
            </div>
          </div>

          ${a.next_step_title ? `
          <div style="margin-top:0.9rem;padding:0.7rem 0.9rem;background:rgba(16,185,129,0.05);border-left:3px solid #10b981;border-radius:0 8px 8px 0;display:flex;align-items:flex-start;gap:0.55rem;">
            <i class="ph ph-check-circle" style="color:#10b981;flex-shrink:0;margin-top:2px;"></i>
            <div style="flex:1;font-size:0.82rem;">
              <div style="font-weight:600;color:var(--text-main);">${a.next_step_title}</div>
              <div style="color:var(--text-muted);margin-top:0.2rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
                ${nextDt ? `<span><i class="ph ph-calendar"></i> ${new Date(nextDt+'T12:00:00').toLocaleDateString('pt-BR')}</span>` : ''}
                ${nextStepResp ? `<span><i class="ph ph-user"></i> ${nextStepResp}</span>` : ''}
              </div>
            </div>
            <span style="font-size:0.7rem;color:#10b981;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Salvo</span>
          </div>` : ''}
        </div>

        <!-- TAB: LEMBRETE -->
        <div class="adc-panel" id="adc-tab-lembrete" data-activity-dt="${dtLocal}">

          <!-- Contextual hint -->
          <div style="display:flex;align-items:flex-start;gap:0.55rem;padding:0.65rem 0.85rem;background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.13);border-radius:8px;margin-bottom:1.1rem;font-size:0.79rem;color:var(--text-muted);line-height:1.45;">
            <i class="ph ph-bell" style="color:#f59e0b;font-size:1rem;flex-shrink:0;margin-top:1px;"></i>
            <span>Receba uma notificação para não esquecer de agir. O lembrete é enviado no horário que você definir abaixo.</span>
          </div>

          <!-- Quick presets -->
          <div style="margin-bottom:0.9rem;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;">Lembrar com antecedência</div>
            <div style="display:flex;gap:0.45rem;flex-wrap:wrap;" id="adc-reminder-presets">
              <button type="button" class="adc-reminder-preset" data-offset="-15" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.07);color:#f59e0b;font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">15 min antes</button>
              <button type="button" class="adc-reminder-preset" data-offset="-60" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.07);color:#f59e0b;font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">1 hora antes</button>
              <button type="button" class="adc-reminder-preset" data-offset="-1440" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.07);color:#f59e0b;font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">1 dia antes</button>
              <button type="button" class="adc-reminder-preset" data-offset="0" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.07);color:#f59e0b;font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">Na data</button>
              <button type="button" class="adc-reminder-preset" data-offset="custom" style="padding:0.35rem 0.75rem;border-radius:20px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;font-weight:500;transition:all 0.15s;">Personalizado</button>
            </div>
          </div>

          <!-- Datetime input + channels -->
          <div style="background:linear-gradient(135deg,rgba(245,158,11,0.07),rgba(245,158,11,0.01));border:1px solid rgba(245,158,11,0.15);border-radius:12px;padding:1.2rem;margin-bottom:1rem;">
            <div class="input-group" style="margin-bottom:0.9rem;">
              <label>Data e Hora do Lembrete</label>
              <input type="datetime-local" id="adc-reminder-at" class="input-control" value="${reminderAt}">
            </div>
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;">Notificar por</div>
              <div style="display:flex;gap:1rem;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:0.45rem;cursor:pointer;font-size:0.84rem;padding:0.4rem 0.8rem;border-radius:8px;border:1px solid ${a.reminder_email?'rgba(99,102,241,0.35)':'var(--dark-border)'};background:${a.reminder_email?'rgba(99,102,241,0.08)':'transparent'};transition:all 0.15s;" id="adc-email-label">
                  <input type="checkbox" id="adc-reminder-email" ${a.reminder_email?'checked':''} style="width:14px;height:14px;accent-color:var(--primary,#6366f1);cursor:pointer;">
                  <i class="ph ph-envelope" style="color:#6366f1;"></i> E-mail
                </label>
                <label style="display:flex;align-items:center;gap:0.45rem;cursor:pointer;font-size:0.84rem;padding:0.4rem 0.8rem;border-radius:8px;border:1px solid ${a.reminder_whatsapp?'rgba(37,211,102,0.35)':'var(--dark-border)'};background:${a.reminder_whatsapp?'rgba(37,211,102,0.08)':'transparent'};transition:all 0.15s;" id="adc-wpp-label">
                  <input type="checkbox" id="adc-reminder-wpp" ${a.reminder_whatsapp?'checked':''} style="width:14px;height:14px;accent-color:#25d366;cursor:pointer;">
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
                ${a.reminder_email ? '<span><i class="ph ph-envelope"></i> E-mail</span>' : ''}
                ${a.reminder_whatsapp ? '<span><i class="ph ph-whatsapp-logo"></i> WhatsApp</span>' : ''}
              </div>
            </div>
            <span style="font-size:0.7rem;color:#f59e0b;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Salvo</span>
          </div>` : ''}
        </div>
      </div>

      <!-- FOOTER -->
      <div style="padding:1rem 2rem;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;gap:0.75rem;background:rgba(0,0,0,0.2);flex-shrink:0;">
        ${isCreateMode
          ? `<div></div>` /* placeholder para manter space-between */
          : `<button id="adc-delete-btn" style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.22);border-radius:8px;padding:0.55rem 1rem;cursor:pointer;color:#ef4444;font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.16)'" onmouseout="this.style.background='rgba(239,68,68,0.07)'">
               <i class="ph ph-trash"></i> Excluir
             </button>`
        }
        <div style="display:flex;gap:0.6rem;align-items:center;">
          <button id="adc-cancel-btn" class="btn btn-secondary">Cancelar</button>
          <button id="adc-save-btn" class="btn btn-primary" style="display:flex;align-items:center;gap:0.45rem;padding:0.55rem 1.35rem;font-weight:700;">
            <i class="ph ph-floppy-disk"></i> Salvar Alterações
          </button>
        </div>
      </div>
    </div>`;

    document.body.appendChild(overlay);

    // ── pending attachments ────────────────────────────────────────────────────
    let _adcFiles = [];
    window._adcAddFile = (file) => {
        _adcFiles.push(file);
        const container = document.getElementById('adc-pending-files');
        if (!container) return;
        container.innerHTML = _adcFiles.map((f,i) => `
            <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.7rem;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.07);font-size:0.8rem;">
                <i class="ph ph-file" style="color:var(--primary);"></i>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
                <span style="color:var(--text-muted);flex-shrink:0;">${(f.size/1024).toFixed(0)}KB</span>
                <button type="button" onclick="window._adcRemoveFile(${i})" style="background:none;border:none;cursor:pointer;color:var(--danger);padding:0;"><i class="ph ph-x"></i></button>
            </div>`
        ).join('');
    };
    window._adcRemoveFile = (i) => { _adcFiles.splice(i,1); window._adcAddFile.__refresh?.(); };

    // ── tabs ──────────────────────────────────────────────────────────────────
    overlay.querySelectorAll('.adc-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.querySelectorAll('.adc-tab').forEach(b => b.classList.remove('active'));
            overlay.querySelectorAll('.adc-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            overlay.querySelector(`#adc-tab-${btn.dataset.tab}`)?.classList.add('active');
        });
    });

    // Aba Reunião: mostrar/ocultar conforme tipo selecionado
    document.getElementById('adc-type')?.addEventListener('change', (e) => {
        const reunTab = overlay.querySelector('.adc-tab-reuniao');
        if (reunTab) reunTab.style.display = e.target.value === 'Reunião' ? 'flex' : 'none';
        if (e.target.value !== 'Reunião') {
            // Se estava na aba reunião, volta para info
            const rPanel = document.getElementById('adc-tab-reuniao');
            if (rPanel?.classList.contains('active')) {
                rPanel.classList.remove('active');
                document.getElementById('adc-tab-info')?.classList.add('active');
                overlay.querySelector('.adc-tab[data-tab="info"]')?.classList.add('active');
                overlay.querySelector('.adc-tab[data-tab="reuniao"]')?.classList.remove('active');
            }
        }
    });

    // Listeners condicionais no Card
    document.getElementById('adc-next-date')?.addEventListener('input', (e) => {
        const wrapper = document.getElementById('adc-wrapper-next-reminder');
        if (wrapper) wrapper.style.display = e.target.value ? 'flex' : 'none';
    });

    // ── Carregamento de Sessões Registradas ───────────────────────────────────
    async function _adcLoadTimeLogs(activityId) {
        const tbody = document.getElementById('adc-time-logs-body');
        if (!tbody) return;
        try {
            const res = await fetch(`/api/activities/${activityId}/time-logs`);
            if (!res.ok) throw new Error('Erro');
            const logs = await res.json();
            if (!logs || logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:1.2rem;color:var(--text-muted);font-size:0.8rem;"><i class="ph ph-clock-countdown" style="font-size:1.4rem;display:block;margin:0 auto 0.4rem;"></i>Nenhuma sessão registrada ainda.</td></tr>`;
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
                  <td style="padding:0.45rem 0.6rem;white-space:nowrap;"><span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.15rem 0.5rem;border-radius:5px;background:rgba(99,102,241,0.1);color:#818cf8;font-size:0.78rem;font-weight:600;border:1px solid rgba(99,102,241,0.25);"><i class="ph ph-clock"></i>${durFmt}</span></td>
                  <td style="padding:0.35rem 0.6rem;"><input type="text" class="adc-tl-subject" data-log-id="${log.id}" value="${subj}" placeholder="Adicionar assunto..." style="background:transparent;border:1px solid transparent;border-radius:5px;padding:0.2rem 0.45rem;font-size:0.81rem;color:var(--text-main);width:100%;min-width:120px;transition:all 0.15s;outline:none;" onfocus="this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='rgba(99,102,241,0.35)';" onblur="this.style.background='transparent';this.style.borderColor='transparent';"></td>
                  <td style="padding:0.35rem 0.3rem;text-align:center;"><button type="button" class="adc-tl-del" data-log-id="${log.id}" style="background:none;border:none;cursor:pointer;color:rgba(239,68,68,0.5);font-size:0.9rem;padding:0.15rem 0.3rem;border-radius:4px;transition:all 0.15s;line-height:1;" onmouseover="this.style.color='#ef4444';this.style.background='rgba(239,68,68,0.08)';" onmouseout="this.style.color='rgba(239,68,68,0.5)';this.style.background='none';"><i class="ph ph-trash"></i></button></td>
                </tr>`;
            }).join('');
            // Editar assunto e excluir sessão
            let _subDebT = null;
            tbody.querySelectorAll('.adc-tl-subject').forEach(inp => {
                inp.addEventListener('input', () => {
                    clearTimeout(_subDebT);
                    _subDebT = setTimeout(async () => {
                        try { await fetch(`/api/activities/time-logs/${inp.dataset.logId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: inp.value }) }); } catch(e) {}
                    }, 600);
                });
            });
            tbody.querySelectorAll('.adc-tl-del').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (btn.dataset.confirming === '1') return;
                    btn.dataset.confirming = '1';
                    const td = btn.closest('td');
                    const origHtml = td.innerHTML;
                    td.innerHTML = `<div style="display:flex;align-items:center;gap:0.4rem;white-space:nowrap;"><span style="font-size:0.75rem;color:var(--text-muted);">Remover?</span><button type="button" id="adc-tl-yes-${btn.dataset.logId}" style="padding:0.15rem 0.5rem;border-radius:4px;border:1px solid rgba(239,68,68,0.5);background:rgba(239,68,68,0.12);color:#ef4444;font-size:0.75rem;cursor:pointer;font-weight:600;">Sim</button><button type="button" id="adc-tl-no-${btn.dataset.logId}" style="padding:0.15rem 0.5rem;border-radius:4px;border:1px solid var(--dark-border);background:transparent;color:var(--text-muted);font-size:0.75rem;cursor:pointer;">Não</button></div>`;
                    document.getElementById(`adc-tl-no-${btn.dataset.logId}`)?.addEventListener('click', (ev) => { ev.stopPropagation(); _adcLoadTimeLogs(a.id); });
                    document.getElementById(`adc-tl-yes-${btn.dataset.logId}`)?.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        try { await fetch(`/api/activities/time-logs/${btn.dataset.logId}`, { method: 'DELETE' }); _adcLoadTimeLogs(a.id); } catch(err) { utils.showToast('Erro ao remover sessão', 'error'); }
                    });
                });
            });
        } catch(e) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:1rem;color:#ef4444;font-size:0.8rem;">Erro ao carregar sessões.</td></tr>`;
        }
    }
    // Carregar sessões ao abrir aba Tempo
    overlay.querySelectorAll('.adc-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.tab === 'tempo' && !isCreateMode) _adcLoadTimeLogs(a.id);
        });
    });
    // Carregar se já iniciou na aba Tempo
    if (!isCreateMode) _adcLoadTimeLogs(a.id);

    // ── Autocomplete de Empresa ───────────────────────────────────────────────
    (function() {
        let _debT = null;
        const srch = document.getElementById('adc-company-search');
        const drop = document.getElementById('adc-company-dropdown');
        const hid  = document.getElementById('adc-company-id');
        if (!srch || !drop) return;
        async function _fetchCo(q) {
            try {
                const res = await fetch(`/api/companies/search?q=${encodeURIComponent(q)}&limit=10`);
                if (!res.ok) return;
                const list = await res.json();
                if (!list.length) { drop.style.display='none'; return; }
                drop.innerHTML = list.map(c=>`
                    <div class="adc-co-opt" data-id="${c.id}" data-name="${c.Nome_da_empresa}"
                        style="padding:0.5rem 0.85rem;cursor:pointer;font-size:0.84rem;display:flex;align-items:center;gap:0.5rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <i class="ph ph-building-office" style="color:var(--primary);flex-shrink:0;"></i>
                        <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.Nome_da_empresa}</span>
                        ${c.Status?`<span style="font-size:0.7rem;color:var(--text-muted);">${c.Status}</span>`:''}
                    </div>`).join('');
                drop.style.display='block';
                drop.querySelectorAll('.adc-co-opt').forEach(el=>{
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

    // ── Componente Quem Executa (Próximo Passo) ───────────────────────────────
    (function() {
        let _nxtMode = 'user', _usuarios = [], _debT = null;
        fetch('/api/usuarios').then(r=>r.ok?r.json():[]).then(l=>{ _usuarios=l; }).catch(()=>{});

        overlay.querySelectorAll('.adc-nxt-mode').forEach(btn => {
            btn.addEventListener('click', () => {
                _nxtMode = btn.dataset.mode;
                overlay.querySelectorAll('.adc-nxt-mode').forEach(b => {
                    const on = b.dataset.mode === _nxtMode;
                    b.style.background = on?'rgba(16,185,129,0.12)':'transparent';
                    b.style.borderColor = on?'rgba(16,185,129,0.5)':'var(--dark-border)';
                    b.style.color = on?'#10b981':'var(--text-muted)';
                    b.style.fontWeight = on?'600':'500';
                });
                const inp = document.getElementById('adc-nxt-input');
                if(inp){ inp.placeholder={user:'Buscar usuário...',email:'Ex: fulano@email.com',whatsapp:'Ex: 11999998888'}[_nxtMode]||''; inp.value=''; }
                const drop = document.getElementById('adc-nxt-dropdown');
                if(drop) drop.style.display='none';
            });
        });

        const nxtInput = document.getElementById('adc-nxt-input');
        const nxtDrop  = document.getElementById('adc-nxt-dropdown');
        if (nxtInput && nxtDrop) {
            const showDrop = q => {
                if(_nxtMode!=='user'){ nxtDrop.style.display='none'; return; }
                const m = _usuarios.filter(u=>u.nome.toLowerCase().includes(q.toLowerCase())).slice(0,5);
                if(!m.length){ nxtDrop.style.display='none'; return; }
                nxtDrop.innerHTML = m.map(u=>`<div class="adc-nu-opt" data-id="${u.id}" data-nome="${u.nome}" style="padding:0.42rem 0.7rem;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.45rem;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="width:24px;height:24px;border-radius:50%;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.67rem;font-weight:700;flex-shrink:0;">${u.nome[0]}</span>${u.nome}</div>`).join('');
                nxtDrop.style.display='block';
                nxtDrop.querySelectorAll('.adc-nu-opt').forEach(el=>{
                    el.addEventListener('mouseover',()=>el.style.background='rgba(16,185,129,0.1)');
                    el.addEventListener('mouseout',()=>el.style.background='');
                    el.addEventListener('mousedown',ev=>{ev.preventDefault();adcAddNxtChip(el.dataset.id,el.dataset.nome,'user');nxtInput.value='';nxtDrop.style.display='none';});
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
                        adcAddNxtChip(v, v, _nxtMode);
                        nxtInput.value = '';
                        nxtDrop.style.display = 'none';
                    }
                }
            });
        }

        function adcAddNxtChip(id, label, type) {
            const chips = document.getElementById('adc-nxt-chips'); if(!chips) return;
            const icons = {user:'ph-user',email:'ph-envelope',whatsapp:'ph-whatsapp-logo'};
            const styles = {user:'rgba(16,185,129,0.12)|rgba(16,185,129,0.3)|#10b981',email:'rgba(6,182,212,0.12)|rgba(6,182,212,0.3)|#22d3ee',whatsapp:'rgba(37,211,102,0.1)|rgba(37,211,102,0.3)|#25d366'};
            const [bg,bdr,clr] = (styles[type]||styles.user).split('|');
            const sp = document.createElement('span');
            sp.className='adc-nxt-chip'; sp.dataset.id=id; sp.dataset.type=type;
            sp.style.cssText=`display:inline-flex;align-items:center;gap:0.35rem;padding:0.22rem 0.6rem;border-radius:20px;font-size:0.76rem;background:${bg};border:1px solid ${bdr};color:${clr};`;
            sp.innerHTML=`<i class="ph ${icons[type]||'ph-user'}"></i>${label}<button type="button" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;margin-left:2px;font-size:0.9rem;">×</button>`;
            sp.querySelector('button').addEventListener('click',()=>sp.remove());
            chips.appendChild(sp);
        }

        overlay.querySelector('#adc-nxt-add-btn')?.addEventListener('click',()=>{
            const v=document.getElementById('adc-nxt-input')?.value?.trim(); if(!v) return;
            adcAddNxtChip(v,v,_nxtMode); document.getElementById('adc-nxt-input').value='';
        });
    })();

    // ── Reminder presets ────────────────────────────────────────────────────────
    overlay.querySelectorAll('.adc-reminder-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const reminderInput = document.getElementById('adc-reminder-at');
            const offset = btn.dataset.offset;
            if (offset === 'custom') { reminderInput?.focus(); return; }
            const tabEl = document.getElementById('adc-tab-lembrete');
            const actDt = tabEl?.dataset.activityDt;
            const base = actDt ? new Date(actDt) : new Date();
            base.setMinutes(base.getMinutes() + parseInt(offset, 10));
            const iso = new Date(base.getTime() - base.getTimezoneOffset()*60000).toISOString().slice(0,16);
            if (reminderInput) reminderInput.value = iso;
        });
        btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.75'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    });

    // ── Reminder channel toggle style ──────────────────────────────────────────
    ['adc-reminder-email','adc-reminder-wpp'].forEach(id => {
        const chk = document.getElementById(id);
        const lbl = document.getElementById(id === 'adc-reminder-email' ? 'adc-email-label' : 'adc-wpp-label');
        if (!chk || !lbl) return;
        const [borderOn, bgOn] = id === 'adc-reminder-email'
            ? ['rgba(99,102,241,0.35)','rgba(99,102,241,0.08)']
            : ['rgba(37,211,102,0.35)','rgba(37,211,102,0.08)'];
        chk.addEventListener('change', () => {
            lbl.style.borderColor = chk.checked ? borderOn : 'var(--dark-border)';
            lbl.style.background  = chk.checked ? bgOn     : 'transparent';
        });
    });

    // ── Participantes multi-modo ───────────────────────────────────────────────
    let _adcPartMode = 'user', _adcUsuarios = [], _adcDebT = null;
    fetch('/api/usuarios').then(r=>r.ok?r.json():[]).then(l=>{ _adcUsuarios=l; }).catch(()=>{});

    overlay.querySelectorAll('.adc-part-mode').forEach(btn => {
        btn.addEventListener('click', () => {
            _adcPartMode = btn.dataset.mode;
            overlay.querySelectorAll('.adc-part-mode').forEach(b => {
                const on = b.dataset.mode === _adcPartMode;
                b.style.background = on?'rgba(99,102,241,0.15)':'transparent';
                b.style.borderColor = on?'rgba(99,102,241,0.5)':'var(--dark-border)';
                b.style.color = on?'#818cf8':'var(--text-muted)';
                b.style.fontWeight = on?'600':'500';
            });
            const inp = overlay.querySelector('#adc-part-input');
            if(inp){ 
                inp.placeholder = {user:'Buscar usuário...', email:'Ex: fulano@email.com', whatsapp:'Ex: 11999998888'}[_adcPartMode]||''; 
                inp.value=''; 
            }
            const drop = overlay.querySelector('#adc-part-dropdown');
            if(drop) drop.style.display='none';
        });
    });

    const adcPartInput = overlay.querySelector('#adc-part-input');
    const adcPartDrop  = overlay.querySelector('#adc-part-dropdown');
    if(adcPartInput && adcPartDrop) {
        const showDrop = q => {
            if(_adcPartMode !== 'user'){ adcPartDrop.style.display='none'; return; }
            const m = _adcUsuarios.filter(u=>u.nome.toLowerCase().includes(q.toLowerCase())).slice(0,6);
            if(!m.length){ adcPartDrop.style.display='none'; return; }
            adcPartDrop.innerHTML = m.map(u=>`<div class="adc-part-opt" data-id="${u.id}" data-nome="${u.nome}" style="padding:0.42rem 0.7rem;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.45rem;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.67rem;font-weight:700;flex-shrink:0;">${u.nome[0]}</span>${u.nome}</div>`).join('');
            adcPartDrop.style.display='block';
            adcPartDrop.querySelectorAll('.adc-part-opt').forEach(el=>{
                el.addEventListener('mouseover',()=>el.style.background='rgba(99,102,241,0.1)');
                el.addEventListener('mouseout',()=>el.style.background='');
                el.addEventListener('mousedown',ev=>{ev.preventDefault();adcAddChip(el.dataset.id,el.dataset.nome,'user');adcPartInput.value='';adcPartDrop.style.display='none';});
            });
        };
        adcPartInput.addEventListener('input',()=>{clearTimeout(_adcDebT);_adcDebT=setTimeout(()=>showDrop(adcPartInput.value),200);});
        adcPartInput.addEventListener('focus',()=>{ if(_adcPartMode==='user') showDrop(adcPartInput.value); });
        adcPartInput.addEventListener('blur', ()=>{ setTimeout(()=>adcPartDrop.style.display='none',200); });

        // Suporte ao Enter no input de participantes
        adcPartInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const v = adcPartInput.value.trim();
                if (v) {
                    adcAddChip(v, v, _adcPartMode);
                    adcPartInput.value = '';
                    adcPartDrop.style.display = 'none';
                }
            }
        });
    }

    function adcAddChip(id, label, type) {
        const chips = document.getElementById('adc-participants-chips'); if(!chips) return;
        const icons = {user:'ph-user',email:'ph-envelope',whatsapp:'ph-whatsapp-logo'};
        const styles = {user:'rgba(99,102,241,0.12)|rgba(99,102,241,0.3)|#818cf8',email:'rgba(6,182,212,0.12)|rgba(6,182,212,0.3)|#22d3ee',whatsapp:'rgba(37,211,102,0.1)|rgba(37,211,102,0.3)|#25d366'};
        const [bg,bdr,clr] = (styles[type]||styles.user).split('|');
        const sp = document.createElement('span');
        sp.dataset.id=id; sp.dataset.type=type;
        sp.style.cssText=`display:inline-flex;align-items:center;gap:0.35rem;padding:0.22rem 0.6rem;border-radius:20px;font-size:0.76rem;background:${bg};border:1px solid ${bdr};color:${clr};`;
        sp.innerHTML=`<i class="ph ${icons[type]||'ph-user'}"></i>${label}<button type="button" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;line-height:1;margin-left:2px;font-size:0.9rem;">×</button>`;
        sp.querySelector('button').addEventListener('click',()=>sp.remove());
        chips.appendChild(sp);
    }

    overlay.querySelector('#adc-part-add')?.addEventListener('click',()=>{
        const v = overlay.querySelector('#adc-part-input')?.value?.trim(); 
        if(!v) return;
        adcAddChip(v, v, _adcPartMode); 
        const inp = overlay.querySelector('#adc-part-input');
        if (inp) inp.value='';
    });

    // ── close ─────────────────────────────────────────────────────────────────
    function _closeCard() {
        clearInterval(_tIv);
        delete window._adcAddFile;
        delete window._adcRemoveFile;
        overlay.style.opacity = '0'; overlay.style.transition = 'opacity 0.18s';
        setTimeout(() => overlay.remove(), 200);
    }
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeCard(); });
    document.getElementById('adc-close').addEventListener('click', _closeCard);
    document.getElementById('adc-cancel-btn').addEventListener('click', _closeCard);
    function _onEsc(e) { if(e.key==='Escape'){_closeCard();document.removeEventListener('keydown',_onEsc);}}
    document.addEventListener('keydown', _onEsc);

    // ── timer ──────────────────────────────────────────────────────────────────
    const _updT = () => { const el=document.getElementById('adc-timer-display'); if(el) el.textContent=_fmtT(_tSec); };
    document.getElementById('adc-timer-start').addEventListener('click', () => {
        if(_tState!=='idle') return; _tState='running';
        _tIv = setInterval(()=>{ _tSec++; _updT(); },1000);
        document.getElementById('adc-timer-start').style.display='none';
        document.getElementById('adc-timer-pause').style.display='flex';
        document.getElementById('adc-timer-stop').style.display='flex';
    });
    document.getElementById('adc-timer-pause').addEventListener('click', () => {
        if(_tState!=='running') return; _tState='paused'; clearInterval(_tIv);
        document.getElementById('adc-timer-pause').style.display='none';
        document.getElementById('adc-timer-resume').style.display='flex';
    });
    document.getElementById('adc-timer-resume').addEventListener('click', () => {
        if(_tState!=='paused') return; _tState='running';
        _tIv=setInterval(()=>{ _tSec++; _updT(); },1000);
        document.getElementById('adc-timer-resume').style.display='none';
        document.getElementById('adc-timer-pause').style.display='flex';
    });
    document.getElementById('adc-timer-stop').addEventListener('click', () => {
        clearInterval(_tIv); _tState='idle';
        const el=document.getElementById('adc-time-min'); if(el) el.value=Math.ceil(_tSec/60);
        ['adc-timer-start','adc-timer-pause','adc-timer-resume','adc-timer-stop'].forEach(id=>{ const e=document.getElementById(id);if(e)e.style.display='none'; });
        utils.showToast(`Tempo registrado: ${_fmtM(Math.ceil(_tSec/60))}`, 'success');
    });

    // ── delete (somente modo edição) ──────────────────────────────────────────
    if (!isCreateMode) {
        document.getElementById('adc-delete-btn')?.addEventListener('click', () => {
            confirmar(`Excluir "${a.title}"?`, async () => {
                try {
                    await _deleteActivityApi(a.id);
                    utils.showToast('Atividade excluída!', 'success');
                    _closeCard();
                    await _reloadActivities();
                } catch(e) { utils.showToast(e.message, 'error'); }
            });
        });
    }

    // ── save ──────────────────────────────────────────────────────────────────
    document.getElementById('adc-save-btn').addEventListener('click', async () => {
        const btn = document.getElementById('adc-save-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Salvando...';

        const tManual = parseInt(document.getElementById('adc-time-min')?.value||'0');
        const timeSpent = tManual>0 ? tManual : (_tSec>0 ? Math.ceil(_tSec/60) : null);

        const title = document.getElementById('adc-title')?.value?.trim();
        if (!title) {
            utils.showToast('O título é obrigatório.', 'error');
            btn.disabled=false;
            btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Alterações';
            return;
        }

        const actType = document.getElementById('adc-type').value;
        if (isCreateMode && !actType) {
            utils.showToast('Selecione o tipo de atividade.', 'error');
            btn.disabled=false;
            btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Alterações';
            return;
        }

        // Coleta participantes dos chips (multi-modo) — envia user_id (Clerk ID) para tipo 'user'
        const partChips = [...document.querySelectorAll('#adc-participants-chips > span')];
        const assigneeIds = partChips
            .map(ch => ch.dataset.id)
            .filter(Boolean);

        // Coleta responsáveis do próximo passo dos chips (multi-modo)
        const nxtChips = [...document.querySelectorAll('#adc-nxt-chips > span')];
        const nxtResp = nxtChips.map(ch => ch.dataset.id).filter(Boolean);

        // Company
        const companyId = document.getElementById('adc-company-id')?.value || null;

        const payload = {
            activity_type:     actType,
            status:            document.getElementById('adc-status').value || null,
            priority:          document.getElementById('adc-priority').value || null,
            activity_datetime: document.getElementById('adc-datetime').value ? new Date(document.getElementById('adc-datetime').value).toISOString() : null,
            title,
            description:       document.getElementById('adc-desc').value.trim() || null,
            assignees:         assigneeIds,
            company_id:        companyId,
            time_spent_minutes: timeSpent,
            next_step_title:   document.getElementById('adc-next-title').value.trim() || null,
            next_step_date:    document.getElementById('adc-next-date').value ? new Date(document.getElementById('adc-next-date').value).toISOString() : null,
            next_step_responsibles: nxtResp,
            google_meet_link:  document.getElementById('adc-meet-link')?.value?.trim() || null,
            reminder_at:       document.getElementById('adc-reminder-at').value ? new Date(document.getElementById('adc-reminder-at').value).toISOString() : null,
            reminder_email:    document.getElementById('adc-reminder-email').checked,
            reminder_whatsapp: document.getElementById('adc-reminder-wpp').checked,
            notify_on_assign:  document.getElementById('adc-notify-assign')?.checked || false,
            send_invite_email: document.getElementById('adc-send-invite')?.checked || false,
            send_summary_email: document.getElementById('adc-send-summary')?.checked || false,
            send_recording_email: document.getElementById('adc-send-recording')?.checked || false,
            recording_url:     document.getElementById('adc-recording-url')?.value?.trim() || null,
            next_step_reminder_email: document.getElementById('adc-next-reminder')?.checked || false,
        };

        try {
            let savedActivity;
            if (isCreateMode) {
                const cid = companyIdForCreate || _currentCompanyId;
                if (!cid) throw new Error('Empresa não identificada para criar atividade.');
                savedActivity = await createActivity(cid, payload);
                utils.showToast('Atividade criada!', 'success');
            } else {
                savedActivity = await updateActivity(a.id, payload);
                utils.showToast('Atividade atualizada!', 'success');
            }

            // Notifica outros painéis
            window.dispatchEvent(new CustomEvent('journey:activity-changed', {
                detail: { action: isCreateMode ? 'create' : 'update', id: savedActivity?.id }
            }));

            // Upload de arquivos pendentes
            const actId = savedActivity?.id || a.id;
            for (const file of _adcFiles) {
                const fd = new FormData(); fd.append('file', file);
                await fetch(`/api/activities/${actId}/attachments`, { method:'POST', body:fd });
            }

            _closeCard();
            await _reloadActivities();
        } catch(e) {
            utils.showToast(e.message, 'error');
            btn.disabled=false;
            btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Alterações';
        }
    });

    // ── Permissões de Edição ──────────────────────────────────────────────────
    const podeEditar = isCreateMode || (window.canDo ? window.canDo('company_edit.activities') : true);
    if (!podeEditar) {
        // Obter os painéis (tabs) para bloquear
        // Em activities.js, as abas são .adc-panel
        const panels = overlay.querySelectorAll('.adc-panel');
        panels.forEach(panel => {
            const blockOverlay = document.createElement('div');
            blockOverlay.style.cssText = 'position:absolute; inset:0; z-index:10; pointer-events:none; background:rgba(0,0,0,0);';
            panel.style.position = 'relative';
            panel.appendChild(blockOverlay);
        });
        
        // Adiciona banner no container principal
        const cardContainer = document.getElementById('act-detail-card');
        if (cardContainer) {
            const banner = document.createElement('div');
            banner.className = 'edit-lock-banner';
            banner.style.cssText = `
                display:flex; align-items:center; gap:0.6rem;
                padding:0.7rem 1.8rem; font-size:0.75rem; 
                background:rgba(239,68,68,0.06); color:#ef4444; 
                border-bottom:1px solid rgba(239,68,68,0.22);
            `;
            banner.innerHTML = `<i class="ph ph-lock-key" style="font-size:1.1rem;"></i> <span>Modo somente leitura — você não tem permissão para editar atividades.</span>`;
            
            // Inserir banner logo abaixo do header (entre o header e as tabs no act-detail-card)
            // As abas neste caso estão dentro do mesmo div do Header
            const headerDiv = cardContainer.children[0];
            headerDiv.insertAdjacentElement('afterend', banner);
        }

        const campos = Array.from(overlay.querySelectorAll('input, select, textarea, button:not(#adc-close):not(.adc-tab):not(#adc-cancel-btn):not(#adc-meet-enter-btn):not(a)'));
        campos.forEach(el => {
            if (el.id === 'adc-save-btn' || el.id === 'adc-delete-btn') {
                el.disabled = true;
                el.style.opacity = '0.38';
                el.style.cursor = 'not-allowed';
                el.style.pointerEvents = 'auto'; // allow hover for tooltip
                el.setAttribute('data-th-title', 'SEM PERMISSÃO');
                el.setAttribute('data-th-tooltip', 'Você não tem permissão para editar informações nesta seção.');
            } else {
                if (!el.disabled) {
                    el.disabled = true;
                    el.style.opacity = '0.6';
                }
                const targetTooltip = el.closest('.input-group') || el.parentElement;
                if (targetTooltip) {
                    targetTooltip.setAttribute('data-th-title', 'BLOQUEADO');
                    targetTooltip.setAttribute('data-th-tooltip', 'Você não tem permissão para salvar ou alterar estes campos.');
                    targetTooltip.style.cursor = 'not-allowed';
                }
            }
        });
    }

    document.body.appendChild(overlay);
}

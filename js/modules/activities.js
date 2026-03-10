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
    'Aberta',
    'Em andamento',
    'Concluída',
    'Cancelada',
];

const ACTIVITY_TYPE_CONFIG = {
    'Comentário': { icon: 'ph-chat-text', color: '#64748b' },
    'Reunião': { icon: 'ph-video', color: '#6366f1' },
    'Chamados HD': { icon: 'ph-headset', color: '#f59e0b' },
    'Chamados CS': { icon: 'ph-heartbeat', color: '#10b981' },
    'Ação necessária': { icon: 'ph-lightning', color: '#ef4444' },
};

export const ACTIVITY_PRIORITIES = ['baixa', 'média', 'alta', 'urgente'];

const PRIORITY_CONFIG = {
    baixa:   { label: 'Baixa',   color: '#64748b', bg: 'rgba(100,116,139,0.12)', icon: 'ph-arrow-down' },
    'média': { label: 'Média',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: 'ph-arrows-horizontal' },
    alta:    { label: 'Alta',    color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: 'ph-arrow-up' },
    urgente: { label: 'Urgente', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: 'ph-warning' },
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
            { key: 'assignees', label: 'Responsáveis', type: 'string', searchable: true },
            { key: 'created_by', label: 'Criado por', type: 'string', searchable: true },
            { key: 'activity_date', label: 'Data', type: 'date', sortable: true },
            { key: 'time_spent', label: 'Tempo', type: 'string' },
            { key: 'next_step', label: 'Próximo Passo', type: 'string', searchable: true },
            { key: 'status', label: 'Status', type: 'string', filterable: true },
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
        assignees: (a.activity_assignees || []).map(r => r.user_id).join(', ') || '-',
        created_by: a.created_by_user_id || '-',
        next_step: a.next_step_title ? `${a.next_step_title}${a.next_step_date ? ' · ' + new Date(a.next_step_date).toLocaleDateString('pt-BR') : ''}` : '-',
        nature: a.nature || 'registro',
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
                    <button type="button" class="btn btn-secondary btn-icon" onclick="activities.openEditModal('${act.id}')" title="Editar">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button type="button" class="btn btn-danger btn-icon" onclick="activities.deleteActivity('${act.id}')" title="Excluir">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function _statusBg(s) {
    const m = { 'Aberta': 'rgba(99,102,241,0.12)', 'Em andamento': 'rgba(245,158,11,0.12)', 'Concluída': 'rgba(16,185,129,0.12)', 'Cancelada': 'rgba(239,68,68,0.12)' };
    return m[s] || 'rgba(255,255,255,0.05)';
}
function _statusColor(s) {
    const m = { 'Aberta': '#818cf8', 'Em andamento': '#f59e0b', 'Concluída': '#10b981', 'Cancelada': '#ef4444' };
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

    bar.innerHTML = `
        <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
            <div class="search-wrapper" style="flex:1;min-width:220px;">
                <i class="ph ph-magnifying-glass search-icon"></i>
                <input type="text" id="search-activities" class="search-input" placeholder="Buscar em atividades...">
            </div>

            <select id="filter-act-type" class="input-control" style="min-width:160px;max-width:190px;" onchange="activities.applyFilter('activity_type', this.value)">
                <option value="">Tipo: todos</option>
                ${ACTIVITY_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>

            <select id="filter-act-dept" class="input-control" style="min-width:150px;max-width:180px;" onchange="activities.applyFilter('department', this.value)">
                <option value="">Departamento: todos</option>
                ${ACTIVITY_DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>

            <select id="filter-act-status" class="input-control" style="min-width:140px;max-width:170px;" onchange="activities.applyFilter('status', this.value)">
                <option value="">Status: todos</option>
                ${ACTIVITY_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>

            <button type="button" class="btn btn-secondary btn-sm" onclick="activities.clearAllFilters()" title="Limpar filtros">
                <i class="ph ph-funnel-simple-x"></i>
            </button>
        </div>
        <div id="activities-active-chips" class="active-filters-bar" style="display:none;margin-top:0.5rem;"></div>
    `;
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
    _editingActivityId = null;
    _timerReset();
    _showModal({
        title: '+ Nova Atividade',
        submitLabel: 'Salvar Atividade',
        prefill: null,
    });
}

export async function openEditModal(activityId) {
    _editingActivityId = activityId;
    const activity = _manager?._originalData?.find(a => a.id === activityId);
    if (!activity) {
        utils.showToast('Atividade não encontrada.', 'error');
        return;
    }
    _showModal({
        title: 'Editar Atividade',
        submitLabel: 'Salvar Alterações',
        prefill: activity,
    });
}

function _showModal({ title, submitLabel, prefill }) {
    const existing = document.getElementById('activity-modal-overlay');
    if (existing) existing.remove();

    const assigneesValue = prefill ? (prefill.activity_assignees || []).map(r => r.user_id).join(', ') : '';
    const nextStepResp = prefill ? (prefill.activity_next_step_responsibles || []).map(r => r.user_id).join(', ') : '';
    const dtValue = prefill?.activity_datetime ? new Date(prefill.activity_datetime).toISOString().slice(0, 16) : '';
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
                        <span style="font-size:0.73rem;color:var(--text-muted);margin-top:0.25rem;display:block;">Separe por vírgula</span>
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
                        <label>Status <span class="th-info-btn" data-th-title="STATUS" data-th-tooltip="Estado: Aberta (não iniciada), Em andamento, Concluída, Cancelada."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <select id="modal-act-status" class="input-control">
                            <option value="">Selecione...</option>
                            ${ACTIVITY_STATUSES.map(s => `<option value="${s}" ${prefill?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Natureza <span class="th-info-btn" data-th-title="NATUREZA" data-th-tooltip="Registro = interação já realizada. Tarefa = ação a ser realizada (aparece em Minhas Tarefas)."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <select id="modal-act-nature" class="input-control">
                            <option value="registro" ${(prefill?.nature||'registro')==='registro'?'selected':''}>Registro (histórico)</option>
                            <option value="tarefa" ${prefill?.nature==='tarefa'?'selected':''}>Tarefa (a fazer)</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2" style="margin-bottom:1rem;">
                    <div class="input-group">
                        <label>Prioridade <span class="th-info-btn" data-th-title="PRIORIDADE" data-th-tooltip="Nível de urgência: Urgente = requer atenção imediata, Alta = hoje, Média = esta semana, Baixa = quando possível."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                        <select id="modal-act-priority" class="input-control">
                            <option value="">Sem prioridade</option>
                            ${ACTIVITY_PRIORITIES.map(p => `<option value="${p}" ${prefill?.priority===p?'selected':''}>${PRIORITY_CONFIG[p]?.label||p}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Google Meet Link  <i class="ph ph-video" style="color:#6366f1;"></i></label>
                        <input type="url" id="modal-act-meet-link" class="input-control" placeholder="https://meet.google.com/xxx" value="${prefill?.google_meet_link||''}">
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
                    <div style="font-weight:600;margin-bottom:0.75rem;"><i class="ph ph-arrow-right-dashed" style="color:var(--secondary);"></i> Próximo Passo</div>
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
    const nature = document.getElementById('modal-act-nature')?.value || 'registro';
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
        nature,
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

export async function deleteActivity(activityId) {
    if (!confirm('Deseja excluir esta atividade?')) return;
    try {
        await _deleteActivityApi(activityId);
        utils.showToast('Atividade excluída!', 'success');
        await _reloadActivities();
    } catch (e) {
        utils.showToast(e.message, 'error');
    }
}

// Expor _addFile para o dropzone inline
export function _addFile(file) { _addPendingAttachment(file); }

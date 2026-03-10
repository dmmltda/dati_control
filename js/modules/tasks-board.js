/**
 * ============================================================================
 * Módulo: Minhas Tarefas (Tasks Board)
 * ============================================================================
 * View global de tarefas atribuídas ao usuário logado.
 * Suporta visualização Kanban e Lista (TableManager 2.0).
 * ============================================================================
 */

import { TableManager } from '../core/table-manager.js';
import * as utils from './utils.js';

// ──────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ──────────────────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS = [
    { key: 'Aberta',      label: 'A Fazer',      color: '#6366f1', icon: 'ph-list-checks' },
    { key: 'Em andamento',label: 'Em Andamento',  color: '#f59e0b', icon: 'ph-spinner' },
    { key: 'Concluída',   label: 'Concluída',     color: '#10b981', icon: 'ph-check-circle' },
    { key: 'Cancelada',   label: 'Cancelada',     color: '#64748b', icon: 'ph-x-circle' },
];

const PRIORITY_COLORS = {
    urgente: '#ef4444', alta: '#f97316', 'média': '#f59e0b', baixa: '#64748b',
};

// ──────────────────────────────────────────────────────────────────────────────
// ESTADO
// ──────────────────────────────────────────────────────────────────────────────

let _currentView = 'kanban'; // 'kanban' | 'lista'
let _tasks = [];
let _listManager = null;
let _filters = { status: '', priority: '' };

// ──────────────────────────────────────────────────────────────────────────────
// API
// ──────────────────────────────────────────────────────────────────────────────

async function _fetchTasks() {
    const params = new URLSearchParams({ nature: 'tarefa', assignee: 'me' });
    if (_filters.status)   params.append('status', _filters.status);
    if (_filters.priority) params.append('priority', _filters.priority);
    const res = await fetch(`/api/activities?${params}`);
    if (!res.ok) throw new Error('Erro ao carregar tarefas');
    return res.json();
}

// ──────────────────────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────────────────────

export async function initTasksBoard() {
    _renderShell();
    await _loadAndRender();
}

export function switchView(view) {
    _currentView = view;
    document.querySelectorAll('.tb-view-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
    });
    if (_tasks.length) {
        _renderContent(_tasks);
    }
}

function _renderShell() {
    const container = document.getElementById('view-minhas-tarefas');
    if (!container) return;

    container.innerHTML = `
        <div class="top-bar" style="margin-bottom:1.5rem;flex-wrap:wrap;gap:0.75rem;">
            <div>
                <h1 style="margin:0;font-size:1.3rem;font-weight:800;display:flex;align-items:center;gap:0.5rem;">
                    <i class="ph ph-checks" style="color:var(--primary);"></i> Minhas Tarefas
                </h1>
                <p style="margin:0;color:var(--text-muted);font-size:0.78rem;">Todas as tarefas atribuídas a você — por criação ou responsabilidade.</p>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
                <!-- Filtros -->
                <select id="tb-filter-status" class="input-control" style="min-width:140px;max-width:160px;" onchange="tasksBoard.applyFilter('status', this.value)">
                    <option value="">Status: todos</option>
                    <option value="Aberta">A Fazer</option>
                    <option value="Em andamento">Em Andamento</option>
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
                        style="border:none;background:none;padding:0.5rem 1rem;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;">
                        <i class="ph ph-columns"></i> Kanban
                    </button>
                    <button class="tb-view-btn" data-view="lista" onclick="tasksBoard.switchView('lista')"
                        style="border:none;background:none;padding:0.5rem 1rem;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;">
                        <i class="ph ph-list-bullets"></i> Lista
                    </button>
                </div>
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

    const html = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;align-items:start;">
            ${KANBAN_COLUMNS.map(col => {
                const colTasks = tasks.filter(t => (t.status || 'Aberta') === col.key);
                return `
                <div class="kanban-column glass-panel" style="padding:1rem;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <i class="ph ${col.icon}" style="color:${col.color};font-size:1rem;"></i>
                            <span style="font-weight:700;font-size:0.9rem;">${col.label}</span>
                        </div>
                        <span style="background:${col.color}20;color:${col.color};border:1px solid ${col.color}44;border-radius:20px;padding:0.15rem 0.6rem;font-size:0.75rem;font-weight:700;">${colTasks.length}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:0.75rem;min-height:120px;">
                        ${colTasks.length ? colTasks.map(t => _renderKanbanCard(t)).join('') : `
                            <div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);font-size:0.82rem;border:1px dashed var(--dark-border);border-radius:8px;">
                                <i class="ph ph-tray" style="display:block;font-size:1.5rem;margin-bottom:0.5rem;"></i>
                                Nenhuma tarefa
                            </div>`}
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

    return `
        <div class="kanban-card" style="background:rgba(255,255,255,0.04);border:1px solid var(--dark-border);border-radius:10px;padding:0.85rem;position:relative;${pc ? `border-left:3px solid ${pc};` : ''}">
            ${pc ? `<span style="position:absolute;top:0.6rem;right:0.6rem;background:${pc}20;color:${pc};border:1px solid ${pc}44;border-radius:20px;padding:0.1rem 0.5rem;font-size:0.7rem;font-weight:700;">${t.priority}</span>` : ''}
            <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.35rem;display:flex;align-items:center;gap:0.35rem;">
                <i class="ph ph-building-office"></i>${company || 'Sem empresa'}
            </div>
            <div style="font-weight:600;font-size:0.88rem;line-height:1.4;margin-bottom:0.5rem;margin-right:${pc ? '3rem' : '0'};">${t.title}</div>
            ${deadline ? `
                <div style="font-size:0.75rem;display:flex;align-items:center;gap:0.3rem;color:${isOverdue ? '#ef4444' : 'var(--text-muted)'};">
                    <i class="ph ph-calendar-blank"></i>${deadline}${isOverdue ? ' <span style="color:#ef4444;">· atrasada!</span>' : ''}
                </div>` : ''}
        </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// LISTA (TableManager 2.0)
// ──────────────────────────────────────────────────────────────────────────────

function _renderLista(tasks) {
    const content = document.getElementById('tb-content');
    if (!content) return;

    content.innerHTML = `
        <div class="glass-panel" style="padding:1.25rem;">
            <table class="company-table" id="tb-list-table" style="min-width:800px;">
                <thead>
                    <tr>
                        <th>Título</th>
                        <th style="width:130px;">Empresa</th>
                        <th style="text-align:center;width:100px;">Status</th>
                        <th style="text-align:center;width:100px;">Prioridade</th>
                        <th style="text-align:center;width:110px;">Prazo</th>
                        <th style="text-align:center;width:100px;">Tipo</th>
                    </tr>
                </thead>
                <tbody id="tb-list-body"></tbody>
            </table>
        </div>`;

    const tbody = document.getElementById('tb-list-body');
    if (!tbody) return;

    if (!tasks.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-muted);">
            <i class="ph ph-checks" style="font-size:2rem;display:block;margin-bottom:0.75rem;"></i>
            Nenhuma tarefa encontrada
        </td></tr>`;
        return;
    }

    const STATUS_COLORS = { 'Aberta': '#6366f1', 'Em andamento': '#f59e0b', 'Concluída': '#10b981', 'Cancelada': '#64748b' };

    tbody.innerHTML = tasks.map(t => {
        const sc = STATUS_COLORS[t.status] || '#64748b';
        const pc = t.priority ? (PRIORITY_COLORS[t.priority] || '#64748b') : null;
        const deadline = t.activity_datetime ? new Date(t.activity_datetime).toLocaleDateString('pt-BR') : '-';
        const isOverdue = t.activity_datetime && new Date(t.activity_datetime) < new Date() && t.status !== 'Concluída';
        return `
            <tr>
                <td style="font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.title}">${t.title}</td>
                <td style="font-size:0.82rem;color:var(--text-muted);">${t.companies?.Nome_da_empresa || '-'}</td>
                <td style="text-align:center;">
                    <span class="badge" style="background:${sc}18;color:${sc};border:1px solid ${sc}44;font-size:0.72rem;">${t.status || 'Aberta'}</span>
                </td>
                <td style="text-align:center;">
                    ${pc ? `<span class="badge" style="background:${pc}18;color:${pc};border:1px solid ${pc}44;font-size:0.72rem;">${t.priority}</span>` : '-'}
                </td>
                <td style="text-align:center;font-size:0.82rem;color:${isOverdue ? '#ef4444' : 'var(--text-muted)'};">${deadline}</td>
                <td style="text-align:center;font-size:0.82rem;color:var(--text-muted);">${t.activity_type}</td>
            </tr>`;
    }).join('');
}

// ──────────────────────────────────────────────────────────────────────────────
// FILTROS
// ──────────────────────────────────────────────────────────────────────────────

export async function applyFilter(key, value) {
    _filters[key] = value;
    await _loadAndRender();
}

// ──────────────────────────────────────────────────────────────────────────────
// WINDOW EXPORT
// ──────────────────────────────────────────────────────────────────────────────

window.tasksBoard = { initTasksBoard, switchView, applyFilter };

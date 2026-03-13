/**
 * notifications.js — Sininho de notificações in-app
 * Gerencia o feed de notificações do usuário logado.
 * Integra com: GET /api/notifications, PUT /api/notifications/:id/read, PUT /api/notifications/read-all
 */

import * as auth from './auth.js';
import * as tasksBoard from './tasks-board.js';
import * as nav from './navigation.js';

let _polling = null;
let _notificacoes = [];

// Filtros de estado
let _filtroTexto = '';
let _filtroDataInicial = '';
let _filtroDataFinal = '';

// ─── Data e Hora Absoluta ────────────────────────────────────────────────────
function _formatarDataHora(dateStr) {
    const d = new Date(dateStr);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} às ${hora}:${min}`;
}

// ─── Ícone por tipo ──────────────────────────────────────────────────────────
function _icone(type) {
    if (type === 'mentioned')          return { icon: 'ph-at',            color: '#818cf8' };
    if (type === 'next-step-assigned') return { icon: 'ph-arrow-right',   color: '#10b981' };
    return { icon: 'ph-bell', color: '#f59e0b' };
}

// ─── Renderizar lista ─────────────────────────────────────────────────────────
function _render() {
    const list    = document.getElementById('notif-list');
    const empty   = document.getElementById('notif-empty');
    const badge   = document.getElementById('notif-badge');
    const headerBadge = document.getElementById('notif-header-badge');

    if (!list) return;

    const naoLidas = _notificacoes.filter(n => !n.read).length;

    // Badge do sininho
    if (badge) {
        if (naoLidas > 0) {
            badge.textContent = naoLidas > 9 ? '9+' : naoLidas;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // Badge do cabeçalho do dropdown
    if (headerBadge) {
        if (naoLidas > 0) {
            headerBadge.textContent = `${naoLidas} não lida${naoLidas !== 1 ? 's' : ''}`;
            headerBadge.style.display = 'inline-block';
        } else {
            headerBadge.style.display = 'none';
        }
    }

    // Aplicar filtros
    let passadasFiltro = _notificacoes;
    if (_filtroTexto) {
        const text = _filtroTexto.toLowerCase();
        passadasFiltro = passadasFiltro.filter(n => 
            (n.title && n.title.toLowerCase().includes(text)) || 
            (n.message && n.message.toLowerCase().includes(text))
        );
    }
    if (_filtroDataInicial) {
        const di = new Date(_filtroDataInicial + 'T00:00:00').getTime();
        passadasFiltro = passadasFiltro.filter(n => new Date(n.created_at).getTime() >= di);
    }
    if (_filtroDataFinal) {
        const df = new Date(_filtroDataFinal + 'T23:59:59').getTime();
        passadasFiltro = passadasFiltro.filter(n => new Date(n.created_at).getTime() <= df);
    }

    if (!passadasFiltro.length) {
        list.innerHTML = '';
        empty.style.display = 'block';
        if (_notificacoes.length > 0) {
            empty.innerHTML = '<i class="ph ph-magnifying-glass" style="font-size:1.8rem; display:block; margin-bottom:0.5rem; opacity:0.3;"></i>Nenhum resultado para os filtros atuais';
        } else {
            empty.innerHTML = '<i class="ph ph-bell-slash" style="font-size:1.8rem; display:block; margin-bottom:0.5rem; opacity:0.3;"></i>Tudo em dia — nenhuma notificação';
        }
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = passadasFiltro.map(n => {
        const { icon, color } = _icone(n.type);
        const lida = n.read;
        
        // Se já está lida, podemos ocultá-la completamente se o usuário quiser, 
        // mas vamos mantê-la com estilo apagado, o X as remove da view.
        if (n._hidden) return '';

        return `
        <div class="notif-item" data-id="${n.id}" data-activity-id="${n.activity_id || ''}"
            style="display:flex;align-items:flex-start;gap:0.65rem;padding:0.7rem 1rem;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.12s;background:${lida ? 'transparent' : 'rgba(99,102,241,0.05)'}"
            onmouseover="this.style.background='rgba(255,255,255,0.04)'"
            onmouseout="this.style.background='${lida ? 'transparent' : 'rgba(99,102,241,0.05)'}'">
            <span style="width:28px;height:28px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">
                <i class="ph ${icon}" style="color:${color};font-size:0.85rem;"></i>
            </span>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.78rem;font-weight:${lida ? '400' : '600'};color:${lida ? 'var(--text-muted)' : 'var(--text-main)'};line-height:1.35;margin-bottom:0.15rem;">${n.message}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">${_formatarDataHora(n.created_at)}</div>
            </div>
            ${!lida ? `<span style="width:6px;height:6px;border-radius:50%;background:#818cf8;flex-shrink:0;margin-top:6px;"></span>` : ''}
            
            <button class="notif-dismiss-btn" data-th-title="DISPENSAR" data-th-tooltip="Marcar como lida e remover" style="background:transparent; border:none; cursor:pointer; font-size:1.1rem; color:var(--text-muted); opacity:0.5; padding:0 0.2rem; transition:all 0.2s;"
                onmouseover="this.style.opacity='1'; this.style.color='#10b981';"
                onmouseout="this.style.opacity='0.5'; this.style.color='var(--text-muted)';"
                onclick="window._notifDispensar(event, '${n.id}')">
                <i class="ph ph-check-circle"></i>
            </button>
        </div>`;
    }).join('');

    // Click em cada item
    list.querySelectorAll('.notif-item').forEach(el => {
        el.addEventListener('click', () => _abrirNotificacao(el.dataset.id, el.dataset.activityId));
    });
}

// ─── Abrir notificação e marcar como lida ───────────────────────────────────
async function _abrirNotificacao(notifId, activityId) {
    _fecharDropdown();

    // Marca como lida
    try {
        const token = await auth.getAuthToken();
        await fetch(`/api/notifications/${notifId}/read`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
        });
        const n = _notificacoes.find(x => x.id === notifId);
        if (n) n.read = true;
        _render();
    } catch {}

    // Navega e abre o drawer
    if (activityId) {
        nav.switchView('minhas-tarefas');
        await tasksBoard.initTasksBoard();
        setTimeout(() => tasksBoard.openActivityDetail(activityId), 350);
    }
}

// ─── Dispensar notificação isolada ──────────────────────────────────────────
async function _dispensarNotificacao(e, notifId) {
    if (e) e.stopPropagation();

    // Remove do display otimisticamente
    const n = _notificacoes.find(x => x.id === notifId);
    if (n) {
        n.read = true;
        n._hidden = true;
    }
    _render();

    try {
        const token = await auth.getAuthToken();
        await fetch(`/api/notifications/${notifId}/read`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
        });
    } catch {}
}

// ─── Buscar notificações ─────────────────────────────────────────────────────
async function _fetch() {
    try {
        const token = await auth.getAuthToken();
        const res   = await fetch('/api/notifications', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        _notificacoes = await res.json();
        _render();
    } catch {}
}

// ─── Toggle dropdown ─────────────────────────────────────────────────────────
function _toggleDropdown(e) {
    if (e) e.stopPropagation();
    const dd = document.getElementById('notif-dropdown');
    if (!dd) return;
    const aberto = dd.style.display !== 'none';
    dd.style.display = aberto ? 'none' : 'block';
    if (!aberto) _fetch(); // Atualiza ao abrir
}

function _fecharDropdown() {
    const dd = document.getElementById('notif-dropdown');
    if (dd) dd.style.display = 'none';
}

// Expõe globalmente para uso no onclick do HTML (evita conflito com event delegation)
window._notifToggle = _toggleDropdown;
window._notifFechar = _fecharDropdown;
window._notifDispensar = _dispensarNotificacao;

// ─── Inicializar ─────────────────────────────────────────────────────────────
export function initNotifications() {
    const readAllBtn = document.getElementById('notif-read-all-btn');

    // Eventos de filtro
    const searchInput = document.getElementById('notif-search-input');
    const dateStart = document.getElementById('notif-date-start');
    const dateEnd = document.getElementById('notif-date-end');

    if (searchInput) {
        searchInput.addEventListener('input', e => {
            _filtroTexto = e.target.value;
            _render();
        });
    }
    if (dateStart) {
        dateStart.addEventListener('change', e => {
            _filtroDataInicial = e.target.value;
            _render();
        });
    }
    if (dateEnd) {
        dateEnd.addEventListener('change', e => {
            _filtroDataFinal = e.target.value;
            _render();
        });
    }

    // Marcar tudo como lido (e ocultar)
    readAllBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            const token = await auth.getAuthToken();
            await fetch('/api/notifications/read-all', {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` }
            });
            _notificacoes.forEach(n => {
                n.read = true;
                n._hidden = true; // esconde da lista ao marcar tudo lido
            });
            _render();
        } catch {}
    });

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('notif-bell-wrap');
        if (wrap && !wrap.contains(e.target)) _fecharDropdown();
    });

    // Busca inicial
    _fetch();

    // Polling a cada 30s
    if (_polling) clearInterval(_polling);
    _polling = setInterval(_fetch, 30_000);
}

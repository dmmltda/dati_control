/**
 * @file settings-permissions.js — Módulo de Configurações → Permissões
 *
 * Tela dedicada de gerenciamento de feature permissions.
 * Layout split-pane:
 *   - Esquerda: lista de usuários standard
 *   - Direita: checkboxes de permissão do usuário selecionado
 */

import { getAuthToken } from './auth.js';
import { showToast } from './utils.js';

// ─── Estado interno ────────────────────────────────────────────────────────
let _usuarios = [];        // usuários standard carregados
let _selectedUserId = null;
let _selectedNome = '';
let _saving = false;

const _PERMISSION_GROUPS = [
    {
        label: 'Navegação Global',
        icon: 'ph-compass',
        color: '#818cf8',
        keys: [
            ['dashboard.view',  'Dashboard',               'ph-squares-four'],
            ['companies.view',  'Empresas',                'ph-users-three'],
            ['my_tasks.view',   'Minhas Atividades',       'ph-check-circle'],
            ['reports.view',    'Relatórios',              'ph-chart-bar'],
            ['audit.view',      'Histórico de Alterações', 'ph-clock-counter-clockwise'],
            ['test_logs.view',  'Log de Testes',           'ph-test-tube'],
            ['gabi.view',       'Gabi AI',                 'ph-sparkle'],
        ],
    },
    {
        label: 'Visualizar Cliente (Abas)',
        icon: 'ph-eye',
        color: '#f472b6',
        keys: [
            ['company_tab.basic_data', 'Dados Básicos',    'ph-buildings'],
            ['company_tab.products',   'Produtos DATI',    'ph-package'],
            ['company_tab.contacts',   'Contatos',         'ph-users'],
            ['company_tab.cs',         'Customer Success', 'ph-heartbeat'],
            ['company_tab.activities', 'Atividades',       'ph-activity'],
        ],
    },
    {
        label: 'Edição do Cliente',
        icon: 'ph-pencil-simple',
        color: '#34d399',
        keys: [
            ['company_edit.basic_data', 'Editar Básicos',     'ph-pencil'],
            ['company_edit.products',   'Editar Produtos',    'ph-wrench'],
            ['company_edit.contacts',   'Editar Contatos',    'ph-user-gear'],
            ['company_edit.cs',         'Editar CS',          'ph-note-pencil'],
            ['company_edit.activities', 'Editar Atividades',  'ph-plus-circle'],
        ],
    },
];

// ─── Init ──────────────────────────────────────────────────────────────────
export async function initSettingsPermissions() {
    await _carregarUsuarios();
    _renderLista();
    _renderPlaceholder();
}

// ─── API ───────────────────────────────────────────────────────────────────
async function _carregarUsuarios() {
    try {
        const token = await getAuthToken();
        const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        const todos = await res.json();
        _usuarios = todos.filter(u => u.user_type === 'standard' && u.ativo !== false);
    } catch (err) {
        console.error('[SettingsPermissions] Erro ao carregar usuários:', err);
        _usuarios = [];
    }
}

async function _carregarPermissoes(userId) {
    const token = await getAuthToken();
    const res = await fetch(`/api/users/${userId}/feature-permissions`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json(); // { 'dashboard.view': true, ... }
}

// ─── Render: lista lateral de usuários ────────────────────────────────────
function _renderLista() {
    const container = document.getElementById('perm-user-list');
    if (!container) return;

    if (_usuarios.length === 0) {
        container.innerHTML = `
            <div style="padding:1.5rem; text-align:center; color:#64748b; font-size:0.82rem;">
                <i class="ph ph-users-three" style="font-size:2rem; display:block; margin-bottom:0.5rem; opacity:0.3;"></i>
                Nenhum usuário standard ativo.
            </div>`;
        return;
    }

    container.innerHTML = _usuarios.map(u => {
        const iniciais = u.avatar || (u.nome ? u.nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : 'U');
        return `
            <div class="perm-user-item" id="perm-user-item-${u.id}"
                 onclick="window._permSelectUser('${u.id}', '${u.nome.replace(/'/g, "&#39;")}')"
                 style="display:flex; align-items:center; gap:0.75rem; padding:0.75rem 1rem;
                        cursor:pointer; border-radius:10px; transition:all 0.15s; margin-bottom:0.2rem;"
                 onmouseover="if(this.id !== 'perm-user-item-${_selectedUserId}') this.style.background='rgba(255,255,255,0.04)'"
                 onmouseout="if(this.id !== 'perm-user-item-${_selectedUserId}') this.style.background='transparent'">
                <div style="width:34px; height:34px; border-radius:50%; flex-shrink:0;
                            background:linear-gradient(135deg,#1e3a5f,#0f3460);
                            color:#fff; display:flex; align-items:center; justify-content:center;
                            font-size:12px; font-weight:700;">${iniciais}</div>
                <div style="min-width:0; flex:1;">
                    <div style="font-weight:600; color:#e2e8f0; font-size:0.85rem;
                                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.nome}</div>
                    <div style="color:#64748b; font-size:0.72rem;
                                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email}</div>
                </div>
                <i class="ph ph-caret-right" style="color:#475569; font-size:0.85rem; flex-shrink:0;"></i>
            </div>`;
    }).join('');
}

// ─── Render: placeholder (nenhum selecionado) ──────────────────────────────
function _renderPlaceholder() {
    const panel = document.getElementById('perm-detail-panel');
    if (!panel) return;
    panel.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;
                    height:100%; padding:3rem; text-align:center; color:#475569;">
            <div style="width:56px; height:56px; border-radius:16px;
                        background:rgba(129,140,248,0.08); border:1px solid rgba(129,140,248,0.15);
                        display:flex; align-items:center; justify-content:center; margin-bottom:1.25rem;">
                <i class="ph ph-shield-check" style="font-size:1.6rem; color:#818cf8;"></i>
            </div>
            <div style="font-weight:600; color:#64748b; font-size:0.95rem; margin-bottom:0.4rem;">
                Selecione um usuário
            </div>
            <div style="color:#475569; font-size:0.8rem; max-width:260px; line-height:1.5;">
                Escolha um usuário Standard na lista ao lado para gerenciar suas permissões de acesso.
            </div>
        </div>`;
}

// ─── Render: painel de permissões do usuário selecionado ───────────────────
async function _renderPermissoes(userId) {
    const panel = document.getElementById('perm-detail-panel');
    if (!panel) return;

    // Loading state
    panel.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; height:100%; color:#64748b;">
            <i class="ph ph-circle-notch" style="animation:fp-spin 1s linear infinite; font-size:1.5rem;"></i>
        </div>`;

    try {
        const permsMap = await _carregarPermissoes(userId);
        const usuario = _usuarios.find(u => u.id === userId);
        if (!usuario) return;

        const totalPerms = Object.values(permsMap).filter(Boolean).length;
        const allKeys = Object.values(_PERMISSION_GROUPS).flatMap(g => g.keys).length;

        panel.innerHTML = `
            <!-- Header do usuário selecionado -->
            <div style="padding:1.25rem 1.5rem; border-bottom:1px solid rgba(255,255,255,0.06);
                        display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <div style="width:40px; height:40px; border-radius:50%;
                                background:linear-gradient(135deg,#1e3a5f,#0f3460);
                                color:#fff; display:flex; align-items:center; justify-content:center;
                                font-size:13px; font-weight:700; flex-shrink:0;">
                        ${usuario.avatar || usuario.nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                        <div style="font-weight:700; color:#e2e8f0; font-size:0.95rem;">${usuario.nome}</div>
                        <div style="color:#64748b; font-size:0.75rem;">${usuario.email}</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <!-- Progresso de permissões -->
                    <div style="font-size:0.75rem; color:#94a3b8;">
                        <span style="color:#a78bfa; font-weight:700;">${totalPerms}</span>
                        <span style="color:#475569;">/${allKeys} permissões</span>
                    </div>
                    <!-- Atalhos rápidos -->
                    <button onclick="window._permGrantAll()" style="
                        padding:0.4rem 0.75rem; border-radius:7px; border:1px solid rgba(52,211,153,0.3);
                        background:rgba(52,211,153,0.08); color:#34d399; cursor:pointer;
                        font-size:0.73rem; font-weight:600; font-family:inherit; transition:all 0.15s;"
                        onmouseover="this.style.background='rgba(52,211,153,0.15)'"
                        onmouseout="this.style.background='rgba(52,211,153,0.08)'">
                        <i class="ph ph-check-square"></i> Todas
                    </button>
                    <button onclick="window._permRevokeAll()" style="
                        padding:0.4rem 0.75rem; border-radius:7px; border:1px solid rgba(239,68,68,0.25);
                        background:rgba(239,68,68,0.07); color:#f87171; cursor:pointer;
                        font-size:0.73rem; font-weight:600; font-family:inherit; transition:all 0.15s;"
                        onmouseover="this.style.background='rgba(239,68,68,0.15)'"
                        onmouseout="this.style.background='rgba(239,68,68,0.07)'">
                        <i class="ph ph-x-square"></i> Nenhuma
                    </button>
                </div>
            </div>

            <!-- Checkboxes organizados por grupo -->
            <div style="padding:1.25rem 1.5rem; overflow-y:auto; flex:1;">
                ${_PERMISSION_GROUPS.map(group => `
                    <div style="margin-bottom:1.5rem;">
                        <!-- Header do grupo -->
                        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem; padding-bottom:0.5rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                            <i class="${group.icon}" style="color:${group.color}; font-size:0.9rem;"></i>
                            <span style="font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:${group.color};">${group.label}</span>
                        </div>
                        <!-- Grid de checkboxes -->
                        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:0.4rem;">
                            ${group.keys.map(([key, label, icon]) => `
                                <label id="perm-label-${key.replace(/\./g, '-')}"
                                    style="display:flex; align-items:center; gap:0.55rem; padding:0.5rem 0.65rem;
                                           border-radius:8px; cursor:pointer; transition:all 0.15s;
                                           border:1px solid ${permsMap[key] ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)'};
                                           background:${permsMap[key] ? 'rgba(167,139,250,0.07)' : 'rgba(255,255,255,0.02)'};"
                                    onmouseover="this.style.background='${permsMap[key] ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.05)'}'"
                                    onmouseout="this.style.background='${permsMap[key] ? 'rgba(167,139,250,0.07)' : 'rgba(255,255,255,0.02)'}'">
                                    <input type="checkbox" name="perm-check" value="${key}"
                                        ${permsMap[key] ? 'checked' : ''}
                                        onchange="window._permUpdateLabel(this)"
                                        style="width:15px; height:15px; accent-color:#a78bfa; cursor:pointer; flex-shrink:0;">
                                    <i class="${icon}" style="color:${permsMap[key] ? '#a78bfa' : '#475569'}; font-size:0.85rem; flex-shrink:0; transition:color 0.15s;"></i>
                                    <span style="font-size:0.8rem; color:${permsMap[key] ? '#e2e8f0' : '#94a3b8'}; line-height:1.3; transition:color 0.15s;">${label}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Footer: botão salvar -->
            <div style="padding:1rem 1.5rem; border-top:1px solid rgba(255,255,255,0.06);
                        display:flex; justify-content:flex-end; align-items:center; gap:0.75rem; flex-shrink:0;">
                <span style="color:#64748b; font-size:0.78rem;" id="perm-save-status">Alterações não salvas são perdidas ao trocar de usuário.</span>
                <button id="perm-save-btn" onclick="window._permSalvar()" style="
                    padding:0.65rem 1.5rem; border-radius:8px; border:none;
                    background:linear-gradient(135deg,#6d28d9,#4f46e5); color:#fff;
                    cursor:pointer; font-size:0.85rem; font-weight:600; font-family:inherit;
                    display:flex; align-items:center; gap:0.45rem; transition:all 0.2s;"
                    onmouseover="this.style.filter='brightness(1.12)'"
                    onmouseout="this.style.filter='brightness(1)'">
                    <i class="ph ph-floppy-disk"></i> Salvar Permissões
                </button>
            </div>`;
    } catch (err) {
        panel.innerHTML = `<div style="padding:2rem; text-align:center; color:#ef4444;">
            <i class="ph ph-warning" style="font-size:1.5rem; display:block; margin-bottom:0.5rem;"></i>
            Erro ao carregar: ${err.message}
        </div>`;
    }
}

// ─── Funções globais expostas ──────────────────────────────────────────────

window._permSelectUser = async function (userId, nome) {
    if (_selectedUserId === userId) return;

    _selectedUserId = userId;
    _selectedNome = nome;

    // Highlight na lista
    document.querySelectorAll('.perm-user-item').forEach(el => {
        el.style.background = 'transparent';
        el.style.borderLeft = 'none';
    });
    const item = document.getElementById(`perm-user-item-${userId}`);
    if (item) {
        item.style.background = 'rgba(91,82,246,0.12)';
        item.style.borderLeft = '3px solid #5b52f6';
        item.style.paddingLeft = 'calc(1rem - 3px)';
    }

    await _renderPermissoes(userId);
};

/** Atualiza o visual do label quando o checkbox muda */
window._permUpdateLabel = function (checkbox) {
    const label = checkbox.closest('label');
    const icon = label?.querySelector('i:not(.ph-check)');
    const text = label?.querySelector('span');
    if (checkbox.checked) {
        if (label) {
            label.style.background = 'rgba(167,139,250,0.07)';
            label.style.borderColor = 'rgba(167,139,250,0.2)';
        }
        if (icon) icon.style.color = '#a78bfa';
        if (text) text.style.color = '#e2e8f0';
    } else {
        if (label) {
            label.style.background = 'rgba(255,255,255,0.02)';
            label.style.borderColor = 'rgba(255,255,255,0.04)';
        }
        if (icon) icon.style.color = '#475569';
        if (text) text.style.color = '#94a3b8';
    }
};

/** Marca todos os checkboxes */
window._permGrantAll = function () {
    document.querySelectorAll('input[name="perm-check"]').forEach(cb => {
        cb.checked = true;
        window._permUpdateLabel(cb);
    });
};

/** Desmarca todos os checkboxes */
window._permRevokeAll = function () {
    document.querySelectorAll('input[name="perm-check"]').forEach(cb => {
        cb.checked = false;
        window._permUpdateLabel(cb);
    });
};

/** Salva as permissões do usuário selecionado */
window._permSalvar = async function () {
    if (!_selectedUserId || _saving) return;
    _saving = true;

    const btn = document.getElementById('perm-save-btn');
    const status = document.getElementById('perm-save-status');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-circle-notch" style="animation:fp-spin 1s linear infinite;display:inline-block;"></i> Salvando...'; }

    const checked = [...document.querySelectorAll('input[name="perm-check"]:checked')].map(cb => cb.value);

    try {
        const token = await getAuthToken();
        const res = await fetch(`/api/users/${_selectedUserId}/feature-permissions`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: checked }),
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erro ao salvar');
        }
        showToast(`Permissões de ${_selectedNome} atualizadas! ✅`, 'success');
        if (status) status.textContent = `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        _saving = false;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar Permissões'; }
    }
};

/** Filtra a lista de usuários pela busca */
window._permFiltrarLista = function (query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll('.perm-user-item').forEach(item => {
        const nome = item.querySelector('div > div:first-child')?.textContent?.toLowerCase() || '';
        const email = item.querySelector('div > div:last-child')?.textContent?.toLowerCase() || '';
        item.style.display = (!q || nome.includes(q) || email.includes(q)) ? '' : 'none';
    });
};


if (!document.getElementById('fp-spin-style')) {
    const style = document.createElement('style');
    style.id = 'fp-spin-style';
    style.textContent = '@keyframes fp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
}

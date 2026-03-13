/**
 * @file settings-users.js — Módulo de Configurações → Usuários
 *
 * Responsabilidades:
 *  - Carregar e renderizar lista de usuários
 *  - Atualizar KPIs (total, masters, standards, convites pendentes)
 *  - Modal de convite via Clerk Organizations
 *  - Alterar user_type de um usuário (master ↔ standard)
 *  - Desativar/reativar usuário
 *
 * Funções globais expostas (para uso nos onclick do HTML):
 *  - window._usersSearch(query)       → filtra tabela
 *  - window._fecharModalConvite()     → fecha o modal
 *  - window._onInviteTypeChange(type) → toggle da seção de empresas
 *  - window._enviarConvite()          → envia convite via Clerk
 *  - window._alterarTipoUsuario(id)   → abre dropdown para mudar tipo
 */

import { getAuthToken } from './auth.js';
import { showToast } from './utils.js';
import { confirmar } from './confirmar.js';

// ─── Estado interno ────────────────────────────────────────────────────────
let _usuarios = [];      // cache completo carregado da API
let _filtrado = [];      // lista atual filtrada
let _companies = [];     // empresas disponíveis para o modal

// ─── Init (chamado pelo app.js ao navegar para config-usuarios) ────────────
export async function initSettingsUsers() {
    await Promise.all([_carregarUsuarios(), _carregarEmpresas()]);
    _renderTabela(_usuarios);
    _atualizarKPIs();
    _wiredButtons();
}

// ─── API: Carregar usuários ────────────────────────────────────────────────
async function _carregarUsuarios() {
    try {
        const token = await getAuthToken();
        const res = await fetch('/api/users', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        _usuarios = await res.json();
        _filtrado = [..._usuarios];
    } catch (err) {
        console.error('[SettingsUsers] Erro ao carregar usuários:', err);
        _showError('Erro ao carregar usuários: ' + err.message);
    }
}

// ─── API: Carregar empresas disponíveis ────────────────────────────────────
async function _carregarEmpresas() {
    try {
        const token = await getAuthToken();
        const res = await fetch('/api/users/me/companies', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        _companies = (data.companies || []).filter(c => c.company_type === 'son' || c.company_type === 'standalone');
    } catch (err) {
        console.warn('[SettingsUsers] Erro ao carregar empresas:', err);
    }
}

// ─── Render: Tabela de usuários ────────────────────────────────────────────
function _renderTabela(lista) {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding:3rem; color:#64748b;">
                    <i class="ph ph-users" style="font-size:2rem; display:block; margin-bottom:0.75rem; opacity:0.4;"></i>
                    Nenhum usuário encontrado.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = lista.map(u => {
        const iniciais = u.avatar || (u.nome ? u.nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : 'U');
        const isMaster = u.user_type === 'master';
        const isAtivo = u.ativo !== false;

        const companiesHtml = isMaster
            ? `<span style="color:#a78bfa; font-size:0.75rem; font-weight:600;">
                   <i class="ph ph-crown"></i> Acesso total
               </span>`
            : (u.companies && u.companies.length > 0
                ? u.companies.slice(0, 3).map(c => `
                      <span style="display:inline-block; background:rgba(96,165,250,0.12); color:#60a5fa;
                            border:1px solid rgba(96,165,250,0.25); border-radius:6px;
                            padding:0.15rem 0.5rem; font-size:0.72rem; font-weight:600; margin:0.1rem;">
                          ${c.nome}
                      </span>`).join('')
                  + (u.companies.length > 3 ? `<span style="color:#64748b; font-size:0.72rem;"> +${u.companies.length - 3}</span>` : '')
                : `<span style="color:#64748b; font-size:0.75rem; font-style:italic;">Sem empresas vinculadas</span>`);

        return `
            <tr style="opacity:${isAtivo ? 1 : 0.5};">
                <td style="text-align:center; padding:0.75rem 0.5rem;">
                    <div style="width:34px; height:34px; border-radius:50%;
                                background:${isMaster ? 'linear-gradient(135deg,#6d28d9,#4f46e5)' : 'linear-gradient(135deg,#1e3a5f,#0f3460)'};
                                color:#fff; display:inline-flex; align-items:center;
                                justify-content:center; font-size:12px; font-weight:700;">
                        ${iniciais}
                    </div>
                </td>
                <td>
                    <div style="font-weight:600; color:#e2e8f0; font-size:0.875rem;">${u.nome}</div>
                    <div style="color:#64748b; font-size:0.786rem; margin-top:0.286rem;">${u.email}</div>
                    ${u.department ? `<div style="color:#8b98b4; font-size:0.7rem;">${u.department}</div>` : ''}
                </td>
                <td style="text-align:center;">
                    <span style="display:inline-flex; align-items:center; gap:0.3rem;
                                 padding:0.25rem 0.65rem; border-radius:20px; font-size:0.72rem; font-weight:700;
                                 background:${isMaster ? 'rgba(167,139,250,0.15)' : 'rgba(96,165,250,0.12)'};
                                 color:${isMaster ? '#a78bfa' : '#60a5fa'};
                                 border:1px solid ${isMaster ? 'rgba(167,139,250,0.3)' : 'rgba(96,165,250,0.25)'};">
                        <i class="ph ph-${isMaster ? 'crown' : 'user'}"></i>
                        ${isMaster ? 'Master' : 'Standard'}
                    </span>
                </td>
                <td style="max-width:280px;">
                    <div style="display:flex; flex-wrap:wrap; gap:0.2rem; align-items:center;">
                        ${companiesHtml}
                    </div>
                </td>
                <td style="text-align:center;">
                    <span style="display:inline-flex; align-items:center; gap:0.3rem;
                                 padding:0.2rem 0.55rem; border-radius:20px; font-size:0.72rem; font-weight:600;
                                 background:${isAtivo ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)'};
                                 color:${isAtivo ? '#10b981' : '#ef4444'};
                                 border:1px solid ${isAtivo ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)'};">
                        <i class="ph ph-${isAtivo ? 'check-circle' : 'x-circle'}"></i>
                        ${isAtivo ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
                <td style="text-align:center;">
                    <div style="display:flex; gap:0.4rem; justify-content:center; align-items:center;">
                        <button class="btn btn-secondary"
                            style="padding:0.3rem 0.6rem; font-size:0.75rem;"
                            title="${isMaster ? 'Tornar Standard' : 'Tornar Master'}"
                            onclick="window._alterarTipoUsuario('${u.id}', '${isMaster ? 'standard' : 'master'}', '${u.nome}')">
                            <i class="ph ph-${isMaster ? 'user' : 'crown'}"></i>
                            ${isMaster ? '→ Standard' : '→ Master'}
                        </button>
                        <button class="btn btn-secondary"
                            style="padding:0.3rem 0.6rem; font-size:0.75rem; color:#a78bfa;"
                            title="Gerenciar permissões"
                            onclick="window._gerenciarPermissoes('${u.id}', '${u.nome.replace(/'/g, "&#39;")}', ${isMaster})">
                            <i class="ph ph-shield-check"></i>
                        </button>

                        <button class="btn btn-secondary"
                            style="padding:0.3rem 0.6rem; font-size:0.75rem; color:${isAtivo ? '#ef4444' : '#10b981'};"
                            title="${isAtivo ? 'Desativar usuário' : 'Reativar usuário'}"
                            onclick="window._alterarStatusUsuario('${u.id}', ${!isAtivo}, '${u.nome}')">
                            <i class="ph ph-${isAtivo ? 'user-minus' : 'user-plus'}"></i>
                        </button>
                        <button class="btn btn-secondary"
                            style="padding:0.3rem 0.6rem; font-size:0.75rem; color:#ef4444;"
                            title="Deletar usuário permanentemente"
                            onclick="window._deletarUsuario('${u.id}', '${u.nome.replace(/'/g, "&#39;")}')">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

// ─── KPIs ──────────────────────────────────────────────────────────────────
function _atualizarKPIs() {
    const total = _usuarios.length;
    const masters = _usuarios.filter(u => u.user_type === 'master').length;
    const standards = _usuarios.filter(u => u.user_type === 'standard').length;

    const el = id => document.getElementById(id);
    if (el('kpi-total-usuarios')) el('kpi-total-usuarios').textContent = total;
    if (el('kpi-masters')) el('kpi-masters').textContent = masters;
    if (el('kpi-standards')) el('kpi-standards').textContent = standards;
    // convites pendentes: buscar via API em breve — por ora mostra 0
    if (el('kpi-convites')) el('kpi-convites').textContent = '0';
}

// ─── Busca (filtro local) ──────────────────────────────────────────────────
window._usersSearch = function (query) {
    const q = (query || '').toLowerCase().trim();
    _filtrado = q
        ? _usuarios.filter(u =>
            (u.nome || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q) ||
            (u.user_type || '').toLowerCase().includes(q) ||
            (u.department || '').toLowerCase().includes(q)
          )
        : [..._usuarios];
    _renderTabela(_filtrado);
};

// ─── Ações: Alterar tipo ───────────────────────────────────────────────────
window._alterarTipoUsuario = function (userId, novoTipo, nome) {
    const confirmMsg = novoTipo === 'master'
        ? `Tornar "${nome}" um Master? Ele terá acesso total ao sistema.`
        : `Tornar "${nome}" Standard? Você precisará configurar as empresas que ele pode acessar.`;

    confirmar(confirmMsg, async () => {
        try {
            const token = await getAuthToken();
            const res = await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_type: novoTipo }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro desconhecido');

            showToast(`${nome} agora é ${novoTipo === 'master' ? 'Master' : 'Standard'}.`, 'success');
            await _carregarUsuarios();
            _renderTabela(_filtrado);
            _atualizarKPIs();
        } catch (err) {
            showToast('Erro: ' + err.message, 'error');
        }
    });
};

// ─── Ações: Alterar status (ativo/inativo) ─────────────────────────────────
window._alterarStatusUsuario = function (userId, novoAtivo, nome) {
    const msg = novoAtivo ? `Reativar "${nome}"?` : `Desativar "${nome}"? Ele perderá o acesso imediatamente.`;

    confirmar(msg, async () => {
        try {
            const token = await getAuthToken();
            const res = await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ativo: novoAtivo }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro desconhecido');

            showToast(`${nome} ${novoAtivo ? 'reativado' : 'desativado'}.`, 'success');
            await _carregarUsuarios();
            _renderTabela(_filtrado);
            _atualizarKPIs();
        } catch (err) {
            showToast('Erro: ' + err.message, 'error');
        }
    });
};

// ─── Ações: Deletar usuário permanentemente ───────────────────────────────
window._deletarUsuario = function (userId, nome) {
    confirmar(
        `⚠️ Deletar "${nome}" permanentemente?\n\nEssa ação é irreversível e removerá o usuário do banco de dados.`,
        async () => {
            try {
                const token = await getAuthToken();
                const res = await fetch(`/api/users/${userId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error((await res.json()).error || 'Erro ao deletar');

                showToast(`"${nome}" foi deletado.`, 'success');
                await _carregarUsuarios();
                _renderTabela(_usuarios);
                _atualizarKPIs();
            } catch (err) {
                showToast('Erro: ' + err.message, 'error');
            }
        },
        { danger: true }
    );
};

// ─── Modal de Convite ──────────────────────────────────────────────────────
function _wiredButtons() {
    const btn = document.getElementById('btn-convidar-usuario');
    if (btn) btn.onclick = _abrirModalConvite;
}

function _abrirModalConvite() {
    const modal = document.getElementById('modal-convidar-usuario');
    if (!modal) return;

    // Reset campos
    const emailEl = document.getElementById('invite-email');
    if (emailEl) emailEl.value = '';
    const tipoEl = document.getElementById('invite-user-type');
    if (tipoEl) tipoEl.value = 'standard';

    // Preenche lista de empresas
    _renderEmpresasModal();

    modal.style.display = 'flex';
}

window._fecharModalConvite = function () {
    const modal = document.getElementById('modal-convidar-usuario');
    if (modal) modal.style.display = 'none';
};

window._onInviteTypeChange = function (tipo) {
    const section = document.getElementById('invite-companies-section');
    if (section) section.style.display = tipo === 'standard' ? 'block' : 'none';
};

function _renderEmpresasModal() {
    const container = document.getElementById('invite-companies-list');
    if (!container) return;

    if (!_companies || _companies.length === 0) {
        container.innerHTML = `<div style="color:#64748b; font-size:0.85rem; text-align:center; padding:1rem;">
            Nenhuma empresa filha cadastrada.<br>
            <small>Crie empresas son primeiro em Configurações → Empresas.</small>
        </div>`;
        return;
    }

    container.innerHTML = `
        <label style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0.5rem; cursor:pointer; border-radius:6px; background:rgba(91,82,246,0.08); margin-bottom:0.2rem;">
            <input type="checkbox" id="invite-all-companies" onchange="window._toggleAllCompanies(this.checked)"
                style="accent-color:#5b52f6;">
            <span style="font-weight:600; font-size:0.8rem; color:#e2e8f0;">Todas as empresas</span>
        </label>
        <div style="height:1px; background:rgba(255,255,255,0.06); margin:0.3rem 0;"></div>
        ${_companies.map(c => `
            <label class="invite-company-item" style="display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0.5rem; cursor:pointer; border-radius:6px; transition:background 0.15s;"
                onmouseover="this.style.background='rgba(255,255,255,0.04)'"
                onmouseout="this.style.background='transparent'">
                <input type="checkbox" name="invite-company" value="${c.id}"
                    style="accent-color:#5b52f6;">
                <span style="font-size:0.8rem; color:#e2e8f0;">${c.Nome_da_empresa || c.nome}</span>
                ${c.company_type === 'son' ? '<span style="font-size:0.65rem; color:#64748b; margin-left:auto;">filha</span>' : ''}
            </label>
        `).join('')}
    `;
}

window._toggleAllCompanies = function (checked) {
    document.querySelectorAll('input[name="invite-company"]').forEach(cb => cb.checked = checked);
};

window._enviarConvite = async function () {
    const email = document.getElementById('invite-email')?.value?.trim();
    const userType = document.getElementById('invite-user-type')?.value;

    if (!email) return showToast('Informe o e-mail do convidado.', 'error');

    const selectedCompanies = userType === 'standard'
        ? [...document.querySelectorAll('input[name="invite-company"]:checked')].map(cb => cb.value)
        : [];

    const btnEnviar = document.getElementById('btn-enviar-convite');
    if (btnEnviar) { btnEnviar.disabled = true; btnEnviar.innerHTML = '<i class="ph ph-spinner"></i> Enviando...'; }

    try {
        const token = await getAuthToken();

        const res = await fetch('/api/invites', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, user_type: userType, companies: selectedCompanies }),
        });

        const data = await res.json();

        if (res.status === 409 && data.can_resend) {
            // Mostra dialog no padrão do confirmar.js — aviso amarelo
            if (btnEnviar) { btnEnviar.disabled = false; btnEnviar.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Enviar Convite'; }
            _mostrarDialogConviteDuplicado(email, data.invite_id, userType, selectedCompanies);
            return;
        }

        if (!res.ok) throw new Error(data.error || 'Erro ao enviar convite');

        showToast(`Convite enviado para ${email}! ✉️`, 'success');
        window._fecharModalConvite();

        await _carregarUsuarios();
        _renderTabela(_filtrado);
        _atualizarKPIs();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        if (btnEnviar) { btnEnviar.disabled = false; btnEnviar.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Enviar Convite'; }
    }
};

/**
 * Dialog de confirmação para reenvio — mesmo padrão visual do confirmar.js
 * Ícone amarelo (aviso, não destrutivo), botão "Reenviar" em roxo.
 */
function _mostrarDialogConviteDuplicado(email, inviteId, userType, companies) {
    const modal = document.createElement('div');
    modal.id = 'dialog-convite-duplicado';

    Object.assign(modal.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '999999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        opacity: '0',
        transition: 'opacity 0.2s ease',
    });

    modal.innerHTML = `
        <div style="
            background: rgba(30, 41, 59, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 2rem;
            width: 90%;
            max-width: 420px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
            transform: scale(0.9);
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
        ">
            <div style="
                width: 52px; height: 52px;
                background: rgba(245, 158, 11, 0.12);
                color: #f59e0b;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                margin: 0 auto 1.25rem;
                font-size: 1.6rem;
                border: 1px solid rgba(245, 158, 11, 0.25);
            ">
                <i class="ph ph-envelope-simple-warning"></i>
            </div>

            <h3 style="color: #e2e8f0; font-size: 1.1rem; margin: 0 0 0.6rem; font-weight: 700;">
                Convite já enviado
            </h3>
            <p style="color: #94a3b8; font-size: 0.88rem; line-height: 1.6; margin: 0 0 1.75rem;">
                Já existe um convite pendente para <strong style="color:#e2e8f0;">${email}</strong>.
                Deseja revogar o convite anterior e reenviar um novo?
            </p>

            <div style="display: flex; gap: 0.75rem; justify-content: center;">
                <button id="dialog-convite-nao" style="
                    flex: 1; padding: 0.75rem; border-radius: 8px;
                    border: 1px solid #334155; background: transparent;
                    color: #cbd5e1; font-weight: 500; cursor: pointer;
                    font-size: 0.875rem; transition: all 0.2s;
                    font-family: inherit;
                ">Não, cancelar</button>

                <button id="dialog-convite-sim" style="
                    flex: 1; padding: 0.75rem; border-radius: 8px;
                    border: none; background: linear-gradient(135deg, #6d28d9, #4f46e5);
                    color: #fff; font-weight: 600; cursor: pointer;
                    font-size: 0.875rem; transition: all 0.2s;
                    font-family: inherit; display: flex; align-items: center;
                    justify-content: center; gap: 0.4rem;
                ">
                    <i class="ph ph-paper-plane-tilt"></i> Reenviar Convite
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.firstElementChild.style.transform = 'scale(1)';
    });

    const close = (confirmed) => {
        modal.style.opacity = '0';
        modal.firstElementChild.style.transform = 'scale(0.9)';
        setTimeout(() => modal.remove(), 200);
        if (confirmed) _reenviarConvite(inviteId);
    };

    modal.querySelector('#dialog-convite-sim').onclick = () => close(true);
    modal.querySelector('#dialog-convite-nao').onclick = () => close(false);

    // Hover effects
    modal.querySelectorAll('button').forEach(btn => {
        btn.onmouseover = () => btn.style.filter = 'brightness(1.12)';
        btn.onmouseout  = () => btn.style.filter = 'brightness(1)';
    });
}

async function _reenviarConvite(inviteId) {
    try {
        const token = await getAuthToken();
        const res = await fetch(`/api/invites/${inviteId}/resend`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao reenviar');

        showToast(`Convite reenviado com sucesso! ✉️`, 'success');
        window._fecharModalConvite();
        await _carregarUsuarios();
        _renderTabela(_filtrado);
        _atualizarKPIs();
    } catch (err) {
        showToast('Erro ao reenviar: ' + err.message, 'error');
    }
}


// ─── Helper: renderiza erro na tabela ─────────────────────────────────────-
function _showError(msg) {
    const tbody = document.getElementById('users-table-body');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:#ef4444;">
            <i class="ph ph-warning" style="font-size:1.5rem; display:block; margin-bottom:0.5rem;"></i>
            ${msg}
        </td></tr>`;
    }
}

// ─── Gerenciamento de Feature Permissions ──────────────────────────────────

const _PERMISSION_GROUPS = [
    {
        label: 'Navegação',
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
        label: 'Edição',
        icon: 'ph-pencil-simple',
        color: '#34d399',
        keys: [
            ['company_edit.basic_data', 'Editar Básicos',       'ph-pencil'],
            ['company_edit.products',   'Editar Produtos DATI', 'ph-wrench'],
            ['company_edit.contacts',   'Editar Contatos',      'ph-user-gear'],
            ['company_edit.cs',         'Editar CS',            'ph-note-pencil'],
            ['company_edit.activities', 'Editar Atividades',    'ph-plus-circle'],
        ],
    },
];

/**
 * Abre o modal de permissões para um usuário.
 * Para Masters: exibe modal informativo (acesso total).
 * Para Standards: exibe modal editável com checkboxes.
 */
window._gerenciarPermissoes = async function (userId, nome, isMaster = false) {
    // Masters têm acesso total — exibir modal informativo
    if (isMaster) {
        let modal = document.getElementById('modal-feature-permissions');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-feature-permissions';
            Object.assign(modal.style, {
                position: 'fixed', inset: '0', zIndex: '99999',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(8,14,32,0.88)', backdropFilter: 'blur(10px)',
                opacity: '0', transition: 'opacity 0.2s ease',
            });
            modal.addEventListener('click', e => { if (e.target === modal) window._fecharModalPermissoes(); });
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div id="fp-panel" style="
                background:#0f172a; border:1px solid rgba(255,255,255,0.09); border-radius:20px;
                width:92%; max-width:420px; padding:2rem;
                box-shadow:0 40px 80px rgba(0,0,0,0.7);
                font-family:'Plus Jakarta Sans','DM Sans',sans-serif;
                transform:scale(0.93) translateY(8px);
                transition:transform 0.28s cubic-bezier(0.175,0.885,0.32,1.275);
                text-align:center;">
                <div style="width:52px;height:52px;border-radius:16px;margin:0 auto 1.25rem;
                            background:linear-gradient(135deg,rgba(109,40,217,0.3),rgba(79,70,229,0.3));
                            border:1px solid rgba(167,139,250,0.3);
                            display:flex;align-items:center;justify-content:center;">
                    <i class="ph ph-crown" style="color:#a78bfa;font-size:1.4rem;"></i>
                </div>
                <div style="font-weight:700;color:#e2e8f0;font-size:1rem;margin-bottom:0.4rem;">Acesso Master</div>
                <div style="color:#64748b;font-size:0.82rem;margin-bottom:0.35rem;">${nome}</div>
                <div style="color:#94a3b8;font-size:0.82rem;line-height:1.6;margin-bottom:1.75rem;">
                    Usuários <strong style="color:#a78bfa;">Master</strong> possuem acesso irrestrito a todas as
                    funcionalidades do sistema. Não é necessário configurar permissões individualmente.
                </div>
                <button onclick="window._fecharModalPermissoes()"
                    style="padding:0.65rem 2rem;border-radius:8px;border:none;
                           background:linear-gradient(135deg,#6d28d9,#4f46e5);color:#fff;
                           cursor:pointer;font-size:0.85rem;font-weight:600;font-family:inherit;transition:all 0.2s;"
                    onmouseover="this.style.filter='brightness(1.12)'"
                    onmouseout="this.style.filter='brightness(1)'">Entendido</button>
            </div>`;
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            modal.querySelector('#fp-panel').style.transform = 'scale(1) translateY(0)';
        });
        if (!document.getElementById('fp-spin-style')) {
            const s = document.createElement('style');
            s.id = 'fp-spin-style';
            s.textContent = '@keyframes fp-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
            document.head.appendChild(s);
        }
        return;
    }

    // Standard: modal editável
    let modal = document.getElementById('modal-feature-permissions');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-feature-permissions';
        Object.assign(modal.style, {
            position: 'fixed', inset: '0', zIndex: '99999',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(8,14,32,0.88)', backdropFilter: 'blur(10px)',
            opacity: '0', transition: 'opacity 0.2s ease',
        });
        modal.addEventListener('click', e => { if (e.target === modal) window._fecharModalPermissoes(); });
        document.body.appendChild(modal);
    }

    // Inicia keyframe de spin
    if (!document.getElementById('fp-spin-style')) {
        const s = document.createElement('style');
        s.id = 'fp-spin-style';
        s.textContent = '@keyframes fp-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }';
        document.head.appendChild(s);
    }

    // Skeleton do modal enquanto carrega
    modal.innerHTML = `
        <div id="fp-panel" style="
            background: #0f172a;
            border: 1px solid rgba(255,255,255,0.09);
            border-radius: 20px;
            width: 92%; max-width: 580px;
            max-height: 88vh;
            display: flex; flex-direction: column;
            box-shadow: 0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(167,139,250,0.08);
            font-family: 'Plus Jakarta Sans','DM Sans',sans-serif;
            transform: scale(0.93) translateY(8px);
            transition: transform 0.28s cubic-bezier(0.175,0.885,0.32,1.275);
            overflow: hidden;
        ">
            <!-- Cabeçalho -->
            <div style="padding:1.25rem 1.5rem; border-bottom:1px solid rgba(255,255,255,0.07);
                        display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
                <div style="display:flex; align-items:center; gap:0.85rem;">
                    <div style="width:40px; height:40px; border-radius:12px;
                                background:linear-gradient(135deg,rgba(109,40,217,0.4),rgba(79,70,229,0.4));
                                border:1px solid rgba(167,139,250,0.25);
                                display:flex; align-items:center; justify-content:center;">
                        <i class="ph ph-shield-check" style="color:#a78bfa; font-size:1.2rem;"></i>
                    </div>
                    <div>
                        <div style="font-weight:700; color:#e2e8f0; font-size:1rem; line-height:1.2;">Permissões de Acesso</div>
                        <div style="color:#64748b; font-size:0.78rem; display:flex; align-items:center; gap:0.35rem; margin-top:0.15rem;">
                            <i class="ph ph-user" style="font-size:0.7rem;"></i>
                            ${nome}
                        </div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    <span id="fp-count-badge" style="font-size:0.72rem; color:#a78bfa; background:rgba(167,139,250,0.1);
                          border:1px solid rgba(167,139,250,0.2); padding:0.2rem 0.55rem; border-radius:20px; font-weight:600;">
                        — permissões
                    </span>
                    <button onclick="window._fecharModalPermissoes()"
                        style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08);
                               border-radius:8px; color:#64748b; cursor:pointer; padding:0.35rem 0.5rem;
                               font-size:1rem; transition:all 0.15s; line-height:1;"
                        onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.color='#e2e8f0'"
                        onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color='#64748b'">
                        <i class="ph ph-x"></i>
                    </button>
                </div>
            </div>

            <!-- Atalhos rápidos -->
            <div style="padding:0.75rem 1.5rem; border-bottom:1px solid rgba(255,255,255,0.05);
                        display:flex; align-items:center; gap:0.6rem; flex-shrink:0; background:rgba(255,255,255,0.015);">
                <span style="font-size:0.75rem; color:#475569; margin-right:0.25rem;">Selecionar:</span>
                <button onclick="window._fpGrantAll()"
                    style="padding:0.3rem 0.7rem; border-radius:6px; border:1px solid rgba(52,211,153,0.3);
                           background:rgba(52,211,153,0.07); color:#34d399; cursor:pointer; font-size:0.73rem;
                           font-weight:600; font-family:inherit; transition:all 0.15s;"
                    onmouseover="this.style.background='rgba(52,211,153,0.15)'"
                    onmouseout="this.style.background='rgba(52,211,153,0.07)'">
                    <i class="ph ph-check-square"></i> Todas
                </button>
                <button onclick="window._fpRevokeAll()"
                    style="padding:0.3rem 0.7rem; border-radius:6px; border:1px solid rgba(239,68,68,0.25);
                           background:rgba(239,68,68,0.06); color:#f87171; cursor:pointer; font-size:0.73rem;
                           font-weight:600; font-family:inherit; transition:all 0.15s;"
                    onmouseover="this.style.background='rgba(239,68,68,0.14)'"
                    onmouseout="this.style.background='rgba(239,68,68,0.06)'">
                    <i class="ph ph-x-square"></i> Nenhuma
                </button>
            </div>

            <!-- Checkboxes -->
            <div id="fp-groups-container" style="overflow-y:auto; flex:1; padding:1.25rem 1.5rem;">
                <div style="text-align:center; padding:3rem; color:#64748b;">
                    <i class="ph ph-circle-notch" style="animation:fp-spin 1s linear infinite; display:inline-block; font-size:1.4rem; margin-bottom:0.5rem; display:block;"></i>
                    Carregando permissões...
                </div>
            </div>

            <!-- Footer -->
            <div style="padding:1rem 1.5rem; border-top:1px solid rgba(255,255,255,0.07);
                        display:flex; justify-content:flex-end; align-items:center; gap:0.75rem; flex-shrink:0;">
                <button onclick="window._fecharModalPermissoes()"
                    style="padding:0.6rem 1.25rem; border-radius:8px; border:1px solid rgba(255,255,255,0.1);
                           background:transparent; color:#94a3b8; cursor:pointer; font-size:0.85rem;
                           font-family:inherit; transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.05)'"
                    onmouseout="this.style.background='transparent'">Cancelar</button>
                <button id="fp-save-btn" onclick="window._salvarPermissoes('${userId}')"
                    style="padding:0.6rem 1.5rem; border-radius:8px; border:none;
                           background:linear-gradient(135deg,#6d28d9,#4f46e5); color:#fff;
                           cursor:pointer; font-size:0.85rem; font-weight:600; font-family:inherit;
                           display:flex; align-items:center; gap:0.4rem; transition:all 0.2s;"
                    onmouseover="this.style.filter='brightness(1.12)'"
                    onmouseout="this.style.filter='brightness(1)'">
                    <i class="ph ph-floppy-disk"></i> Salvar
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        const panel = modal.querySelector('#fp-panel');
        if (panel) panel.style.transform = 'scale(1) translateY(0)';
    });

    // Carrega permissões atuais
    try {
        const token = await getAuthToken();
        const res = await fetch(`/api/users/${userId}/feature-permissions`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const permsMap = await res.json();
        _renderPermissoesCheckboxes(permsMap);
        _atualizarContadorFP();
    } catch (err) {
        const container = document.getElementById('fp-groups-container');
        if (container) container.innerHTML =
            `<div style="color:#ef4444;text-align:center;padding:2rem;">
                <i class="ph ph-warning" style="font-size:1.5rem; display:block; margin-bottom:0.5rem;"></i>
                Erro ao carregar: ${err.message}
            </div>`;
    }
};

function _atualizarContadorFP() {
    const checked = document.querySelectorAll('input[name="fp-perm"]:checked').length;
    const total   = document.querySelectorAll('input[name="fp-perm"]').length;
    const badge   = document.getElementById('fp-count-badge');
    if (badge) badge.textContent = `${checked}/${total} permissões`;
}

function _renderPermissoesCheckboxes(permsMap) {
    const container = document.getElementById('fp-groups-container');
    if (!container) return;

    container.innerHTML = _PERMISSION_GROUPS.map(group => `
        <div style="margin-bottom:1.5rem;">
            <!-- Cabeçalho do grupo -->
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.65rem;
                        padding-bottom:0.5rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                <i class="${group.icon}" style="color:${group.color}; font-size:0.85rem;"></i>
                <span style="font-size:0.68rem; font-weight:700; text-transform:uppercase;
                             letter-spacing:0.1em; color:${group.color};">${group.label}</span>
            </div>
            <!-- Grid de checkboxes -->
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:0.3rem;">
                ${group.keys.map(([key, label, icon]) => `
                    <label style="display:flex; align-items:center; gap:0.5rem; padding:0.45rem 0.65rem;
                                  border-radius:8px; cursor:pointer; transition:all 0.12s;
                                  border:1px solid ${permsMap[key] ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)'};
                                  background:${permsMap[key] ? 'rgba(167,139,250,0.07)' : 'rgba(255,255,255,0.02)'};"
                           onmouseover="this.style.background='${permsMap[key] ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.05)'}'"
                           onmouseout="this.style.background='${permsMap[key] ? 'rgba(167,139,250,0.07)' : 'rgba(255,255,255,0.02)'}'">
                        <input type="checkbox" name="fp-perm" value="${key}"
                            ${permsMap[key] ? 'checked' : ''}
                            onchange="window._fpUpdateLabel(this); window._atualizarContadorFP();"
                            style="width:14px; height:14px; accent-color:#a78bfa; cursor:pointer; flex-shrink:0;">
                        <i class="${icon}" style="color:${permsMap[key] ? '#a78bfa' : '#475569'}; font-size:0.8rem; flex-shrink:0; transition:color 0.12s;"></i>
                        <span style="font-size:0.78rem; color:${permsMap[key] ? '#e2e8f0' : '#94a3b8'}; line-height:1.3; transition:color 0.12s;">${label}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');
}

window._fpUpdateLabel = function(cb) {
    const label = cb.closest('label');
    const icon  = label?.querySelector('i');
    const text  = label?.querySelector('span');
    if (cb.checked) {
        if (label) { label.style.background = 'rgba(167,139,250,0.07)'; label.style.borderColor = 'rgba(167,139,250,0.2)'; }
        if (icon)  icon.style.color = '#a78bfa';
        if (text)  text.style.color = '#e2e8f0';
    } else {
        if (label) { label.style.background = 'rgba(255,255,255,0.02)'; label.style.borderColor = 'rgba(255,255,255,0.04)'; }
        if (icon)  icon.style.color = '#475569';
        if (text)  text.style.color = '#94a3b8';
    }
};

window._fpGrantAll = function() {
    document.querySelectorAll('input[name="fp-perm"]').forEach(cb => { cb.checked = true; window._fpUpdateLabel(cb); });
    _atualizarContadorFP();
};

window._fpRevokeAll = function() {
    document.querySelectorAll('input[name="fp-perm"]').forEach(cb => { cb.checked = false; window._fpUpdateLabel(cb); });
    _atualizarContadorFP();
};

window._atualizarContadorFP = _atualizarContadorFP;

window._fecharModalPermissoes = function () {
    const modal = document.getElementById('modal-feature-permissions');
    if (!modal) return;
    modal.style.opacity = '0';
    const panel = modal.querySelector('#fp-panel');
    if (panel) { panel.style.transform = 'scale(0.93) translateY(8px)'; }
    setTimeout(() => { modal.style.display = 'none'; }, 220);
};

window._salvarPermissoes = async function (userId) {
    const btn = document.getElementById('fp-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-circle-notch" style="animation:fp-spin 1s linear infinite;display:inline-block;margin-right:0.3rem;"></i> Salvando...'; }

    const checked = [...document.querySelectorAll('input[name="fp-perm"]:checked')].map(cb => cb.value);

    try {
        const token = await getAuthToken();
        const res = await fetch(`/api/users/${userId}/feature-permissions`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: checked }),
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error('[Feature Permissions] Server returned error:', res.status, errorText);
            let errorMessage = 'Erro ao salvar';
            try {
                const data = JSON.parse(errorText);
                errorMessage = data.error || errorMessage;
            } catch (e) {
                errorMessage = errorText;
            }
            throw new Error(`${res.status} - ${errorMessage}`);
        }
        showToast(`Permissões atualizadas! ✅`, 'success');
        window._fecharModalPermissoes();

        // ─ Se as permissões alteradas são do próprio usuário logado,
        //   atualiza o cache em memória e re-aplica o nav imediatamente
        const eu = window.__usuarioAtual;
        if (eu && eu.id === userId) {
            try {
                const meRes = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
                if (meRes.ok) {
                    const me = await meRes.json();
                    window.__usuarioAtual = me;
                    window.aplicarPermissoesNavegacao?.();
                }
            } catch (_) { /* silencioso — o refresh manual resolve */ }
        }
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar'; }
    }
};



import { state } from './modules/state.js';
import * as utils from './modules/utils.js';
import * as ui from './modules/ui.js';
import * as nav from './modules/navigation.js';
import * as auth from './modules/auth.js';
import * as handlers from './modules/handlers.js';
import { api } from './modules/api.js';
import { confirmar } from './modules/confirmar.js';
import {
    openProdutoEditor,
    closeProdutoEditor,
    openBulkProdutoEditor,
} from './modules/company-products/company-products-editor.js';
import { refreshCompanyProductsTable } from './modules/company-products/company-products-table.js';
import {
    openContatoEditor,
    saveContatoEditor,
    closeContatoEditor,
    openBulkContatoEditor,
} from './modules/company-contacts/company-contacts-editor.js';
import { refreshCompanyContactsTable } from './modules/company-contacts/company-contacts-table.js';
import { initImportModule } from './modules/importer/import-manager.js';
import * as activities from './modules/activities.js';
import { initTooltipSystem } from './core/tooltip.js'; // 🎯 Tooltip System — UX 10/10

// ─── Journey Dashboard (novo módulo) ────────────────────────────────────────
import { initDashboard } from '../src/pages/Dashboard.js';
// mockUsuarios removido — substituiído por /api/usuarios (Clerk-sincronizado)

// Controla se o dashboard já foi inicializado
let _dashboardIniciado = false;

/**
 * Inicializa o Journey Dashboard (chamado no primeiro acesso e no nav click)
 */
function mostrarJourneyDashboard() {
    if (!_dashboardIniciado) {
        initDashboard('journey-dashboard-root');
        _dashboardIniciado = true;

        // Exibe a data atual no header do dashboard
        const elData = document.getElementById('dashboard-data-hoje');
        if (elData) {
            const hoje = new Date();
            elData.textContent = hoje.toLocaleDateString('pt-BR', {
                weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
            });
        }

        // Inicializa o menu dropdown de usuário
        _dbInicializarMenu();
    }
}

// ─── Lógica do Dropdown de Usuário (menu geral do dashboard) ─────────────────
// Todas as funções window._ são expostas globalmente para os onclick do HTML.

/**
 * Popula o #db-user-list com os usuários reais da API /api/usuarios
 */
async function _dbInicializarMenu() {
    const lista = document.getElementById('db-user-list');
    if (!lista) return;

    const avatarColors = ['#0F3460', '#1A5276', '#E8832A', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#EC4899'];

    // Cache local dos usuários carregados (para _dbSelecionarUsuario)
    let usuarios = [];
    try {
        const token = await auth.getAuthToken();
        usuarios = await fetch('/api/usuarios', {
            headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json()).catch(() => []);
    } catch (err) {
        console.warn('[Dashboard] Não foi possível carregar usuários:', err);
    }

    // Armazena no window para o _dbSelecionarUsuario usar
    window.__usuariosCache = Array.isArray(usuarios) ? usuarios : [];

    lista.innerHTML = window.__usuariosCache.map((u, i) => {
        const cor = avatarColors[i % avatarColors.length];
        const avatarText = u.avatar || (u.nome ? u.nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : 'U');
        return `
            <button class="db-dropdown-item" id="db-dd-${u.id}"
                onclick="window._dbSelecionarUsuario('${u.nome}', '${u.nome}', '${avatarText}', event)"
                style="--avatar-cor:${cor};">
                <span style="width:26px;height:26px;border-radius:50%;background:${cor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;flex-shrink:0;">${avatarText}</span>
                <div style="display:flex;flex-direction:column;min-width:0;flex:1;">
                    <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.nome}</span>
                    <span style="font-size:11px;color:#64748B;font-weight:400;">${u.role || 'member'}</span>
                </div>
                <i class="ph ph-check" id="check-${u.id}" style="margin-left:auto;font-size:12px;color:#0F3460;display:none;"></i>
            </button>
        `;
    }).join('');
}

/**
 * Abre/fecha o dropdown de usuário
 */
window._dbToggleUserMenu = function (event) {
    event.stopPropagation();
    const menu = document.getElementById('db-user-dropdown-menu');
    const btn = document.getElementById('db-user-btn');
    if (!menu) return;
    const aberto = menu.classList.toggle('open');
    if (btn) btn.setAttribute('aria-expanded', aberto ? 'true' : 'false');
};

/**
 * Seleciona um usuário e propaga para o filtro do painel Próximos Passos
 * @param {string} nome       - nome do usuário (ou 'Todos')
 * @param {string} label      - texto a mostrar no botão
 * @param {string} avatar     - iniciais para o avatar
 * @param {Event}  event
 */
window._dbSelecionarUsuario = function (nome, label, avatar, event) {
    event?.stopPropagation();

    // Atualiza visual do botão
    const btnNome = document.getElementById('db-user-name-btn');
    const btnAvatar = document.getElementById('db-avatar-btn');
    if (btnNome) btnNome.textContent = label;
    if (btnAvatar) {
        btnAvatar.textContent = avatar;
        btnAvatar.style.background = nome === 'Todos' ? '#64748B' : '#0F3460';
    }

    // Remove .active de todos os itens e esconde todos os checks
    document.querySelectorAll('.db-dropdown-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('[id^="check-"]').forEach(el => el.style.display = 'none');

    // Marca o item selecionado
    const idTarget = nome === 'Todos' ? 'db-dd-todos' : null;
    if (idTarget) {
        document.getElementById(idTarget)?.classList.add('active');
        document.getElementById('check-Todos').style.display = 'inline';
    } else {
        // Acha o botão pelo nome do usuário usando o cache da API
        const usuarios = window.__usuariosCache || [];
        const usuario = usuarios.find(u => u.nome === nome);
        if (usuario) {
            document.getElementById(`db-dd-${usuario.id}`)?.classList.add('active');
            const chk = document.getElementById(`check-${usuario.id}`);
            if (chk) chk.style.display = 'inline';
        }
    }

    // Fecha o menu
    document.getElementById('db-user-dropdown-menu')?.classList.remove('open');
    document.getElementById('db-user-btn')?.setAttribute('aria-expanded', 'false');

    // ─── Propaga o filtro para o painel Próximos Passos ───────────────
    // O painel expõe window._proximosPassos.setResponsavel()
    if (window._proximosPassos?.setResponsavel) {
        window._proximosPassos.setResponsavel(nome === 'Todos' ? 'Todos' : nome);
    }
};

// Fecha o dropdown ao clicar fora
document.addEventListener('click', (e) => {
    const wrap = document.getElementById('db-user-dropdown-wrap');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('db-user-dropdown-menu')?.classList.remove('open');
        document.getElementById('db-user-btn')?.setAttribute('aria-expanded', 'false');
    }
});



// Globalize for inline onclicks
window.ui = ui;
window.nav = nav;
window.handlers = handlers;
window.utils = utils;
window.state = state;
window.activities = activities;

// =============================================================================
// SECTION 1: Click Event Handler Functions (Delegation pattern)
// Each function returns true if handled, false to continue the chain.
// =============================================================================

function handleNavigation(target) {
    if (target.closest('.nav-item') && !target.closest('.nav-group-toggle') && !target.closest('.nav-sub-item')) {
        const view = target.closest('.nav-item').getAttribute('data-view');
        if (view) {
            nav.switchView(view);
            if (view === 'import') initImportModule();
            // Inicializa o dashboard quando o usuário nav. para ele
            if (view === 'dashboard') mostrarJourneyDashboard();
        }
        return true;
    }

    if (target.closest('.nav-sub-item')) {
        const subItem = target.closest('.nav-sub-item');
        document.querySelectorAll('.nav-sub-item').forEach(i => i.classList.remove('active'));
        subItem.classList.add('active');
        const view = subItem.getAttribute('data-view');
        if (view) nav.switchView(view);
        if (view === 'log') ui.renderLogTestes();
        return true;
    }

    if (target.closest('.btn-new-company')) {
        nav.openCompanyForm();
        return true;
    }

    if (target.closest('.btn-back-list')) {
        nav.switchView('company-list');
        return true;
    }

    return false;
}

function handleCompanyActions(target, e) {
    if (target.closest('.btn-edit')) {
        nav.openCompanyForm(target.closest('.btn-edit').getAttribute('data-id'));
        return true;
    }

    if (target.closest('.btn-delete')) {
        e.preventDefault();
        e.stopPropagation();
        const id = target.closest('.btn-delete').getAttribute('data-id');
        const v2 = ui.getCompaniesManagerV2?.();

        // Se a linha clicada faz parte de uma seleção múltipla → bulk delete
        const selectedIds = v2 ? [...v2.getSelectedIds()] : [];
        const isPartOfSelection = selectedIds.includes(String(id)) && selectedIds.length > 1;

        if (isPartOfSelection) {
            // Delegar para bulk delete com todas as selecionadas
            const count = selectedIds.length;
            confirmar(
                `Deseja excluir permanentemente ${count} empresas selecionadas?`,
                () => {
                    (async () => {
                        let successCount = 0, errorCount = 0;
                        for (const sid of selectedIds) {
                            try {
                                await api.deleteCompany(sid);
                                state.companies = state.companies.filter(c => String(c.id) !== String(sid));
                                successCount++;
                            } catch (err) {
                                console.error(`[Delete] Erro ao excluir ${sid}:`, err);
                                errorCount++;
                            }
                        }
                        ui.renderDashboard?.();
                        ui.renderCompanyList();
                        ui.clearBulkSelection?.();
                        if (errorCount === 0) {
                            utils.showToast(`${successCount} empresa${successCount !== 1 ? 's' : ''} excluída${successCount !== 1 ? 's' : ''} com sucesso!`, 'success');
                        } else {
                            utils.showToast(`${successCount} excluída${successCount !== 1 ? 's' : ''}. ${errorCount} com erro.`, 'error');
                        }
                    })();
                }
            );
        } else {
            // Delete individual (sem seleção múltipla ativa)
            confirmar('Deseja excluir esta empresa permanentemente?', () => {
                (async () => {
                    try {
                        await api.deleteCompany(id);
                        state.companies = state.companies.filter(c => String(c.id) !== String(id));
                        ui.renderDashboard();
                        ui.renderCompanyList();
                        utils.showToast('Exclusão realizada com sucesso!', 'success');
                    } catch (err) {
                        utils.showToast('Erro ao excluir: ' + err.message, 'error');
                    }
                })();
            });
        }
        return true;
    }

    return false;
}

function handleTabActions(target) {
    if (target.closest('.tab-menu-btn')) {
        const btn = target.closest('.tab-menu-btn');
        const tabId = btn.getAttribute('data-tab');
        if (tabId) {
            nav.switchFormTab(tabId, btn);

            // Inicializa a aba Atividades ao navegar para ela
            if (tabId === 'tab-atividades') {
                const companyId = document.getElementById('company-id')?.value;
                if (companyId) {
                    activities.initActivitiesTab(companyId);
                }
            }
        }
        return true;
    }
    return false;
}

function handleContactActions(target, e) {
    // ── TM2: Edit contato ──────────────────────────────────────────────────────
    if (target.closest('.btn-edit-contato')) {
        e.stopPropagation();
        openContatoEditor(target.closest('.btn-edit-contato').dataset.contId);
        return true;
    }
    // ── TM2: Delete contato individual ─────────────────────────────────────────
    if (target.closest('.btn-delete-contato')) {
        e.stopPropagation();
        const contId = target.closest('.btn-delete-contato').dataset.contId;
        const cont = (state.tempContatos || []).find(c => String(c.id) === String(contId));
        const mgr = ui.getCompanyContactsManager ? ui.getCompanyContactsManager() : null;
        const selIds = mgr ? mgr.getSelectedIds() : [];
        const isInSelection = selIds.includes(String(contId)) && selIds.length > 1;

        if (isInSelection) {
            confirmar(
                `Excluir ${selIds.length} contato${selIds.length !== 1 ? 's' : ''} selecionado${selIds.length !== 1 ? 's' : ''}?`,
                () => {
                    const idSet = new Set(selIds.map(String));
                    state.tempContatos = (state.tempContatos || []).filter(c => !idSet.has(String(c.id)));
                    mgr.clearSelection();
                    refreshCompanyContactsTable();
                    utils.showToast(`${selIds.length} contato${selIds.length !== 1 ? 's' : ''} removido${selIds.length !== 1 ? 's' : ''}.`, 'success');
                }
            );
        } else {
            confirmar(
                `Remover o contato "${cont?.nome || 'contato'}"?`,
                () => {
                    state.tempContatos = (state.tempContatos || []).filter(c => String(c.id) !== String(contId));
                    refreshCompanyContactsTable();
                    utils.showToast('Contato removido.', 'success');
                }
            );
        }
        return true;
    }
    return false;
}

function handleTempDataActions(target) {
    const tempRemovers = [
        { class: '.btn-remove-temp-dashboard', stateArr: 'tempDashboards', render: 'renderDashboardsTable', msg: 'Excluir este dashboard?' },
        { class: '.btn-remove-temp-nps', stateArr: 'tempNPSHistory', render: 'renderNPSHistoryTable', msg: 'Excluir esta pesquisa NPS?' },
        { class: '.btn-remove-temp-csmeet', stateArr: 'tempReunioesCS', render: 'renderCSMeetingsTable', msg: 'Excluir esta reunião?' },
        { class: '.btn-remove-temp-ticket', stateArr: 'tempChamados', render: 'renderTicketsTable', msg: 'Excluir este chamado?' },
        { class: '.btn-remove-temp-reuniao', stateArr: 'tempReunioes', render: 'renderReunioesTable', msg: 'Excluir esta reunião?' },
        { class: '.btn-remove-temp-followup', stateArr: 'tempFollowUps', render: 'renderFollowUpsTable', msg: 'Excluir este follow-up?' }
    ];

    for (const r of tempRemovers) {
        const btn = target.closest(r.class);
        if (btn) {
            const index = parseInt(btn.dataset.index);
            confirmar(r.msg, () => {
                state[r.stateArr].splice(index, 1);
                ui[r.render]();
            });
            return true;
        }
    }

    if (target.closest('.btn-remove-temp-note')) {
        handlers.removeTempNote(target.closest('.btn-remove-temp-note').dataset.index);
        return true;
    }

    return false;
}

function handleToggleActions(target) {
    const toggleConfigs = [
        { toggleId: 'btn-toggle-dashboard-form', containerId: 'dashboard-form-container', cancelId: 'btn-cancel-dashboard', reset: ['new-db-data', 'new-db-dest', 'new-db-link'], mode: 'block' },
        { toggleId: 'btn-toggle-nps-form', containerId: 'nps-form-container', cancelId: 'btn-cancel-nps', reset: ['new-nps-data', 'new-nps-dest', 'new-nps-forms', 'new-nps-score'], mode: 'block' },
        { toggleId: 'btn-toggle-cs-meet-form', containerId: 'cs-meet-form-container', cancelId: 'btn-cancel-cs-meet', reset: ['new-cs-meet-data', 'new-cs-meet-parts', 'new-cs-meet-obs', 'new-cs-meet-link'], mode: 'block' },
        { toggleId: 'btn-toggle-ticket-form', containerId: 'ticket-form-container', cancelId: 'btn-cancel-ticket', reset: ['new-tk-data', 'new-tk-autor', 'new-tk-num', 'new-tk-link', 'new-tk-resumo'], mode: 'block' },
        { toggleId: 'btn-toggle-contact-form', containerId: 'contact-form-container', cancelId: 'btn-cancel-contact', reset: [], mode: 'block' },
        { toggleId: 'btn-toggle-meeting-form', containerId: 'meeting-form-container', cancelId: 'btn-cancel-meeting', reset: [], mode: 'block' },
        { toggleId: 'btn-toggle-followup-form', containerId: 'followup-form-container', cancelId: 'btn-cancel-followup', reset: ['new-fw-usuario', 'new-fw-content', 'new-fw-next', 'new-fw-area'], mode: 'block' }
    ];

    const matchToggle = toggleConfigs.find(c => target.closest(`#${c.toggleId}`));
    if (matchToggle) {
        const container = document.getElementById(matchToggle.containerId);
        const toggleBtn = document.getElementById(matchToggle.toggleId);
        if (container) container.style.display = matchToggle.mode;
        if (toggleBtn) toggleBtn.style.display = 'none';
        return true;
    }

    const matchCancel = toggleConfigs.find(c => target.closest(`#${c.cancelId}`));
    if (matchCancel) {
        const container = document.getElementById(matchCancel.containerId);
        const toggleBtn = document.getElementById(matchCancel.toggleId);
        if (container) container.style.display = 'none';
        if (toggleBtn) toggleBtn.style.display = 'inline-flex';
        if (matchCancel.reset) {
            matchCancel.reset.forEach(f => {
                const el = document.getElementById(f);
                if (el) el.value = '';
            });
        }
        return true;
    }

    return false;
}

function handleSaveActions(target) {
    const targetId = target.id;
    if (targetId === 'btn-save-contact') { handlers.saveNewContato(); return true; }
    if (targetId === 'btn-save-dashboard') { handlers.saveTempDashboard(); return true; }
    if (targetId === 'btn-save-nps') { handlers.saveTempNPS(); return true; }
    if (targetId === 'btn-save-cs-meet') { handlers.saveTempCSMeet(); return true; }
    if (targetId === 'btn-save-ticket') { handlers.saveTempTicket(); return true; }
    if (targetId === 'btn-add-cs-note') { handlers.addCSNote(); return true; }
    if (targetId === 'btn-add-meeting-submit') { handlers.saveTempReuniao(); return true; }
    if (targetId === 'btn-save-followup') { handlers.saveTempFollowUp(); return true; }
    if (targetId === 'btn-logout') { auth.handleLogout(); return true; }
    return false;
}

// =============================================================================
// SECTION 2: Global Click Dispatcher
// =============================================================================

function handleGlobalClick(e) {
    const target = e.target;

    if (handleNavigation(target)) return;
    if (handleCompanyActions(target, e)) return;
    if (handleTabActions(target)) return;
    if (handleContactActions(target, e)) return;
    if (handleTempDataActions(target)) return;
    if (handleToggleActions(target)) return;
    if (handleSaveActions(target)) return;
}

// =============================================================================
// SECTION 3: App Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializa Clerk — ele decide sozinho se mostra login ou app
    // (substitui a verificação sessionStorage anterior)
    await auth.initClerk();

    // Inicializa o Journey Dashboard quando o Clerk confirmar a autenticação.
    // O evento 'dati:app-ready' é emitido pelo auth.js (_bootstrapApp) após login
    // bem-sucedido — funciona tanto para sessão preexistente quanto para login novo.
    document.addEventListener('dati:app-ready', () => {
        mostrarJourneyDashboard();
    });

    ui.initGlobalPickers();

    // 🎯 Inicializa o sistema global de tooltips (data-th-tooltip)
    initTooltipSystem();

    // Register global click delegation
    document.addEventListener('click', handleGlobalClick);

    // --- Static Form Listeners ---
    // login-form removido — o Clerk gerencia o submit da tela de login
    document.getElementById('company-form')?.addEventListener('submit', handlers.handleCompanySubmit);

    // --- Static Change Listeners (form elements, never recreated by DOM) ---
    document.getElementById('emp-estado')?.addEventListener('change', (e) => {
        utils.loadCities(e.target.value, '');
        const cityEl = document.getElementById('emp-cidade');
        if (cityEl) cityEl.value = '';
    });

    document.getElementById('emp-status')?.addEventListener('change', (e) => {
        utils.updateStatusStyle(e.target);
    });

    document.getElementById('qual-tem-comex')?.addEventListener('change', (e) => {
        const group = document.getElementById('group-qual-comex');
        if (group) group.style.display = e.target.value === 'Sim' ? 'block' : 'none';
    });

    document.getElementById('qual-tem-erp')?.addEventListener('change', (e) => {
        const group = document.getElementById('group-qual-erp');
        if (group) group.style.display = e.target.value === 'Sim' ? 'block' : 'none';
    });

    // ── Produtos DATI: Adicionar ───────────────────────────────────────────────
    document.getElementById('btn-add-produto')?.addEventListener('click', () => {
        openProdutoEditor(null);
    });

    // ── Produtos DATI: Checkboxes individuais (event delegation) ──────────────
    document.getElementById('produtos-table-body')?.addEventListener('change', (e) => {
        const cb = e.target.closest('.produto-checkbox');
        if (!cb) return;
        const mgr = ui.getCompanyProductsManager ? ui.getCompanyProductsManager() : null;
        if (!mgr) return;

        const prodId = cb.dataset.prodId;
        mgr.toggleSelect(prodId);

        // Feedback visual na linha
        const row = cb.closest('tr');
        if (row) row.classList.toggle('row-selected', mgr.isSelected(prodId));

        ui.updateProdutosBulkUI?.();
    });

    // ── Produtos DATI: Select-all da página ────────────────────────────────────
    document.getElementById('select-all-produtos')?.addEventListener('change', (e) => {
        const mgr = ui.getCompanyProductsManager ? ui.getCompanyProductsManager() : null;
        if (!mgr) return;

        mgr.toggleSelectAll(e.target.checked);

        // Feedback visual em todas as linhas da página
        document.querySelectorAll('#produtos-table-body .produto-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
            const row = cb.closest('tr');
            if (row) row.classList.toggle('row-selected', e.target.checked);
        });

        ui.updateProdutosBulkUI?.();
    });

    // ── Produtos DATI: Editar / Excluir individual via event delegation ────────
    document.getElementById('produtos-table-body')?.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit-produto');
        const deleteBtn = e.target.closest('.btn-delete-produto');

        if (editBtn) {
            e.stopPropagation();
            openProdutoEditor(editBtn.dataset.prodId);
            return;
        }

        if (deleteBtn) {
            e.stopPropagation();
            const prodId = deleteBtn.dataset.prodId;
            const prod = (state.tempProdutos || []).find(p => String(p.id) === String(prodId));
            confirmar(
                `Remover o produto "${prod?.nome || 'produto'}" desta empresa?`,
                () => {
                    state.tempProdutos = (state.tempProdutos || [])
                        .filter(p => String(p.id) !== String(prodId));
                    refreshCompanyProductsTable();
                    utils.showToast('Produto removido.', 'success');
                }
            );
        }
    });

    // ── Produtos DATI: Bulk delete ─────────────────────────────────────────────
    document.getElementById('bulk-delete-produtos-btn')?.addEventListener('click', () => {
        const mgr = ui.getCompanyProductsManager ? ui.getCompanyProductsManager() : null;
        if (!mgr) return;
        const ids = mgr.getSelectedIds();
        if (!ids.length) return;

        confirmar(
            `Excluir ${ids.length} produto${ids.length !== 1 ? 's' : ''} selecionado${ids.length !== 1 ? 's' : ''} desta empresa?`,
            () => {
                const idSet = new Set(ids.map(String));
                state.tempProdutos = (state.tempProdutos || [])
                    .filter(p => !idSet.has(String(p.id)));
                mgr.clearSelection();
                refreshCompanyProductsTable();
                utils.showToast(
                    `${ids.length} produto${ids.length !== 1 ? 's' : ''} removido${ids.length !== 1 ? 's' : ''}.`,
                    'success'
                );
            }
        );
    });

    // ── Produtos DATI: Limpar seleção ──────────────────────────────────────────
    document.getElementById('bulk-clear-produtos-btn')?.addEventListener('click', () => {
        ui.clearProdutosBulkSelection?.();
    });

    // ── Produtos DATI: Bulk edit ───────────────────────────────────────────────
    document.getElementById('bulk-edit-produtos-btn')?.addEventListener('click', () => {
        const mgr = ui.getCompanyProductsManager ? ui.getCompanyProductsManager() : null;
        if (!mgr) return;
        const ids = mgr.getSelectedIds();
        if (!ids.length) return;
        openBulkProdutoEditor(ids);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // ── Contatos: TM2 Wiring ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    // ── Contatos: Botão "+ Novo Contato" ──────────────────────────────────────
    document.getElementById('btn-add-contato')?.addEventListener('click', () => {
        openContatoEditor(null);
    });

    // ── Contatos: Editor modal — Salvar ───────────────────────────────────────
    document.getElementById('btn-save-contato-editor')?.addEventListener('click', () => {
        saveContatoEditor();
    });

    // ── Contatos: Editor modal — Cancelar / Overlay ───────────────────────────
    document.getElementById('btn-cancel-contato-editor')?.addEventListener('click', closeContatoEditor);
    document.getElementById('contato-editor-overlay')?.addEventListener('click', (e) => {
        // Fecha apenas se o clique foi no overlay (fundo), não dentro do modal
        if (e.target.id === 'contato-editor-overlay') closeContatoEditor();
    });

    // ── Contatos: Checkboxes individuais ──────────────────────────────────────
    document.getElementById('contatos-table-body')?.addEventListener('change', (e) => {
        const cb = e.target.closest('.contato-checkbox');
        if (!cb) return;
        const mgr = ui.getCompanyContactsManager ? ui.getCompanyContactsManager() : null;
        if (!mgr) return;

        const contId = cb.dataset.contId;
        mgr.toggleSelect(contId);

        const row = cb.closest('tr');
        if (row) row.classList.toggle('row-selected', mgr.isSelected(contId));

        ui.updateContatosBulkUI?.();
    });

    // ── Contatos: Select-all da página ────────────────────────────────────────
    document.getElementById('select-all-contatos')?.addEventListener('change', (e) => {
        const mgr = ui.getCompanyContactsManager ? ui.getCompanyContactsManager() : null;
        if (!mgr) return;

        mgr.toggleSelectAll(e.target.checked);

        document.querySelectorAll('#contatos-table-body .contato-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
            const row = cb.closest('tr');
            if (row) row.classList.toggle('row-selected', e.target.checked);
        });

        ui.updateContatosBulkUI?.();
    });

    // ── Contatos: Bulk delete ─────────────────────────────────────────────────
    document.getElementById('bulk-delete-contatos-btn')?.addEventListener('click', () => {
        const mgr = ui.getCompanyContactsManager ? ui.getCompanyContactsManager() : null;
        if (!mgr) return;
        const ids = mgr.getSelectedIds();
        if (!ids.length) return;

        confirmar(
            `Excluir ${ids.length} contato${ids.length !== 1 ? 's' : ''} selecionado${ids.length !== 1 ? 's' : ''}?`,
            () => {
                const idSet = new Set(ids.map(String));
                state.tempContatos = (state.tempContatos || []).filter(c => !idSet.has(String(c.id)));
                mgr.clearSelection();
                refreshCompanyContactsTable();
                utils.showToast(
                    `${ids.length} contato${ids.length !== 1 ? 's' : ''} removido${ids.length !== 1 ? 's' : ''}.`,
                    'success'
                );
            }
        );
    });

    // ── Contatos: Editar em massa ─────────────────────────────────────────────
    document.getElementById('bulk-edit-contatos-btn')?.addEventListener('click', () => {
        const mgr = ui.getCompanyContactsManager ? ui.getCompanyContactsManager() : null;
        if (!mgr) return;
        const ids = mgr.getSelectedIds();
        if (!ids.length) return;
        openBulkContatoEditor(ids);
    });

    // ── Contatos: Limpar seleção ──────────────────────────────────────────────
    document.getElementById('bulk-clear-contatos-btn')?.addEventListener('click', () => {
        ui.clearContatosBulkSelection?.();
    });

    // --- Bulk Selection: checkboxes individuais via event delegation ---
    document.getElementById('company-table-body')?.addEventListener('change', (e) => {
        const cb = e.target.closest('.company-checkbox');
        const v2 = ui.getCompaniesManagerV2();
        if (!cb || !v2) return;

        const id = cb.dataset.id;
        v2.toggleSelect(id);

        // Feedback visual na linha
        const row = cb.closest('tr');
        if (row) row.classList.toggle('row-selected', v2.isSelected(id));

        ui.updateBulkSelectionUI();
    });

    // --- Bulk Selection: selecionar todos da página ---
    document.getElementById('select-all-companies')?.addEventListener('change', (e) => {
        const v2 = ui.getCompaniesManagerV2();
        if (!v2) return;

        const pageData = v2.getPaginatedData();
        const ids = pageData.map(row => row.id);

        v2.toggleSelectAll(e.target.checked);

        // Feedback visual em todas as linhas da página
        document.querySelectorAll('#company-table-body .company-checkbox').forEach(cb => {
            const row = cb.closest('tr');
            cb.checked = e.target.checked;
            if (row) row.classList.toggle('row-selected', e.target.checked);
        });

        ui.updateBulkSelectionUI();
    });

    // --- Bulk Edit: abre o formulário em modo edição em massa ---
    document.getElementById('bulk-edit-btn')?.addEventListener('click', () => {
        const v2 = ui.getCompaniesManagerV2?.();
        if (!v2) return;
        const ids = [...v2.getSelectedIds()];
        if (ids.length === 0) return;
        nav.openBulkEditForm(ids);
    });

    // --- Bulk Delete: exclusão real em massa ---
    document.getElementById('bulk-delete-btn')?.addEventListener('click', () => {
        const v2 = ui.getCompaniesManagerV2();
        if (!v2) return;
        const ids = [...v2.getSelectedIds()];
        if (ids.length === 0) return;

        confirmar(
            `Deseja excluir permanentemente ${ids.length} empresa${ids.length !== 1 ? 's' : ''} selecionada${ids.length !== 1 ? 's' : ''}?`,
            () => {
                // IIFE async separada para garantir execução completa
                (async () => {
                    let successCount = 0;
                    let errorCount = 0;

                    for (const id of ids) {
                        console.log(`[Bulk Delete] Tentando excluir ID: ${id}`);
                        try {
                            await api.deleteCompany(id);
                            state.companies = state.companies.filter(c => String(c.id) !== String(id));
                            successCount++;
                            console.log(`[Bulk Delete] ✅ Excluído com sucesso: ${id}`);
                        } catch (err) {
                            console.error(`[Bulk Delete] ❌ Erro ao excluir ID ${id}:`, err);
                            errorCount++;
                        }
                    }

                    console.log(`[Bulk Delete] Concluído: ${successCount} ok, ${errorCount} erros`);

                    // Atualizar UI após todas as exclusões
                    ui.renderDashboard?.();
                    ui.renderCompanyList();
                    ui.clearBulkSelection?.();

                    if (errorCount === 0) {
                        utils.showToast(`${successCount} empresa${successCount !== 1 ? 's' : ''} excluída${successCount !== 1 ? 's' : ''} com sucesso!`, 'success');
                    } else {
                        utils.showToast(`${successCount} excluída${successCount !== 1 ? 's' : ''}. ${errorCount} com erro.`, 'error');
                    }
                })();
            }
        );
    });
});

// =============================================================================
// SECTION 4: Global Assignments (legacy HTML compatibility)
// =============================================================================

window.switchCSSubTab = nav.switchCSSubTab;
window.switchFormTab = nav.switchFormTab;
window.maskCurrency = utils.maskCurrency;
window.maskCNPJ = utils.maskCNPJ;
window.toggleNavGroup = (groupId) => {
    const group = document.getElementById(groupId);
    if (group) group.classList.toggle('open');
};

// Make UI available globally for sorting/filtering in index.html
window.ui = ui;

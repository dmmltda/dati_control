import { state } from './modules/state.js';
import * as utils from './modules/utils.js';
import * as ui from './modules/ui.js';
import * as nav from './modules/navigation.js';
import * as auth from './modules/auth.js';
import * as handlers from './modules/handlers.js';
import { api } from './modules/api.js';
import { confirmar } from './modules/confirmar.js';

// Globalize for inline onclicks
window.ui = ui;
window.nav = nav;
window.handlers = handlers;
window.utils = utils;
window.state = state;

// =============================================================================
// SECTION 1: Click Event Handler Functions (Delegation pattern)
// Each function returns true if handled, false to continue the chain.
// =============================================================================

function handleNavigation(target) {
    if (target.closest('.nav-item') && !target.closest('.nav-group-toggle') && !target.closest('.nav-sub-item')) {
        const view = target.closest('.nav-item').getAttribute('data-view');
        if (view) nav.switchView(view);
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
        confirmar('Deseja excluir esta empresa permanentemente?', () => {
            (async () => {
                try {
                    await api.deleteCompany(id);
                    state.companies = state.companies.filter(c => c.id != id);
                    ui.renderDashboard();
                    ui.renderCompanyList();
                    utils.showToast('Exclusão realizada com sucesso!', 'success');
                } catch (err) {
                    utils.showToast('Erro ao excluir: ' + err.message, 'error');
                }
            })();
        });
        return true;
    }

    return false;
}

function handleTabActions(target) {
    if (target.closest('.tab-menu-btn')) {
        const btn = target.closest('.tab-menu-btn');
        const tabId = btn.getAttribute('data-tab');
        if (tabId) nav.switchFormTab(tabId, btn);
        return true;
    }
    return false;
}

function handleContactActions(target) {
    if (target.closest('.btn-edit-contato')) {
        handlers.startEditContato(target.closest('.btn-edit-contato').dataset.id);
        return true;
    }
    if (target.closest('.btn-cancel-edit-contato')) {
        handlers.cancelEditContato();
        return true;
    }
    if (target.closest('.btn-save-edit-contato')) {
        handlers.saveEditContato(target.closest('.btn-save-edit-contato').dataset.id);
        return true;
    }
    if (target.closest('.btn-remove-contato')) {
        handlers.removeTempContato(target.closest('.btn-remove-contato').dataset.id);
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
    if (handleContactActions(target)) return;
    if (handleTempDataActions(target)) return;
    if (handleToggleActions(target)) return;
    if (handleSaveActions(target)) return;
}

// =============================================================================
// SECTION 3: App Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Check Auth
    if (sessionStorage.getItem('dati_auth') === 'true') {
        auth.showApp();
    }
    ui.initGlobalPickers();

    // Register global click delegation
    document.addEventListener('click', handleGlobalClick);

    // --- Static Form Listeners ---
    document.getElementById('login-form')?.addEventListener('submit', auth.handleLogin);
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

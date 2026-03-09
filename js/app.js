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

document.addEventListener('DOMContentLoaded', () => {
    // Check Auth
    if (sessionStorage.getItem('dati_auth') === 'true') {
        auth.showApp();
    }
    ui.initGlobalPickers();

    // --- Dynamic Delegate additions (Combined for performance and robustness) ---
    document.addEventListener('click', (e) => {
        const target = e.target;
        
        // 1. Navigation Actions
        if (target.closest('.nav-item') && !target.closest('.nav-group-toggle') && !target.closest('.nav-sub-item')) {
            const view = target.closest('.nav-item').getAttribute('data-view');
            if (view) nav.switchView(view);
            return;
        }

        if (target.closest('.nav-sub-item')) {
            const subItem = target.closest('.nav-sub-item');
            document.querySelectorAll('.nav-sub-item').forEach(i => i.classList.remove('active'));
            subItem.classList.add('active');
            const view = subItem.getAttribute('data-view');
            if (view) nav.switchView(view);
            if (view === 'log') ui.renderLogTestes();
            return;
        }

        if (target.closest('.btn-new-company')) {
            nav.openCompanyForm();
            return;
        }

        if (target.closest('.btn-back-list')) {
            nav.switchView('company-list');
            return;
        }

        // 2. Company Action Buttons in Table
        if (target.closest('.btn-edit')) {
            nav.openCompanyForm(target.closest('.btn-edit').getAttribute('data-id'));
            return;
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
        }

        // 3. Tab Management
        if (target.closest('.tab-menu-btn')) {
            const btn = target.closest('.tab-menu-btn');
            const tabId = btn.getAttribute('data-tab');
            if (tabId) nav.switchFormTab(tabId, btn);
            return;
        }

        // 4. Contact/Product Handlers (within forms)
        if (target.closest('.btn-edit-contato')) {
            handlers.startEditContato(target.closest('.btn-edit-contato').dataset.id);
            return;
        }
        if (target.closest('.btn-cancel-edit-contato')) {
            handlers.cancelEditContato();
            return;
        }
        if (target.closest('.btn-save-edit-contato')) {
            handlers.saveEditContato(target.closest('.btn-save-edit-contato').dataset.id);
            return;
        }
        if (target.closest('.btn-remove-contato')) {
            handlers.removeTempContato(target.closest('.btn-remove-contato').dataset.id);
            return;
        }



        // 5. Temporary Data Handlers (CS Tabs)
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
                return; // Early return for these delegates
            }
        }

        if (target.closest('.btn-remove-temp-note')) {
            handlers.removeTempNote(target.closest('.btn-remove-temp-note').dataset.index);
            return;
        }

        // --- View Toggle Utility (Delegated) ---
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
            return;
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
            return;
        }

        // --- Save Button Actions (Delegated) ---
        const targetId = target.id;
        if (targetId === 'btn-save-contact') return handlers.saveNewContato();
        if (targetId === 'btn-save-dashboard') return handlers.saveTempDashboard();
        if (targetId === 'btn-save-nps') return handlers.saveTempNPS();
        if (targetId === 'btn-save-cs-meet') return handlers.saveTempCSMeet();
        if (targetId === 'btn-save-ticket') return handlers.saveTempTicket();
        if (targetId === 'btn-add-cs-note') return handlers.addCSNote();
        if (targetId === 'btn-add-meeting-submit') return handlers.saveTempReuniao();
        if (targetId === 'btn-save-followup') return handlers.saveTempFollowUp();
        if (targetId === 'btn-logout') return auth.handleLogout();

    });

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

// Global assignment for legacy HTML compatibility
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

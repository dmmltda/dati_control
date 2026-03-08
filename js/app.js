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
        }

        if (target.closest('.nav-sub-item')) {
            const subItem = target.closest('.nav-sub-item');
            document.querySelectorAll('.nav-sub-item').forEach(i => i.classList.remove('active'));
            subItem.classList.add('active');
            const view = subItem.getAttribute('data-view');
            if (view) nav.switchView(view);
            if (view === 'log') ui.renderLogTestes();
        }

        if (target.closest('.btn-new-company')) {
            nav.openCompanyForm();
        }

        if (target.closest('.btn-back-list')) {
            nav.switchView('company-list');
        }

        // 2. Company Action Buttons in Table
        if (target.closest('.btn-edit')) {
            nav.openCompanyForm(target.closest('.btn-edit').getAttribute('data-id'));
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
        }

        // 4. Contact/Product Handlers (within forms)
        if (target.closest('.btn-edit-contato')) {
            handlers.startEditContato(parseInt(target.closest('.btn-edit-contato').dataset.index));
        }
        if (target.closest('.btn-cancel-edit-contato')) {
            handlers.cancelEditContato();
        }
        if (target.closest('.btn-save-edit-contato')) {
            handlers.saveEditContato(parseInt(target.closest('.btn-save-edit-contato').dataset.index));
        }
        if (target.closest('.btn-remove-contato')) {
            handlers.removeTempContato(parseInt(target.closest('.btn-remove-contato').dataset.index));
        }

        if (target.closest('.btn-edit-produto')) {
            state.editingProdutoIndex = parseInt(target.closest('.btn-edit-produto').dataset.index);
            ui.renderProdutosTable();
        }
        if (target.closest('.btn-remove-produto')) {
            handlers.removeTempProduto(parseInt(target.closest('.btn-remove-produto').dataset.index));
        }
        if (target.closest('.btn-save-edit-produto')) {
            handlers.saveEditProduto(parseInt(target.closest('.btn-save-edit-produto').dataset.index));
        }
        if (target.closest('.btn-cancel-edit-produto')) {
            state.editingProdutoIndex = -1;
            ui.renderProdutosTable();
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
        }
    });

    // --- Static Form Listeners ---
    document.getElementById('login-form')?.addEventListener('submit', auth.handleLogin);
    document.getElementById('btn-logout')?.addEventListener('click', auth.handleLogout);
    document.getElementById('company-form')?.addEventListener('submit', handlers.handleCompanySubmit);

    // Search & Filter
    document.getElementById('search-empresa')?.addEventListener('input', (e) => ui.handleCompaniesSearch(e.target.value));

    // Dynamic Selects & Dependencies
    document.getElementById('emp-estado')?.addEventListener('change', (e) => {
        utils.loadCities(e.target.value, '');
        const cityEl = document.getElementById('emp-cidade');
        if (cityEl) cityEl.value = ''; 
    });
    
    document.getElementById('emp-status')?.addEventListener('change', (e) => utils.updateStatusStyle(e.target));

    document.getElementById('qual-tem-comex')?.addEventListener('change', (e) => {
        const group = document.getElementById('group-qual-comex');
        if (group) group.style.display = e.target.value === 'Sim' ? 'block' : 'none';
    });
    
    document.getElementById('qual-tem-erp')?.addEventListener('change', (e) => {
        const group = document.getElementById('group-qual-erp');
        if (group) group.style.display = e.target.value === 'Sim' ? 'block' : 'none';
    });

    // --- View Toggle Utility ---
    const setupToggle = (toggleBtnId, containerId, cancelBtnId, resetFields = []) => {
        document.getElementById(toggleBtnId)?.addEventListener('click', () => {
            const container = document.getElementById(containerId);
            const toggleBtn = document.getElementById(toggleBtnId);
            if (container) container.style.display = 'block';
            if (toggleBtn) toggleBtn.style.display = 'none';
        });
        document.getElementById(cancelBtnId)?.addEventListener('click', () => {
            const container = document.getElementById(containerId);
            const toggleBtn = document.getElementById(toggleBtnId);
            if (container) container.style.display = 'none';
            if (toggleBtn) toggleBtn.style.display = 'inline-flex';
            resetFields.forEach(f => { const el = document.getElementById(f); if(el) el.value = ''; });
        });
    };

    setupToggle('btn-toggle-dashboard-form', 'dashboard-form-container', 'btn-cancel-dashboard', ['new-db-data', 'new-db-dest', 'new-db-link']);
    setupToggle('btn-toggle-nps-form', 'nps-form-container', 'btn-cancel-nps', ['new-nps-data', 'new-nps-dest', 'new-nps-forms', 'new-nps-score']);
    setupToggle('btn-toggle-cs-meet-form', 'cs-meet-form-container', 'btn-cancel-cs-meet', ['new-cs-meet-data', 'new-cs-meet-parts', 'new-cs-meet-obs', 'new-cs-meet-link']);
    setupToggle('btn-toggle-ticket-form', 'ticket-form-container', 'btn-cancel-ticket', ['new-tk-data', 'new-tk-autor', 'new-tk-num', 'new-tk-link', 'new-tk-resumo']);
    setupToggle('btn-toggle-produto-form', 'produto-form-container', 'btn-cancel-produto');
    setupToggle('btn-toggle-contact-form', 'contact-form-container', 'btn-cancel-contact');
    setupToggle('btn-toggle-meeting-form', 'meeting-form-container', 'btn-cancel-meeting');
    setupToggle('btn-toggle-followup-form', 'followup-form-container', 'btn-cancel-followup', ['new-fw-usuario', 'new-fw-content', 'new-fw-next', 'new-fw-area']);

    // --- Save Button Actions ---
    document.getElementById('btn-save-contact')?.addEventListener('click', handlers.saveNewContato);
    document.getElementById('btn-save-produto')?.addEventListener('click', handlers.saveNewProduto);
    document.getElementById('btn-save-dashboard')?.addEventListener('click', handlers.saveTempDashboard);
    document.getElementById('btn-save-nps')?.addEventListener('click', handlers.saveTempNPS);
    document.getElementById('btn-save-cs-meet')?.addEventListener('click', handlers.saveTempCSMeet);
    document.getElementById('btn-save-ticket')?.addEventListener('click', handlers.saveTempTicket);
    document.getElementById('btn-add-cs-note')?.addEventListener('click', handlers.addCSNote);
    document.getElementById('btn-add-meeting-submit')?.addEventListener('click', handlers.saveTempReuniao);
    document.getElementById('btn-save-followup')?.addEventListener('click', handlers.saveTempFollowUp);
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

import { state } from './modules/state.js';
import * as utils from './modules/utils.js';
import * as ui from './modules/ui.js';
import * as nav from './modules/navigation.js';
import * as auth from './modules/auth.js';
import * as handlers from './modules/handlers.js';

document.addEventListener('DOMContentLoaded', () => {
    // Check Auth
    if (sessionStorage.getItem('dati_auth') === 'true') {
        auth.showApp();
    }

    // --- Global Click Handlers ---
    document.addEventListener('click', (e) => {
        const target = e.target;

        // Nav Items
        if (target.closest('.nav-item')) {
            const view = target.closest('.nav-item').getAttribute('data-view');
            nav.switchView(view);
            if (view === 'log') ui.renderLogTestes();
        }

        // New Company Buttons
        if (target.closest('.btn-new-company')) {
            nav.openCompanyForm();
        }

        // Back to List
        if (target.closest('.btn-back-list')) {
            nav.switchView('company-list');
        }

        // Action Buttons in Table
        if (target.closest('.btn-edit')) {
            nav.openCompanyForm(target.closest('.btn-edit').getAttribute('data-id'));
        }
        if (target.closest('.btn-delete')) {
            const id = target.closest('.btn-delete').getAttribute('data-id');
            if(confirm('Deseja excluir esta empresa?')) {
                state.companies = state.companies.filter(c => c.id !== id);
                utils.saveCompanies(() => {
                    ui.renderDashboard();
                    ui.renderCompanyList();
                    utils.showToast('Excluído com sucesso!');
                });
            }
        }

        // Tab Menu Buttons
        if (target.closest('.tab-menu-btn')) {
            const btn = target.closest('.tab-menu-btn');
            const tabId = btn.getAttribute('data-tab');
            if (tabId) nav.switchFormTab(tabId, btn);
        }

        // CS Submenu - handled via inline onclick which globalizes switchCSSubTab

        // Dynamic Table Buttons (using delegates for performance)
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

        // Product Delegates
        if (target.closest('.btn-edit-produto')) {
            const index = parseInt(target.closest('.btn-edit-produto').dataset.index);
            state.editingProdutoIndex = index;
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
        
        // ... more delegates can be added here
    });

    // --- Specific Form Listeners ---
    document.getElementById('login-form')?.addEventListener('submit', auth.handleLogin);
    document.getElementById('btn-logout')?.addEventListener('click', auth.handleLogout);
    document.getElementById('company-form')?.addEventListener('submit', handlers.handleCompanySubmit);

    // Search & Filter
    document.getElementById('search-empresa')?.addEventListener('input', ui.renderCompanyList);
    document.getElementById('filter-status')?.addEventListener('change', ui.renderCompanyList);

    // Dynamic Selects
    document.getElementById('emp-estado')?.addEventListener('change', (e) => {
        utils.loadCities(e.target.value, '');
        document.getElementById('emp-cidade').value = ''; 
    });
    document.getElementById('emp-status')?.addEventListener('change', (e) => utils.updateStatusStyle(e.target));

    // Qualification Toggles
    document.getElementById('qual-tem-comex')?.addEventListener('change', (e) => {
        document.getElementById('group-qual-comex').style.display = e.target.value === 'Sim' ? 'block' : 'none';
    });
    document.getElementById('qual-tem-erp')?.addEventListener('change', (e) => {
        document.getElementById('group-qual-erp').style.display = e.target.value === 'Sim' ? 'block' : 'none';
    });

    // --- Toggle Show/Hide for inline forms ---
    const setupToggle = (toggleBtnId, containerId, cancelBtnId, resetFields = []) => {
        document.getElementById(toggleBtnId)?.addEventListener('click', () => {
            document.getElementById(containerId).style.display = 'block';
            document.getElementById(toggleBtnId).style.display = 'none';
        });
        document.getElementById(cancelBtnId)?.addEventListener('click', () => {
            document.getElementById(containerId).style.display = 'none';
            document.getElementById(toggleBtnId).style.display = 'inline-flex';
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

    // --- Save Actions ---
    document.getElementById('btn-save-contact')?.addEventListener('click', handlers.saveNewContato);
    document.getElementById('btn-save-produto')?.addEventListener('click', handlers.saveNewProduto);
    
    document.getElementById('btn-save-dashboard')?.addEventListener('click', handlers.saveTempDashboard);
    document.getElementById('btn-save-nps')?.addEventListener('click', handlers.saveTempNPS);
    document.getElementById('btn-save-cs-meet')?.addEventListener('click', handlers.saveTempCSMeet);
    document.getElementById('btn-save-ticket')?.addEventListener('click', handlers.saveTempTicket);
    document.getElementById('btn-add-cs-note')?.addEventListener('click', handlers.addCSNote);
    document.getElementById('btn-add-meeting-submit')?.addEventListener('click', handlers.saveTempReuniao);

    // Dynamic Delegate additions
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('.btn-remove-temp-dashboard')) {
            const index = target.closest('.btn-remove-temp-dashboard').dataset.index;
            if(confirm('Excluir este dashboard?')) {
                state.tempDashboards.splice(index, 1);
                ui.renderDashboardsTable();
            }
        }
        if (target.closest('.btn-remove-temp-nps')) {
            const index = target.closest('.btn-remove-temp-nps').dataset.index;
            if(confirm('Excluir esta pesquisa NPS?')) {
                state.tempNPSHistory.splice(index, 1);
                ui.renderNPSHistoryTable();
            }
        }
        if (target.closest('.btn-remove-temp-csmeet')) {
            const index = target.closest('.btn-remove-temp-csmeet').dataset.index;
            if(confirm('Excluir esta reunião?')) {
                state.tempReunioesCS.splice(index, 1);
                ui.renderCSMeetingsTable();
            }
        }
        if (target.closest('.btn-remove-temp-ticket')) {
            const index = target.closest('.btn-remove-temp-ticket').dataset.index;
            if(confirm('Excluir este chamado?')) {
                state.tempChamados.splice(index, 1);
                ui.renderTicketsTable();
            }
        }
        if (target.closest('.btn-remove-temp-reuniao')) {
            const index = target.closest('.btn-remove-temp-reuniao').dataset.index;
            if(confirm('Excluir esta reunião?')) {
                state.tempReunioes.splice(index, 1);
                ui.renderReunioesTable();
            }
        }
        if (target.closest('.btn-remove-temp-note')) {
            handlers.removeTempNote(target.closest('.btn-remove-temp-note').dataset.index);
        }
    });

});

// Global assignment for legacy compatibility where strictly needed (though event delegation is preferred)
window.switchCSSubTab = nav.switchCSSubTab;
window.switchFormTab = nav.switchFormTab;
window.maskCurrency = utils.maskCurrency;

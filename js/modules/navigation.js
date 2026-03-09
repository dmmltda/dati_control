import { state, resetTempState } from './state.js';
import { loadCities, updateStatusStyle } from './utils.js';
import * as ui from './ui.js';

export function switchView(viewId) {
    const viewSections = document.querySelectorAll('.view-section');
    const navItems = document.querySelectorAll('.nav-item');
    
    viewSections.forEach(section => section.style.display = 'none');
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.style.display = 'block';
    
    navItems.forEach(item => {
        item.classList.remove('active');
        if(item.getAttribute('data-view') === viewId) {
            item.classList.add('active');
        }
    });
    ui.initGlobalPickers();
}

export function switchFormTab(tabId, btnElement) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-menu-btn').forEach(el => el.classList.remove('active'));
    
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    
    if (btnElement) {
        btnElement.classList.add('active');
    } else {
        const btn = Array.from(document.querySelectorAll('.tab-menu-btn')).find(b => b.getAttribute('data-tab') === tabId || b.innerHTML.includes(tabId));
        if (btn) btn.classList.add('active');
    }
}

export function switchCSSubTab(tabId, btnElement) {
    document.querySelectorAll('.cs-sub-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.cs-submenu-btn').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    if (btnElement) btnElement.classList.add('active');
}

export function openCompanyForm(id = null) {
    document.getElementById('company-form').reset();
    resetTempState(); // Zera tudo incluindo currentEditingId
    state.currentEditingId = id; // Seta DEPOIS do reset para não ser apagado
    
    // Reset UI Toggles
    const containers = [
        'produto-form-container', 'contact-form-container', 
        'dashboard-form-container', 'nps-form-container', 
        'cs-meet-form-container', 'ticket-form-container',
        'meeting-form-container'
    ];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const buttons = [
        'btn-toggle-produto-form', 'btn-toggle-contact-form',
        'btn-toggle-dashboard-form', 'btn-toggle-nps-form',
        'btn-toggle-cs-meet-form', 'btn-toggle-ticket-form',
        'btn-toggle-meeting-form'
    ];
    buttons.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'inline-flex';
    });

    switchFormTab('tab-dados');
    
    // Reset specific fields
    ['emp-health-score', 'emp-nps', 'qual-tem-comex', 'qual-qual-comex', 'qual-tem-erp', 'qual-qual-erp', 'qual-objetivo', 'qual-dores', 'qual-expectativa', 'emp-cnpj'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    document.getElementById('group-qual-comex').style.display = 'none';
    document.getElementById('group-qual-erp').style.display = 'none';
    
    const cidadeInput = document.getElementById('emp-cidade');
    cidadeInput.disabled = true;
    cidadeInput.placeholder = 'Selecione um estado primeiro...';

    if (id) {
        const comp = state.companies.find(c => c.id == id);
        if (comp) {
            document.getElementById('company-id').value = comp.id;
            document.getElementById('emp-nome').value = comp.nome;
            document.getElementById('emp-tipo').value = comp.tipo || '';
            document.getElementById('emp-cnpj').value = comp.cnpj || '';
            document.getElementById('emp-site').value = comp.site || '';
            document.getElementById('emp-status').value = comp.status;
            document.getElementById('emp-segmento').value = comp.segmento || '';
            document.getElementById('emp-canal').value = comp.canal || '';
            document.getElementById('emp-estado').value = comp.estado || '';
            document.getElementById('emp-health-score').value = comp.healthScore || '';
            document.getElementById('emp-nps').value = comp.nps || '';
            
            if (comp.estado) {
                loadCities(comp.estado, comp.cidade || '');
            } else {
                document.getElementById('emp-cidade').value = comp.cidade || '';
            }
            
            document.getElementById('form-title').innerText = comp.nome;

            state.tempContatos = [...(comp.contatos || [])];
            state.tempProdutos = [...(comp.produtos || [])];
            state.tempDashboards = [...(comp.dashboardsHistory || [])];
            state.tempNPSHistory = [...(comp.npsHistory || [])];
            state.tempReunioesCS = [...(comp.reunioesCSHistory || [])];
            state.tempChamados = [...(comp.chamadosHistory || [])];
            state.tempNotes = [...(comp.csNotes || [])];
            state.tempReunioes = [...(comp.reunioes || [])];
            state.tempFollowUps = [...(comp.followUps || [])];
            document.getElementById('qual-tem-comex').value = comp.qualificacao?.temComex || '';
            document.getElementById('qual-qual-comex').value = comp.qualificacao?.qualComex || '';
            document.getElementById('group-qual-comex').style.display = comp.qualificacao?.temComex === 'Sim' ? 'block' : 'none';
            
            document.getElementById('qual-tem-erp').value = comp.qualificacao?.temERP || '';
            document.getElementById('qual-qual-erp').value = comp.qualificacao?.qualERP || '';
            document.getElementById('group-qual-erp').style.display = comp.qualificacao?.temERP === 'Sim' ? 'block' : 'none';
            
            document.getElementById('qual-objetivo').value = comp.qualificacao?.objetivo || '';
            document.getElementById('qual-dores').value = comp.qualificacao?.dores || '';
            document.getElementById('qual-expectativa').value = comp.qualificacao?.expectativa || '';
        }
    } else {
        document.getElementById('form-title').innerText = "Nova Empresa";
    }

    // Always re-render tables
    ui.renderContatosTable();
    if (ui.renderProdutosTable) ui.renderProdutosTable();
    ui.renderDashboardsTable();
    ui.renderNPSHistoryTable();
    ui.renderCSMeetingsTable();
    ui.renderTicketsTable();
    ui.renderCSTimeline();
    ui.renderReunioesTable();
    ui.renderFollowUpsTable();
    
    // Ajusta o texto do botão conforme contexto
    const saveBtn = document.getElementById('btn-save-company');
    if (saveBtn) {
        if (id) {
            saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar';
        } else {
            saveBtn.innerHTML = '<i class="ph ph-plus-circle"></i> Criar Empresa';
        }
        saveBtn.disabled = false;
    }

    updateStatusStyle(document.getElementById('emp-status'));
    ui.initGlobalPickers();
    switchView('company-form');
}

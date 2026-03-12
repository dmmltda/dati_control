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

    // Restaura required no emp-nome (pode ter sido removido pelo modo bulk edit)
    const nomeInput = document.getElementById('emp-nome');
    if (nomeInput) {
        nomeInput.setAttribute('required', '');
        const label = nomeInput.closest('.input-group')?.querySelector('label');
        if (label && label._bulkRemovedAsterisk) {
            label.textContent = label.textContent.trim() + ' *';
            label._bulkRemovedAsterisk = false;
        }
    }
    // Remove banner bulk se existir (caso volte sem finalizar)
    document.getElementById('company-form')?.querySelector('.bulk-edit-banner')?.remove();

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
    ['emp-health-score', 'emp-nps', 'emp-cnpj'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
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

/**
 * Abre o formulário em modo "Edição em Massa".
 * Apenas os campos preenchidos pelo usuário serão aplicados a todas as empresas selecionadas.
 * @param {string[]} ids - Array de IDs das empresas selecionadas
 */
export function openBulkEditForm(ids) {
    if (!ids || ids.length === 0) return;

    // Abre o form vazio (sem carregar dados de nenhuma empresa específica)
    openCompanyForm(null);

    // state já importado no topo — seta modo bulk edit
    state.bulkEditIds = [...ids];
    state.currentEditingId = null;

    const count = ids.length;

    // Atualiza título do form
    const titleEl = document.getElementById('form-title');
    if (titleEl) titleEl.innerText = `Edição em Massa (${count} empresa${count !== 1 ? 's' : ''})`;

    // Banner informativo no topo do form
    const formEl = document.getElementById('company-form');
    if (formEl) {
        formEl.querySelector('.bulk-edit-banner')?.remove();
        const banner = document.createElement('div');
        banner.className = 'bulk-edit-banner';
        banner.innerHTML = `
            <i class="ph ph-info"></i>
            <span>Preencha apenas os campos que deseja alterar em
            <strong>${count} empresa${count !== 1 ? 's' : ''}</strong>.
            Campos vazios serão <strong>ignorados</strong>.</span>
        `;
        formEl.insertBefore(banner, formEl.firstChild);
    }

    // Botão de salvar customizado para modo bulk
    const saveBtn = document.getElementById('btn-save-company');
    if (saveBtn) {
        saveBtn.innerHTML = `<i class="ph ph-pencil-simple-line"></i> Aplicar em ${count} ${count !== 1 ? 'empresas' : 'empresa'}`;
        saveBtn.style.background = 'linear-gradient(135deg, #3b82f6, #6366f1)';
    }

    // ⚠️ Em modo bulk, nenhum campo é obrigatório — remove required do emp-nome
    // para que o browser não bloqueie o submit quando o campo estiver vazio
    const nomeInput = document.getElementById('emp-nome');
    if (nomeInput) {
        nomeInput.removeAttribute('required');
        // Atualiza o label visualmente (remove o asterisco)
        const label = nomeInput.closest('.input-group')?.querySelector('label');
        if (label && label.textContent.includes('*')) {
            label.textContent = label.textContent.replace(' *', '');
            label._bulkRemovedAsterisk = true; // marca para restaurar depois
        }
    }
}


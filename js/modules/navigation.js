import { state, resetTempState } from './state.js';
import { loadCities, updateStatusStyle } from './utils.js';
import * as ui from './ui.js';

export function switchView(viewId) {
    const viewSections = document.querySelectorAll('.view-section');
    const navItems = document.querySelectorAll('.nav-item');
    
    viewSections.forEach(section => section.style.display = 'none');
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        // Views marcadas com .flex-view precisam de display:flex para o layout dock-to-bottom funcionar
        target.style.display = target.classList.contains('flex-view') ? 'flex' : 'block';
    }

    
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
    if (target) {
        target.classList.add('active');
        // Ao trocar de aba, aplica as restrições de edição pertinentes apenas a ela
        _aplicarPermissaoEdicaoEmpresa(tabId);
    }
    
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
            document.getElementById('emp-status').value = comp.status || 'Prospect';
            document.getElementById('emp-segmento').value = comp.segmento || '';
            document.getElementById('emp-canal').value = comp.canal || '';
            document.getElementById('emp-estado').value = comp.estado || '';
            document.getElementById('emp-health-score').value = comp.healthScore || '';
            document.getElementById('emp-nps').value = comp.nps || '';

            // Sincroniza todos os CustomSelects visuais após o DOM receber o value
            ['emp-tipo', 'emp-estado', 'emp-segmento', 'emp-canal', 'emp-health-score', 'emp-nps'].forEach(id => {
                const el = document.getElementById(id);
                if (el && el._customSelectInstance) {
                    el._customSelectInstance.setValue(el.value || '');
                }
            });
            
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

    // ─ Verifica permissão de visualização das abas (company_tab.X) ──
    const tabBtns = document.querySelectorAll('.tab-menu-btn[data-tab-view]');
    let firstVisibleTab = null;
    let fallbackTab = null;

    tabBtns.forEach(btn => {
        const permissionKey = btn.getAttribute('data-tab-view');
        const podeVer = window.canDo ? window.canDo(permissionKey) : true;
        
        // Em vez de hide, vamos manter flex mas travar se não tiver permissão
        btn.style.display = 'flex';
        
        if (!podeVer) {
            btn.style.opacity = '0.38';
            btn.dataset.lockedTab = "1";
            btn.setAttribute('data-th-title', 'BLOQUEADO');
            btn.setAttribute('data-th-tooltip', 'Você não tem permissão de visualizar esta aba.');
            // Adiciona ícone de cadeado se não tiver
            if (!btn.querySelector('.tab-lock-icon')) {
                btn.insertAdjacentHTML('beforeend', '<i class="ph ph-lock-simple tab-lock-icon" style="margin-left:auto; opacity:0.7;"></i>');
            }
        } else {
            btn.style.opacity = '1';
            btn.dataset.lockedTab = "0";
            btn.removeAttribute('data-th-title');
            btn.removeAttribute('data-th-tooltip');
            btn.querySelector('.tab-lock-icon')?.remove();

            if (btn.id !== 'btn-tab-cs' || (comp && comp.status === 'Em Contrato')) {
                // Customer success hidden by default if not 'Em Contrato'
                if (!firstVisibleTab) firstVisibleTab = btn;
            } else if (btn.id !== 'btn-tab-cs') {
                if (!fallbackTab) fallbackTab = btn;
            }
        }
    });

    // Se a lógica do app exibe CS mas o usuário tem permissão nela, mantemos a visibilidade (sem display:none pra quem não tem lock)
    const csBtn = document.getElementById('btn-tab-cs');
    if (csBtn && csBtn.dataset.lockedTab !== "1") {
        if (id && comp && comp.status === 'Em Contrato') {
             csBtn.style.display = 'flex';
        } else if (window.canDo && window.canDo('company_tab.cs')) {
             csBtn.style.display = 'none'; // oculto logicamente pois não é cliente
        }
    }

    // Aplica active data final e permissão de edição
    const activeTabObj = document.querySelector('.tab-content.active');
    if (activeTabObj) {
         _aplicarPermissaoEdicaoEmpresa(activeTabObj.id);
    } else if (firstVisibleTab) {
         switchFormTab(firstVisibleTab.getAttribute('data-tab'));
    } else if (fallbackTab) {
         switchFormTab(fallbackTab.getAttribute('data-tab'));
    }
}

/**
 * Aplica (ou remove) o modo "somente leitura" no formulário da empresa
 * baseado na permissão (company_edit.X) para a aba atual selecionada.
 */
function _aplicarPermissaoEdicaoEmpresa(tabId) {
    const viewContainer = document.getElementById('view-company-form');
    if (!viewContainer || !tabId) return;

    // Achar o botão da aba pra pegar a chave de permissão
    const btn = Array.from(document.querySelectorAll('.tab-menu-btn')).find(b => b.getAttribute('data-tab') === tabId);
    if (!btn) return;
    
    let permissionKey = btn.getAttribute('data-tab-edit');
    // Default fallback se não achar
    if (!permissionKey) permissionKey = 'company_edit.basic_data';

    const podeEditar = window.canDo?.(permissionKey) ?? true;

    // Selecionamos APENAS os inputs da aba em si + os itens do "top bar" que pertecem à aba atual logicamente
    // Para simplificar: top bar pertence a basic_data E customer_success (depende de onde o usuario interagir)
    // Vamos travar com base no tab atual: tudo visível sofre lock/unlock se faz parte da aba.
    const containerDaAba = document.getElementById(tabId);
    let extraElements = [];
    
    if (tabId === 'tab-dados') {
         extraElements = Array.from(document.querySelectorAll('#emp-status, #form-title'));
    } else if (tabId === 'tab-cs') {
         extraElements = Array.from(document.querySelectorAll('#emp-health-score, #emp-nps'));
    }

    const camposDaAba = Array.from(containerDaAba ? containerDaAba.querySelectorAll('input, select, textarea, .csel, button:not(#btn-sair-sem-salvar):not(.tab-btn):not(.cs-submenu-btn):not(.btn-back-list)') : []);
    const camposParaTravar = [...camposDaAba, ...extraElements];

    // O Save btn trava SE a aba atual não permite!
    const saveBtn = document.getElementById('btn-save-company');

    // Removemos qualquer overlay atual p/ resetar
    document.getElementById('company-edit-lock-overlay')?.remove();
    document.querySelectorAll('.edit-lock-banner').forEach(b => b.remove());

    if (podeEditar) {
        camposParaTravar.forEach(el => {
            if (el.dataset.editLockedDisabled) {
                if (el.classList.contains('csel')) {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                } else {
                    el.disabled = false;
                    el.style.opacity = '';
                }
                delete el.dataset.editLockedDisabled;
            }
            
            let targetTooltip = el.closest('.input-group') || el.closest('.select-wrapper') || el.parentElement;
            if (targetTooltip) {
                targetTooltip.removeAttribute('data-th-tooltip');
                targetTooltip.removeAttribute('data-th-title');
                targetTooltip.style.cursor = '';
            }
        });

        if (saveBtn) {
            saveBtn.style.opacity = '';
            saveBtn.style.cursor  = '';
            saveBtn.style.pointerEvents = '';
            saveBtn.disabled      = false;
            saveBtn.removeAttribute('data-th-tooltip');
            saveBtn.removeAttribute('data-th-title');
        }
    } else {
        // ── Modo somente leitura pra a aba atual ─────────────────────────────────────────
        
        // Form overlay pra evitar clique e tap visual no background
        if (containerDaAba) {
            const overlay = document.createElement('div');
            overlay.id = 'company-edit-lock-overlay';
            overlay.style.cssText = `
                position:absolute; inset:0; z-index:10; pointer-events:none;
                background:rgba(0,0,0,0);
            `;
            containerDaAba.style.position = 'relative';
            containerDaAba.appendChild(overlay);
        }

        camposParaTravar.forEach(el => {
            if (el.classList.contains('csel')) {
                if (!el.dataset.editLockedDisabled) {
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0.6';
                    el.dataset.editLockedDisabled = '1';
                }
            } else {
                if (!el.disabled) {
                    el.disabled = true;
                    el.style.opacity = '0.6';
                    el.dataset.editLockedDisabled = '1';
                }
            }
            
            let targetTooltip = el.closest('.input-group') || el.closest('.select-wrapper') || el.parentElement;
            if (targetTooltip) {
                targetTooltip.setAttribute('data-th-title', 'BLOQUEADO');
                targetTooltip.setAttribute('data-th-tooltip', 'Você não tem permissão para salvar ou alterar estes campos.');
                targetTooltip.style.cursor = 'not-allowed';
            }
        });

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.38';
            saveBtn.style.cursor  = 'not-allowed';
            saveBtn.style.pointerEvents = 'auto'; // Deve receber hover para o Tooltip disparar!
            saveBtn.setAttribute('data-th-title', 'SEM PERMISSÃO');
            saveBtn.setAttribute('data-th-tooltip', 'Você não tem permissão para editar informações nesta aba.');
        }

        // Add um banner em cima do container da aba
        if (containerDaAba && !containerDaAba.querySelector('.edit-lock-banner')) {
            const banner = document.createElement('div');
            banner.className = 'edit-lock-banner';
            banner.style.cssText = `
                display:flex; align-items:center; gap:0.6rem;
                background:rgba(248,113,113,0.06); border:1px solid rgba(248,113,113,0.18);
                border-radius:8px; padding:0.6rem 1rem; margin-bottom:1rem;
                font-size:0.8rem; color:#f87171; font-family:inherit;
            `;
            banner.innerHTML = '<i class="ph ph-lock-simple"></i> Modo somente leitura — você não tem permissão para salvar edições nesta seção.';
            containerDaAba.insertBefore(banner, containerDaAba.firstChild);
        }
    }
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


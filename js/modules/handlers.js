import { state } from './state.js';
import * as utils from './utils.js';
import * as ui from './ui.js';
import { switchView } from './navigation.js';

// --- Contact Handlers ---
export function saveNewContato() {
    const nome = document.getElementById('new-cont-nome').value.trim();
    if (!nome) { utils.showToast('O Nome do Contato é obrigatório!', 'error'); return; }

    state.tempContatos.push({
        nome,
        email1: document.getElementById('new-cont-email1').value.trim(),
        telefone: document.getElementById('new-cont-tel').value.trim(),
        cargo: document.getElementById('new-cont-cargo').value.trim(),
        departamento: document.getElementById('new-cont-dep').value.trim(),
        linkedin: document.getElementById('new-cont-linkedin').value.trim(),
        whatsapp: document.getElementById('new-cont-tel').value.trim()
    });

    // Reset fields
    ['new-cont-nome', 'new-cont-email1', 'new-cont-tel', 'new-cont-cargo', 'new-cont-dep', 'new-cont-linkedin'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('contact-form-container').style.display = 'none';
    document.getElementById('btn-toggle-contact-form').style.display = 'inline-flex';
    
    ui.renderContatosTable();
    utils.showToast('Contato adicionado!', 'success');
}

export function startEditContato(index) {
    state.editingContatoIndex = index;
    ui.renderContatosTable();
}

export function cancelEditContato() {
    state.editingContatoIndex = -1;
    ui.renderContatosTable();
}

export function saveEditContato(index) {
    const nomeInput = document.getElementById(`edit-cont-nome-${index}`);
    if (!nomeInput.value.trim()) {
        utils.showToast('O Nome do Contato é obrigatório!', 'error');
        return;
    }

    const cont = state.tempContatos[index];
    cont.nome = nomeInput.value.trim();
    cont.email1 = document.getElementById(`edit-cont-email1-${index}`).value.trim();
    cont.telefone = document.getElementById(`edit-cont-tel-${index}`).value.trim();
    
    state.editingContatoIndex = -1;
    ui.renderContatosTable();
    utils.showToast('Contato atualizado!', 'success');
}

export function removeTempContato(index) {
    if(confirm('Remover este contato?')) {
        state.tempContatos.splice(index, 1);
        ui.renderContatosTable();
    }
}

// --- Product Handlers ---
export async function saveNewProduto() {
    const nome = document.getElementById('new-prod-nome').value;
    if (!nome) { utils.showToast('Selecione um produto!', 'error'); return; }

    try {
        const propFile = document.getElementById('new-prod-proposta').files[0];
        const contFile = document.getElementById('new-prod-contrato').files[0];
        
        const proposta = propFile ? await utils.getBase64(propFile) : null;
        const contrato = contFile ? await utils.getBase64(contFile) : null;

        state.tempProdutos.push({
            nome,
            dataContratacao: document.getElementById('new-prod-data').value,
            mensalidade: document.getElementById('new-prod-mensalidade').value.trim(),
            faturamentoMinimo: document.getElementById('new-prod-minimo').value.trim(),
            valorPorUsuario: document.getElementById('new-prod-val-user').value.trim(),
            horasHd: document.getElementById('new-prod-horas-hd').value,
            propostaName: proposta?.name || '',
            propostaData: proposta?.data || '',
            contratoName: contrato?.name || '',
            contratoData: contrato?.data || ''
        });

        // Reset
        document.getElementById('produto-form-container').style.display = 'none';
        document.getElementById('btn-toggle-produto-form').style.display = 'inline-flex';
        ['new-prod-nome', 'new-prod-data', 'new-prod-proposta', 'new-prod-contrato', 'new-prod-mensalidade', 'new-prod-minimo', 'new-prod-val-user', 'new-prod-horas-hd'].forEach(id => {
            const el = document.getElementById(id);
            if (el.type === 'file') el.value = '';
            else el.value = el.tagName === 'SELECT' ? '' : '0';
        });

        ui.renderProdutosTable();
        utils.showToast('Produto adicionado!', 'success');
    } catch (err) {
        utils.showToast(err, 'error');
    }
}

export async function saveEditProduto(index) {
    const nomeInput = document.getElementById(`edit-prod-nome-${index}`);
    const dataInput = document.getElementById(`edit-prod-data-${index}`);
    
    try {
        const prod = state.tempProdutos[index];
        prod.nome = nomeInput.value;
        prod.dataContratacao = dataInput.value;
        prod.mensalidade = document.getElementById(`edit-prod-mensalidade-${index}`).value.trim();
        
        state.editingProdutoIndex = -1;
        ui.renderProdutosTable();
        utils.showToast('Produto atualizado!', 'success');
    } catch (err) {
        utils.showToast('Erro ao processar', 'error');
    }
}

export function removeTempProduto(index) {
    if(confirm('Remover este produto?')) {
        state.tempProdutos.splice(index, 1);
        ui.renderProdutosTable();
    }
}

// --- Company Form Submit ---
export function handleCompanySubmit(e) {
    e.preventDefault();

    const companyData = {
        id: state.currentEditingId || 'comp_' + Date.now(),
        nome: document.getElementById('emp-nome').value.trim(),
        site: document.getElementById('emp-site').value.trim(),
        status: document.getElementById('emp-status').value,
        healthScore: document.getElementById('emp-health-score').value,
        nps: document.getElementById('emp-nps').value,
        cidade: document.getElementById('emp-cidade').value.trim(),
        estado: document.getElementById('emp-estado').value.trim(),
        canal: document.getElementById('emp-canal').value.trim(),
        segmento: document.getElementById('emp-segmento').value.trim(),
        tipo: document.getElementById('emp-tipo').value.trim(),
        contatos: state.tempContatos,
        produtos: state.tempProdutos,
        dashboardsHistory: state.tempDashboards,
        npsHistory: state.tempNPSHistory,
        reunioesCSHistory: state.tempReunioesCS,
        chamadosHistory: state.tempChamados,
        csNotes: state.tempNotes,
        reunioes: state.tempReunioes,
        qualificacao: {
            temComex: document.getElementById('qual-tem-comex').value,
            qualComex: document.getElementById('qual-qual-comex').value,
            temERP: document.getElementById('qual-tem-erp').value,
            qualERP: document.getElementById('qual-qual-erp').value,
            objetivo: document.getElementById('qual-objetivo').value,
            dores: document.getElementById('qual-dores').value,
            expectativa: document.getElementById('qual-expectativa').value
        },
        updatedAt: Date.now()
    };

    if (state.currentEditingId) {
        const index = state.companies.findIndex(c => c.id === state.currentEditingId);
        if (index > -1) state.companies[index] = companyData;
    } else {
        companyData.createdAt = Date.now();
        state.companies.push(companyData);
    }

    utils.saveCompanies(() => {
        ui.renderDashboard();
        ui.renderCompanyList();
        switchView('company-list');
        utils.showToast(state.currentEditingId ? 'Empresa atualizada!' : 'Empresa criada!');
    });
}

// --- CS Hub Modals/Forms Handlers ---
export function saveTempDashboard() {
    const data = document.getElementById('new-db-data').value;
    const dest = document.getElementById('new-db-dest').value;
    const link = document.getElementById('new-db-link').value;
    if(!data || !dest || !link) { utils.showToast('Preencha os campos obrigatórios (*)', 'error'); return; }
    state.tempDashboards.push({ data, destinatarios: dest, link });
    document.getElementById('btn-cancel-dashboard').click();
    ui.renderDashboardsTable();
    utils.showToast('Dashboard registrado!', 'success');
}

export function saveTempNPS() {
    const data = document.getElementById('new-nps-data').value;
    const dest = document.getElementById('new-nps-dest').value;
    const score = document.getElementById('new-nps-score').value;
    if(!data || !dest || !score) { utils.showToast('Preencha os campos obrigatórios (*)', 'error'); return; }
    state.tempNPSHistory.push({ data, destinatarios: dest, forms: document.getElementById('new-nps-forms').value, score });
    document.getElementById('btn-cancel-nps').click();
    ui.renderNPSHistoryTable();
    utils.showToast('Pesquisa NPS salva!', 'success');
}

export function saveTempCSMeet() {
    const data = document.getElementById('new-cs-meet-data').value;
    const parts = document.getElementById('new-cs-meet-parts').value;
    if(!data || !parts) { utils.showToast('Data e Participantes são obrigatórios.', 'error'); return; }
    state.tempReunioesCS.push({ data, participantes: parts, obs: document.getElementById('new-cs-meet-obs').value, link: document.getElementById('new-cs-meet-link').value });
    document.getElementById('btn-cancel-cs-meet').click();
    ui.renderCSMeetingsTable();
    utils.showToast('Reunião CS registrada!', 'success');
}

export function saveTempTicket() {
    const data = document.getElementById('new-tk-data').value;
    const num = document.getElementById('new-tk-num').value;
    const resumo = document.getElementById('new-tk-resumo').value;
    if(!data || !num || !resumo) { utils.showToast('Data, Número e Resumo são obrigatórios.', 'error'); return; }
    state.tempChamados.push({ data, numero: num, resumo, autor: document.getElementById('new-tk-autor').value, link: document.getElementById('new-tk-link').value });
    document.getElementById('btn-cancel-ticket').click();
    ui.renderTicketsTable();
    utils.showToast('Chamado registrado!', 'success');
}

export function addCSNote() {
    const noteInput = document.getElementById('new-cs-note');
    const text = noteInput.value.trim();
    if(!text) return;

    state.tempNotes.push({
        text: text,
        author: 'admin',
        date: new Date().toLocaleString('pt-BR'),
        timestamp: Date.now()
    });

    noteInput.value = '';
    ui.renderCSTimeline();
    utils.showToast('Comentário salvo!', 'success');
}

export function removeTempNote(index) {
    state.tempNotes.splice(index, 1);
    ui.renderCSTimeline();
}

export function saveTempReuniao() {
    const dateVal = document.getElementById('new-meet-date').value;
    if(!dateVal) {
        utils.showToast('A data é obrigatória.', 'error');
        return;
    }

    state.tempReunioes.push({
        data: dateVal,
        temperatura: document.getElementById('new-meet-temp').value,
        participantes: document.getElementById('new-meet-parts').value,
        link: document.getElementById('new-meet-link').value
    });

    document.getElementById('btn-cancel-meeting').click();
    ui.renderReunioesTable();
    utils.showToast('Reunião registrada!', 'success');
}

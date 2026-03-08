import { state } from './state.js';
import * as utils from './utils.js';
import * as ui from './ui.js';
import { switchView } from './navigation.js';
import { api } from './api.js';

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
export async function handleCompanySubmit(e) {
    if (e) e.preventDefault();

    console.log('💾 Iniciando salvamento 10/10...');
    utils.showToast('Salvando dados...', 'info');

    try {
        // Objeto fiel ao Schema Prisma (Português/Excel) 10/10
        const dbPayload = {
            Nome_da_empresa: document.getElementById('emp-nome').value.trim(),
            CNPJ_da_empresa: document.getElementById('emp-cnpj').value.trim(),
            Status: document.getElementById('emp-status').value,
            Estado: document.getElementById('emp-estado').value.trim(),
            Cidade: document.getElementById('emp-cidade').value.trim(),
            Tipo_de_empresa: document.getElementById('emp-tipo').value.trim(),
            Segmento_da_empresa: document.getElementById('emp-segmento').value.trim(),
            Modo_da_empresa: document.getElementById('emp-canal').value.trim(), // Canal -> Modo
            Health_Score: document.getElementById('emp-health-score').value,
            
            // Qualificação
            Tem_algum_comex: document.getElementById('qual-tem-comex').value,
            Qual_comex: document.getElementById('qual-qual-comex').value,
            ERP: document.getElementById('qual-tem-erp').value,
            Dores_Gargalos: document.getElementById('qual-dores').value,
            Principal_Objetivo: document.getElementById('qual-objetivo').value,
            Expectativa_da_DATI: document.getElementById('qual-expectativa').value,

            // Relacionamentos temporários do state
            Produtos: state.tempProdutos.map(p => ({
                Produto_DATI: p.nome,
                Valor_Total: parseFloat(p.mensalidade || 0),
                Data_do_contrato: p.dataContratacao ? new Date(p.dataContratacao) : null
            })),
            Contatos: state.tempContatos.map(c => ({
                Nome_do_contato: c.nome,
                Cargo_do_contato: c.cargo,
                Departamento_do_contato: c.departamento,
                Email_1: c.email1,
                WhatsApp: c.whatsapp,
                LinkedIn: c.linkedin
            })),
            Reunioes: [
                ...state.tempReunioes.map(r => ({
                    Data_reuniao: r.data ? new Date(r.data) : null,
                    Participantes: r.participantes,
                    Temperatura: r.temperatura,
                    Link_gravacao: r.link,
                    Observacoes: r.observacoes,
                    Tipo_reuniao: 'Geral'
                })),
                ...state.tempReunioesCS.map(r => ({
                    Data_reuniao: r.data ? new Date(r.data) : null,
                    Participantes: r.participantes,
                    Temperatura: r.temperatura,
                    Link_gravacao: r.link,
                    Observacoes: r.obs,
                    Tipo_reuniao: 'CS'
                }))
            ],
            Dashboards: state.tempDashboards.map(d => ({
                Data: d.data ? new Date(d.data) : null,
                Destinatario: d.destinatarios,
                Link: d.link
            })),
            NPS: state.tempNPSHistory.map(n => ({
                Data: n.data ? new Date(n.data) : null,
                Destinatario: n.destinatarios,
                Formulario: n.forms,
                Score: n.score
            })),
            Tickets: state.tempChamados.map(t => ({
                Data: t.data ? new Date(t.data) : null,
                Numero: t.numero,
                Resumo: t.resumo,
                Autor: t.autor,
                Link: t.link
            })),
            Notas: state.tempNotes.map(n => ({
                Data: n.data ? new Date(n.timestamp || Date.now()) : new Date(),
                Conteudo: n.text,
                Autor: n.author
            }))
        };

        let result;
        if (state.currentEditingId) {
            console.log(`📝 Atualizando empresa ${state.currentEditingId}...`);
            result = await api.updateCompany(state.currentEditingId, dbPayload);
        } else {
            console.log('🆕 Criando nova empresa...');
            result = await api.createCompany(dbPayload);
        }

        if (result) {
            const isUpdate = !!state.currentEditingId;
            // Atualizar state e UI 10/10
            await ui.renderDashboard(); 
            // Recarregar lista completa da API para garantir sincronia
            const updatedCompanies = await api.getCompanies();
            state.companies = updatedCompanies;
            
            ui.renderCompanyList();
            switchView('company-list');
            utils.showToast(isUpdate ? 'Empresa atualizada com sucesso!' : 'Empresa criada com sucesso!', 'success');
        }

    } catch (error) {
        console.error('❌ Erro fatal ao salvar:', error);
        utils.showToast('Erro ao salvar no banco: ' + error.message, 'error');
    }
}

// --- CS Hub Modals/Forms Handlers ---
export function saveTempDashboard() {
    try {
        const data = document.getElementById('new-db-data').value;
        const dest = document.getElementById('new-db-dest').value;
        const link = document.getElementById('new-db-link').value;
        if(!data || !dest || !link) { utils.showToast('Preencha os campos obrigatórios (*)', 'error'); return; }
        state.tempDashboards.push({ data, destinatarios: dest, link });
        document.getElementById('btn-cancel-dashboard').click();
        ui.renderDashboardsTable();
        utils.showToast('Dashboard registrado!', 'success');
    } catch (err) {
        console.error('❌ Erro no saveTempDashboard:', err);
        utils.showToast('Erro ao salvar localmente: ' + err.message, 'error');
    }
}

export function saveTempNPS() {
    try {
        const data = document.getElementById('new-nps-data').value;
        const dest = document.getElementById('new-nps-dest').value;
        const score = document.getElementById('new-nps-score').value;
        if(!data || !dest || !score) { utils.showToast('Preencha os campos obrigatórios (*)', 'error'); return; }
        state.tempNPSHistory.push({ data, destinatarios: dest, forms: document.getElementById('new-nps-forms').value, score });
        document.getElementById('btn-cancel-nps').click();
        ui.renderNPSHistoryTable();
        utils.showToast('Pesquisa NPS salva!', 'success');
    } catch (err) {
        console.error('❌ Erro no saveTempNPS:', err);
        utils.showToast('Erro ao salvar localmente: ' + err.message, 'error');
    }
}

export function saveTempCSMeet() {
    try {
        const data = document.getElementById('new-cs-meet-data').value;
        const parts = document.getElementById('new-cs-meet-parts').value;
        if(!data || !parts) { utils.showToast('Data e Participantes são obrigatórios.', 'error'); return; }
        state.tempReunioesCS.push({ data, participantes: parts, obs: document.getElementById('new-cs-meet-obs').value, link: document.getElementById('new-cs-meet-link').value });
        document.getElementById('btn-cancel-cs-meet').click();
        ui.renderCSMeetingsTable();
        utils.showToast('Reunião CS registrada!', 'success');
    } catch (err) {
        console.error('❌ Erro no saveTempCSMeet:', err);
        utils.showToast('Erro ao salvar localmente: ' + err.message, 'error');
    }
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
    try {
        console.log('📅 Tentando salvar reunião geral...');
        const dateVal = document.getElementById('new-meet-date').value;
        if(!dateVal) {
            utils.showToast('A data é obrigatória.', 'error');
            return;
        }

        const meet = {
            data: dateVal,
            temperatura: document.getElementById('new-meet-temp').value,
            participantes: document.getElementById('new-meet-parts').value,
            link: document.getElementById('new-meet-link').value
        };

        console.log('📝 Dados coletados:', meet);
        state.tempReunioes.push(meet);

        document.getElementById('btn-cancel-meeting').click();
        ui.renderReunioesTable();
        utils.showToast('Reunião registrada!', 'success');
        console.log('✅ Reunião salva no state.tempReunioes');
    } catch (err) {
        console.error('❌ Erro no saveTempReuniao:', err);
        utils.showToast('Erro ao salvar localmente: ' + err.message, 'error');
    }
}

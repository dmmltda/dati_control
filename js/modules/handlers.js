import { state } from './state.js';
import * as utils from './utils.js';
import * as ui from './ui.js';
import { switchView } from './navigation.js';
import { api } from './api.js';
import { confirmar } from './confirmar.js';
import { getAuthToken } from './auth.js';

// --- Contact Handlers ---
export function saveNewContato() {
    const nome = document.getElementById('new-cont-nome').value.trim();
    if (!nome) { utils.showToast('O Nome do Contato é obrigatório!', 'error'); return; }

    state.tempContatos.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
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

export function startEditContato(id) {
    state.editingContatoId = id;
    ui.renderContatosTable();
}

export function cancelEditContato() {
    state.editingContatoId = null;
    ui.renderContatosTable();
}

export function saveEditContato(id) {
    const nomeInput = document.getElementById(`edit-cont-nome-${id}`);
    if (!nomeInput || !nomeInput.value.trim()) {
        utils.showToast('O Nome do Contato é obrigatório!', 'error');
        return;
    }

    const cont = state.tempContatos.find(c => String(c.id) === String(id));
    if (!cont) return;

    cont.nome = nomeInput.value.trim();
    cont.email1 = document.getElementById(`edit-cont-email1-${id}`).value.trim();
    cont.telefone = document.getElementById(`edit-cont-tel-${id}`).value.trim();

    state.editingContatoId = null;
    ui.renderContatosTable();
    utils.showToast('Contato atualizado!', 'success');
}

export function removeTempContato(id) {
    confirmar('Remover este contato?', () => {
        const index = state.tempContatos.findIndex(c => String(c.id) === String(id));
        if (index !== -1) {
            state.tempContatos.splice(index, 1);
            ui.renderContatosTable();
        }
    });
}

// --- Company Form Submit ---
let _isSaving = false; // guarda contra duplo submit
export async function handleCompanySubmit(e) {
    if (e) e.preventDefault();

    // Impede duplo clique / duplo submit
    if (_isSaving) return;
    _isSaving = true;

    const saveBtn = document.getElementById('btn-save-company');
    const _savedLabel = saveBtn ? saveBtn.innerHTML : null;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="ph ph-spinner" style="animation:spin 1s linear infinite"></i> Salvando...';
    }

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
            Site: document.getElementById('emp-site').value.trim() || null,
            Tipo_de_empresa: document.getElementById('emp-tipo').value.trim(),
            Segmento_da_empresa: document.getElementById('emp-segmento').value.trim(),
            Modo_da_empresa: document.getElementById('emp-canal').value.trim() || null,
            Health_Score: document.getElementById('emp-health-score').value || null,
            NPS: document.getElementById('emp-nps').value || null,

            Produtos: (state.tempProdutos || []).map(p => ({
                nome: p.nome,
                tipoCobranca: p.tipoCobranca,
                valorUnitario: p.valorUnitario,
                valorMinimo: p.valorMinimo,
                cobrancaSetup: p.cobrancaSetup,
                valorSetup: p.valorSetup,
                qtdUsuarios: p.qtdUsuarios,
                valorUserAdic: p.valorUserAdic,
                totalHorasHd: p.totalHorasHd ? parseInt(p.totalHorasHd) : null,
                valorAdicHd: p.valorAdicHd,
                propostaData: p.propostaData ?? null,
                propostaName: p.propostaName ?? null,
                contratoData: p.contratoData ?? null,
                contratoName: p.contratoName ?? null,
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
            NPS_History: state.tempNPSHistory.map(n => ({
                id: n.id,
                Data: n.data ? new Date(n.data) : null,
                Destinatario: n.destinatarios || n.destinatario,
                Formulario: n.formType || n.formulario,
                Score: n.score,
                Respostas_JSON: n.respostasJSON
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
            })),
            Follow_Ups: state.tempFollowUps.map(f => ({
                Data_inclusao: f.data ? new Date(f.data) : new Date(),
                Conteudo: f.conteudo,
                Usuario: f.usuario,
                Area: f.area,
                Data_proximo_contato: f.proximoContato ? new Date(f.proximoContato) : null
            }))
        };

        // =====================================================================
        // MODO BULK EDIT — aplica apenas os campos preenchidos em N empresas
        // =====================================================================
        if (state.bulkEditIds && state.bulkEditIds.length > 0) {
            const bulkIds = [...state.bulkEditIds];
            const count = bulkIds.length;

            // Coleta só os campos com valor (não nulo, não vazio)
            const partialPayload = {};
            const fieldMap = {
                Status: document.getElementById('emp-status')?.value,
                Nome_da_empresa: document.getElementById('emp-nome')?.value?.trim(),
                Estado: document.getElementById('emp-estado')?.value?.trim(),
                Cidade: document.getElementById('emp-cidade')?.value?.trim(),
                Tipo_de_empresa: document.getElementById('emp-tipo')?.value?.trim(),
                Segmento_da_empresa: document.getElementById('emp-segmento')?.value?.trim(),
                Modo_da_empresa: document.getElementById('emp-canal')?.value?.trim(),
                Site: document.getElementById('emp-site')?.value?.trim(),
                Health_Score: document.getElementById('emp-health-score')?.value,
                NPS: document.getElementById('emp-nps')?.value,
            };

            // Inclui somente campos com valor preenchido
            Object.entries(fieldMap).forEach(([key, val]) => {
                if (val !== undefined && val !== null && val !== '') {
                    partialPayload[key] = val;
                }
            });

            if (Object.keys(partialPayload).length === 0) {
                utils.showToast('Preencha pelo menos um campo para aplicar.', 'error');
                return;
            }

            utils.showToast(`Aplicando em ${count} empresa${count !== 1 ? 's' : ''}...`, 'info');

            let successCount = 0, errorCount = 0;
            for (const id of bulkIds) {
                try {
                    // Para o PUT, precisamos preservar os dados existentes + sobrescrever apenas os novos
                    const existing = state.companies.find(c => String(c.id) === String(id));
                    if (!existing) { errorCount++; continue; }

                    // Usa o payload existente mapeado e mescla com as alterações
                    const fullPayload = {
                        Nome_da_empresa: existing.nome,
                        Status: existing.status,
                        Estado: existing.estado,
                        Cidade: existing.cidade,
                        Tipo_de_empresa: existing.tipo,
                        Segmento_da_empresa: existing.segmento,
                        Modo_da_empresa: existing.canal,
                        Site: existing.site,
                        Health_Score: existing.healthScore,
                        NPS: existing.nps,
                        Contatos: [],
                        Reunioes: [],
                        Dashboards: [],
                        NPS_History: [],
                        Tickets: [],
                        Notas: [],
                        Follow_Ups: [],
                        Produtos: [],   // bulk edit não altera produtos individuais
                        ...partialPayload          // sobrescreve apenas os campos preenchidos
                    };

                    await api.updateCompany(id, fullPayload);
                    successCount++;
                } catch (err) {
                    console.error(`[Bulk Edit] Erro ao atualizar ${id}:`, err);
                    errorCount++;
                }
            }

            const updatedCompanies = await api.getCompanies();
            state.companies = updatedCompanies;
            state.bulkEditIds = [];
            ui.renderCompanyList();
            ui.clearBulkSelection?.();
            switchView('company-list');

            if (errorCount === 0) {
                utils.showToast(`${successCount} empresa${successCount !== 1 ? 's' : ''} atualizada${successCount !== 1 ? 's' : ''} com sucesso!`, 'success');
            } else {
                utils.showToast(`${successCount} ok. ${errorCount} com erro.`, 'error');
            }
            return;
        }

        // =====================================================================
        // MODO INDIVIDUAL — criar ou atualizar uma única empresa
        // =====================================================================
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

            // Para empresa NOVA: atualiza o ID para que edições futuras sejam PUT (não POST)
            if (!isUpdate && result.id) {
                state.currentEditingId = result.id;
                document.getElementById('company-id').value = result.id;
                // Atualiza título da tela com o nome da empresa criada
                const formTitle = document.getElementById('form-title');
                if (formTitle) formTitle.innerText = result.nome || dbPayload.Nome_da_empresa || 'Empresa';
            }

            // Atualiza o botão de salvar - sempre mostra "Salvar" depois do primeiro save
            const saveBtn = document.getElementById('btn-save-company');
            if (saveBtn) saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar';

            // NÃO redireciona — usuário fica na tela da empresa
            // Atualiza lista de empresas em background para sincronia
            await ui.renderDashboard();
            api.getCompanies().then(updated => {
                state.companies = updated;
                ui.renderCompanyList();
            }).catch(err => console.warn('[Save] Falha refresh background:', err));

            utils.showToast(isUpdate ? 'Empresa atualizada com sucesso!' : 'Empresa criada com sucesso!', 'success');
        }

    } catch (error) {
        console.error('❌ Erro fatal ao salvar:', error);
        utils.showToast('Erro ao salvar no banco: ' + error.message, 'error');
    } finally {
        // Sempre reabilita o botão ao terminar (sucesso ou erro)
        _isSaving = false;
        const btn = document.getElementById('btn-save-company');
        if (btn && _savedLabel) {
            btn.disabled = false;
            // Restaura o label correto: se já tem ID agora (empresa criada), usa "Salvar"
            if (state.currentEditingId) {
                btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar';
            } else if (_savedLabel) {
                btn.innerHTML = _savedLabel;
            }
        }
    }
}

// --- CS Hub Modals/Forms Handlers ---
export function saveTempDashboard() {
    try {
        const data = document.getElementById('new-db-data').value;
        const dest = document.getElementById('new-db-dest').value;
        const link = document.getElementById('new-db-link').value;
        if (!data || !dest || !link) { utils.showToast('Preencha os campos obrigatórios (*)', 'error'); return; }
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
        const tipo = document.getElementById('new-nps-tipo').value;
        const formType = document.getElementById('new-nps-form-type').value;
        const data = document.getElementById('new-nps-data').value;
        const dest = document.getElementById('new-nps-dest').value;
        const score = document.getElementById('new-nps-score').value;

        if (!tipo || !formType || !data || !dest || !score) {
            utils.showToast('Preencha os campos obrigatórios (*)', 'error');
            return;
        }

        state.tempNPSHistory.push({
            tipo,
            formType,
            data,
            destinatarios: dest,
            forms: document.getElementById('new-nps-forms').value,
            score
        });

        document.getElementById('btn-cancel-nps').click();
        ui.renderNPSHistoryTable();
        utils.showToast('Pesquisa NPS salva!', 'success');
    } catch (err) {
        console.error('❌ Erro no saveTempNPS:', err);
        utils.showToast('Erro ao salvar localmente: ' + err.message, 'error');
    }
}

export async function enviarPesquisa() {
    try {
        const tipo = document.getElementById('new-nps-tipo').value;
        const formType = document.getElementById('new-nps-form-type').value;
        const data = document.getElementById('new-nps-data').value;
        const dest = document.getElementById('new-nps-dest').value;

        if (!tipo || !formType || !data || !dest) {
            utils.showToast('Preencha os campos obrigatórios (*)', 'error');
            return;
        }

        const token = await getAuthToken();
        const res = await fetch('/api/emails/nps', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ destinatarios: dest, tipoForm: formType })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Erro HTTP ${res.status}`);
        }

        utils.showToast('Pesquisa enviada com sucesso ao cliente!', 'success');

        // Registra no "Histórico de Alterações" (Audit Log)
        _recordAuditAction('UPDATE', 'activity', `Pesquisa NPS (${formType}) enviada para: ` + dest);

        // Salva registro "Pendente"
        state.tempNPSHistory.push({
            tipo,
            formType,
            data,
            destinatarios: dest,
            forms: '',
            score: 'Pendente'
        });

        document.getElementById('btn-cancel-nps').click();
        ui.renderNPSHistoryTable();
    } catch (err) {
        console.error('❌ Erro ao enviar pesquisa:', err);
        utils.showToast('Erro ao disparar formulário NPS: ' + err.message, 'error');
    }
}

function _recordAuditAction(action, entity, desc) {
    // Como não temos um endpoint real de POST /api/audit-logs que funcione para o mock,
    // vamos apenas disparar um evento ou logar no console.
    // Em um sistema real, faríamos fetch('/api/audit-logs', { method: 'POST', ... })
    console.log(`[AuditLog] ${action} ${entity}: ${desc}`);
    
    // Dispara evento para o módulo de audit log atualizar se estiver aberto
    window.dispatchEvent(new CustomEvent('journey:audit-changed'));
}

export function saveTempCSMeet() {
    try {
        const data = document.getElementById('new-cs-meet-data').value;
        const parts = document.getElementById('new-cs-meet-parts').value;
        if (!data || !parts) { utils.showToast('Data e Participantes são obrigatórios.', 'error'); return; }
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
    if (!data || !num || !resumo) { utils.showToast('Data, Número e Resumo são obrigatórios.', 'error'); return; }
    state.tempChamados.push({ data, numero: num, resumo, autor: document.getElementById('new-tk-autor').value, link: document.getElementById('new-tk-link').value });
    document.getElementById('btn-cancel-ticket').click();
    ui.renderTicketsTable();
    utils.showToast('Chamado registrado!', 'success');
}

export function addCSNote() {
    const noteInput = document.getElementById('new-cs-note');
    const text = noteInput.value.trim();
    if (!text) return;

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
        if (!dateVal) {
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

export function saveTempFollowUp() {
    try {
        const usuario = document.getElementById('new-fw-usuario').value.trim();
        const conteudo = document.getElementById('new-fw-content').value.trim();
        if (!usuario || !conteudo) {
            utils.showToast('Usuário e Conteúdo são obrigatórios.', 'error');
            return;
        }

        state.tempFollowUps.push({
            data: new Date().toISOString().split('T')[0],
            usuario,
            area: document.getElementById('new-fw-area').value,
            conteudo,
            proximoContato: document.getElementById('new-fw-next').value
        });

        document.getElementById('btn-cancel-followup').click();
        ui.renderFollowUpsTable();
        utils.showToast('Follow-up registrado!', 'success');
    } catch (err) {
        utils.showToast('Erro ao salvar localmente: ' + err.message, 'error');
    }
}

export function removeTempFollowUp(index) {
    confirmar('Remover este follow-up?', () => {
        state.tempFollowUps.splice(index, 1);
        ui.renderFollowUpsTable();
    });
}


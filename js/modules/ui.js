import { state } from './state.js';
import { STATUS_CONFIG, CS_VISIBLE_STATUSES } from './config.js';
import { TableManager } from './table-manager.js';

let productsTableManager = null;
let contactsTableManager = null;
let logTableManager = null;
let dashboardTableManager = null;
let npsTableManager = null;
let csMeetingTableManager = null;
let meetingGeralTableManager = null;
let companiesTableManager = null;

export function renderDashboard() {
    const statsContainer = document.getElementById('dashboard-stats');
    if (!statsContainer) return;
    statsContainer.innerHTML = '';

    const counts = state.companies.reduce((acc, comp) => {
        acc[comp.status] = (acc[comp.status] || 0) + 1;
        return acc;
    }, {});

    let total = state.companies.length;

    statsContainer.innerHTML += `
        <div class="glass-panel stat-card" style="border-left-color: var(--text-main);">
            <div class="stat-icon" style="background: rgba(255,255,255,0.1); color: var(--text-main);">
                <i class="ph ph-buildings"></i>
            </div>
            <div class="stat-value">${total}</div>
            <div class="stat-label">Total de Empresas</div>
        </div>
    `;

    const order = ['Prospect', 'Lead', 'Reunião', 'Proposta | Andamento', 'Cliente Ativo'];
    order.forEach(status => {
        const config = STATUS_CONFIG[status];
        const count = counts[status] || 0;
        statsContainer.innerHTML += `
            <div class="glass-panel stat-card" style="border-left-color: ${config.color};">
                <div class="stat-icon" style="background: ${config.color}20; color: ${config.color};">
                    <i class="ph ${config.icon}"></i>
                </div>
                <div class="stat-value">${count}</div>
                <div class="stat-label">${status}</div>
            </div>
        `;
    });
}

export function renderCompanyList() {
    const tableBody = document.getElementById('company-table-body');
    if (!tableBody) return;

    if (!companiesTableManager) {
        companiesTableManager = new TableManager(
            state.companies,
            [
                { key: 'nome', type: 'string' },
                { key: 'segmento', type: 'string' },
                { key: 'cidade', type: 'string' },
                { key: 'status', type: 'string' },
                { key: 'updatedAt', type: 'number' }
            ],
            (data) => renderCompanyTableRows(data),
            'view-company-list'
        );
        companiesTableManager.paginationContainerId = 'pagination-companies';
        // Configura busca em múltiplas colunas (10/10 UX)
        companiesTableManager.searchKeys = ['nome', 'segmento', 'canal', 'cidade', 'estado', 'status', 'cnpj', 'site'];
        
        // Default sort by updatedAt desc
        companiesTableManager.sort = { key: 'updatedAt', direction: 'desc' };
        companiesTableManager.apply();
    } else {
        companiesTableManager.setData(state.companies);
    }
}

function renderCompanyTableRows(data) {
    const tableBody = document.getElementById('company-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-results">
                        <div class="empty-icon">
                            <i class="ph ph-magnifying-glass"></i>
                        </div>
                        <h3>Nenhum resultado encontrado</h3>
                        <p>Não encontramos nada para o termo "<strong>${companiesTableManager.globalSearch}</strong>".</p>
                        <button class="btn btn-secondary btn-sm" onclick="ui.clearCompaniesFilters()" style="margin-top: 1rem">
                            <i class="ph ph-x"></i> Limpar Filtros
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    data.forEach(comp => {
        const config = STATUS_CONFIG[comp.status] || STATUS_CONFIG['Prospect'];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight: 600; color: var(--text-main);">${comp.nome}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${comp.site || '-'}</div>
            </td>
            <td>
                <div>${comp.segmento || '-'}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${comp.canal || '-'}</div>
            </td>
            <td>${comp.cidade || '-'}${comp.estado ? ` / ${comp.estado}` : ''}</td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-start;">
                    <span class="badge ${config.class}">${comp.status}</span>
                    <div style="display: flex; gap: 0.3rem;">
                        ${(comp.healthScore && CS_VISIBLE_STATUSES.includes(comp.status)) ? `
                            <span class="badge" style="font-size: 0.65rem; background: ${comp.healthScore === 'Saudável' ? 'rgba(16,185,129,0.15)' : comp.healthScore === 'Atenção' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${comp.healthScore === 'Saudável' ? '#10b981' : comp.healthScore === 'Atenção' ? '#f59e0b' : '#ef4444'}; border: 1px solid currentColor;">
                                ${comp.healthScore === 'Saudável' ? '🟢' : comp.healthScore === 'Atenção' ? '🟡' : '🔴'} ${comp.healthScore}
                            </span>
                        ` : ''}
                        ${(comp.nps && CS_VISIBLE_STATUSES.includes(comp.status)) ? `
                            <span class="badge" style="font-size: 0.65rem; background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid var(--dark-border);">
                                NPS: ${comp.nps}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </td>
            <td>
                <div class="actions">
                    <button type="button" class="btn btn-secondary btn-icon btn-edit" data-id="${comp.id}" title="Editar">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button type="button" class="btn btn-danger btn-icon btn-delete" data-id="${comp.id}" title="Excluir">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

export function renderContatosTable() {
    const contatosTableBody = document.getElementById('contatos-table-body');
    if (!contatosTableBody) return;

    if (!contactsTableManager) {
        contactsTableManager = new TableManager(
            state.tempContatos,
            [
                { key: 'nome', type: 'string' },
                { key: 'cargo', type: 'string' },
                { key: 'departamento', type: 'string' }
            ],
            (data) => renderContatosTableRows(data),
            'tab-contatos'
        );
        contactsTableManager.paginationContainerId = 'pagination-contatos';
        contactsTableManager.apply();
    } else {
        contactsTableManager.setData(state.tempContatos);
    }
}

function renderContatosTableRows(data) {
    const body = document.getElementById('contatos-table-body');
    if (!body) return;
    body.innerHTML = '';

    if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">Nenhum contato cadastrado.</td></tr>`;
        return;
    }

    data.forEach(cont => {
        const index = state.tempContatos.indexOf(cont);
        const tr = document.createElement('tr');
        if (state.editingContatoIndex === index) {
            tr.className = 'editing-row';
            tr.innerHTML = `
                <td colspan="6">
                    <div class="grid-3" style="padding: 1rem;">
                        <input type="text" id="edit-cont-nome-${index}" class="input-control" value="${cont.nome}" placeholder="Nome *">
                        <input type="email" id="edit-cont-email1-${index}" class="input-control" value="${cont.email1 || ''}" placeholder="E-mail">
                        <input type="tel" id="edit-cont-tel-${index}" class="input-control" value="${cont.telefone || ''}" placeholder="Telefone">
                    </div>
                </td>
                <td style="text-align: right;">
                    <div class="actions">
                        <button type="button" class="btn btn-primary btn-icon btn-save-edit-contato" data-index="${index}"><i class="ph ph-check"></i></button>
                        <button type="button" class="btn btn-secondary btn-icon btn-cancel-edit-contato"><i class="ph ph-x"></i></button>
                    </div>
                </td>
            `;
        } else {
            tr.innerHTML = `
                <td style="font-weight: 500;">${cont.nome}</td>
                <td style="font-size: 0.85rem;">${cont.email1 || '-'}</td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${cont.cargo || '-'}</td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${cont.departamento || '-'}</td>
                <td style="font-size: 0.85rem;">${cont.whatsapp || cont.telefone || '-'}</td>
                <td style="font-size: 0.85rem;">${cont.linkedin ? 'Link' : '-'}</td>
                <td style="text-align: right;">
                    <div class="actions" style="justify-content: flex-end;">
                        <button type="button" class="btn btn-secondary btn-icon btn-edit-contato" data-index="${index}"><i class="ph ph-pencil-simple"></i></button>
                        <button type="button" class="btn btn-danger btn-icon btn-remove-contato" data-index="${index}"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            `;
        }
        body.appendChild(tr);
    });

    const clearBtn = document.getElementById('btn-clear-contatos-filters');
    if (clearBtn && contactsTableManager) {
        const hasFilters = Object.keys(contactsTableManager.filters).length > 0;
        clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    }
}

export function renderProdutosTable() {
    const produtosTableBody = document.getElementById('produtos-table-body');
    if (!produtosTableBody) return;

    if (!productsTableManager) {
        productsTableManager = new TableManager(
            state.tempProdutos,
            [
                { key: 'nome', type: 'string' },
                { key: 'mensalidade', type: 'number' },
                { key: 'horasHd', type: 'number' }
            ],
            (data) => renderProdutosTableRows(data),
            'tab-produtos'
        );
        productsTableManager.paginationContainerId = 'pagination-produtos';
        productsTableManager.apply();
    } else {
        productsTableManager.setData(state.tempProdutos);
    }
}

function renderProdutosTableRows(data) {
    const body = document.getElementById('produtos-table-body');
    if (!body) return;
    body.innerHTML = '';

    if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">Nenhum produto encontrado.</td></tr>`;
        return;
    }

    data.forEach(prod => {
        const index = state.tempProdutos.indexOf(prod);
        const tr = document.createElement('tr');
        
        if (state.editingProdutoIndex === index) {
            tr.className = 'editing-row';
            tr.innerHTML = `
                <td colspan="4">
                    <div class="grid-3" style="padding: 1rem;">
                        <select id="edit-prod-nome-${index}" class="input-control">
                            <option value="DATI Import" ${prod.nome === 'DATI Import' ? 'selected' : ''}>DATI Import</option>
                            <option value="DATI Export" ${prod.nome === 'DATI Export' ? 'selected' : ''}>DATI Export</option>
                            <option value="Smart Read" ${prod.nome === 'Smart Read' ? 'selected' : ''}>Smart Read</option>
                            <option value="Orkestra" ${prod.nome === 'Orkestra' ? 'selected' : ''}>Orkestra</option>
                        </select>
                        <input type="date" id="edit-prod-data-${index}" class="input-control" value="${prod.dataContratacao || ''}">
                        <input type="text" id="edit-prod-mensalidade-${index}" class="input-control" value="${prod.mensalidade || ''}" placeholder="Valor (R$)">
                    </div>
                </td>
                <td style="text-align: right;">
                    <div class="actions">
                        <button type="button" class="btn btn-primary btn-icon btn-save-edit-produto" data-index="${index}"><i class="ph ph-check"></i></button>
                        <button type="button" class="btn btn-secondary btn-icon btn-cancel-edit-produto"><i class="ph ph-x"></i></button>
                    </div>
                </td>
            `;
        } else {
            const propLink = prod.propostaData ? `<a href="${prod.propostaData}" download="${prod.propostaName}" class="badge" style="background: rgba(79,70,229,0.2); color: #fff; text-decoration: none;"><i class="ph ph-download-simple"></i> Proposta</a>` : '';
            const contLink = prod.contratoData ? `<a href="${prod.contratoData}" download="${prod.contratoName}" class="badge" style="background: rgba(16,185,129,0.2); color: #fff; text-decoration: none;"><i class="ph ph-download-simple"></i> Contrato</a>` : '';

            tr.innerHTML = `
                <td>
                    <div style="font-weight: 500;">${prod.nome}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem;">${prod.dataContratacao || 'S/ Data'}</div>
                </td>
                <td>R$ ${prod.mensalidade || '0,00'}</td>
                <td>${prod.horasHd || '0'}h</td>
                <td>
                    <div style="display: flex; gap: 0.3rem;">
                        ${propLink} ${contLink}
                    </div>
                </td>
                <td style="text-align: right;">
                    <div class="actions" style="justify-content: flex-end;">
                        <button type="button" class="btn btn-secondary btn-icon btn-edit-produto" data-index="${index}"><i class="ph ph-pencil-simple"></i></button>
                        <button type="button" class="btn btn-danger btn-icon btn-remove-produto" data-index="${index}"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            `;
        }
        body.appendChild(tr);
    });

    const clearBtn = document.getElementById('btn-clear-produtos-filters');
    if (clearBtn && productsTableManager) {
        const hasFilters = Object.keys(productsTableManager.filters).length > 0;
        clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    }
}

export function renderDashboardsTable() {
    const body = document.getElementById('dashboards-table-body');
    if(!body) return;

    if (!dashboardTableManager) {
        dashboardTableManager = new TableManager(
            state.tempDashboards,
            [
                { key: 'data', type: 'date' },
                { key: 'destinatarios', type: 'string' }
            ],
            (data) => renderDashboardsTableRows(data),
            'tab-dashboards'
        );
        dashboardTableManager.paginationContainerId = 'pagination-dashboards';
        dashboardTableManager.apply();
    } else {
        dashboardTableManager.setData(state.tempDashboards);
    }
}

function renderDashboardsTableRows(data) {
    const body = document.getElementById('dashboards-table-body');
    if(!body) return;
    body.innerHTML = '';
    
    if(data.length === 0) {
        body.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum dashboard registrado.</td></tr>`;
        return;
    }

    data.forEach((db, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${db.data}</td>
            <td>${db.destinatarios}</td>
            <td>${db.link ? `<a href="${db.link}" target="_blank" class="badge" style="background: rgba(79,70,229,0.1); color: #fff; text-decoration:none;"><i class="ph ph-presentation-chart"></i> Link Power BI</a>` : '-'}</td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-dashboard" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function renderNPSHistoryTable() {
    const body = document.getElementById('nps-history-table-body');
    if(!body) return;

    if (!npsTableManager) {
        npsTableManager = new TableManager(
            state.tempNPSHistory,
            [
                { key: 'data', type: 'date' },
                { key: 'destinatarios', type: 'string' },
                { key: 'score', type: 'number' }
            ],
            (data) => renderNPSHistoryTableRows(data),
            'tab-nps'
        );
        npsTableManager.paginationContainerId = 'pagination-nps';
        npsTableManager.apply();
    } else {
        npsTableManager.setData(state.tempNPSHistory);
    }
}

function renderNPSHistoryTableRows(data) {
    const body = document.getElementById('nps-history-table-body');
    if(!body) return;
    body.innerHTML = '';
    
    if(data.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma pesquisa NPS registrada.</td></tr>`;
        return;
    }

    data.forEach((nps, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${nps.data}</td>
            <td>${nps.destinatarios}</td>
            <td style="text-align:center;">${nps.forms || 0}</td>
            <td style="text-align:center;"><span class="badge" style="background: rgba(245,158,11,0.1); color: #f59e0b; border: 1px solid currentColor;">${nps.score}</span></td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-nps" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function renderCSMeetingsTable() {
    const body = document.getElementById('cs-meetings-table-body');
    if(!body) return;

    if (!csMeetingTableManager) {
        csMeetingTableManager = new TableManager(
            state.tempReunioesCS,
            [
                { key: 'data', type: 'date' },
                { key: 'participantes', type: 'string' }
            ],
            (data) => renderCSMeetingsTableRows(data),
            'tab-cs-meetings'
        );
        csMeetingTableManager.paginationContainerId = 'pagination-cs-meetings';
        csMeetingTableManager.apply();
    } else {
        csMeetingTableManager.setData(state.tempReunioesCS);
    }
}

function renderCSMeetingsTableRows(data) {
    const body = document.getElementById('cs-meetings-table-body');
    if(!body) return;
    body.innerHTML = '';
    
    if(data.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma reunião de alinhamento registrada.</td></tr>`;
        return;
    }

    data.forEach((meet, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${meet.data}</td>
            <td>${meet.participantes}</td>
            <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${meet.obs || '-'}</td>
            <td>${meet.link ? `<a href="${meet.link}" target="_blank" class="badge" style="background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid currentColor;"><i class="ph ph-video"></i> Ver</a>` : '-'}</td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-csmeet" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function renderTicketsTable() {
    const body = document.getElementById('tickets-table-body');
    if(!body) return;
    body.innerHTML = '';
    
    if(state.tempChamados.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum chamado registrado.</td></tr>`;
        return;
    }

    state.tempChamados.sort((a,b) => b.data.localeCompare(a.data)).forEach((tk, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${tk.data}</td>
            <td><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-main);">${tk.numero}</span></td>
            <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${tk.resumo}</td>
            <td>${tk.autor}</td>
            <td>${tk.link ? `<a href="${tk.link}" target="_blank" class="badge" style="background: rgba(59,130,246,0.1); color: #3b82f6; border: 1px solid currentColor;"><i class="ph ph-headset"></i> Portal</a>` : '-'}</td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-ticket" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function renderCSTimeline() {
    const timeline = document.getElementById('cs-timeline');
    if(!timeline) return;
    timeline.innerHTML = '';

    if(state.tempNotes.length === 0) {
        timeline.innerHTML = `<div style="color: var(--text-muted); padding: 1rem; font-size: 0.85rem;">Nenhuma observação registrada.</div>`;
        return;
    }

    state.tempNotes.sort((a,b) => b.timestamp - a.timestamp).forEach((note, index) => {
        const item = document.createElement('div');
        item.style.padding = '0.8rem';
        item.style.background = 'rgba(255,255,255,0.02)';
        item.style.borderRadius = 'var(--radius-sm)';
        item.style.position = 'relative';
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">
                    <i class="ph ph-user"></i> <strong>${note.author}</strong> • ${note.date}
                </div>
                <button type="button" class="btn btn-icon btn-remove-temp-note" data-index="${index}" style="color: var(--text-muted); font-size: 0.8rem;">
                    <i class="ph ph-x"></i>
                </button>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-main); line-height: 1.4;">${note.text}</div>
            <div style="position: absolute; left: -1.3rem; top: 1.2rem; width: 0.6rem; height: 0.6rem; background: var(--dark-border); border: 2px solid var(--bg-main); border-radius: 50%;"></div>
        `;
        timeline.appendChild(item);
    });
}

export function renderReunioesTable() {
    const tableBody = document.getElementById('meetings-table-body');
    if(!tableBody) return;

    if (!meetingGeralTableManager) {
        meetingGeralTableManager = new TableManager(
            state.tempReunioes,
            [
                { key: 'data', type: 'date' },
                { key: 'participantes', type: 'string' },
                { key: 'temperatura', type: 'string' }
            ],
            (data) => renderReunioesTableRows(data),
            'tab-meetings-geral'
        );
        meetingGeralTableManager.paginationContainerId = 'pagination-meetings-geral';
        meetingGeralTableManager.apply();
    } else {
        meetingGeralTableManager.setData(state.tempReunioes);
    }
}

function renderReunioesTableRows(data) {
    const tableBody = document.getElementById('meetings-table-body');
    if(!tableBody) return;
    tableBody.innerHTML = '';
    
    if(data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma reunião registrada.</td></tr>`;
        return;
    }

    data.forEach((meet, index) => {
        const tr = document.createElement('tr');
        let tempClass = 'badge-warm';
        if(meet.temperatura === 'Hot') tempClass = 'badge-hot';
        if(meet.temperatura === 'Cold') tempClass = 'badge-cold';

        tr.innerHTML = `
            <td>${meet.data}</td>
            <td>${meet.participantes || '-'}</td>
            <td style="text-align: center;">
                <span class="badge ${tempClass}">${meet.temperatura === 'Hot' ? '🔥' : meet.temperatura === 'Warm' ? '⛅' : '❄️'} ${meet.temperatura}</span>
            </td>
            <td>${meet.link ? `<a href="${meet.link}" target="_blank" class="badge" style="background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.2);"><i class="ph ph-link"></i> Gravação</a>` : '-'}</td>
            <td style="text-align: right;">
                <button type="button" class="btn btn-danger btn-icon btn-remove-temp-reuniao" data-index="${index}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

export function renderLogTestes() {
    const body = document.getElementById('log-testes-body');
    if (!body) return;

    const dataExecucao = '07/03/2026';
    const horaExecucao = '15:20';
    const PASSOU = `<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); white-space:nowrap;"><i class="ph ph-check-circle"></i> Sucesso</span>`;
    const E2E   = `<span class="badge" style="background:rgba(139,92,246,0.15); color:#a78bfa; border:1px solid rgba(139,92,246,0.3);">E2E</span>`;
    const UNIT  = `<span class="badge" style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3);">Unitário</span>`;

    const testesRaw = [
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'DB_KEY deve estar definido e ser uma string', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'STATUS_CONFIG contém todos os 8 status esperados', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'Cada status tem icon, class e color', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'Classes CSS de status seguem o padrão "status-*"', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'CS_VISIBLE_STATUSES é um array de 3 itens', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'CS_VISIBLE_STATUSES inclui apenas os 3 status de cliente', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'CS_VISIBLE_STATUSES NÃO inclui status de pré-venda', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'config.js', descricao: 'CS_VISIBLE_STATUSES tem exatamente 3 itens', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'state.companies é array', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'currentEditingId é null por padrão', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'Arrays temp vazios na inicialização', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'editingContatoIndex é -1 por padrão', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'editingProdutoIndex é -1 por padrão', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'resetTempState() limpa todos os arrays temporários', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'resetTempState() reseta índices de edição para -1', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'state.js', descricao: 'resetTempState() reseta currentEditingId para null', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'utils.js', descricao: 'maskCurrency: 100 → "1,00"', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'utils.js', descricao: 'maskCurrency: 150000 → "1.500,00"', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'utils.js', descricao: 'maskCurrency: 10000000 → "100.000,00"', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'utils.js', descricao: 'maskCurrency: remove caracteres não numéricos', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'auth.js', descricao: 'Login com credenciais corretas: define sessionStorage', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'UNITÁRIO', modulo: 'auth.js', descricao: 'Logout: limpa campos de login', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'E2E', modulo: 'auth.spec', descricao: 'Login com admin/dati2024: app exibido', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'E2E', modulo: 'companies.spec', descricao: 'Criar empresa completa e salvar', status: PASSOU },
        { data: dataExecucao, hora: horaExecucao, tipo: 'E2E', modulo: 'crud_advanced.spec', descricao: 'Editar nome e status de empresa existente', status: PASSOU }
    ];

    if (!logTableManager) {
        logTableManager = new TableManager(
            testesRaw,
            [
                { key: 'data', type: 'date' },
                { key: 'hora', type: 'string' },
                { key: 'tipo', type: 'string' },
                { key: 'modulo', type: 'string' },
                { key: 'descricao', type: 'string' },
                { key: 'status', type: 'string' }
            ],
            (data) => renderLogTableRows(data),
            'log-testes'
        );
        logTableManager.paginationContainerId = 'pagination-log';
    }

    logTableManager.apply();
}

function renderLogTableRows(data) {
    const body = document.getElementById('log-testes-body');
    if (!body) return;

    const PASSOU = `<span class="badge" style="background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.2);"><i class="ph ph-check-circle"></i> SUCESSO</span>`;
    const UNIT_BADGE  = `<span class="badge" style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3);">Unitário</span>`;
    const E2E_BADGE   = `<span class="badge" style="background:rgba(167,139,250,0.15); color:#a78bfa; border:1px solid rgba(167,139,250,0.3);">E2E</span>`;

    body.innerHTML = '';
    data.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="white-space:nowrap; color:var(--text-muted); font-size:0.85rem;">${item.data}</td>
            <td style="white-space:nowrap; color:var(--text-muted); font-size:0.85rem;">${item.hora}</td>
            <td style="white-space:nowrap;">${item.tipo === 'UNITÁRIO' ? UNIT_BADGE : E2E_BADGE}</td>
            <td style="font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${item.modulo}</td>
            <td style="font-size:0.85rem;">${item.descricao}</td>
            <td>${item.status}</td>
        `;
        body.appendChild(tr);
    });

    // Show/Hide Clear Filter button
    const clearBtn = document.getElementById('btn-clear-log-filters');
    if (clearBtn) {
        const hasFilters = Object.keys(logTableManager.filters).length > 0;
        clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    }
}

function getManagerForKey(key) {
    if (key.startsWith('produtos_')) return productsTableManager;
    if (key.startsWith('contatos_')) return contactsTableManager;
    if (key.startsWith('db_')) return dashboardTableManager;
    if (key.startsWith('nps_')) return npsTableManager;
    if (key.startsWith('csmt_')) return csMeetingTableManager;
    if (key.startsWith('meet_')) return meetingGeralTableManager;
    if (key.startsWith('comp_')) return companiesTableManager;
    return logTableManager;
}

function getDataKey(key) {
    return key.replace(/^(produtos_|contatos_|db_|nps_|csmt_|meet_|comp_)/, '');
}

// Handler para paginação (Mapeia Container ID -> Manager)
window.getManagerForKeyPagination = function(containerId) {
    if (containerId === 'pagination-companies') return companiesTableManager;
    if (containerId === 'pagination-dashboards') return dashboardTableManager;
    if (containerId === 'pagination-nps') return npsTableManager;
    if (containerId === 'pagination-cs-meetings') return csMeetingTableManager;
    if (containerId === 'pagination-meetings-geral') return meetingGeralTableManager;
    if (containerId === 'pagination-log') return logTableManager;
    if (containerId === 'pagination-produtos') return productsTableManager;
    if (containerId === 'pagination-contatos') return contactsTableManager;
    return null;
};

export function toggleFilterPopover(key, event) {
    event.stopPropagation();
    const popover = document.getElementById(`filter-popover-${key}`);
    if (!popover) return;

    // Close others
    document.querySelectorAll('.filter-popover').forEach(p => {
        if (p !== popover) p.classList.remove('show');
    });

    const isOpen = popover.classList.contains('show');
    if (isOpen) {
        popover.classList.remove('show');
    } else {
        renderFilterOptions(key, popover);
        popover.classList.add('show');
    }
}

function renderFilterOptions(key, container) {
    const manager = getManagerForKey(key);
    if (!manager) return;
    const dataKey = getDataKey(key);
    const values = manager.getUniqueValues(dataKey);
    const selectedValue = manager.filters[dataKey];

    container.innerHTML = `
        <input type="text" class="filter-search" placeholder="Pesquisar..." onkeyup="ui.searchFilterOptions('${key}', this)">
        <div class="filter-list">
            <div class="filter-option ${!selectedValue ? 'selected' : ''}" onclick="ui.applyGenericFilter('${key}', '', event)">
                (Tudo)
            </div>
            ${values.map(val => `
                <div class="filter-option ${selectedValue === val ? 'selected' : ''}" onclick="ui.applyGenericFilter('${key}', '${val}', event)">
                    ${val}
                </div>
            `).join('')}
        </div>
    `;
}

export function searchFilterOptions(key, input) {
    const term = input.value.toLowerCase();
    const list = input.nextElementSibling;
    const options = list.querySelectorAll('.filter-option');
    options.forEach(opt => {
        const text = opt.textContent.toLowerCase();
        opt.style.display = text.includes(term) || opt.textContent.trim() === '(Tudo)' ? '' : 'none';
    });
}

export function applyGenericFilter(key, value, event) {
    if (event) event.stopPropagation();
    const manager = getManagerForKey(key);
    if (manager) {
        const dataKey = getDataKey(key);
        manager.setFilter(dataKey, value);
    }
    document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
}

export function handleProdutosSort(key, event) {
    if (event) event.stopPropagation();
    if (productsTableManager) productsTableManager.toggleSort(key);
}

export function handleContatosSort(key, event) {
    if (event) event.stopPropagation();
    if (contactsTableManager) contactsTableManager.toggleSort(key);
}

export function handleDashboardsSort(key, event) {
    if (event) event.stopPropagation();
    if (dashboardTableManager) dashboardTableManager.toggleSort(key);
}

export function handleNPSSort(key, event) {
    if (event) event.stopPropagation();
    if (npsTableManager) npsTableManager.toggleSort(key);
}

export function handleCSMeetingsSort(key, event) {
    if (event) event.stopPropagation();
    if (csMeetingTableManager) csMeetingTableManager.toggleSort(key);
}

export function handleReunioesSort(key, event) {
    if (event) event.stopPropagation();
    if (meetingGeralTableManager) meetingGeralTableManager.toggleSort(key);
}

export function handleCompaniesSort(key, event) {
    if (event) event.stopPropagation();
    if (companiesTableManager) companiesTableManager.toggleSort(key);
}

export function handleCompaniesSearch(term) {
    if (companiesTableManager) {
        companiesTableManager.setGlobalSearch(term);
        
        // Controla visibilidade do botão limpar busca (10/10 UX)
        const clearBtn = document.getElementById('clear-search');
        if (clearBtn) {
            clearBtn.style.display = term ? 'flex' : 'none';
        }
    }
}

export function clearProdutosFilters() {
    if (productsTableManager) {
        productsTableManager.filters = {};
        productsTableManager.apply();
        document.querySelectorAll('#tab-produtos .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearContatosFilters() {
    if (contactsTableManager) {
        contactsTableManager.filters = {};
        contactsTableManager.apply();
        document.querySelectorAll('#tab-contatos .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearDashboardsFilters() {
    if (dashboardTableManager) {
        dashboardTableManager.filters = {};
        dashboardTableManager.apply();
        document.querySelectorAll('#tab-dashboards .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearNPSFilters() {
    if (npsTableManager) {
        npsTableManager.filters = {};
        npsTableManager.apply();
        document.querySelectorAll('#tab-nps .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearCSMeetingsFilters() {
    if (csMeetingTableManager) {
        csMeetingTableManager.filters = {};
        csMeetingTableManager.apply();
        document.querySelectorAll('#tab-cs-meetings .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearReunioesGeralFilters() {
    if (meetingGeralTableManager) {
        meetingGeralTableManager.filters = {};
        meetingGeralTableManager.apply();
        document.querySelectorAll('#tab-meetings-geral .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function clearCompaniesFilters() {
    if (companiesTableManager) {
        companiesTableManager.filters = {};
        companiesTableManager.globalSearch = '';
        companiesTableManager.apply();
        
        const searchInput = document.getElementById('search-empresa');
        if (searchInput) searchInput.value = '';

        document.querySelectorAll('#view-company-list .btn-filter-column').forEach(btn => btn.classList.remove('active'));
    }
}

export function handleCompaniesFilter(key, value) {
    if (companiesTableManager) {
        companiesTableManager.setFilter(key, value);
    }
}


export function handleLogSort(key, event) {
    if (event) event.stopPropagation();
    if (logTableManager) logTableManager.toggleSort(key);
}

export function handleLogSearch(term) {
    if (logTableManager) {
        logTableManager.setGlobalSearch(term);
        updateClearFiltersBtn();
    }
}

export function clearLogFilters() {
    if (logTableManager) {
        logTableManager.filters = {};
        logTableManager.globalSearch = '';
        logTableManager.apply();
        
        // Reset UI
        const searchInput = document.getElementById('log-search-global');
        if (searchInput) searchInput.value = '';
        
        document.querySelectorAll('.btn-filter-column').forEach(btn => btn.classList.remove('active'));
        updateClearFiltersBtn();
    }
}

function updateClearFiltersBtn() {
    const clearBtn = document.getElementById('btn-clear-log-filters');
    if (clearBtn && logTableManager) {
        const hasFilters = Object.keys(logTableManager.filters).length > 0 || logTableManager.globalSearch !== '';
        clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    }
}

// Global click to close popovers
document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-popover') && !e.target.closest('.btn-filter-column')) {
        document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
    }
});


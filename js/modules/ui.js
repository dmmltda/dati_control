import { state } from './state.js';
import { STATUS_CONFIG } from './config.js';
import { CS_VISIBLE_STATUSES } from './config.js';

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
    const searchInput = document.getElementById('search-empresa');
    const statusFilter = document.getElementById('filter-status');
    const tableBody = document.getElementById('company-table-body');
    if (!tableBody) return;

    const searchTerm = searchInput?.value.toLowerCase() || '';
    const filterTerm = statusFilter?.value || '';

    const filtered = state.companies.filter(c => {
        const matchName = c.nome.toLowerCase().includes(searchTerm);
        const matchStatus = filterTerm === '' || c.status === filterTerm;
        return matchName && matchStatus;
    });

    tableBody.innerHTML = '';

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <i class="ph ph-folder-open"></i>
                        <h3>Nenhuma empresa encontrada</h3>
                        <p>Tente ajustar os filtros ou cadastre uma nova empresa.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    filtered.sort((a,b) => b.updatedAt - a.updatedAt).forEach(comp => {
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
                    <button class="btn btn-secondary btn-icon btn-edit" data-id="${comp.id}" title="Editar">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="btn btn-danger btn-icon btn-delete" data-id="${comp.id}" title="Excluir">
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
    contatosTableBody.innerHTML = '';
    
    if(state.tempContatos.length === 0) {
        contatosTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">Nenhum contato cadastrado.<br><span style="font-size: 0.8rem;">Clique no botão "+ Novo Contato" para adicionar.</span></td></tr>`;
        return;
    }

    state.tempContatos.forEach((cont, index) => {
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
        contatosTableBody.appendChild(tr);
    });
}

export function renderProdutosTable() {
    const produtosTableBody = document.getElementById('produtos-table-body');
    if (!produtosTableBody) return;
    produtosTableBody.innerHTML = '';
    
    if(state.tempProdutos.length === 0) {
        produtosTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">Nenhum produto cadastrado.</td></tr>`;
        return;
    }

    state.tempProdutos.forEach((prod, index) => {
        const tr = document.createElement('tr');
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
        produtosTableBody.appendChild(tr);
    });
}

export function renderDashboardsTable() {
    const body = document.getElementById('dashboards-table-body');
    if(!body) return;
    body.innerHTML = '';
    
    if(state.tempDashboards.length === 0) {
        body.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum dashboard registrado.</td></tr>`;
        return;
    }

    state.tempDashboards.sort((a,b) => b.data.localeCompare(a.data)).forEach((db, index) => {
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
    body.innerHTML = '';
    
    if(state.tempNPSHistory.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma pesquisa NPS registrada.</td></tr>`;
        return;
    }

    state.tempNPSHistory.sort((a,b) => b.data.localeCompare(a.data)).forEach((nps, index) => {
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
    body.innerHTML = '';
    
    if(state.tempReunioesCS.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma reunião de alinhamento registrada.</td></tr>`;
        return;
    }

    state.tempReunioesCS.sort((a,b) => b.data.localeCompare(a.data)).forEach((meet, index) => {
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
    tableBody.innerHTML = '';
    
    if(state.tempReunioes.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma reunião registrada.</td></tr>`;
        return;
    }

    state.tempReunioes.sort((a,b) => b.data.localeCompare(a.data)).forEach((meet, index) => {
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

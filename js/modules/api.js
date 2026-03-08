const API_URL = '/api';

// Mapeamento DB -> Frontend (10/10 compatibility)
function mapFromDB(comp) {
    if (!comp) return null;
    return {
        ...comp,
        id: comp.id,
        nome: comp.Nome_da_empresa,
        cnpj: comp.CNPJ_da_empresa,
        status: comp.Status,
        estado: comp.Estado,
        cidade: comp.Cidade,
        tipo: comp.Tipo_de_empresa,
        segmento: comp.Segmento_da_empresa,
        modo: comp.Modo_da_empresa,
        leadSource: comp.Lead,
        healthScore: comp.Health_Score,
        
        // Relacionamentos
        produtos: (comp.Produtos || []).map(p => ({
            id: p.id,
            nome: p.Produto_DATI,
            valor: p.Valor_Total,
            mensalidade: p.Valor_mensalidade,
            dataContratacao: p.Data_do_contrato ? new Date(p.Data_do_contrato).toISOString().split('T')[0] : null
        })),
        
        contatos: (comp.Contatos || []).map(c => ({
            id: c.id,
            nome: c.Nome_do_contato,
            cargo: c.Cargo_do_contato,
            departamento: c.Departamento_do_contato,
            email1: c.Email_1,
            whatsapp: c.WhatsApp,
            linkedin: c.LinkedIn
        })),

        reunioes: (comp.Reunioes || []).filter(r => r.Tipo_reuniao === 'Geral').map(r => ({
            id: r.id,
            data: r.Data_reuniao ? new Date(r.Data_reuniao).toISOString().split('T')[0] : null,
            participantes: r.Participantes,
            temperatura: r.Temperatura,
            link: r.Link_gravacao,
            observacoes: r.Observacoes
        })),

        reunioesCSHistory: (comp.Reunioes || []).filter(r => r.Tipo_reuniao === 'CS').map(r => ({
            id: r.id,
            data: r.Data_reuniao ? new Date(r.Data_reuniao).toISOString().split('T')[0] : null,
            participantes: r.Participantes,
            temperatura: r.Temperatura,
            link: r.Link_gravacao,
            obs: r.Observacoes
        })),

        dashboardsHistory: (comp.Dashboards || []).map(d => ({
            id: d.id,
            data: d.Data ? new Date(d.Data).toISOString().split('T')[0] : null,
            destinatario: d.Destinatario,
            link: d.Link
        })),

        npsHistory: (comp.NPS || []).map(n => ({
            id: n.id,
            data: n.Data ? new Date(n.Data).toISOString().split('T')[0] : null,
            destinatario: n.Destinatario,
            formulario: n.Formulario,
            score: n.Score
        })),

        chamadosHistory: (comp.Tickets || []).map(t => ({
            id: t.id,
            data: t.Data ? new Date(t.Data).toISOString().split('T')[0] : null,
            numero: t.Numero,
            resumo: t.Resumo,
            autor: t.Autor,
            link: t.Link
        })),

        csNotes: (comp.Notas || []).map(n => ({
            id: n.id,
            text: n.Conteudo,
            author: n.Autor,
            date: n.Data ? new Date(n.Data).toLocaleString('pt-BR') : '',
            timestamp: n.Data ? new Date(n.Data).getTime() : Date.now()
        }))
    };
}

export const api = {
    async getCompanies() {
        const response = await fetch(`${API_URL}/companies`);
        const data = await response.json();
        return Array.isArray(data) ? data.map(mapFromDB) : [];
    },

    async getCompany(id) {
        const response = await fetch(`${API_URL}/companies/${id}`);
        const data = await response.json();
        return mapFromDB(data);
    },

    async createCompany(companyData) {
        // O companyData enviado pelo migration.js já está no formato DB 10/10
        const response = await fetch(`${API_URL}/companies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(companyData)
        });
        const data = await response.json();
        return mapFromDB(data);
    },

    async updateCompany(id, companyData) {
        const response = await fetch(`${API_URL}/companies/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(companyData)
        });
        const data = await response.json();
        return mapFromDB(data);
    },

    async deleteCompany(id) {
        await fetch(`${API_URL}/companies/${id}`, {
            method: 'DELETE'
        });
    }
};

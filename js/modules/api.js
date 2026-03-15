import { getAuthToken } from './auth.js';

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
        canal: comp.Modo_da_empresa,
        site: comp.Site,
        nps: comp.NPS,
        leadSource: comp.Lead,
        healthScore: comp.Health_Score,
        proximoPasso: comp.Data_de_follow_up ? new Date(comp.Data_de_follow_up).toLocaleDateString('pt-BR') : '-',

        // Relacionamentos
        produtos: (comp.company_products || []).map(p => ({
            id: p.id,
            nome: p.Produto_DATI,
            tipoCobranca: p.Tipo_cobranca,
            valorUnitario: p.Valor_unitario != null ? parseFloat(p.Valor_unitario) : null,
            valorMinimo: p.Valor_minimo != null ? parseFloat(p.Valor_minimo) : null,
            valorTotal: p.Valor_total != null ? parseFloat(p.Valor_total) : null,
            cobrancaSetup: p.Cobranca_setup,
            valorSetup: p.Valor_setup != null ? parseFloat(p.Valor_setup) : null,
            qtdUsuarios: p.Qtd_usuarios,
            valorUserAdic: p.Valor_usuario_adicional != null ? parseFloat(p.Valor_usuario_adicional) : null,
            totalHorasHd: p.Total_horas_hd,
            valorAdicHd: p.Valor_adic_hd != null ? parseFloat(p.Valor_adic_hd) : null,
            propostaData: p.Proposta_comercial,
            propostaName: p.Proposta_nome,
            contratoData: p.Contrato,
            contratoName: p.Contrato_nome,
        })),
        produtosNames: (comp.company_products || []).map(p => p.Produto_DATI).filter(Boolean).join(', '),

        contatos: (comp.contacts || []).map(c => ({
            id: c.id,
            nome: c.Nome_do_contato,
            cargo: c.Cargo_do_contato,
            departamento: c.Departamento_do_contato,
            email1: c.Email_1,
            whatsapp: c.WhatsApp,
            linkedin: c.LinkedIn
        })),

        reunioes: (comp.company_meetings || []).filter(r => r.Tipo_reuniao === 'Geral').map(r => ({
            id: r.id,
            data: r.Data_reuniao ? new Date(r.Data_reuniao).toISOString().split('T')[0] : null,
            participantes: r.Participantes,
            temperatura: r.Temperatura,
            link: r.Link_gravacao,
            observacoes: r.Observacoes
        })),

        reunioesCSHistory: (comp.company_meetings || []).filter(r => r.Tipo_reuniao === 'CS').map(r => ({
            id: r.id,
            data: r.Data_reuniao ? new Date(r.Data_reuniao).toISOString().split('T')[0] : null,
            participantes: r.Participantes,
            temperatura: r.Temperatura,
            link: r.Link_gravacao,
            obs: r.Observacoes
        })),

        dashboardsHistory: (comp.company_dashboards || []).map(d => ({
            id: d.id,
            data: d.Data ? new Date(d.Data).toISOString().split('T')[0] : null,
            destinatario: d.Destinatario,
            link: d.Link
        })),

        npsHistory: (comp.company_nps || []).map(n => ({
            id: n.id,
            data: n.Data ? new Date(n.Data).toISOString().split('T')[0] : null,
            destinatario: n.Destinatario,
            formulario: n.Formulario,
            score: n.Score,
            respostasJSON: n.Respostas_JSON
        })),

        chamadosHistory: (comp.company_tickets || []).map(t => ({
            id: t.id,
            data: t.Data ? new Date(t.Data).toISOString().split('T')[0] : null,
            numero: t.Numero,
            resumo: t.Resumo,
            autor: t.Autor,
            link: t.Link
        })),

        csNotes: (comp.company_notes || []).map(n => ({
            id: n.id,
            text: n.Conteudo,
            author: n.Autor,
            date: n.Data ? new Date(n.Data).toLocaleString('pt-BR') : '',
            timestamp: n.Data ? new Date(n.Data).getTime() : Date.now()
        })),

        followUps: (comp.company_followups || []).map(f => ({
            id: f.id,
            data: f.Data_inclusao ? new Date(f.Data_inclusao).toISOString().split('T')[0] : null,
            conteudo: f.Conteudo,
            usuario: f.Usuario,
            area: f.Area,
            proximoContato: f.Data_proximo_contato ? new Date(f.Data_proximo_contato).toISOString().split('T')[0] : null
        }))
    };
}

/**
 * Wrapper fetch autenticado — adiciona o token Clerk automaticamente.
 * @param {string} url
 * @param {RequestInit} options
 */
async function _fetch(url, options = {}) {
    const token = await getAuthToken();
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });
}

export const api = {
    async getCompanies() {
        const response = await _fetch(`${API_URL}/companies`);
        const data = await response.json();
        return Array.isArray(data) ? data.map(mapFromDB) : [];
    },

    async getCompany(id) {
        const response = await _fetch(`${API_URL}/companies/${id}`);
        const data = await response.json();
        return mapFromDB(data);
    },

    async createCompany(companyData) {
        // O companyData enviado pelo migration.js já está no formato DB 10/10
        const response = await _fetch(`${API_URL}/companies`, {
            method: 'POST',
            body: JSON.stringify(companyData)
        });
        const data = await response.json();
        return mapFromDB(data);
    },

    async updateCompany(id, companyData) {
        const response = await _fetch(`${API_URL}/companies/${id}`, {
            method: 'PUT',
            body: JSON.stringify(companyData)
        });
        if (!response.ok) {
            let errorMsg = `Erro ${response.status}`;
            try {
                const errData = await response.json();
                errorMsg = errData.message || errData.error || errorMsg;
            } catch (_) {}
            throw new Error(errorMsg);
        }
        const data = await response.json();
        return mapFromDB(data);
    },

    async deleteCompany(id) {
        const res = await _fetch(`${API_URL}/companies/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Falha ao excluir: HTTP ${res.status}${body ? ' — ' + body : ''}`);
        }
    }
};

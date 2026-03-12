/**
 * ============================================================================
 * Testes Unitários — api.js
 * js/modules/api.js
 * ============================================================================
 * Mock do fetch + getAuthToken para testar toda a camada REST sem rede real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks de módulos ─────────────────────────────────────────────────────────

vi.mock('../../modules/auth.js', () => ({
    getAuthToken: vi.fn().mockResolvedValue('token-de-teste'),
}));

// ─── Import após mock ─────────────────────────────────────────────────────────
// (o import precisa vir DEPOIS do vi.mock para pegar o stub)
const { api } = await import('../../modules/api.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Cria um mock de Response do fetch.
 */
function mockResponse(body, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    };
}

// Empresa no formato do banco (DB shape)
const DB_COMPANY = {
    id: 'abc123',
    Nome_da_empresa: 'Empresa Teste',
    CNPJ_da_empresa: '12.345.678/0001-99',
    Status: 'Cliente Ativo',
    Estado: 'SP',
    Cidade: 'São Paulo',
    Tipo_de_empresa: 'Privada',
    Segmento_da_empresa: 'Tech',
    Modo_da_empresa: 'Direto',
    Site: 'https://teste.com',
    NPS: 9,
    Lead: 'Inbound',
    Health_Score: 85,
    Data_de_follow_up: null,
    company_products: [],
    contacts: [],
    company_meetings: [],
    company_dashboards: [],
    company_nps: [],
    company_tickets: [],
    company_notes: [],
    company_followups: [],
};

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

// ─── getCompanies ─────────────────────────────────────────────────────────────

describe('api.getCompanies()', () => {
    it('retorna array mapeado em caso de sucesso', async () => {
        fetch.mockResolvedValue(mockResponse([DB_COMPANY]));
        const result = await api.getCompanies();
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].nome).toBe('Empresa Teste');
        expect(result[0].cnpj).toBe('12.345.678/0001-99');
    });

    it('retorna array vazio quando API retorna dado não-array', async () => {
        fetch.mockResolvedValue(mockResponse({ error: 'oops' }));
        const result = await api.getCompanies();
        expect(result).toEqual([]);
    });

    it('envia header Authorization com token Clerk', async () => {
        fetch.mockResolvedValue(mockResponse([]));
        await api.getCompanies();
        const [, options] = fetch.mock.calls[0];
        expect(options.headers.Authorization).toBe('Bearer token-de-teste');
    });

    it('faz GET em /api/companies', async () => {
        fetch.mockResolvedValue(mockResponse([]));
        await api.getCompanies();
        expect(fetch.mock.calls[0][0]).toMatch('/api/companies');
    });
});

// ─── getCompany ───────────────────────────────────────────────────────────────

describe('api.getCompany(id)', () => {
    it('retorna empresa mapeada pelo id', async () => {
        fetch.mockResolvedValue(mockResponse(DB_COMPANY));
        const result = await api.getCompany('abc123');
        expect(result.id).toBe('abc123');
        expect(result.nome).toBe('Empresa Teste');
    });

    it('inclui o ID na URL', async () => {
        fetch.mockResolvedValue(mockResponse(DB_COMPANY));
        await api.getCompany('xyz');
        expect(fetch.mock.calls[0][0]).toContain('/api/companies/xyz');
    });

    it('retorna null quando empresa não existe (null body)', async () => {
        fetch.mockResolvedValue(mockResponse(null));
        const result = await api.getCompany('inexistente');
        expect(result).toBeNull();
    });
});

// ─── createCompany ────────────────────────────────────────────────────────────

describe('api.createCompany(data)', () => {
    it('envia POST com body JSON e retorna empresa mapeada', async () => {
        fetch.mockResolvedValue(mockResponse(DB_COMPANY, { status: 201 }));
        const result = await api.createCompany({ Nome_da_empresa: 'Empresa Teste' });
        expect(result.nome).toBe('Empresa Teste');

        const [, options] = fetch.mock.calls[0];
        expect(options.method).toBe('POST');
        expect(options.body).toContain('Empresa Teste');
    });

    it('envia Content-Type correto', async () => {
        fetch.mockResolvedValue(mockResponse(DB_COMPANY));
        await api.createCompany({});
        const [, options] = fetch.mock.calls[0];
        expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('passa dados extras no body sem perder campos', async () => {
        fetch.mockResolvedValue(mockResponse(DB_COMPANY));
        const payload = { Nome_da_empresa: 'Teste', Status: 'Prospect', NPS: 7 };
        await api.createCompany(payload);
        const [, options] = fetch.mock.calls[0];
        const sent = JSON.parse(options.body);
        expect(sent.Status).toBe('Prospect');
        expect(sent.NPS).toBe(7);
    });
});

// ─── updateCompany ────────────────────────────────────────────────────────────

describe('api.updateCompany(id, data)', () => {
    it('envia PUT para /api/companies/:id', async () => {
        fetch.mockResolvedValue(mockResponse(DB_COMPANY));
        await api.updateCompany('abc123', { Nome_da_empresa: 'Novo Nome' });
        const [url, options] = fetch.mock.calls[0];
        expect(url).toContain('/api/companies/abc123');
        expect(options.method).toBe('PUT');
    });

    it('retorna empresa mapeada após update', async () => {
        const updated = { ...DB_COMPANY, Nome_da_empresa: 'Atualizada' };
        fetch.mockResolvedValue(mockResponse(updated));
        const result = await api.updateCompany('abc123', {});
        expect(result.nome).toBe('Atualizada');
    });

    it('body contém apenas os campos enviados', async () => {
        fetch.mockResolvedValue(mockResponse(DB_COMPANY));
        const patch = { Status: 'Churned' };
        await api.updateCompany('abc123', patch);
        const [, options] = fetch.mock.calls[0];
        const sent = JSON.parse(options.body);
        expect(sent.Status).toBe('Churned');
    });
});

// ─── deleteCompany ────────────────────────────────────────────────────────────

describe('api.deleteCompany(id)', () => {
    it('envia DELETE para /api/companies/:id', async () => {
        fetch.mockResolvedValue(mockResponse('', { ok: true }));
        await api.deleteCompany('abc123');
        const [url, options] = fetch.mock.calls[0];
        expect(url).toContain('/api/companies/abc123');
        expect(options.method).toBe('DELETE');
    });

    it('não lança erro quando resposta ok', async () => {
        fetch.mockResolvedValue(mockResponse('', { ok: true }));
        await expect(api.deleteCompany('abc123')).resolves.not.toThrow();
    });

    it('lança erro com mensagem quando resposta não ok (404)', async () => {
        fetch.mockResolvedValue(mockResponse('Not Found', { ok: false, status: 404 }));
        await expect(api.deleteCompany('inexistente')).rejects.toThrow(/404/);
    });

    it('lança erro quando HTTP 500', async () => {
        fetch.mockResolvedValue(mockResponse('Internal Error', { ok: false, status: 500 }));
        await expect(api.deleteCompany('abc')).rejects.toThrow(/500/);
    });
});

// ─── mapFromDB — validação do mapeamento ─────────────────────────────────────

describe('api — mapeamento mapFromDB', () => {
    it('mapeia contatos para formato frontend', async () => {
        const withContacts = {
            ...DB_COMPANY,
            contacts: [{ id: 'c1', Nome_do_contato: 'João', Cargo_do_contato: 'CEO', Email_1: 'joao@emp.com', WhatsApp: '', LinkedIn: '', Departamento_do_contato: '' }]
        };
        fetch.mockResolvedValue(mockResponse([withContacts]));
        const [emp] = await api.getCompanies();
        expect(emp.contatos).toHaveLength(1);
        expect(emp.contatos[0].nome).toBe('João');
        expect(emp.contatos[0].cargo).toBe('CEO');
    });

    it('mapeia produtos para formato frontend', async () => {
        const withProduct = {
            ...DB_COMPANY,
            company_products: [{
                id: 'p1', Produto_DATI: 'DATImonitor', Tipo_cobranca: 'Mensal',
                Valor_unitario: '150.00', Valor_total: '450.00', Qtd_usuarios: 3
            }]
        };
        fetch.mockResolvedValue(mockResponse([withProduct]));
        const [emp] = await api.getCompanies();
        expect(emp.produtos[0].nome).toBe('DATImonitor');
        expect(emp.produtos[0].valorUnitario).toBe(150);
    });

    it('Data_de_follow_up null resulta em proximoPasso = \'-\'', async () => {
        fetch.mockResolvedValue(mockResponse([DB_COMPANY]));
        const [emp] = await api.getCompanies();
        expect(emp.proximoPasso).toBe('-');
    });
});

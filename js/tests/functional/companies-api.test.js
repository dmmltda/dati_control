/**
 * ============================================================================
 * Testes Funcionais — companies API
 * js/tests/functional/companies-api.test.js
 * ============================================================================
 * Testa os endpoints CRUD de empresas contra o servidor real (porta 3099).
 * Exige que o servidor Express esteja rodando (iniciado pelo setup.js).
 *
 * NOTA: Esse servidor usa extractUsuario (Clerk). Para testes funcionais,
 * o servidor é iniciado com TEST_MODE=true que pula a validação de JWT
 * ou usa um token de serviço mockado.
 * ============================================================================
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, seedData } from './setup.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Faz request autenticado para o servidor de teste.
 * Em TEST_MODE o servidor aceita qualquer Bearer token.
 */
async function req(method, path, body = null) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token-functional',
        },
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(`${BASE_URL}${path}`, opts);
}

const get  = (path)       => req('GET', path);
const post = (path, body) => req('POST', path, body);
const put  = (path, body) => req('PUT', path, body);
const del  = (path)       => req('DELETE', path);

// Payload mínimo para criar empresa
function makeCompanyPayload(suffix = Date.now()) {
    return {
        Nome_da_empresa:    `Empresa Funcional ${suffix}`,
        CNPJ_da_empresa:    `${suffix}`.padStart(14, '0').substring(0, 14),
        Status:             'Prospect',
        Segmento_da_empresa: 'Tech',
        Modo_da_empresa:    'Direto',
    };
}

// ─── GET /api/companies ───────────────────────────────────────────────────────

describe('GET /api/companies', () => {
    it('retorna 200 e array de empresas', async () => {
        const res = await get('/api/companies');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('array contém a empresa de seed', async () => {
        const res = await get('/api/companies');
        const data = await res.json();
        const found = data.find(c => c.id === seedData.companyId);
        expect(found).toBeDefined();
    });

    it('sem autenticação → 401', async () => {
        const res = await fetch(`${BASE_URL}/api/companies`);
        expect(res.status).toBe(401);
    });
});

// ─── POST /api/companies ──────────────────────────────────────────────────────

describe('POST /api/companies', () => {
    let createdId = null;

    it('cria empresa e retorna 201', async () => {
        const res = await post('/api/companies', makeCompanyPayload('1001'));
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.id).toBeDefined();
        createdId = data.id;
    });

    it('empresa criada aparece no GET seguinte', async () => {
        if (!createdId) return;
        const res = await get(`/api/companies/${createdId}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe(createdId);
    });

    it('Nome_da_empresa obrigatório → 400', async () => {
        const payload = { Status: 'Prospect' }; // sem nome
        const res = await post('/api/companies', payload);
        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    // Cleanup
    afterAll(async () => {
        if (createdId) {
            await del(`/api/companies/${createdId}`).catch(() => {});
        }
    });
});

// ─── GET /api/companies/:id ───────────────────────────────────────────────────

describe('GET /api/companies/:id', () => {
    it('retorna empresa correta pelo id', async () => {
        const res = await get(`/api/companies/${seedData.companyId}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe(seedData.companyId);
        expect(data.Nome_da_empresa).toBe('__TEST_COMPANY__');
    });

    it('id inexistente → 404', async () => {
        const res = await get('/api/companies/id-que-nao-existe-xyz');
        expect(res.status).toBe(404);
    });

    it('retorna relacionamentos (contacts array)', async () => {
        const res = await get(`/api/companies/${seedData.companyId}`);
        const data = await res.json();
        expect(Array.isArray(data.contacts)).toBe(true);
    });
});

// ─── PUT /api/companies/:id ───────────────────────────────────────────────────

describe('PUT /api/companies/:id', () => {
    it('atualiza Nome_da_empresa e retorna dados atualizados', async () => {
        const novoNome = '__TEST_COMPANY_UPDATED__';
        const res = await put(`/api/companies/${seedData.companyId}`, {
            Nome_da_empresa: novoNome,
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.Nome_da_empresa).toBe(novoNome);
    });

    it('restaura nome original para não impactar outros testes', async () => {
        await put(`/api/companies/${seedData.companyId}`, {
            Nome_da_empresa: '__TEST_COMPANY__',
        });
    });

    it('atualizar company inexistente → 404', async () => {
        const res = await put('/api/companies/inexistente-xyz', { Nome_da_empresa: 'X' });
        expect(res.status).toBe(404);
    });
});

// ─── DELETE /api/companies/:id ────────────────────────────────────────────────

describe('DELETE /api/companies/:id', () => {
    let tempId = null;

    beforeAll(async () => {
        // Cria empresa temporária só para testar delete
        const res = await post('/api/companies', makeCompanyPayload('DELETE_TEST'));
        const data = await res.json();
        tempId = data.id;
    });

    it('delete de empresa existente → 200 ou 204', async () => {
        if (!tempId) return;
        const res = await del(`/api/companies/${tempId}`);
        expect([200, 204]).toContain(res.status);
    });

    it('empresa deletada não aparece mais no GET', async () => {
        if (!tempId) return;
        const res = await get(`/api/companies/${tempId}`);
        expect(res.status).toBe(404);
    });

    it('delete de id inexistente → 404', async () => {
        const res = await del('/api/companies/nao-existe-nunca-xyz');
        expect(res.status).toBe(404);
    });
});

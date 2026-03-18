/**
 * ============================================================================
 * Testes Funcionais — activities API
 * js/tests/functional/activities-api.test.js
 * ============================================================================
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BASE_URL, seedData } from './setup.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function makeActivityPayload(suffix = Date.now()) {
    return {
        activity_type:     'Comentário',
        title:             `Atividade de Teste ${suffix}`,
        description:       'Descrição funcional de teste.',
        department:        'Customer Success',
        activity_datetime: new Date().toISOString(),
        assignees:         ['test-user-id'],
        status:            'Aberta',
    };
}

// ─── POST /api/companies/:id/activities ───────────────────────────────────────

describe('POST /api/companies/:id/activities', () => {
    let createdActivityId = null;

    it('cria atividade válida → 201', async () => {
        const res = await post(
            `/api/companies/${seedData.companyId}/activities`,
            makeActivityPayload('create')
        );
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.id).toBeDefined();
        createdActivityId = data.id;
        seedData.activityIds.push(data.id); // registra para cleanup
    });

    it('title obrigatório ausente → 400', async () => {
        const payload = { activity_type: 'Comentário', description: 'sem título' };
        const res = await post(`/api/companies/${seedData.companyId}/activities`, payload);
        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('empresa inexistente → 404', async () => {
        const res = await post(
            '/api/companies/empresa-que-nao-existe/activities',
            makeActivityPayload()
        );
        expect(res.status).toBe(404);
    });

    afterAll(() => { createdActivityId = null; });
});

// ─── GET /api/companies/:id/activities ────────────────────────────────────────

describe('GET /api/companies/:id/activities', () => {
    let actId = null;

    beforeAll(async () => {
        // Cria atividade para garantir que haja pelo menos uma
        const res = await post(
            `/api/companies/${seedData.companyId}/activities`,
            makeActivityPayload('list')
        );
        const data = await res.json();
        actId = data.id;
        seedData.activityIds.push(actId);
    });

    it('retorna 200 e array', async () => {
        const res = await get(`/api/companies/${seedData.companyId}/activities`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('array contém a atividade criada', async () => {
        const res = await get(`/api/companies/${seedData.companyId}/activities`);
        const data = await res.json();
        const found = data.find(a => a.id === actId);
        expect(found).toBeDefined();
    });

    it('empresa inexistente → 404', async () => {
        const res = await get('/api/companies/nao-existe-xyz/activities');
        expect(res.status).toBe(404);
    });
});

// ─── PUT /api/activities/:id ──────────────────────────────────────────────────

describe('PUT /api/activities/:id', () => {
    let actId = null;

    beforeAll(async () => {
        const res = await post(
            `/api/companies/${seedData.companyId}/activities`,
            makeActivityPayload('update')
        );
        const data = await res.json();
        actId = data.id;
        seedData.activityIds.push(actId);
    });

    it('atualiza status → 200', async () => {
        const res = await put(`/api/activities/${actId}`, { status: 'Concluída' });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.status).toBe('Concluída');
    });

    it('atualiza título → campo correto retornado', async () => {
        const newTitle = `Título Atualizado ${Date.now()}`;
        const res = await put(`/api/activities/${actId}`, { title: newTitle });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.title).toBe(newTitle);
    });

    it('id inexistente → 404', async () => {
        const res = await put('/api/activities/id-falso-xyz', { status: 'Aberta' });
        expect(res.status).toBe(404);
    });
});

// ─── DELETE /api/activities/:id ───────────────────────────────────────────────

describe('DELETE /api/activities/:id', () => {
    let actId = null;

    beforeAll(async () => {
        const res = await post(
            `/api/companies/${seedData.companyId}/activities`,
            makeActivityPayload('delete')
        );
        const data = await res.json();
        actId = data.id;
        // Não adiciona ao seedData.activityIds pois será deletado pelo teste
    });

    it('deleta atividade existente → 200 ou 204', async () => {
        const res = await del(`/api/activities/${actId}`);
        expect([200, 204]).toContain(res.status);
    });

    it('atividade deletada retorna 404 no GET subsequente', async () => {
        // Se a rota GET /api/activities/:id existir
        const res = await get(`/api/activities/${actId}`);
        expect([404, 405]).toContain(res.status); // 405 se rota não existe
    });

    it('deletar id inexistente → 404', async () => {
        const res = await del('/api/activities/nao-existe-definitivamente');
        expect(res.status).toBe(404);
    });
});

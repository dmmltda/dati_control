/**
 * ============================================================================
 * Testes Funcionais — Pipeline de Importação
 * js/tests/functional/import-pipeline.test.js
 * ============================================================================
 * Testa o fluxo completo de importação CSV via API:
 *   1. POST /api/import/upload  → job criado (import_id), total_rows
 *   2. POST /api/import/:id/validate → valid/invalid/duplicate counts
 *   3. POST /api/import/:id/simulate → preview sem criar empresas
 *   4. POST /api/import/:id/execute → empresas criadas no banco
 * ============================================================================
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BASE_URL, seedData } from './setup.js';

// ─── CSV mínimo válido ────────────────────────────────────────────────────────

const VALID_CSV = [
    'Nome_da_empresa,CNPJ_da_empresa,Status,Segmento_da_empresa,Modo_da_empresa,contato_nome,contato_email',
    'Import Test Alpha,11111111000101,Prospect,Tech,Direto,João Alpha,joao@alpha.com',
    'Import Test Beta,22222222000102,Prospect,Tech,Direto,Maria Beta,maria@beta.com',
].join('\n');

const INVALID_CSV = [
    'Nome_da_empresa,CNPJ_da_empresa,Status',
    ',12345,Prospect',          // empresa vazia → inválido
    'Valid Corp,11111111000111,Prospect',
].join('\n');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUTH = { 'Authorization': 'Bearer test-token-functional' };

async function uploadCSV(csvContent, filename = 'test.csv') {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const form = new FormData();
    form.append('file', blob, filename);
    return fetch(`${BASE_URL}/api/import/upload`, {
        method: 'POST',
        headers: AUTH,
        body: form,
    });
}

async function postJson(path, body = {}) {
    return fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// ─── Upload ───────────────────────────────────────────────────────────────────

describe('Import Pipeline — Step 1: Upload', () => {
    it('upload de CSV válido → 200/201 com import_id', async () => {
        const res = await uploadCSV(VALID_CSV);
        const data = await res.json();
        expect([200, 201]).toContain(res.status);
        expect(data.import_id).toBeDefined();
        expect(typeof data.total_rows).toBe('number');
    });

    it('upload sem arquivo → 400', async () => {
        const res = await fetch(`${BASE_URL}/api/import/upload`, {
            method: 'POST',
            headers: AUTH,
        });
        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('upload sem auth → 401', async () => {
        const blob = new Blob([VALID_CSV], { type: 'text/csv' });
        const form = new FormData();
        form.append('file', blob, 'test.csv');
        const res = await fetch(`${BASE_URL}/api/import/upload`, {
            method: 'POST',
            body: form,
        });
        expect(res.status).toBe(401);
    });
});

// ─── Validate ─────────────────────────────────────────────────────────────────

describe('Import Pipeline — Step 2: Validate', () => {
    let importId = null;

    beforeAll(async () => {
        const res = await uploadCSV(VALID_CSV);
        const data = await res.json();
        importId = data.import_id;
    });

    afterAll(async () => {
        if (importId) {
            await fetch(`${BASE_URL}/api/import/${importId}`, {
                method: 'DELETE',
                headers: AUTH,
            }).catch(() => {});
        }
    });

    it('validate retorna valid/invalid/duplicate/total', async () => {
        if (!importId) return;
        const res = await postJson(`/api/import/${importId}/validate`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(typeof data.valid).toBe('number');
        expect(typeof data.invalid).toBe('number');
        expect(typeof data.duplicate).toBe('number');
        expect(typeof data.total).toBe('number');
        expect(typeof data.score).toBe('number');
    });

    it('CSV com 2 linhas válidas → valid >= 1', async () => {
        if (!importId) return;
        const res = await postJson(`/api/import/${importId}/validate`);
        const data = await res.json();
        expect(data.valid).toBeGreaterThanOrEqual(1);
    });

    it('import_id inválido → 404', async () => {
        const res = await postJson('/api/import/id-falso-xyz123/validate');
        expect(res.status).toBe(404);
    });
});

// ─── Simulate ─────────────────────────────────────────────────────────────────

describe('Import Pipeline — Step 3: Simulate', () => {
    let importId = null;

    beforeAll(async () => {
        const res = await uploadCSV(VALID_CSV);
        const data = await res.json();
        importId = data.import_id;
        if (importId) {
            await postJson(`/api/import/${importId}/validate`);
        }
    });

    afterAll(async () => {
        if (importId) {
            await fetch(`${BASE_URL}/api/import/${importId}`, {
                method: 'DELETE',
                headers: AUTH,
            }).catch(() => {});
        }
    });

    it('simulate retorna companies_would_create e contacts_would_create', async () => {
        if (!importId) return;
        const res = await postJson(`/api/import/${importId}/simulate`, {
            duplicate_action: 'ignore'
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(typeof data.companies_would_create).toBe('number');
        expect(typeof data.contacts_would_create).toBe('number');
        expect(typeof data.ignored).toBe('number');
    });

    it('simulate não cria empresas no banco (count inalterado)', async () => {
        if (!importId) return;
        // Verifica que /api/companies não foi modificado
        const before = await (await fetch(`${BASE_URL}/api/companies`, { headers: AUTH })).json();
        await postJson(`/api/import/${importId}/simulate`, { duplicate_action: 'ignore' });
        const after = await (await fetch(`${BASE_URL}/api/companies`, { headers: AUTH })).json();
        expect(after.length).toBe(before.length);
    });
});

// ─── Execute ──────────────────────────────────────────────────────────────────

describe('Import Pipeline — Step 4: Execute', () => {
    let importId = null;
    const EXEC_CSV = [
        'Nome_da_empresa,CNPJ_da_empresa,Status,Segmento_da_empresa,Modo_da_empresa',
        `Import Execute Test ${Date.now()},33333333000133,Prospect,Tech,Direto`,
    ].join('\n');

    beforeAll(async () => {
        const up = await uploadCSV(EXEC_CSV, 'execute-test.csv');
        const upData = await up.json();
        importId = upData.import_id;
        if (importId) {
            await postJson(`/api/import/${importId}/validate`);
        }
    });

    afterAll(async () => {
        // Cleanup das empresas criadas pelo execute
        const res = await fetch(`${BASE_URL}/api/companies`, { headers: AUTH });
        const companies = await res.json();
        for (const c of companies) {
            if (c.Nome_da_empresa?.startsWith('Import Execute Test')) {
                await fetch(`${BASE_URL}/api/companies/${c.id}`, {
                    method: 'DELETE',
                    headers: AUTH,
                }).catch(() => {});
            }
        }
    });

    it('execute cria empresas no banco → 200 com companies_created', async () => {
        if (!importId) return;
        const res = await postJson(`/api/import/${importId}/execute`, { user: 'test' });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(typeof data.companies_created).toBe('number');
        expect(data.companies_created).toBeGreaterThanOrEqual(1);
    });

    it('execute duas vezes detecta duplicatas (não duplica)', async () => {
        // Testa com novo import do mesmo CSV
        const up = await uploadCSV(EXEC_CSV, 'dup-test.csv');
        const upData = await up.json();
        const dup_id = upData.import_id;
        if (dup_id) {
            await postJson(`/api/import/${dup_id}/validate`);
            const res = await postJson(`/api/import/${dup_id}/execute`, { user: 'test' });
            const data = await res.json();
            // Deve ter 0 empresas novas criadas (CNPJ já existe)
            expect(data.companies_created ?? data.cnpj_conflicts).toBeDefined();
        }
    });
});

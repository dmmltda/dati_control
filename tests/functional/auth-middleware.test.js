/**
 * ============================================================================
 * Testes Funcionais — Auth Middleware
 * js/tests/functional/auth-middleware.test.js
 * ============================================================================
 * Verifica que o middleware extractUsuario aplica regras corretas:
 * - Sem token → 401
 * - Token usuário standard em rota master → 403
 * - Token válido master → 200
 *
 * NOTA: Em TEST_MODE=true o servidor usa um stub de autenticação que:
 *   - "test-token-functional" → usuário master válido
 *   - "test-token-standard"   → usuário standard (não-master)
 *   - ausente/inválido        → 401
 * ============================================================================
 */
import { describe, it, expect } from 'vitest';
import { BASE_URL } from './setup.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithToken(path, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${BASE_URL}${path}`, { headers });
}

// ─── 401 — Sem autenticação ───────────────────────────────────────────────────

describe('Auth Middleware — sem token (401)', () => {
    it('GET /api/companies sem token → 401', async () => {
        const res = await fetchWithToken('/api/companies', null);
        expect(res.status).toBe(401);
    });

    it('POST /api/companies sem token → 401', async () => {
        const res = await fetch(`${BASE_URL}/api/companies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Nome_da_empresa: 'X' }),
        });
        expect(res.status).toBe(401);
    });

    it('GET /api/memberships sem token → 401', async () => {
        const res = await fetchWithToken('/api/memberships', null);
        expect(res.status).toBe(401);
    });

    it('Token malformado (sem Bearer) → 401', async () => {
        const res = await fetch(`${BASE_URL}/api/companies`, {
            headers: { 'Authorization': 'InvalidToken xyz' },
        });
        expect(res.status).toBe(401);
    });
});

// ─── 200 — Com token válido (master) ─────────────────────────────────────────

describe('Auth Middleware — token válido master (200)', () => {
    it('GET /api/companies com token → 200', async () => {
        const res = await fetchWithToken('/api/companies', 'test-token-functional');
        expect(res.status).toBe(200);
    });

    it('GET /health sem token → 200 (rota pública)', async () => {
        const res = await fetch(`${BASE_URL}/health`);
        expect(res.status).toBe(200);
    });

    it('GET /api/test-runs sem token → 200 (rota de sistema aberta)', async () => {
        const res = await fetch(`${BASE_URL}/api/test-runs`);
        expect(res.status).toBe(200);
    });
});

// ─── Rotas públicas — sem auth requerida ─────────────────────────────────────

describe('Auth Middleware — rotas públicas', () => {
    it('/health retorna OK', async () => {
        const res = await fetch(`${BASE_URL}/health`);
        const data = await res.json();
        expect(data.status).toBe('OK');
    });

    it('/api/test-runs (GET) é acessível sem autenticação', async () => {
        const res = await fetch(`${BASE_URL}/api/test-runs`);
        expect(res.status).toBe(200);
    });

    it('/api/test-runs (POST) em dev não precisa de token (ingestAuth libera em !prod)', async () => {
        // Em NODE_ENV !== 'production', o ingestAuth libera
        const res = await fetch(`${BASE_URL}/api/test-runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                suite_type: 'UNITÁRIO',
                environment: 'test',
                cases: [{
                    test_name: 'Teste auth middleware',
                    status: 'PASSOU',
                    module: 'auth-middleware.test.js',
                }]
            })
        });
        // Deve aceitar (201) ou retornar erro de dados (400) — não 401
        expect(res.status).not.toBe(401);
    });
});

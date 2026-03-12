/**
 * ============================================================================
 * Setup — Testes Funcionais
 * js/tests/functional/setup.js
 * ============================================================================
 * - Sobe o servidor Express em porta 3099 (isolada da porta 8000 de dev)
 * - Usa variável DATABASE_URL (mesmo banco de dev — apenas limpa dados de teste)
 * - beforeAll: inicia servidor + seed mínimo
 * - afterAll: limpa dados de teste + fecha servidor
 * ============================================================================
 */
import { beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';

// ──────────────────────────────────────────────────────────────────────────────
// Estado global compartilhado entre os arquivos de teste
// ──────────────────────────────────────────────────────────────────────────────

export const TEST_PORT = 3099;
export const BASE_URL = `http://localhost:${TEST_PORT}`;

// IDs criados durante o seed (para cleanup no afterAll)
export const seedData = {
    companyId: null,
    activityIds: [],
};

let _server = null;
let _prisma = null;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Aguarda o servidor estar disponível (máx. 5s).
 */
async function waitForServer(url, maxMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        try {
            const r = await fetch(`${url}/health`);
            if (r.ok) return;
        } catch (_) { /* ainda não subiu */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Servidor não disponível em ${url} após ${maxMs}ms`);
}

// ──────────────────────────────────────────────────────────────────────────────
// beforeAll — sobe servidor + seed
// ──────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
    // ─── 1. Importa dinamicamente o app Express ───────────────────────────────
    // Seta porta de teste antes de importar para que o servidor use 3099
    process.env.PORT = String(TEST_PORT);
    process.env.TEST_MODE = 'true'; // flag usada pelo servidor para pular Clerk

    let app;
    try {
        const mod = await import('../../../../server/index.js');
        app = mod.default || mod.app;
    } catch (err) {
        // Se o módulo não exportar `app` (usa listen direto), cria wrapper
        console.warn('[setup] Servidor não exporta app — usando fetch direto na porta 3099');
        // Nesse caso o servidor já deve estar rodando ou será iniciado externamente.
    }

    if (app) {
        await new Promise((resolve, reject) => {
            _server = app.listen(TEST_PORT, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    await waitForServer(BASE_URL);

    // ─── 2. Seed: cria 1 empresa de teste ─────────────────────────────────────
    try {
        const { PrismaClient } = await import('@prisma/client');
        _prisma = new PrismaClient();

        const { randomUUID } = await import('crypto');
        const testCompanyId = randomUUID();

        await _prisma.companies.create({
            data: {
                id: testCompanyId,
                Nome_da_empresa: '__TEST_COMPANY__',
                CNPJ_da_empresa: '00.000.000/0001-99',
                Status: 'Prospect',
                Segmento_da_empresa: 'Tech',
                Modo_da_empresa: 'Direto',
            }
        });

        seedData.companyId = testCompanyId;
        console.log(`[setup] ✅ Empresa de teste criada: ${testCompanyId}`);

    } catch (err) {
        console.error('[setup] ⚠️ Erro no seed — testes funcionais podem falhar:', err.message);
    }
}, 30000);

// ──────────────────────────────────────────────────────────────────────────────
// afterAll — limpa dados + fecha servidor
// ──────────────────────────────────────────────────────────────────────────────

afterAll(async () => {
    if (_prisma && seedData.companyId) {
        try {
            // Remove atividades criadas durante testes
            if (seedData.activityIds.length > 0) {
                await _prisma.activities.deleteMany({
                    where: { id: { in: seedData.activityIds } }
                });
            }
            // Remove empresa de teste (cascade remove relacionamentos)
            await _prisma.companies.delete({
                where: { id: seedData.companyId }
            });
            console.log('[setup] ✅ Dados de teste removidos.');
        } catch (err) {
            console.warn('[setup] ⚠️ Erro na limpeza:', err.message);
        } finally {
            await _prisma.$disconnect();
        }
    }

    if (_server) {
        await new Promise(resolve => _server.close(resolve));
        console.log('[setup] ✅ Servidor de teste encerrado.');
    }
}, 15000);

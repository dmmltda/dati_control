/**
 * ============================================================================
 * Base Fixture — Helpers compartilhados por todos os specs
 * js/tests/e2e/fixtures/base.js
 * ============================================================================
 * Estende o `test` do Playwright com fixtures customizadas:
 * - authenticatedPage: página já logada (usa storageState do setup)
 * - apiContext: cliente fetch autenticado para seed/cleanup de dados
 * - testCompanyId: empresa criada para o teste, removida no afterEach
 * ============================================================================
 */
import { test as base, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const TOKEN    = 'test-token-e2e'; // aceito pelo servidor em TEST_MODE=true

// ─── Fixture: apiContext (fetch autenticado) ──────────────────────────────────

export const test = base.extend({

    // Contexto HTTP autenticado para operações de API direta
    apiContext: async ({ request }, use) => {
        // request já está configurado com baseURL pelo playwright.config.js
        // Adiciona o Authorization header
        await use({
            get:  (path)       => request.get(path,  { headers: { Authorization: `Bearer ${TOKEN}` } }),
            post: (path, body) => request.post(path, { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, data: body }),
            put:  (path, body) => request.put(path,  { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, data: body }),
            del:  (path)       => request.delete(path, { headers: { Authorization: `Bearer ${TOKEN}` } }),
        });
    },

    // Empresa de teste criada antes de cada spec que a usa
    testCompany: async ({ apiContext }, use) => {
        const suffix = Date.now().toString(36).toUpperCase();
        const payload = {
            Nome_da_empresa:    `__E2E_TEST_${suffix}__`,
            Status:              'Prospect',
            Segmento_da_empresa: 'Tech',
            Modo_da_empresa:     'Direto',
        };

        let companyId = null;
        try {
            const res  = await apiContext.post('/api/companies', payload);
            const data = await res.json();
            companyId  = data.id;
        } catch (err) {
            console.error('[fixture] Erro ao criar empresa de teste:', err.message);
        }

        // Disponibiliza { id, nome } para o teste
        await use({ id: companyId, nome: payload.Nome_da_empresa });

        // Cleanup: remove empresa após o teste
        if (companyId) {
            await apiContext.del(`/api/companies/${companyId}`).catch(() => {});
        }
    },

    // Limpa empresas criadas durante o teste por nome padrão
    cleanupTestCompanies: async ({ apiContext }, use) => {
        await use();
        // afterAll: remove quaisquer empresas que comecem com __E2E_
        try {
            const res       = await apiContext.get('/api/companies');
            const companies = await res.json();
            for (const c of (Array.isArray(companies) ? companies : [])) {
                if (c.Nome_da_empresa?.startsWith('__E2E_') ||
                    c.Nome_da_empresa?.startsWith('E2E Corp') ||
                    c.Nome_da_empresa?.startsWith('E2E Min') ||
                    c.Nome_da_empresa?.startsWith('Import E2E')) {
                    await apiContext.del(`/api/companies/${c.id}`).catch(() => {});
                }
            }
        } catch (_) { /* silencia — cleanup best-effort */ }
    },
});

export { expect };

// ─── Helpers de navegação reutilizáveis ──────────────────────────────────────

/**
 * Navega para a lista de empresas clicando no menu lateral.
 */
export async function goToCompanyList(page) {
    await page.click('[data-view="company-list"]');
    await expect(page.locator('#view-company-list')).toBeVisible({ timeout: 8000 });
}

/**
 * Navega para o formulário de nova empresa.
 */
export async function goToNewCompany(page) {
    await goToCompanyList(page);
    // Botão flutuante ou botão no header
    const btn = page.locator('#btn-new-company, .btn-new-company').first();
    await btn.click();
    await expect(page.locator('#view-company-form')).toBeVisible({ timeout: 8000 });
}

/**
 * Abre uma empresa pelo nome (pesquisa e clica).
 */
export async function openCompanyByName(page, nome) {
    await goToCompanyList(page);
    await page.fill('#search-empresa', nome);
    await page.waitForTimeout(500); // debounce da busca
    const link = page.locator('#company-table-body').getByText(nome).first();
    await link.click();
    await expect(page.locator('#view-company-form')).toBeVisible({ timeout: 8000 });
}

/**
 * Preenche o formulário de empresa com os dados fornecidos.
 */
export async function fillCompanyForm(page, data) {
    if (data.nome)    await page.fill('#emp-nome', data.nome);
    if (data.status)  await page.selectOption('#emp-status', data.status).catch(() => {});
    if (data.tipo)    await page.selectOption('#emp-tipo', data.tipo).catch(() => {});
    if (data.segmento) await page.selectOption('#emp-segmento', data.segmento).catch(() => {});
    if (data.modo)    await page.selectOption('#emp-canal', data.modo).catch(() => {});
    if (data.estado)  await page.selectOption('#emp-estado', data.estado).catch(() => {});
    if (data.cidade)  await page.fill('#emp-cidade', data.cidade).catch(() => {});
    if (data.site)    await page.fill('#emp-site', data.site).catch(() => {});
    if (data.cnpj)    await page.fill('#emp-cnpj', data.cnpj).catch(() => {});
}

/**
 * Salva o formulário e aguarda retorno para lista.
 */
export async function saveCompanyForm(page) {
    await page.click('#btn-save-company, button[type="submit"]');
    await expect(page.locator('#view-company-list')).toBeVisible({ timeout: 10000 });
}

/**
 * Navega para a view LOG.
 */
export async function goToLog(page) {
    await page.click('[data-view="log"]');
    await expect(page.locator('#view-log')).toBeVisible({ timeout: 8000 });
}

/**
 * Navega para o dashboard.
 */
export async function goToDashboard(page) {
    await page.click('[data-view="dashboard"], [data-view="home"]');
    await page.waitForTimeout(500);
}

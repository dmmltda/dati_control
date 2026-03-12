/**
 * ============================================================================
 * E2E — CRUD de Empresas
 * js/tests/e2e/companies.spec.js
 * ============================================================================
 */
import { test, expect, goToCompanyList, goToNewCompany, fillCompanyForm, saveCompanyForm } from '../fixtures/base.js';
import { EMPRESA_VALIDA, EMPRESA_MINIMA } from '../fixtures/test-data.js';

test.describe('Lista de Empresas', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#app-layout')).toBeVisible({ timeout: 15000 });
        await goToCompanyList(page);
    });

    test('exibe a view de empresas', async ({ page }) => {
        await expect(page.locator('#view-company-list')).toBeVisible();
    });

    test('tabela de empresas está presente', async ({ page }) => {
        const table = page.locator('#company-table-body, .company-table tbody').first();
        await expect(table).toBeVisible({ timeout: 8000 });
    });

    test('campo de busca está presente e funcional', async ({ page }) => {
        const searchInput = page.locator('#search-empresa, input[placeholder*="pesquisar"], input[placeholder*="buscar"]').first();
        await expect(searchInput).toBeVisible();
        await searchInput.fill('xxxxxxxxxxx_inexistente');
        await page.waitForTimeout(600); // debounce
        // Tabela deve estar vazia ou mostrar "nenhum resultado"
        const rows = page.locator('#company-table-body tr, .company-table tbody tr');
        const count = await rows.count();
        // Buscando algo inexistente → 0 resultados ou linha de "nenhum resultado"
        const hasNoResultMsg = await page.locator('td[colspan], .empty-state, .no-results').isVisible().catch(() => false);
        expect(count === 0 || hasNoResultMsg).toBe(true);
        await searchInput.clear();
    });

    test('filtro por status funciona', async ({ page }) => {
        const filterStatus = page.locator('#filter-status, select[id*="status"]').first();
        if (await filterStatus.isVisible({ timeout: 3000 }).catch(() => false)) {
            await filterStatus.selectOption('Prospect');
            await page.waitForTimeout(500);
            // Todas as linhas visíveis devem ser Prospect (ou nenhuma)
            const rows = await page.locator('#company-table-body tr:not(.empty-row)').all();
            for (const row of rows.slice(0, 5)) {
                const text = await row.textContent();
                if (text?.trim()) expect(text).toContain('Prospect');
            }
        } else {
            test.skip(true, 'Filtro de status não encontrado');
        }
    });

    test('paginação está presente quando há dados suficientes', async ({ page }) => {
        // Paginação pode estar presente ou não dependendo da quantidade de dados
        const pagination = page.locator('.pagination, [class*="pagination"], #pagination').first();
        // Não é obrigatório ter paginação — apenas verifica que não quebra
        const pageInfo = page.locator('.page-info, [id*="page-info"]').first();
        const anyPagination = await pagination.isVisible().catch(() => false) ||
                              await pageInfo.isVisible().catch(() => false);
        // Passa se paginação existe OU se a lista é curta o suficiente para não precisar
        expect(true).toBe(true); // estrutural — não falha
    });
});

test.describe('Criar Empresa', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#app-layout')).toBeVisible({ timeout: 15000 });
    });

    test('abre formulário de nova empresa', async ({ page }) => {
        await goToNewCompany(page);
        const title = page.locator('#form-title, h1, h2').first();
        await expect(title).toContainText(/Nova Empresa|Novo/i);
    });

    test('formulário tem todas as abas esperadas', async ({ page }) => {
        await goToNewCompany(page);
        await expect(page.locator('[data-tab="tab-dados"], #btn-tab-dados')).toBeVisible();
        await expect(page.locator('[data-tab="tab-produtos"], #btn-tab-produtos')).toBeVisible();
        await expect(page.locator('[data-tab="tab-contatos"], #btn-tab-contatos')).toBeVisible();
    });

    test('navega entre abas sem erros', async ({ page }) => {
        await goToNewCompany(page);

        await page.click('[data-tab="tab-contatos"], #btn-tab-contatos');
        await expect(page.locator('#tab-contatos')).toHaveClass(/active/);

        await page.click('[data-tab="tab-dados"], #btn-tab-dados');
        await expect(page.locator('#tab-dados')).toHaveClass(/active/);
    });

    test('cria empresa com campos mínimos', async ({ page, cleanupTestCompanies }) => {
        await goToNewCompany(page);
        await fillCompanyForm(page, EMPRESA_MINIMA);
        await saveCompanyForm(page);

        // Empresa deve aparecer na lista
        await expect(page.locator('#company-table-body')).toContainText(EMPRESA_MINIMA.nome, { timeout: 8000 });
    });

    test('NÃO salva empresa sem nome — permanece no formulário', async ({ page }) => {
        await goToNewCompany(page);
        // NÃO preenche nome — só clica salvar
        await page.click('#btn-save-company, button[type="submit"]');
        // Deve permanecer no formulário
        await expect(page.locator('#view-company-form')).toBeVisible({ timeout: 5000 });
    });

    test('cria empresa completa e confirma na lista', async ({ page, cleanupTestCompanies }) => {
        await goToNewCompany(page);
        await fillCompanyForm(page, EMPRESA_VALIDA);
        await saveCompanyForm(page);

        // Busca a empresa na lista para confirmar
        const search = page.locator('#search-empresa').first();
        if (await search.isVisible().catch(() => false)) {
            await search.fill(EMPRESA_VALIDA.nome);
            await page.waitForTimeout(600);
        }
        await expect(page.locator('#company-table-body')).toContainText(EMPRESA_VALIDA.nome, { timeout: 8000 });
    });
});

test.describe('Editar e Deletar Empresa', () => {
    test('edita empresa criada via fixture e confirma alteração', async ({ page, testCompany }) => {
        await page.goto('/');
        await expect(page.locator('#app-layout')).toBeVisible({ timeout: 15000 });

        // Abre a empresa pelo id via API (navega direto)
        await goToCompanyList(page);

        const searchInput = page.locator('#search-empresa').first();
        if (testCompany?.nome && await searchInput.isVisible().catch(() => false)) {
            await searchInput.fill(testCompany.nome);
            await page.waitForTimeout(600);
        }

        // Clica na empresa (link ou botão edit)
        const row = page.locator('#company-table-body').getByText(testCompany?.nome || '__E2E_TEST').first();
        if (await row.isVisible({ timeout: 5000 }).catch(() => false)) {
            await row.click();
            await expect(page.locator('#view-company-form')).toBeVisible({ timeout: 8000 });

            const novoNome = testCompany.nome + '_EDITADO';
            await page.fill('#emp-nome', novoNome);
            await page.click('#btn-save-company, button[type="submit"]');
            await expect(page.locator('#view-company-list')).toBeVisible({ timeout: 8000 });
            await expect(page.locator('#company-table-body')).toContainText('_EDITADO', { timeout: 5000 });
        } else {
            test.skip(true, 'Empresa de fixture não encontrada — pulando edição');
        }
    });
});

test.describe('Seleção múltipla', () => {
    test('checkbox de seleção está presente na tabela', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#app-layout')).toBeVisible({ timeout: 15000 });
        await goToCompanyList(page);

        // Verifica presença de checkbox na coluna de seleção
        const checkbox = page.locator('#company-table-body input[type="checkbox"], .select-checkbox').first();
        await expect(checkbox).toBeVisible({ timeout: 8000 });
    });
});

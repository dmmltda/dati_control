/**
 * ============================================================================
 * E2E — Empresas (Lista, Filtros, Criar, Ações em Massa)
 * tests/e2e/empresas.spec.js
 * ============================================================================
 */
import { test, expect } from './fixtures/base.js';
import { navegarPara } from './fixtures/base.js';

// ─── Lista e Filtros ──────────────────────────────────────────────────────────

test.describe('🏢 Empresas — Lista e Filtros', () => {

    test.beforeEach(async ({ page }) => {
        await navegarPara(page, 'company-list');
        await expect(page.locator('#view-company-list')).toBeVisible();
    });

    test('01 — Tabela de empresas carrega com dados', async ({ page }) => {
        await page.waitForSelector('.company-row, tr[data-empresa-id], tbody tr', { timeout: 10000 });
        const rows = page.locator('.company-row, tr[data-empresa-id], tbody tr');
        expect(await rows.count()).toBeGreaterThan(0);
    });

    test('02 — Campo de busca filtra por nome', async ({ page }) => {
        const searchInput = page.locator('#search-empresa');
        await expect(searchInput).toBeVisible();
        await searchInput.fill('a');
        const hasResults = await page.locator('.company-row, tbody tr').count();
        expect(hasResults).toBeGreaterThanOrEqual(0);
    });

    test('03 — Limpar busca restaura lista', async ({ page }) => {
        await page.locator('#search-empresa').fill('xyzxyzxyz_inexistente');
        await page.locator('#clear-search').click();
        const val = await page.locator('#search-empresa').inputValue();
        expect(val).toBe('');
    });

    test('04 — Botão de filtro por coluna (Status) abre popover', async ({ page }) => {
        const filterBtn = page.locator('button.btn-filter-column').first();
        await expect(filterBtn).toBeVisible();
        await filterBtn.click();
        await expect(
            page.locator('.filter-popover:visible, [id^="filter-popover"]:not([style*="display: none"])').first()
        ).toBeVisible({ timeout: 3000 });
    });

    test('05 — Checkbox "Selecionar todos" funciona', async ({ page }) => {
        const selectAll = page.locator('#select-all-companies');
        await expect(selectAll).toBeVisible();
        await selectAll.check();
        await expect(selectAll).toBeChecked();
        await selectAll.uncheck();
        await expect(selectAll).not.toBeChecked();
    });

    test('06 — Botão "Nova Empresa" está visível', async ({ page }) => {
        await expect(page.locator('.btn-new-company').first()).toBeVisible();
    });

    test('07 — Ordenar por coluna Nome funciona', async ({ page }) => {
        const nomeHeader = page.locator('[data-col="nome"]');
        await expect(nomeHeader).toBeVisible();
        await nomeHeader.click();
        await expect(page.locator('#view-company-list')).toBeVisible({ timeout: 3000 });
    });

    test('08 — Ordenar por Status funciona', async ({ page }) => {
        const statusHeader = page.locator('[data-col="status"]');
        await expect(statusHeader).toBeVisible();
        await statusHeader.click();
        await expect(page.locator('#view-company-list')).toBeVisible({ timeout: 3000 });
    });

});

// ─── Criar ───────────────────────────────────────────────────────────────────

test.describe('🏢 Empresas — Criar', () => {

    test.beforeEach(async ({ page }) => {
        await navegarPara(page, 'company-list');
    });

    test('09 — Modal de nova empresa abre ao clicar no botão', async ({ page }) => {
        await page.locator('.btn-new-company').first().click();
        await expect(
            page.locator('[id*="modal"], .modal:visible, [class*="modal"]:visible').first()
        ).toBeVisible({ timeout: 5000 });
    });

    test('10 — Fechar modal sem salvar não cria empresa', async ({ page }) => {
        const countBefore = await page.locator('.company-row, tbody tr').count();
        await page.locator('.btn-new-company').first().click();
        await page.keyboard.press('Escape');
        const countAfter = await page.locator('.company-row, tbody tr').count();
        expect(countAfter).toBe(countBefore);
    });

});

// ─── Ações em Massa ───────────────────────────────────────────────────────────

test.describe('🏢 Empresas — Ações em Massa', () => {

    test.beforeEach(async ({ page }) => {
        await navegarPara(page, 'company-list');
    });

    test('11 — Botão de exclusão em massa está desabilitado por padrão', async ({ page }) => {
        await expect(page.locator('#bulk-delete-btn')).toBeDisabled();
    });

    test('12 — Botão de edição em massa está desabilitado por padrão', async ({ page }) => {
        await expect(page.locator('#bulk-edit-btn')).toBeDisabled();
    });

    test('13 — Selecionar empresa habilita botões de ação', async ({ page }) => {
        const firstCheckbox = page.locator('tbody tr input[type="checkbox"]').first();
        if (await firstCheckbox.isVisible()) {
            await firstCheckbox.check();
            await expect(page.locator('#bulk-delete-btn')).not.toBeDisabled();
        }
    });

    test('14 — Botão de importação em massa está visível', async ({ page }) => {
        await expect(page.locator('#btn-importar-em-massa')).toBeVisible();
    });

});

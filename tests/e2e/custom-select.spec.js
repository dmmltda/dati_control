/**
 * ============================================================================
 * E2E — Custom Select (Componente Crítico)
 * tests/e2e/custom-select.spec.js
 * ============================================================================
 * Usa o storageState do fixture base.js (autenticado) para ter acesso
 * a páginas com selects. A URL é relativa via baseURL do playwright.config.js.
 */
import { test, expect } from './fixtures/base.js';

// ─── Componente genérico ──────────────────────────────────────────────────────

test.describe('🎛️ Custom Select — Componente', () => {

    test.beforeEach(async ({ page }) => {
        // Vai para raiz do app (já autenticado via storageState)
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('01 — Select abre ao clicar', async ({ page }) => {
        const select = page.locator('[data-custom-select], .custom-select, [class*="custom-select"]').first();
        if (!await select.isVisible()) test.skip();

        await select.click();
        await expect(
            page.locator('[class*="dropdown"], [class*="options"], [class*="select-list"]').first()
        ).toBeVisible({ timeout: 3000 });
    });

    test('02 — Select fecha ao pressionar Escape', async ({ page }) => {
        const select = page.locator('[data-custom-select], .custom-select').first();
        if (!await select.isVisible()) test.skip();

        await select.click();
        await page.keyboard.press('Escape');
        await expect(
            page.locator('[class*="dropdown"]:visible, [class*="options"]:visible').first()
        ).not.toBeVisible({ timeout: 2000 });
    });

    test('03 — Select fecha ao clicar fora', async ({ page }) => {
        const select = page.locator('[data-custom-select], .custom-select').first();
        if (!await select.isVisible()) test.skip();

        await select.click();
        await page.mouse.click(10, 10);
        await expect(
            page.locator('[class*="dropdown"]:visible').first()
        ).not.toBeVisible({ timeout: 2000 });
    });

    test('04 — Selecionar opção atualiza o valor', async ({ page }) => {
        const select = page.locator('[data-custom-select], .custom-select').first();
        if (!await select.isVisible()) test.skip();

        await select.click();
        const firstOption = page.locator('[class*="option"], [class*="item"]').first();
        const optionText = await firstOption.textContent();
        await firstOption.click();
        await expect(select).toContainText(optionText?.trim() || '');
    });

    test('05 — Navegação por teclado funciona', async ({ page }) => {
        const select = page.locator('[data-custom-select], .custom-select').first();
        if (!await select.isVisible()) test.skip();

        await select.click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(
            page.locator('[class*="dropdown"]:visible').first()
        ).not.toBeVisible({ timeout: 2000 });
    });

});

// ─── Selects em Contexto (TODO) ───────────────────────────────────────────────

test.describe('🎛️ Selects em Contexto', () => {

    test('Select de Status da Empresa funciona', async ({ page }) => {
        await page.goto('/');
        // TODO: navegar até o modal de empresa e testar o select de status
        test.skip();
    });

    test('Select de Tipo de Atividade funciona', async ({ page }) => {
        await page.goto('/');
        // TODO: navegar até criar atividade e testar o select
        test.skip();
    });

    test('Select de Responsável em Tasks funciona', async ({ page }) => {
        await page.goto('/');
        // TODO: navegar até kanban e testar o select de responsável
        test.skip();
    });

});

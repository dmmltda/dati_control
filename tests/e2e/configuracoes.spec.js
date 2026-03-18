/**
 * ============================================================================
 * E2E — Configurações (Usuários + Gabi IA)
 * tests/e2e/configuracoes.spec.js
 * ============================================================================
 */
import { test, expect } from './fixtures/base.js';
import { navegarPara } from './fixtures/base.js';

// ─── Configurações — Usuários ─────────────────────────────────────────────────

test.describe('⚙️ Configurações — Usuários', () => {

    test.beforeEach(async ({ page }) => {
        await navegarPara(page, 'config-usuarios');
    });

    test('01 — Página de usuários carrega', async ({ page }) => {
        await expect(
            page.locator('[id*="usuarios"], [class*="usuarios"], [id*="users"], [class*="users"]').first()
        ).toBeVisible({ timeout: 8000 });
    });

    test('02 — Lista de usuários tem pelo menos 1 usuário', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const userItems = page.locator('[class*="user-item"], [class*="usuario-item"], tbody tr').first();
        await expect(userItems).toBeVisible({ timeout: 8000 });
    });

    test('03 — Nenhum erro de servidor', async ({ page }) => {
        /** @type {string[]} */
        const errors = [];
        page.on('response', r => { if (r.status() >= 500) errors.push(r.url()); });
        await page.waitForLoadState('networkidle');
        expect(errors).toHaveLength(0);
    });

    test('04 — Botão de convidar usuário está visível', async ({ page }) => {
        const inviteBtn = page.locator(
            'button:has-text("Convidar"), button:has-text("Adicionar"), button:has-text("Novo")'
        ).first();
        await expect(inviteBtn).toBeVisible({ timeout: 5000 });
    });

    test('05 — Modal de convite abre ao clicar no botão', async ({ page }) => {
        const inviteBtn = page.locator(
            'button:has-text("Convidar"), button:has-text("Adicionar"), button:has-text("Novo")'
        ).first();
        await inviteBtn.click();
        await expect(
            page.locator('[id*="modal"]:visible, .modal:visible, [id*="invite"]:visible').first()
        ).toBeVisible({ timeout: 5000 });
    });

    test('06 — Modal de convite fecha com Escape', async ({ page }) => {
        const inviteBtn = page.locator(
            'button:has-text("Convidar"), button:has-text("Adicionar"), button:has-text("Novo")'
        ).first();
        await inviteBtn.click();
        await page.locator('[id*="modal"]:visible, .modal:visible, [id*="invite"]:visible').first()
            .waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        await page.keyboard.press('Escape');
        await expect(
            page.locator('[id*="modal"], .modal').first()
        ).not.toBeVisible({ timeout: 3000 });
    });

});

// ─── Configurações — Gabi IA ──────────────────────────────────────────────────

test.describe('⚙️ Configurações — Gabi IA', () => {

    test.beforeEach(async ({ page }) => {
        await navegarPara(page, 'config-gabi');
    });

    test('07 — Página de configurações Gabi carrega', async ({ page }) => {
        await expect(
            page.locator('[id*="gabi"], [class*="gabi"]').first()
        ).toBeVisible({ timeout: 8000 });
    });

    test('08 — Nenhum erro de servidor', async ({ page }) => {
        /** @type {string[]} */
        const errors = [];
        page.on('response', r => { if (r.status() >= 500) errors.push(r.url()); });
        await page.waitForLoadState('networkidle');
        expect(errors).toHaveLength(0);
    });

});

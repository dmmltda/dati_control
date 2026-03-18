/**
 * ============================================================================
 * E2E — Monitoramento (Audit Log, Relatórios, Logs de Testes)
 * tests/e2e/monitoramento.spec.js
 * ============================================================================
 */
import { test, expect } from './fixtures/base.js';
import { navegarPara } from './fixtures/base.js';

// ─── Audit Log ────────────────────────────────────────────────────────────────

test.describe('📋 Audit Log — Histórico de Alterações', () => {

    test.beforeEach(async ({ page }) => {
        await navegarPara(page, 'audit-log');
    });

    test('01 — Página de audit log carrega', async ({ page }) => {
        await expect(
            page.locator('[id*="audit"], [class*="audit"]').first()
        ).toBeVisible({ timeout: 8000 });
    });

    test('02 — Nenhum erro de servidor', async ({ page }) => {
        /** @type {string[]} */
        const errors = [];
        page.on('response', r => { if (r.status() >= 500) errors.push(r.url()); });
        await page.waitForLoadState('networkidle');
        expect(errors).toHaveLength(0);
    });

    test('03 — Nenhum erro JS crítico', async ({ page }) => {
        /** @type {string[]} */
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.waitForLoadState('networkidle');
        const critical = errors.filter(e => !e.includes('favicon'));
        expect(critical).toHaveLength(0);
    });

});

// ─── Relatórios ───────────────────────────────────────────────────────────────

test.describe('📈 Relatórios', () => {

    test.beforeEach(async ({ page }) => {
        await navegarPara(page, 'reports');
    });

    test('04 — Página de relatórios carrega', async ({ page }) => {
        await expect(
            page.locator('[id*="report"], [class*="report"]').first()
        ).toBeVisible({ timeout: 8000 });
    });

    test('05 — Nenhum erro de servidor', async ({ page }) => {
        /** @type {string[]} */
        const errors = [];
        page.on('response', r => { if (r.status() >= 500) errors.push(r.url()); });
        await page.waitForLoadState('networkidle');
        expect(errors).toHaveLength(0);
    });

});

// ─── Logs de Testes ───────────────────────────────────────────────────────────

test.describe('🧪 Logs de Testes', () => {

    test.beforeEach(async ({ page }) => {
        await navegarPara(page, 'log');
    });

    test('06 — Página de logs carrega', async ({ page }) => {
        await expect(
            page.locator('[id*="log"], [class*="log"]').first()
        ).toBeVisible({ timeout: 8000 });
    });

});

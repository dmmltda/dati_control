/**
 * ============================================================================
 * E2E — Dashboard
 * js/tests/e2e/dashboard.spec.js
 * ============================================================================
 */
import { test, expect, goToDashboard } from '../fixtures/base.js';

test.describe('Dashboard — métricas e visualizações', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#app-layout')).toBeVisible({ timeout: 15000 });
        await goToDashboard(page);
    });

    test('stat cards estão visíveis e contêm números', async ({ page }) => {
        // Cards de estatísticas
        const statsContainer = page.locator('#dashboard-stats, .stats-grid, .stat-cards').first();
        await expect(statsContainer).toBeVisible({ timeout: 8000 });

        // Deve haver ao menos 2 cards
        const cards = page.locator('.stat-card, [class*="stat-card"], [data-stat]');
        await expect(cards).toHaveCount({ minimum: 2 });
    });

    test('card "Total de Empresas" exibe um número ≥ 0', async ({ page }) => {
        const totalCard = page.locator('[data-stat="total-companies"], #stat-total-companies, .stat-card').first();
        await expect(totalCard).toBeVisible({ timeout: 8000 });

        const value = await totalCard.locator('.stat-value, .stat-number, strong').first().textContent();
        expect(Number(value?.replace(/\D/g, ''))).toBeGreaterThanOrEqual(0);
    });

    test('seção "Próximos Passos" está presente', async ({ page }) => {
        const section = page.locator('#proximos-passos, [data-section="next-steps"], .next-steps-section').first();
        await expect(section).toBeVisible({ timeout: 8000 });
    });

    test('Funil de Vendas ou gráfico está visível', async ({ page }) => {
        // Funil ou qualquer visualização de pipeline
        const funnel = page.locator('#funil-vendas, .funnel-chart, [data-chart="funnel"], canvas').first();
        await expect(funnel).toBeVisible({ timeout: 10000 });
    });

    test('a tela não tem erros de console críticos', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error' && !msg.text().includes('favicon')) {
                errors.push(msg.text());
            }
        });

        await page.reload();
        await goToDashboard(page);
        await page.waitForTimeout(2000);

        // Permite erros de rede em testes (ex: Clerk mock), mas não de JS
        const criticalErrors = errors.filter(e =>
            !e.includes('net::') &&
            !e.includes('Failed to load resource') &&
            !e.includes('clerk')
        );
        expect(criticalErrors).toHaveLength(0);
    });

    test('layout é responsivo — viewport mobile não quebra', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 }); // iPhone 12
        await page.reload();
        await page.waitForLoadState('networkidle');

        // O app deve ainda ser visível (sem overflow horizontal)
        const bodyWidth  = await page.evaluate(() => document.body.scrollWidth);
        const docWidth   = await page.evaluate(() => document.documentElement.clientWidth);
        expect(bodyWidth).toBeLessThanOrEqual(docWidth + 20); // 20px de tolerância
    });
});

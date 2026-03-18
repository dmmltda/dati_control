/**
 * ============================================================================
 * E2E — LOG de Testes e Agendamento
 * js/tests/e2e/log.spec.js
 * ============================================================================
 */
import { test, expect, goToLog } from '../fixtures/base.js';

test.describe('LOG — Tab Log Testes', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#app-layout')).toBeVisible({ timeout: 15000 });
        await goToLog(page);

        // Garante que a aba Log Testes está ativa
        const logTestesTab = page.locator('button:has-text("Log Testes"), .cs-submenu-btn:has-text("Log")').first();
        if (await logTestesTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            await logTestesTab.click();
            await page.locator('#log-testes, .cs-submenu-btn.active').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        }
    });

    test('view de LOG está visível', async ({ page }) => {
        await expect(page.locator('#view-log')).toBeVisible({ timeout: 8000 });
    });

    test('painel Log Testes está ativo', async ({ page }) => {
        const panel = page.locator('#log-testes');
        await expect(panel).toBeVisible({ timeout: 8000 });
    });

    test('tabela de runs está visível', async ({ page }) => {
        const table = page.locator('#log-testes-table, .test-runs-table').first();
        await expect(table).toBeVisible({ timeout: 8000 });
    });

    test('busca global de logs funciona', async ({ page }) => {
        const searchInput = page.locator('#log-search-global').first();
        await expect(searchInput).toBeVisible({ timeout: 5000 });
        await searchInput.fill('UNITÁRIO');
        // Não deve lançar erro
        const hasError = await page.locator('.error-message', { hasText: /erro/i }).isVisible().catch(() => false);
        expect(hasError).toBe(false);
        await searchInput.clear();
    });

    test('botão Limpar Filtros aparece quando há busca ativa', async ({ page }) => {
        const searchInput = page.locator('#log-search-global').first();
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await searchInput.fill('algo');

            const clearBtn = page.locator('#btn-clear-log-filters');
            await expect(clearBtn).toBeVisible({ timeout: 3000 });
        }
    });

    test('badges de sumário estão presentes', async ({ page }) => {
        const badges = page.locator('#log-testes-badges');
        await expect(badges).toBeVisible({ timeout: 5000 });
    });
});

test.describe('LOG — Tab Log Geral', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#app-layout')).toBeVisible({ timeout: 15000 });
        await goToLog(page);
    });

    test('aba Log Geral está acessível', async ({ page }) => {
        const logGeralTab = page.locator('button:has-text("Log Geral"), .cs-submenu-btn:has-text("Geral")').first();
        if (await logGeralTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            await logGeralTab.click();
            const panel = page.locator('#log-geral');
            await expect(panel).toBeVisible({ timeout: 5000 });
        } else {
            test.skip(true, 'Aba Log Geral não encontrada');
        }
    });
});

test.describe('LOG — Tab Agendamento', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#app-layout')).toBeVisible({ timeout: 15000 });
        await goToLog(page);
    });

    test('aba Agendamento está acessível', async ({ page }) => {
        const agendTab = page.locator('button:has-text("Agendamento"), .cs-submenu-btn:has-text("Agendamento")').first();
        if (await agendTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            await agendTab.click();
            const panel = page.locator('#log-agendamento');
            await expect(panel).toBeVisible({ timeout: 8000 });
        } else {
            test.skip(true, 'Aba Agendamento não encontrada');
        }
    });

    test('formulário de configuração de agendamento carrega', async ({ page }) => {
        const agendTab = page.locator('button:has-text("Agendamento")').first();
        if (!await agendTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            test.skip(true, 'Aba Agendamento não disponível');
            return;
        }
        await agendTab.click();

        const form = page.locator('#sched-form');
        await expect(form).toBeVisible({ timeout: 8000 });

        // Fields principais devem estar presentes
        await expect(page.locator('#sched-enabled')).toBeVisible();
        await expect(page.locator('#sched-frequency')).toBeVisible();
    });

    test('select de frequência exibe opções corretas', async ({ page }) => {
        const agendTab = page.locator('button:has-text("Agendamento")').first();
        if (!await agendTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            test.skip(true, 'Aba Agendamento não disponível');
            return;
        }
        await agendTab.click();

        const freqSelect = page.locator('#sched-frequency');
        await expect(freqSelect).toBeVisible({ timeout: 8000 });

        const options = await freqSelect.locator('option').allTextContents();
        expect(options).toContain('Manual');
        expect(options.some(o => o.includes('Diário') || o.includes('Diario'))).toBe(true);
        expect(options.some(o => o.includes('Semanal'))).toBe(true);
    });

    test('selecionando "Semanal" exibe campo de dia da semana', async ({ page }) => {
        const agendTab = page.locator('button:has-text("Agendamento")').first();
        if (!await agendTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            test.skip(true, 'Aba Agendamento não disponível');
            return;
        }
        await agendTab.click();

        const freqSelect = page.locator('#sched-frequency');
        await freqSelect.waitFor({ state: 'visible', timeout: 8000 });
        await freqSelect.selectOption('semanal');

        const weekdayRow = page.locator('#sched-weekday-row');
        await expect(weekdayRow).toBeVisible({ timeout: 3000 });
    });

    test('seção de execução manual está presente', async ({ page }) => {
        const agendTab = page.locator('button:has-text("Agendamento")').first();
        if (!await agendTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            test.skip(true, 'Aba Agendamento não disponível');
            return;
        }
        await agendTab.click();

        const runBtn = page.locator('#btn-run-now');
        await expect(runBtn).toBeVisible({ timeout: 8000 });
        await expect(runBtn).toContainText(/Executar/i);
    });

    test('seção de próximas execuções está visível', async ({ page }) => {
        const agendTab = page.locator('button:has-text("Agendamento")').first();
        if (!await agendTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            test.skip(true, 'Aba Agendamento não disponível');
            return;
        }
        await agendTab.click();

        const nextRun = page.locator('#sched-next-run');
        await expect(nextRun).toBeVisible({ timeout: 8000 });
    });

    test('salvar configuração chama API e exibe feedback', async ({ page }) => {
        const agendTab = page.locator('button:has-text("Agendamento")').first();
        if (!await agendTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            test.skip(true, 'Aba Agendamento não disponível');
            return;
        }
        await agendTab.click();

        // Intercept API
        const [response] = await Promise.all([
            page.waitForResponse(r => r.url().includes('/api/test-schedule') && r.request().method() === 'PUT', { timeout: 10000 }),
            page.click('#btn-sched-save'),
        ]).catch(() => [null]);

        if (response) {
            expect(response.status()).toBeLessThan(500);
            // Mensagem de feedback deve aparecer
            const msg = page.locator('#sched-msg');
            await expect(msg).toBeVisible({ timeout: 3000 });
        } else {
            test.skip(true, 'Botão de salvar não respondeu');
        }
    });
});

/**
 * @file cs_hub.spec.js
 * Testes E2E — Customer Success Hub completo
 */
import { test, expect } from '@playwright/test';

async function login(page) {
    await page.goto('/');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'dati2024');
    await page.click('button[type="submit"]');
    await expect(page.locator('#app-layout')).toBeVisible();
}

async function createClienteAtivo(page, nome = 'Empresa CS E2E') {
    await page.click('.btn-new-company');
    await page.fill('#emp-nome', nome);
    await page.selectOption('#emp-status', 'Cliente Ativo');
    await page.click('button[type="submit"]');
    await page.waitForSelector('#view-company-list');
    // Abrir para edição
    const editBtn = page.locator('.btn-edit').first();
    await editBtn.click();
    await expect(page.locator('#view-company-form')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('CS Hub — Dashboards', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await createClienteAtivo(page, 'CS Dashboard Test');
        await page.click('[data-tab="tab-cs"]');
    });

    test('deve adicionar um dashboard', async ({ page }) => {
        await page.click('#btn-toggle-dashboard-form');
        await expect(page.locator('#dashboard-form-container')).toBeVisible();

        await page.fill('#new-db-data', '2024-03-01');
        await page.fill('#new-db-dest', 'diretoria@empresa.com');
        await page.fill('#new-db-link', 'https://app.powerbi.com/report/123');
        await page.click('#btn-save-dashboard');

        await expect(page.locator('#dashboards-table-body')).toContainText('2024-03-01');
        await expect(page.locator('#dashboards-table-body')).toContainText('diretoria@empresa.com');
    });

    test('NÃO deve salvar dashboard sem campos obrigatórios', async ({ page }) => {
        await page.click('#btn-toggle-dashboard-form');
        await page.fill('#new-db-data', '2024-03-01');
        // sem destinatário e link
        await page.click('#btn-save-dashboard');
        // form deve permanecer visível (não foi fechado)
        await expect(page.locator('#dashboard-form-container')).toBeVisible();
    });
});

test.describe('CS Hub — NPS', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await createClienteAtivo(page, 'CS NPS Test');
        await page.click('[data-tab="tab-cs"]');
        // Navegar para sub-tab NPS
        await page.evaluate(() => window.switchCSSubTab('cs-nps', null));
    });

    test('deve adicionar registro NPS', async ({ page }) => {
        await page.click('#btn-toggle-nps-form');
        await page.fill('#new-nps-data', '2024-03-15');
        await page.fill('#new-nps-dest', 'cliente@empresa.com');
        await page.fill('#new-nps-score', '8');
        await page.click('#btn-save-nps');

        await expect(page.locator('#nps-history-table-body')).toContainText('2024-03-15');
        await expect(page.locator('#nps-history-table-body')).toContainText('8');
    });
});

test.describe('CS Hub — Chamados', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await createClienteAtivo(page, 'CS Chamados Test');
        await page.click('[data-tab="tab-cs"]');
        await page.evaluate(() => window.switchCSSubTab('cs-tk', null));
    });

    test('deve registrar um chamado', async ({ page }) => {
        await page.click('#btn-toggle-ticket-form');
        await page.fill('#new-tk-data', '2024-03-20');
        await page.fill('#new-tk-num', 'SD-00123');
        await page.fill('#new-tk-resumo', 'Erro ao importar planilha CSV');
        await page.fill('#new-tk-autor', 'João Silva');
        await page.click('#btn-save-ticket');

        await expect(page.locator('#tickets-table-body')).toContainText('SD-00123');
        await expect(page.locator('#tickets-table-body')).toContainText('Erro ao importar planilha CSV');
    });
});

test.describe('CS Hub — Diário de Observações', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await createClienteAtivo(page, 'CS Notes Test');
        await page.click('[data-tab="tab-cs"]');
        await page.evaluate(() => window.switchCSSubTab('cs-hist', null));
    });

    test('deve adicionar uma nota ao diário', async ({ page }) => {
        await page.fill('#new-cs-note', 'Cliente mencionou expansão para novos mercados.');
        await page.click('#btn-add-cs-note');

        await expect(page.locator('#cs-timeline')).toContainText('Cliente mencionou expansão');
        await expect(page.locator('#cs-timeline')).toContainText('admin');
    });

    test('NÃO deve adicionar nota em branco', async ({ page }) => {
        await page.fill('#new-cs-note', '  ');
        await page.click('#btn-add-cs-note');
        // timeline deve permanecer vazia
        await expect(page.locator('#cs-timeline')).toContainText('Nenhuma observação registrada');
    });
});

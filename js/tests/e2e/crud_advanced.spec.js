/**
 * @file crud_advanced.spec.js
 * Testes E2E — Edição, exclusão, qualificação e reuniões
 */
import { test, expect } from '@playwright/test';

async function login(page) {
    await page.goto('/');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'dati2024');
    await page.click('button[type="submit"]');
    await expect(page.locator('#app-layout')).toBeVisible();
}

async function createEmpresa(page, nome, status = 'Prospect') {
    await page.click('.btn-new-company');
    await page.fill('#emp-nome', nome);
    await page.selectOption('#emp-status', status);
    await page.click('button[type="submit"]');
    await page.waitForSelector('#view-company-list');
}

test.describe.configure({ mode: 'serial' });

test.describe('Edição de Empresa', () => {
    test('deve editar o nome e status de uma empresa existente', async ({ page }) => {
        await login(page);
        await createEmpresa(page, 'Original Ltda', 'Prospect');

        // Clicar em editar
        await page.click('.btn-edit');
        await expect(page.locator('#view-company-form')).toBeVisible();
        await expect(page.locator('#form-title')).not.toContainText('Nova Empresa');

        // Alterar dados
        await page.fill('#emp-nome', 'Original Ltda — Editada');
        await page.selectOption('#emp-status', 'Lead');
        await page.click('button[type="submit"]');

        // Verificar alteração na lista
        await expect(page.locator('#view-company-list')).toBeVisible();
        await expect(page.locator('#company-table-body')).toContainText('Original Ltda — Editada');
    });

    test('deve preservar contatos existentes ao editar a empresa', async ({ page }) => {
        await login(page);
        await page.click('.btn-new-company');
        await page.fill('#emp-nome', 'Empresa Contatos Persistência');

        // Adicionar contato antes de salvar
        await page.click('[data-tab="tab-contatos"]');
        await page.click('#btn-toggle-contact-form');
        await page.fill('#new-cont-nome', 'Contato Persistente');
        await page.click('#btn-save-contact');
        await page.click('button[type="submit"]');

        // Reabrir para edição
        await page.click('.btn-edit');
        await page.click('[data-tab="tab-contatos"]');

        // Contato deve estar lá
        await expect(page.locator('#contatos-table-body')).toContainText('Contato Persistente');
    });
});

test.describe('Exclusão de Empresa', () => {
    test('deve excluir uma empresa da lista', async ({ page }) => {
        await login(page);
        await createEmpresa(page, 'Empresa Para Deletar');

        // Confirmar exclusão (handler de dialog)
        page.on('dialog', dialog => dialog.accept());
        await page.click('.btn-delete');

        await expect(page.locator('#company-table-body')).not.toContainText('Empresa Para Deletar');
    });
});

test.describe('Aba Qualificação', () => {
    test('deve preencher e salvar campos de qualificação', async ({ page }) => {
        await login(page);
        await page.click('.btn-new-company');
        await page.fill('#emp-nome', 'Empresa Qualificação');

        await page.click('[data-tab="tab-qualificacao"]');
        await expect(page.locator('#tab-qualificacao')).toHaveClass(/active/);

        // Preencher campos
        await page.selectOption('#qual-tem-comex', 'Sim');
        await expect(page.locator('#group-qual-comex')).toBeVisible();
        await page.fill('#qual-qual-comex', 'Importa matéria-prima da China');

        await page.selectOption('#qual-tem-erp', 'Não');
        await expect(page.locator('#group-qual-erp')).not.toBeVisible();

        await page.fill('#qual-objetivo', 'Reduzir tempo de desembaraço aduaneiro');
        await page.fill('#qual-dores', 'Alto custo tributário e falta de visibilidade de cargas');
        await page.fill('#qual-expectativa', 'Redução de 20% nos custos operacionais em 6 meses');

        await page.click('button[type="submit"]');
        await expect(page.locator('#view-company-list')).toBeVisible();
    });

    test('deve exibir group-qual-comex apenas quando "Sim" for selecionado', async ({ page }) => {
        await login(page);
        await page.click('.btn-new-company');
        await page.click('[data-tab="tab-qualificacao"]');

        await expect(page.locator('#group-qual-comex')).not.toBeVisible();
        await page.selectOption('#qual-tem-comex', 'Sim');
        await expect(page.locator('#group-qual-comex')).toBeVisible();
        await page.selectOption('#qual-tem-comex', 'Não');
        await expect(page.locator('#group-qual-comex')).not.toBeVisible();
    });
});

test.describe('Aba Reuniões', () => {
    test('deve adicionar uma reunião e salvá-la com a empresa', async ({ page }) => {
        await login(page);
        await page.click('.btn-new-company');
        await page.fill('#emp-nome', 'Empresa Reunião');

        await page.click('[data-tab="tab-reunioes"]');
        await page.click('#btn-toggle-meeting-form');

        await page.fill('#new-meet-date', '2024-03-10');
        await page.selectOption('#new-meet-temp', 'Hot');
        await page.fill('#new-meet-parts', 'CEO, CTO');
        await page.click('#btn-add-meeting-submit');

        await expect(page.locator('#meetings-table-body')).toContainText('2024-03-10');
        await expect(page.locator('#meetings-table-body')).toContainText('Hot');

        await page.click('button[type="submit"]');
        await expect(page.locator('#view-company-list')).toBeVisible();
    });

    test('NÃO deve salvar reunião sem data', async ({ page }) => {
        await login(page);
        await page.click('.btn-new-company');
        await page.click('[data-tab="tab-reunioes"]');
        await page.click('#btn-toggle-meeting-form');

        // sem data
        await page.fill('#new-meet-parts', 'Time Comercial');
        await page.click('#btn-add-meeting-submit');

        // tabela deve permanecer vazia
        await expect(page.locator('#meetings-table-body')).toContainText('Nenhuma reunião registrada');
    });
});

test.describe('Busca e Filtro de Empresas', () => {
    test('deve filtrar empresas pelo campo de busca', async ({ page }) => {
        await login(page);
        await createEmpresa(page, 'Empresa Alfa');
        await createEmpresa(page, 'Empresa Beta');

        await page.click('[data-view="company-list"]');
        await page.fill('#search-empresa', 'alfa');

        const body = page.locator('#company-table-body');
        await expect(body).toContainText('Empresa Alfa');
        await expect(body).not.toContainText('Empresa Beta');
    });

    test('deve filtrar por status', async ({ page }) => {
        await login(page);
        await createEmpresa(page, 'Empresa Prospect X', 'Prospect');
        await createEmpresa(page, 'Empresa Lead X', 'Lead');

        await page.click('[data-view="company-list"]');
        await page.selectOption('#filter-status', 'Lead');

        const body = page.locator('#company-table-body');
        await expect(body).toContainText('Empresa Lead X');
        await expect(body).not.toContainText('Empresa Prospect X');
    });
});

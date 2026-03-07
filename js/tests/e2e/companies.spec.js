/**
 * @file companies.spec.js
 * Testes E2E — CRUD de Empresas
 */
import { test, expect } from '@playwright/test';

// Helper: fazer login
async function login(page) {
    await page.goto('/');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'dati2024');
    await page.click('button[type="submit"]');
    await expect(page.locator('#app-layout')).toBeVisible();
}

test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('deve exibir cards de stats no dashboard', async ({ page }) => {
        await expect(page.locator('#dashboard-stats')).toBeVisible();
        // Ao menos o card "Total de Empresas" deve existir
        await expect(page.locator('#dashboard-stats .stat-card')).toHaveCount({ minimum: 1 });
    });
});

test.describe('Lista de Empresas', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.click('[data-view="company-list"]');
    });

    test('deve exibir a view de empresas ao clicar no menu', async ({ page }) => {
        await expect(page.locator('#view-company-list')).toBeVisible();
    });

    test('deve exibir filtros de busca', async ({ page }) => {
        await expect(page.locator('#search-empresa')).toBeVisible();
        await expect(page.locator('#filter-status')).toBeVisible();
    });
});

test.describe('CRUD de Empresa', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        // Navegar para nova empresa
        await page.click('.btn-new-company');
        await expect(page.locator('#view-company-form')).toBeVisible();
    });

    test('deve abrir formulário de nova empresa', async ({ page }) => {
        await expect(page.locator('#form-title')).toContainText('Nova Empresa');
        await expect(page.locator('#emp-nome')).toBeVisible();
    });

    test('deve exibir todas as abas do formulário', async ({ page }) => {
        await expect(page.locator('[data-tab="tab-dados"]')).toBeVisible();
        await expect(page.locator('[data-tab="tab-produtos"]')).toBeVisible();
        await expect(page.locator('[data-tab="tab-contatos"]')).toBeVisible();
        await expect(page.locator('[data-tab="tab-reunioes"]')).toBeVisible();
        await expect(page.locator('[data-tab="tab-qualificacao"]')).toBeVisible();
    });

    test('deve navegar entre abas corretamente', async ({ page }) => {
        await page.click('[data-tab="tab-contatos"]');
        await expect(page.locator('#tab-contatos')).toHaveClass(/active/);
        await expect(page.locator('#tab-dados')).not.toHaveClass(/active/);

        await page.click('[data-tab="tab-qualificacao"]');
        await expect(page.locator('#tab-qualificacao')).toHaveClass(/active/);
    });

    test('deve criar uma empresa completa e salvá-la', async ({ page }) => {
        // Dados básicos
        await page.fill('#emp-nome', 'Empresa de Teste E2E');
        await page.selectOption('#emp-tipo', 'Trading');
        await page.selectOption('#emp-estado', 'SP');
        await page.selectOption('#emp-canal', 'SDR DATI');

        // Salvar
        await page.click('button[type="submit"]');

        // Deve voltar para a lista e mostrar a empresa
        await expect(page.locator('#view-company-list')).toBeVisible();
        await expect(page.locator('#company-table-body')).toContainText('Empresa de Teste E2E');
    });

    test('NÃO deve salvar empresa sem nome', async ({ page }) => {
        // Tentar salvar sem preencher nome
        await page.click('button[type="submit"]');
        // Deve permanecer no formulário
        await expect(page.locator('#view-company-form')).toBeVisible();
    });

    test('deve adicionar um contato à empresa', async ({ page }) => {
        await page.fill('#emp-nome', 'Empresa Contatos Teste');
        await page.click('[data-tab="tab-contatos"]');
        await page.click('#btn-toggle-contact-form');

        await expect(page.locator('#contact-form-container')).toBeVisible();
        await page.fill('#new-cont-nome', 'Maria Silva');
        await page.fill('#new-cont-email1', 'maria@teste.com');
        await page.fill('#new-cont-cargo', 'Diretora');

        await page.click('#btn-save-contact');

        // Contato deve aparecer na tabela
        await expect(page.locator('#contatos-table-body')).toContainText('Maria Silva');
        await expect(page.locator('#contatos-table-body')).toContainText('Diretora');
    });
});

test.describe('CS Hub — visibilidade por status', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.click('.btn-new-company');
        await page.fill('#emp-nome', 'Empresa CS Test');
    });

    test('aba CS NÃO deve aparecer para status Prospect', async ({ page }) => {
        await page.selectOption('#emp-status', 'Prospect');
        await expect(page.locator('#btn-tab-cs')).not.toBeVisible();
    });

    test('aba CS DEVE aparecer para status Cliente Ativo', async ({ page }) => {
        await page.selectOption('#emp-status', 'Cliente Ativo');
        await expect(page.locator('#btn-tab-cs')).toBeVisible();
    });

    test('widgets Health Score e NPS DEVEM aparecer para Cliente Ativo', async ({ page }) => {
        await page.selectOption('#emp-status', 'Cliente Ativo');
        await expect(page.locator('#cs-header-metrics')).toBeVisible();
    });

    test('widgets Health Score e NPS NÃO DEVEM aparecer para Lead', async ({ page }) => {
        await page.selectOption('#emp-status', 'Lead');
        await expect(page.locator('#cs-header-metrics')).not.toBeVisible();
    });
});

/**
 * @file auth.spec.js
 * Testes E2E — Fluxo de Autenticação
 */
import { test, expect } from '@playwright/test';

test.describe('Autenticação', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('deve exibir tela de login ao carregar', async ({ page }) => {
        await expect(page.locator('#login-screen')).toBeVisible();
        await expect(page.locator('#app-layout')).not.toBeVisible();
    });

    test('deve fazer login com credenciais corretas', async ({ page }) => {
        await page.fill('#username', 'admin');
        await page.fill('#password', 'dati2024');
        await page.click('button[type="submit"]');

        await expect(page.locator('#app-layout')).toBeVisible();
        await expect(page.locator('#login-screen')).not.toBeVisible();
    });

    test('deve exibir erro com credenciais inválidas', async ({ page }) => {
        await page.fill('#username', 'admin');
        await page.fill('#password', 'senhaerrada');
        await page.click('button[type="submit"]');

        await expect(page.locator('#login-error')).toBeVisible();
        await expect(page.locator('#app-layout')).not.toBeVisible();
    });

    test('deve fazer logout e retornar à tela de login', async ({ page }) => {
        await page.fill('#username', 'admin');
        await page.fill('#password', 'dati2024');
        await page.click('button[type="submit"]');
        await expect(page.locator('#app-layout')).toBeVisible();

        await page.click('#btn-logout');
        await expect(page.locator('#login-screen')).toBeVisible();
        await expect(page.locator('#app-layout')).not.toBeVisible();
    });
});

// @ts-check
const { test, expect } = require('@playwright/test');
const { login, navegarPara } = require('./helpers/auth');

test.describe('🧭 Navegação — Menu Lateral', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('01 — Dashboard carrega ao clicar no menu', async ({ page }) => {
    await navegarPara(page, 'dashboard');
    await expect(page.locator('#view-dashboard')).toBeVisible();
  });

  test('02 — Lista de Empresas carrega', async ({ page }) => {
    await navegarPara(page, 'company-list');
    await expect(page.locator('#view-company-list')).toBeVisible();
  });

  test('03 — WhatsApp Inbox carrega', async ({ page }) => {
    await navegarPara(page, 'whatsapp-inbox');
    await page.waitForLoadState('networkidle');
    // Não deve dar erro 404
    expect(page.url()).not.toContain('404');
  });

  test('04 — Relatórios carrega', async ({ page }) => {
    await navegarPara(page, 'reports');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('404');
  });

  test('05 — Audit Log (Histórico de Alterações) carrega', async ({ page }) => {
    await navegarPara(page, 'audit-log');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('404');
  });

  test('06 — Configurações de usuários carrega', async ({ page }) => {
    await navegarPara(page, 'config-usuarios');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('404');
  });

  test('07 — Configurações Gabi carrega', async ({ page }) => {
    await navegarPara(page, 'config-gabi');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('404');
  });

  test('08 — Settings WhatsApp carrega', async ({ page }) => {
    await navegarPara(page, 'settings-whatsapp');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('404');
  });

  test('09 — Nome do usuário logado aparece na sidebar', async ({ page }) => {
    const userName = page.locator('#sidebar-user-name');
    await expect(userName).toBeVisible();
    const text = await userName.textContent();
    expect(text?.trim()).not.toBe('Carregando...');
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('10 — Menu do usuário abre ao clicar', async ({ page }) => {
    await page.locator('#sidebar-user-wrap').click();
    await expect(page.locator('#sidebar-user-menu')).toBeVisible();
  });

  test('11 — Logout funciona', async ({ page }) => {
    await page.locator('#sidebar-user-wrap').click();
    await expect(page.locator('#btn-logout')).toBeVisible();
    await page.locator('#btn-logout').click();
    // Deve redirecionar para login
    await page.waitForURL(url =>
      url.toString().includes('sign-in') ||
      url.toString().includes('login') ||
      url.toString() === new URL('/', page.url()).toString()
    , { timeout: 10000 });
  });

});

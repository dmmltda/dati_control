// @ts-check
const { test, expect } = require('@playwright/test');
const { login, navegarPara } = require('./helpers/auth');

test.describe('📊 Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navegarPara(page, 'dashboard');
    await expect(page.locator('#view-dashboard')).toBeVisible();
  });

  test('01 — Dashboard carrega sem erro JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    const critical = errors.filter(e => !e.includes('favicon'));
    expect(critical).toHaveLength(0);
  });

  test('02 — Filtro de usuário está visível', async ({ page }) => {
    await expect(page.locator('#db-user-btn')).toBeVisible();
  });

  test('03 — Menu de seleção de usuário abre ao clicar', async ({ page }) => {
    await page.locator('#db-user-btn').click();
    await expect(page.locator('#db-user-dropdown-menu')).toBeVisible();
  });

  test('04 — Opção "Todos os usuários" está disponível', async ({ page }) => {
    await page.locator('#db-user-btn').click();
    await expect(page.locator('#db-dd-todos')).toBeVisible();
  });

  test('05 — Botão "Nova Empresa" no dashboard funciona', async ({ page }) => {
    const btn = page.locator('#view-dashboard .btn-new-company');
    await expect(btn).toBeVisible();
    await btn.click();
    // Modal deve abrir
    await expect(
      page.locator('[id*="modal"]:visible, .modal:visible').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('06 — Journey dashboard renderiza', async ({ page }) => {
    await expect(page.locator('#journey-dashboard-root')).toBeVisible();
  });

});

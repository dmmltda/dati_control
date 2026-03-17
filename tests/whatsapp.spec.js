// @ts-check
const { test, expect } = require('@playwright/test');
const { login, navegarPara } = require('./helpers/auth');

test.describe('💬 WhatsApp Inbox', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navegarPara(page, 'whatsapp-inbox');
    await page.waitForLoadState('networkidle');
  });

  test('01 — Página carrega sem erro de servidor', async ({ page }) => {
    const serverErrors = [];
    page.on('response', r => { if (r.status() >= 500) serverErrors.push(r.url()); });
    await page.waitForLoadState('networkidle');
    expect(serverErrors).toHaveLength(0);
  });

  test('02 — Área de conversas está visível', async ({ page }) => {
    // Deve ter algum container de conversas
    await expect(
      page.locator('[id*="whatsapp"], [class*="whatsapp"], [class*="inbox"], [class*="conversation"]').first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('03 — Nenhum erro JS crítico na página', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForLoadState('networkidle');
    const critical = errors.filter(e => !e.includes('favicon') && !e.includes('analytics'));
    expect(critical).toHaveLength(0);
  });

});

test.describe('⚙️ Configurações WhatsApp', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navegarPara(page, 'settings-whatsapp');
    await page.waitForLoadState('networkidle');
  });

  test('04 — Página de configurações WhatsApp carrega', async ({ page }) => {
    // Deve ter alguma seção de configuração
    await expect(
      page.locator('[id*="settings"], [class*="settings"], [id*="whatsapp-config"]').first()
    ).toBeVisible({ timeout: 8000 });
  });

});

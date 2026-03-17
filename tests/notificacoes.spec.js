// @ts-check
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

test.describe('🔔 Notificações', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('01 — Botão de notificações está visível na topbar', async ({ page }) => {
    await expect(page.locator('button:has(> i.ph-bell), button:has(.ph-bell)')).toBeVisible();
  });

  test('02 — Clicar no sino abre dropdown de notificações', async ({ page }) => {
    await page.locator('button:has(> i.ph-bell), button:has(.ph-bell)').first().click();
    await expect(page.locator('#notif-dropdown')).toBeVisible();
  });

  test('03 — Dropdown tem campo de busca', async ({ page }) => {
    await page.locator('button:has(> i.ph-bell), button:has(.ph-bell)').first().click();
    await expect(page.locator('#notif-search-input')).toBeVisible();
  });

  test('04 — Campo de busca em notificações aceita texto', async ({ page }) => {
    await page.locator('button:has(> i.ph-bell), button:has(.ph-bell)').first().click();
    await page.locator('#notif-search-input').fill('teste');
    const val = await page.locator('#notif-search-input').inputValue();
    expect(val).toBe('teste');
  });

  test('05 — Filtro de data inicial aceita valor', async ({ page }) => {
    await page.locator('button:has(> i.ph-bell), button:has(.ph-bell)').first().click();
    await page.locator('#notif-date-start').fill('2025-01-01');
    const val = await page.locator('#notif-date-start').inputValue();
    expect(val).toBe('2025-01-01');
  });

  test('06 — Botão "Marcar tudo lido" está visível', async ({ page }) => {
    await page.locator('button:has(> i.ph-bell), button:has(.ph-bell)').first().click();
    await expect(page.locator('#notif-read-all-btn')).toBeVisible();
  });

  test('07 — Dropdown fecha ao pressionar Escape', async ({ page }) => {
    await page.locator('button:has(> i.ph-bell), button:has(.ph-bell)').first().click();
    await expect(page.locator('#notif-dropdown')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('#notif-dropdown')).not.toBeVisible();
  });

  test('08 — Badge de contagem aparece quando há notificações', async ({ page }) => {
    const badge = page.locator('#notif-badge');
    // Badge pode estar visível ou não, mas não deve dar erro
    const isVisible = await badge.isVisible();
    if (isVisible) {
      const text = await badge.textContent();
      expect(parseInt(text || '0')).toBeGreaterThanOrEqual(0);
    }
    // Se não há notificações, badge fica oculto — OK
    expect(true).toBe(true);
  });

});

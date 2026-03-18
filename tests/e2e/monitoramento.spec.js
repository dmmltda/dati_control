// @ts-check
const { test, expect } = require('@playwright/test');
const { login, navegarPara } = require('./fixtures/auth-helper');

test.describe('📋 Audit Log — Histórico de Alterações', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navegarPara(page, 'audit-log');
    await page.waitForLoadState('networkidle');
  });

  test('01 — Página de audit log carrega', async ({ page }) => {
    await expect(
      page.locator('[id*="audit"], [class*="audit"]').first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('02 — Nenhum erro de servidor', async ({ page }) => {
    const errors = [];
    page.on('response', r => { if (r.status() >= 500) errors.push(r.url()); });
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('03 — Nenhum erro JS crítico', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForLoadState('networkidle');
    const critical = errors.filter(e => !e.includes('favicon'));
    expect(critical).toHaveLength(0);
  });

});

test.describe('📈 Relatórios', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navegarPara(page, 'reports');
    await page.waitForLoadState('networkidle');
  });

  test('04 — Página de relatórios carrega', async ({ page }) => {
    await expect(
      page.locator('[id*="report"], [class*="report"]').first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('05 — Nenhum erro de servidor', async ({ page }) => {
    const errors = [];
    page.on('response', r => { if (r.status() >= 500) errors.push(r.url()); });
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

});

test.describe('🧪 Logs de Testes', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navegarPara(page, 'log');
    await page.waitForLoadState('networkidle');
  });

  test('06 — Página de logs carrega', async ({ page }) => {
    await expect(
      page.locator('[id*="log"], [class*="log"]').first()
    ).toBeVisible({ timeout: 8000 });
  });

});

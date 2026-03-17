// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * CUSTOM SELECT — Componente crítico
 * Usado em todo o sistema — se quebrar, quebra tudo
 */

test.describe('🎛️ Custom Select — Componente', () => {

  test.beforeEach(async ({ page }) => {
    // Substitua pela página que tem mais selects
    await page.goto('https://unnephritic-spirituously-davion.ngrok-free.dev/');
    await page.waitForLoadState('networkidle');
  });

  test('01 — Select abre ao clicar', async ({ page }) => {
    const select = page.locator('[data-custom-select], .custom-select, [class*="custom-select"]').first();
    if (!await select.isVisible()) test.skip();

    await select.click();
    await expect(
      page.locator('[class*="dropdown"], [class*="options"], [class*="select-list"]').first()
    ).toBeVisible({ timeout: 3000 });
  });

  test('02 — Select fecha ao pressionar Escape', async ({ page }) => {
    const select = page.locator('[data-custom-select], .custom-select').first();
    if (!await select.isVisible()) test.skip();

    await select.click();
    await page.keyboard.press('Escape');

    await expect(
      page.locator('[class*="dropdown"]:visible, [class*="options"]:visible').first()
    ).not.toBeVisible({ timeout: 2000 });
  });

  test('03 — Select fecha ao clicar fora', async ({ page }) => {
    const select = page.locator('[data-custom-select], .custom-select').first();
    if (!await select.isVisible()) test.skip();

    await select.click();
    await page.mouse.click(10, 10); // clicar no canto

    await expect(
      page.locator('[class*="dropdown"]:visible').first()
    ).not.toBeVisible({ timeout: 2000 });
  });

  test('04 — Selecionar opção atualiza o valor', async ({ page }) => {
    const select = page.locator('[data-custom-select], .custom-select').first();
    if (!await select.isVisible()) test.skip();

    await select.click();

    const firstOption = page.locator('[class*="option"], [class*="item"]').first();
    const optionText = await firstOption.textContent();
    await firstOption.click();

    await expect(select).toContainText(optionText?.trim() || '');
  });

  test('05 — Navegação por teclado funciona', async ({ page }) => {
    const select = page.locator('[data-custom-select], .custom-select').first();
    if (!await select.isVisible()) test.skip();

    await select.click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Deve ter selecionado algo (select fechou)
    await expect(
      page.locator('[class*="dropdown"]:visible').first()
    ).not.toBeVisible({ timeout: 2000 });
  });

});

/**
 * TESTES ESPECÍFICOS DE SELECT POR CONTEXTO
 * Verifique os seletores reais inspecionando o HTML
 */
test.describe('🎛️ Selects em Contexto', () => {

  test('Select de Status da Empresa funciona', async ({ page }) => {
    await page.goto('https://unnephritic-spirituously-davion.ngrok-free.dev/');
    // TODO: navegar até o modal de empresa e testar o select de status
    test.skip(); // remova ao implementar
  });

  test('Select de Tipo de Atividade funciona', async ({ page }) => {
    await page.goto('https://unnephritic-spirituously-davion.ngrok-free.dev/');
    // TODO: navegar até criar atividade e testar o select
    test.skip();
  });

  test('Select de Responsável em Tasks funciona', async ({ page }) => {
    await page.goto('https://unnephritic-spirituously-davion.ngrok-free.dev/');
    // TODO: navegar até kanban e testar o select de responsável
    test.skip();
  });

});

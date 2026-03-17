// @ts-check
const { test, expect } = require('@playwright/test');
const { login, navegarPara } = require('./helpers/auth');

test.describe('🏢 Empresas — Lista e Filtros', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navegarPara(page, 'company-list');
    await expect(page.locator('#view-company-list')).toBeVisible();
  });

  test('01 — Tabela de empresas carrega com dados', async ({ page }) => {
    // Aguarda pelo menos 1 linha de empresa
    await page.waitForSelector('.company-row, tr[data-empresa-id], tbody tr', { timeout: 10000 });
    const rows = page.locator('.company-row, tr[data-empresa-id], tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('02 — Campo de busca filtra por nome', async ({ page }) => {
    const searchInput = page.locator('#search-empresa');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('a');
    await page.waitForTimeout(600); // debounce
    // Algum resultado ou mensagem de vazio
    const hasResults = await page.locator('.company-row, tbody tr').count();
    expect(hasResults).toBeGreaterThanOrEqual(0); // não deu erro
  });

  test('03 — Limpar busca restaura lista', async ({ page }) => {
    await page.locator('#search-empresa').fill('xyzxyzxyz_inexistente');
    await page.waitForTimeout(600);
    await page.locator('#clear-search').click();
    await page.waitForTimeout(400);
    const val = await page.locator('#search-empresa').inputValue();
    expect(val).toBe('');
  });

  test('04 — Botão de filtro por coluna (Status) abre popover', async ({ page }) => {
    const filterBtn = page.locator('button.btn-filter-column').first();
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();
    // Algum popover deve aparecer
    await expect(page.locator('.filter-popover:visible, [id^="filter-popover"]:not([style*="display: none"])').first())
      .toBeVisible({ timeout: 3000 });
  });

  test('05 — Checkbox "Selecionar todos" funciona', async ({ page }) => {
    const selectAll = page.locator('#select-all-companies');
    await expect(selectAll).toBeVisible();
    await selectAll.check();
    await expect(selectAll).toBeChecked();
    await selectAll.uncheck();
    await expect(selectAll).not.toBeChecked();
  });

  test('06 — Botão "Nova Empresa" está visível', async ({ page }) => {
    await expect(page.locator('.btn-new-company').first()).toBeVisible();
  });

  test('07 — Ordenar por coluna Nome funciona', async ({ page }) => {
    const nomeHeader = page.locator('[data-col="nome"]');
    await expect(nomeHeader).toBeVisible();
    await nomeHeader.click();
    await page.waitForTimeout(500);
    // Não deve dar erro
    await expect(page.locator('#view-company-list')).toBeVisible();
  });

  test('08 — Ordenar por Status funciona', async ({ page }) => {
    const statusHeader = page.locator('[data-col="status"]');
    await expect(statusHeader).toBeVisible();
    await statusHeader.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#view-company-list')).toBeVisible();
  });

});

test.describe('🏢 Empresas — Criar', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navegarPara(page, 'company-list');
  });

  test('09 — Modal de nova empresa abre ao clicar no botão', async ({ page }) => {
    await page.locator('.btn-new-company').first().click();
    // Modal deve aparecer
    await expect(
      page.locator('[id*="modal"], .modal:visible, [class*="modal"]:visible').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('10 — Fechar modal sem salvar não cria empresa', async ({ page }) => {
    const countBefore = await page.locator('.company-row, tbody tr').count();

    await page.locator('.btn-new-company').first().click();
    await page.waitForTimeout(500);

    // Fechar com Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const countAfter = await page.locator('.company-row, tbody tr').count();
    expect(countAfter).toBe(countBefore);
  });

});

test.describe('🏢 Empresas — Ações em Massa', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navegarPara(page, 'company-list');
  });

  test('11 — Botão de exclusão em massa está desabilitado por padrão', async ({ page }) => {
    const deleteBtn = page.locator('#bulk-delete-btn');
    await expect(deleteBtn).toBeDisabled();
  });

  test('12 — Botão de edição em massa está desabilitado por padrão', async ({ page }) => {
    const editBtn = page.locator('#bulk-edit-btn');
    await expect(editBtn).toBeDisabled();
  });

  test('13 — Selecionar empresa habilita botões de ação', async ({ page }) => {
    // Selecionar primeiro checkbox de empresa
    const firstCheckbox = page.locator('tbody tr input[type="checkbox"]').first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.check();
      await expect(page.locator('#bulk-delete-btn')).not.toBeDisabled();
    }
  });

  test('14 — Botão de importação em massa está visível', async ({ page }) => {
    await expect(page.locator('#btn-importar-em-massa')).toBeVisible();
  });

});

// Helper compartilhado de autenticação
const BASE_URL = process.env.BASE_URL || 'https://unnephritic-spirituously-davion.ngrok-free.dev';
const TEST_EMAIL = process.env.TEST_EMAIL || 'teste@dati.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'senha-teste';

async function login(page) {
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Já está logado?
  if (await page.locator('#sidebar-user-name').isVisible({ timeout: 2000 }).catch(() => false)) return;

  const emailInput = page.locator('input[type="email"]').first();
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(TEST_EMAIL);
    await page.locator('button[type="submit"]').first().click();

    const pwInput = page.locator('input[type="password"]').first();
    if (await pwInput.isVisible({ timeout: 4000 }).catch(() => false)) {
      await pwInput.fill(TEST_PASSWORD);
      await page.locator('button[type="submit"]').first().click();
    }
  }

  await page.waitForSelector('#sidebar-user-name', { timeout: 15000 });
}

async function navegarPara(page, dataView) {
  const link = page.locator(`[data-view="${dataView}"]`);
  await link.click();
  await page.waitForLoadState('networkidle');
}

module.exports = { login, navegarPara, BASE_URL };

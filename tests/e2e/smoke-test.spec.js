// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * SMOKE TEST — Roda em todo commit
 * Valida o essencial do sistema em ~30 segundos
 */

const BASE_URL = 'https://unnephritic-spirituously-davion.ngrok-free.dev';

// Substitua pelas credenciais de teste
const TEST_EMAIL = process.env.TEST_EMAIL || 'teste@dati.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'senha-teste';

test.describe('🔥 Smoke Test — Essencial do Sistema', () => {

  test('01 — App carrega sem erro crítico', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Nenhum erro JS crítico
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('analytics')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('02 — Página de login carrega', async ({ page }) => {
    await page.goto(BASE_URL);
    // Deve ter campo de email ou botão de login
    await expect(
      page.locator('input[type="email"], input[type="text"], button:has-text("Entrar")')
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('03 — Login com credenciais válidas funciona', async ({ page }) => {
    await page.goto(BASE_URL);

    // Clerk ou login nativo
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.isVisible()) {
      await emailInput.fill(TEST_EMAIL);
      await page.locator('button[type="submit"], button:has-text("Continuar"), button:has-text("Entrar")').first().click();

      // Se pedir senha em etapa separada
      const passwordInput = page.locator('input[type="password"]').first();
      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passwordInput.fill(TEST_PASSWORD);
        await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
      }
    }

    // Deve chegar em alguma página autenticada (não login)
    await page.waitForURL(url => !url.toString().includes('sign-in') && !url.toString().includes('login'), {
      timeout: 15000
    });
    expect(page.url()).not.toContain('sign-in');
  });

  test('04 — Dashboard principal carrega após login', async ({ page }) => {
    await page.goto(BASE_URL);
    await realizarLogin(page);

    // Algum elemento de navegação visível
    await expect(
      page.locator('nav, .sidebar, .menu, [class*="nav"]').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('05 — Menu de navegação responde ao clique', async ({ page }) => {
    await page.goto(BASE_URL);
    await realizarLogin(page);

    // Primeiro item de menu clicável
    const menuItem = page.locator('nav a, .menu a, .sidebar a').first();
    await expect(menuItem).toBeVisible({ timeout: 10000 });
    await menuItem.click();
    await page.waitForLoadState('networkidle');

    // Não deve dar erro 404 ou 500
    expect(page.url()).not.toContain('404');
    expect(page.url()).not.toContain('error');
  });

  test('06 — Nenhuma requisição de API retorna 500', async ({ page }) => {
    const serverErrors = [];

    page.on('response', response => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} — ${response.url()}`);
      }
    });

    await page.goto(BASE_URL);
    await realizarLogin(page);
    await page.waitForLoadState('networkidle');

    expect(serverErrors).toHaveLength(0);
  });

});

// Helpers
async function realizarLogin(page) {
  // Se já estiver logado, retorna
  if (!page.url().includes('sign-in') && !page.url().includes('login')) {
    return;
  }

  const emailInput = page.locator('input[type="email"]').first();
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailInput.fill(TEST_EMAIL);
    await page.locator('button[type="submit"]').first().click();

    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passwordInput.fill(TEST_PASSWORD);
      await page.locator('button[type="submit"]').first().click();
    }

    await page.waitForURL(url => !url.toString().includes('sign-in'), { timeout: 15000 });
  }
}

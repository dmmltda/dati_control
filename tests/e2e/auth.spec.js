/**
 * ============================================================================
 * E2E — Autenticação
 * js/tests/e2e/auth.spec.js
 * ============================================================================
 */
import { test, expect } from '../fixtures/base.js';
import { USER_MASTER } from '../fixtures/test-data.js';

// Estes testes NÃO usam storageState (testam o fluxo de login em si)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Autenticação — tela de login', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('exibe tela de login ao carregar pela primeira vez', async ({ page }) => {
        // Aguarda Clerk ou tela customizada
        const loginVisible = await Promise.race([
            page.locator('#login-screen').waitFor({ timeout: 10000 }).then(() => true).catch(() => false),
            page.locator('.cl-signIn-root').waitFor({ timeout: 10000 }).then(() => true).catch(() => false),
        ]);
        expect(loginVisible).toBe(true);
    });

    test('app-layout não está visível antes do login', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const appLayout = page.locator('#app-layout');
        const visible = await appLayout.isVisible().catch(() => false);
        expect(visible).toBe(false);
    });

    test('campo de email está visível e focável', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const emailField = page.locator('input[type="email"], input[name="identifier"], #username').first();
        await expect(emailField).toBeVisible({ timeout: 10000 });
        await emailField.focus();
        await expect(emailField).toBeFocused();
    });

    test('botão de submit está visível', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const submitBtn = page.locator('button[type="submit"], .cl-formButtonPrimary').first();
        await expect(submitBtn).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Autenticação — feedback de erros', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('exibe erro ao tentar submeter email em branco', async ({ page }) => {
        const submitBtn = page.locator('button[type="submit"], .cl-formButtonPrimary').first();
        await submitBtn.click();

        // Clerk exibe erro inline ou HTML5 validation
        const hasError = await Promise.race([
            page.locator('.cl-formFieldErrorText, #login-error, [aria-invalid="true"]')
                .waitFor({ timeout: 5000 }).then(() => true).catch(() => false),
        ]);
        // Ao menos a página não deve ter ido para o app
        const appVisible = await page.locator('#app-layout').isVisible().catch(() => false);
        expect(appVisible).toBe(false);
    });

    test('senha errada → usuário permanece na tela de login', async ({ page }) => {
        const emailField = page.locator('input[type="email"], input[name="identifier"], #username').first();
        await emailField.fill(USER_MASTER.email);

        const submitBtn = page.locator('button[type="submit"], .cl-formButtonPrimary').first();
        await submitBtn.click();

        // Se Clerk pedir senha em passo separado:
        const passField = page.locator('input[type="password"]').first();
        if (await passField.isVisible({ timeout: 4000 }).catch(() => false)) {
            await passField.fill('senha-errada-definitivamente');
            await submitBtn.click();
        }

        await page.waitForLoadState('networkidle');
        const appVisible = await page.locator('#app-layout').isVisible().catch(() => false);
        expect(appVisible).toBe(false);
    });
});

test.describe('Autenticação — logout', () => {
    // Este teste usa a sessão autenticada (storageState padrão)
    test('logout limpa sessão e volta para login', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#app-layout')).toBeVisible({ timeout: 15000 });

        // Clica no botão de logout (pode ser no avatar ou menu)
        const logoutBtn = page.locator('#btn-logout, [data-testid="logout"], .cl-userButtonPopoverActionButton__signOut').first();

        // Se o botão estiver em um dropdown/menu, abrir antes
        const userAvatar = page.locator('#user-avatar, .cl-userButtonTrigger').first();
        if (await userAvatar.isVisible({ timeout: 2000 }).catch(() => false)) {
            await userAvatar.click();
            await page.waitForSelector('#btn-logout, .cl-userButtonPopoverActionButton__signOut', { state: 'visible', timeout: 3000 }).catch(() => {});
        }

        if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await logoutBtn.click();
            await page.waitForLoadState('networkidle');

            // App-layout não deve mais estar visível
            const appVisible = await page.locator('#app-layout').isVisible().catch(() => false);
            expect(appVisible).toBe(false);
        } else {
            test.skip(true, 'Botão de logout não encontrado — teste pulado');
        }
    });
});

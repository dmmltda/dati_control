/**
 * ============================================================================
 * Setup Global — Login e Seed de Dados para E2E
 * js/tests/e2e/fixtures/login.setup.js
 * ============================================================================
 * Este arquivo é executado UMA VEZ antes de todos os specs (project 'setup').
 * Salva o storageState autenticado para que os specs não precisem fazer login.
 *
 * Playwright usa storageState (cookies + localStorage do Clerk) para manter
 * a sessão entre os testes sem repetir o fluxo de login.
 * ============================================================================
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { USER_MASTER } from './test-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR  = path.join(__dirname, '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'master.json');

// ─── Login Master ─────────────────────────────────────────────────────────────

setup('autenticar como master e salvar sessão', async ({ page }) => {
    await page.goto('/');

    // Aguarda tela de login aparecer (Clerk renderiza de forma assíncrona)
    const clerkSignIn = page.locator('.cl-signIn-root, #sign-in-form, [data-clerk-sign-in]');
    const customLogin = page.locator('#login-screen');

    // Espera por um dos dois (Clerk hosted ou login customizado)
    await Promise.race([
        clerkSignIn.waitFor({ timeout: 15000 }).catch(() => null),
        customLogin.waitFor( { timeout: 15000 }).catch(() => null),
    ]);

    const isClerk = await clerkSignIn.isVisible().catch(() => false);

    if (isClerk) {
        // ── Fluxo Clerk HostedUI ──────────────────────────────────────────
        await page.fill('input[name="identifier"], input[type="email"]', USER_MASTER.email);
        await page.click('button[type="submit"], .cl-formButtonPrimary');
        await page.waitForTimeout(1000);

        // Clerk tem um step de senha separado
        const passField = page.locator('input[type="password"]');
        if (await passField.isVisible({ timeout: 5000 }).catch(() => false)) {
            await passField.fill(USER_MASTER.password);
            await page.click('button[type="submit"], .cl-formButtonPrimary');
        }

    } else {
        // ── Fluxo login customizado (TEST_MODE) ───────────────────────────
        // Em TEST_MODE o servidor aceita qualquer token — simulamos login
        await page.evaluate((email) => {
            // Injeta diretamente no storage para simular a sessão
            localStorage.setItem('__e2e_user_email', email);
            localStorage.setItem('__e2e_user_type', 'master');
        }, USER_MASTER.email);
    }

    // Aguarda o app carregar (app-layout visível = login OK)
    await expect(page.locator('#app-layout, .app-shell, [data-testid="app-layout"]'))
        .toBeVisible({ timeout: 20000 });

    // Salva o storageState (cookies + localStorage + sessionStorage)
    await page.context().storageState({ path: AUTH_FILE });

    console.log(`[setup] ✅ Sessão master salva em ${AUTH_FILE}`);
});

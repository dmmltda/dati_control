/**
 * ============================================================================
 * Setup Global — Login e Seed de Dados para E2E
 * tests/e2e/fixtures/login.setup.js
 * ============================================================================
 * Executado UMA VEZ antes de todos os specs (project 'setup').
 * Salva o storageState autenticado para que os specs não precisem fazer login.
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

    // 1. Aguarda o Clerk ou o login customizado aparecer
    //    (a splash ".screen#app-layout" desaparece antes do Clerk renderizar)
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Clerk é client-side — precisa de um tick extra

    // 2. Detecta qual fluxo está ativo
    const clerkEmail    = page.locator('#identifier-field, input[name="identifier"], input[type="email"]');
    const clerkPassword = page.locator('#password-field, input[type="password"]');
    const customLogin   = page.locator('#login-screen');

    const clerkVisible  = await clerkEmail.first().isVisible({ timeout: 10000 }).catch(() => false);
    const customVisible = await customLogin.isVisible({ timeout: 3000 }).catch(() => false);

    if (clerkVisible) {
        // ── Fluxo Clerk (email + senha na mesma tela, ou em dois passos) ──────
        console.log('[setup] Clerk detectado — fazendo login...');

        await clerkEmail.first().fill(USER_MASTER.email);

        // Verifica se senha também já está visível (single-step)
        const passVisibleNow = await clerkPassword.isVisible({ timeout: 1000 }).catch(() => false);

        if (!passVisibleNow) {
            // Two-step: clica em "Continue" para avançar ao passo de senha
            await page.click('button[type="submit"], .cl-formButtonPrimary').catch(() => {});
            await clerkPassword.waitFor({ timeout: 8000 }).catch(() => {});
        }

        const passVisible = await clerkPassword.isVisible({ timeout: 5000 }).catch(() => false);
        if (passVisible) {
            await clerkPassword.fill(USER_MASTER.password);
            await page.click('button[type="submit"], .cl-formButtonPrimary');
        }

    } else if (customVisible) {
        // ── Fluxo login customizado (TEST_MODE) ───────────────────────────────
        console.log('[setup] Login customizado detectado — injetando sessão...');
        await page.evaluate((email) => {
            localStorage.setItem('__e2e_user_email', email);
            localStorage.setItem('__e2e_user_type', 'master');
        }, USER_MASTER.email);

        // Recarrega para que o app leia o localStorage e inicialize autenticado
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1500); // tick extra para hydration do app

    } else {
        // ── Já logado? Verifica se o app está visível ─────────────────────────
        console.log('[setup] Nenhum form de login encontrado — talvez já esteja logado');
    }

    // 3. Aguarda o app carregar após o login
    //    O sidebar com links [data-view] é o sinal mais confiável de sessão ativa
    await expect(
        page.locator('[data-view="dashboard"], [data-view="company-list"], #sidebar').first()
    ).toBeVisible({ timeout: 30000 });

    // 4. Salva o storageState (cookies + localStorage + sessionStorage)
    await page.context().storageState({ path: AUTH_FILE });
    console.log(`[setup] ✅ Sessão master salva em ${AUTH_FILE}`);
});

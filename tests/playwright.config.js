// @ts-check
/**
 * ============================================================================
 * Playwright Config — Smoke Tests (Produção / ngrok)
 * ============================================================================
 * Suíte leve de smoke tests voltada a validar o app em produção ou via ngrok.
 *
 * Diferente de js/tests/e2e/ (testes de integração, servidor local, fixtures),
 * esta suíte usa CommonJS + login simples e roda contra URLs públicas.
 *
 * Como rodar:
 *   npx playwright test --config=tests/playwright.config.js
 *
 * Variáveis de ambiente (opcional):
 *   BASE_URL      — URL do app (padrão: ngrok definido em cada spec)
 *   TEST_EMAIL    — Email do usuário de teste
 *   TEST_PASSWORD — Senha do usuário de teste
 * ============================================================================
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './',
    testMatch: '**/*.spec.js',

    // Smoke tests são simples — não é necessário rodar em paralelo
    fullyParallel: false,

    // Sem retries por default (falhou = bug real)
    retries: 0,

    timeout: 45000,

    expect: { timeout: 10000 },

    reporter: [
        ['list'],
        ['html', { outputFolder: '../test-results/smoke/', open: 'never' }],
    ],

    use: {
        screenshot: 'only-on-failure',
        video: 'off',
        viewport: { width: 1440, height: 900 },
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});

/**
 * ============================================================================
 * Playwright Config — Journey CRM E2E
 * ============================================================================
 * Sobe o servidor Express (não Python http.server — precisa de /api/).
 * Base URL: http://localhost:3001 (isolada da porta de dev 8000 e test 3099)
 * ============================================================================
 */
import { defineConfig, devices } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carrega .env.e2e (variáveis específicas dos testes E2E)
dotenvConfig({ path: path.join(__dirname, 'js/tests/e2e/.env.e2e') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const IS_CI    = !!process.env.CI;

export default defineConfig({
    testDir: './js/tests/e2e',
    testMatch: '**/*.spec.js',

    // Cada spec é independente — pode rodar em paralelo
    fullyParallel: true,

    // Em CI, falha se .only escapar por engano
    forbidOnly: IS_CI,

    // Em CI: 2 retries para flakiness de rede; local: 0
    retries: IS_CI ? 2 : 0,

    // Em CI: 1 worker (banco pode colidir); local: automático
    workers: IS_CI ? 1 : undefined,

    // Timeout global por teste
    timeout: 30000,

    // Timeout de asserções expect()
    expect: { timeout: 8000 },

    // ─── Repórteres ──────────────────────────────────────────────────────────
    reporter: [
        ['html',  { outputFolder: 'js/tests/e2e/report/', open: 'never' }],
        ['json',  { outputFile:   'js/tests/e2e/results/results.json' }],
        ['line'],
    ],

    // ─── Configurações globais de uso ────────────────────────────────────────
    use: {
        baseURL:    BASE_URL,
        screenshot: 'only-on-failure',
        video:      'retain-on-failure',
        trace:      'on-first-retry',

        // Viewport padrão desktop
        viewport: { width: 1440, height: 900 },

        // Locale PT-BR para testes de formatação de data/moeda
        locale:   'pt-BR',
        timezone: 'America/Sao_Paulo',
    },

    // ─── Output de artefatos ─────────────────────────────────────────────────
    outputDir: 'js/tests/e2e/results/',

    // ─── Projetos ────────────────────────────────────────────────────────────
    projects: [
        // Chromium — executa sempre (local + CI)
        {
            name:    'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // storageState salvo pelo script de auth (login.setup.js)
                storageState: 'js/tests/e2e/fixtures/.auth/master.json',
            },
            dependencies: ['setup'],
        },

        // Firefox — apenas em CI (economiza tempo local)
        ...(IS_CI ? [{
            name: 'firefox',
            use: {
                ...devices['Desktop Firefox'],
                storageState: 'js/tests/e2e/fixtures/.auth/master.json',
            },
            dependencies: ['setup'],
        }] : []),

        // Projeto de setup (login, seed de dados)
        {
            name:     'setup',
            testMatch: '**/fixtures/login.setup.js',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],

    // ─── Web Server ──────────────────────────────────────────────────────────
    webServer: {
        command: 'node server/index.js',
        url:     BASE_URL,
        reuseExistingServer: !IS_CI,
        timeout: 30000,
        env: {
            PORT:         '3001',
            NODE_ENV:     'test',
            TEST_MODE:    'true',  // bypassa Clerk JWT nos testes
            DATABASE_URL: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || '',
        },
    },
});

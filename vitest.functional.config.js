/**
 * ============================================================================
 * Vitest Config — Testes Funcionais (Backend)
 * ============================================================================
 * Ambiente: node (não jsdom — testa endpoints HTTP reais)
 * Setup:    js/tests/functional/setup.js
 * Inclui:   js/tests/functional/**\/*.test.js
 *
 * Uso: npm run test:functional
 * ============================================================================
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'functional',
        environment: 'node',
        globals: true,

        // Carrega setup antes de cada suíte
        setupFiles: ['./js/tests/functional/setup.js'],

        // Inclui apenas testes funcionais (não unitários!)
        include: ['js/tests/functional/**/*.test.js'],

        // Timeout generoso pois há I/O real (banco + servidor)
        testTimeout: 15000,
        hookTimeout: 20000,

        // Executa em sequência para evitar conflito de porta/banco
        pool: 'forks',
        poolOptions: {
            forks: { singleFork: true }
        },

        // Não gera coverage para funcionais (usa os unitários para isso)
        coverage: { enabled: false },

        // Repórteres
        reporter: ['verbose'],
    }
});

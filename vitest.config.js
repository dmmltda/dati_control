import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            thresholds: {
                lines: 40,       // Fase 1: threshold atual
                functions: 40,
                branches: 40,
                statements: 40,
            },
            include: ['js/modules/**/*.js', 'js/core/**/*.js'],
            exclude: ['js/app.js', 'js/modules/log-testes.js']
        },
        include: ['js/tests/unit/**/*.test.js'],
        // Reporter padrão: verbose no terminal
        reporter: ['verbose'],
    }
});


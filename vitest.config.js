import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['js/modules/**/*.js'],
            exclude: ['js/app.js']
        },
        include: ['js/tests/unit/**/*.test.js']
    }
});

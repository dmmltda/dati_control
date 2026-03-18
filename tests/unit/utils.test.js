/**
 * @file utils.test.js
 * Testes unitários para o módulo de utilidades (utils.js)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage before importing utils
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

import { maskCurrency } from '../../modules/utils.js';

// ------- maskCurrency -------
describe('utils.js — maskCurrency()', () => {
    const makeInput = (value) => ({ value });

    it('deve formatar 100 como "1,00"', () => {
        const input = makeInput('100');
        maskCurrency(input);
        expect(input.value).toBe('1,00');
    });

    it('deve formatar 150000 como "1.500,00"', () => {
        const input = makeInput('150000');
        maskCurrency(input);
        expect(input.value).toBe('1.500,00');
    });

    it('deve formatar 10000000 como "100.000,00"', () => {
        const input = makeInput('10000000');
        maskCurrency(input);
        expect(input.value).toBe('100.000,00');
    });

    it('deve remover caracteres não numéricos antes de formatar', () => {
        const input = makeInput('abc123def');
        maskCurrency(input);
        expect(input.value).toBe('1,23');
    });

    it('deve retornar "0,00" para string vazia', () => {
        const input = makeInput('');
        maskCurrency(input);
        expect(input.value).toBe('0,00');
    });
});

// ------- getBase64 -------
describe('utils.js — getBase64()', () => {
    it('deve retornar null para arquivo undefined', async () => {
        const { getBase64 } = await import('../../modules/utils.js');
        const result = await getBase64(undefined);
        expect(result).toBeNull();
    });

    it('deve rejeitar arquivos maiores que 2MB', async () => {
        const { getBase64 } = await import('../../modules/utils.js');
        // Mock de arquivo grande
        const bigFile = { size: 3 * 1024 * 1024, name: 'grande.pdf' };
        await expect(getBase64(bigFile)).rejects.toMatch(/2MB/);
    });
});

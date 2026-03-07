/**
 * @file config.test.js
 * Testes unitários para o módulo de configuração (config.js)
 */
import { describe, it, expect } from 'vitest';
import { DB_KEY, STATUS_CONFIG, CS_VISIBLE_STATUSES } from '../../modules/config.js';

describe('config.js — DB_KEY', () => {
    it('deve ter uma chave de banco de dados definida', () => {
        expect(DB_KEY).toBeDefined();
        expect(typeof DB_KEY).toBe('string');
        expect(DB_KEY.length).toBeGreaterThan(0);
    });
});

describe('config.js — STATUS_CONFIG', () => {
    const expectedStatuses = [
        'Prospect',
        'Lead',
        'Reunião',
        'Proposta | Andamento',
        'Proposta | Recusada',
        'Cliente Ativo',
        'Cliente Suspenso',
        'Cliente Inativo'
    ];

    it('deve ter todos os status esperados', () => {
        expectedStatuses.forEach(status => {
            expect(STATUS_CONFIG[status], `Status "${status}" deve existir`).toBeDefined();
        });
    });

    it('cada status deve ter icon, class e color', () => {
        expectedStatuses.forEach(status => {
            const config = STATUS_CONFIG[status];
            expect(config.icon, `${status}.icon`).toBeDefined();
            expect(config.class, `${status}.class`).toBeDefined();
            expect(config.color, `${status}.color`).toBeDefined();
            expect(config.color).toMatch(/^#[0-9a-fA-F]{3,6}$/);
        });
    });

    it('classes CSS de status devem seguir o padrão "status-*"', () => {
        expectedStatuses.forEach(status => {
            expect(STATUS_CONFIG[status].class).toMatch(/^status-/);
        });
    });
});

describe('config.js — CS_VISIBLE_STATUSES', () => {
    it('deve ser um array', () => {
        expect(Array.isArray(CS_VISIBLE_STATUSES)).toBe(true);
    });

    it('deve incluir apenas os 3 status de cliente', () => {
        expect(CS_VISIBLE_STATUSES).toContain('Cliente Ativo');
        expect(CS_VISIBLE_STATUSES).toContain('Cliente Inativo');
        expect(CS_VISIBLE_STATUSES).toContain('Cliente Suspenso');
    });

    it('NÃO deve incluir status de pré-venda', () => {
        const preVendaStatuses = ['Prospect', 'Lead', 'Reunião', 'Proposta | Andamento', 'Proposta | Recusada'];
        preVendaStatuses.forEach(status => {
            expect(CS_VISIBLE_STATUSES).not.toContain(status);
        });
    });

    it('deve ter exatamente 3 itens', () => {
        expect(CS_VISIBLE_STATUSES).toHaveLength(3);
    });
});

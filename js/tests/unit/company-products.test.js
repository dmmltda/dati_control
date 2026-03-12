/**
 * ============================================================================
 * Testes Unitários — Produtos DATI (lógica pura de cálculo e validação)
 * js/modules/company-products/
 * ============================================================================
 * Testamos a lógica de negócio dos produtos:
 * - Cálculo de valor total (valor_unitario × qtd_usuarios)
 * - Validação de produto (campos obrigatórios)
 * - Formatação de moeda
 * - Lógica de cobrança (setup, adicional por usuário)
 */
import { describe, it, expect } from 'vitest';

// ─── Lógica pura extraída das regras de negócio de produtos ──────────────────

/**
 * Calcula o valor total de um produto.
 * Regra: Valor_total = Valor_unitario × Qtd_usuarios
 */
function calculateTotal(valorUnitario, qtdUsuarios) {
    if (!valorUnitario || !qtdUsuarios) return 0;
    return parseFloat(valorUnitario) * parseInt(qtdUsuarios);
}

/**
 * Calcula custo adicional por usuário extra.
 */
function calculateAdditionalUserCost(qtdExtra, valorUserAdic) {
    if (!qtdExtra || !valorUserAdic) return 0;
    return parseInt(qtdExtra) * parseFloat(valorUserAdic);
}

/**
 * Valida um produto antes de salvar.
 * Retorna { valid, errors }
 */
function validateProduct(produto) {
    const errors = [];
    if (!produto.Produto_DATI || produto.Produto_DATI.trim().length === 0) {
        errors.push('Nome do produto é obrigatório');
    }
    if (!produto.Tipo_cobranca) {
        errors.push('Tipo de cobrança é obrigatório');
    }
    if (produto.Valor_unitario !== undefined && produto.Valor_unitario !== null) {
        const v = parseFloat(produto.Valor_unitario);
        if (isNaN(v) || v < 0) {
            errors.push('Valor unitário deve ser um número positivo');
        }
    }
    if (produto.Qtd_usuarios !== undefined && produto.Qtd_usuarios !== null) {
        const q = parseInt(produto.Qtd_usuarios);
        if (isNaN(q) || q < 0) {
            errors.push('Quantidade de usuários deve ser inteiro não negativo');
        }
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Formata um número para moeda brasileira (R$ 1.500,00).
 */
function formatCurrency(value) {
    if (value === null || value === undefined || isNaN(parseFloat(value))) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(parseFloat(value));
}

/**
 * Verifica se produto tem cobrança por setup.
 */
function hasSetupCharge(produto) {
    return produto.Cobranca_setup === true || produto.Cobranca_setup === 'Sim';
}

/**
 * Calcula o valor total de setup.
 */
function getSetupTotal(produto) {
    if (!hasSetupCharge(produto)) return 0;
    return parseFloat(produto.Valor_setup || 0);
}

// ─── calculateTotal ───────────────────────────────────────────────────────────

describe('company-products — calculateTotal()', () => {
    it('calcula 150 × 3 = 450', () => {
        expect(calculateTotal(150, 3)).toBe(450);
    });

    it('calcula com string (como vem do banco como Decimal)', () => {
        expect(calculateTotal('150.00', '3')).toBe(450);
    });

    it('valorUnitario null → 0', () => {
        expect(calculateTotal(null, 3)).toBe(0);
    });

    it('qtdUsuarios null → 0', () => {
        expect(calculateTotal(150, null)).toBe(0);
    });

    it('ambos zero → 0', () => {
        expect(calculateTotal(0, 0)).toBe(0);
    });

    it('valor fracionado correto (R$ 99,90 × 10 = R$ 999)', () => {
        expect(calculateTotal(99.9, 10)).toBeCloseTo(999, 2);
    });
});

// ─── calculateAdditionalUserCost ──────────────────────────────────────────────

describe('company-products — calculateAdditionalUserCost()', () => {
    it('5 usuários extras × R$50 = R$250', () => {
        expect(calculateAdditionalUserCost(5, 50)).toBe(250);
    });

    it('qtdExtra null → 0', () => {
        expect(calculateAdditionalUserCost(null, 50)).toBe(0);
    });

    it('valorUserAdic null → 0', () => {
        expect(calculateAdditionalUserCost(5, null)).toBe(0);
    });

    it('aceita strings numéricas do banco', () => {
        expect(calculateAdditionalUserCost('2', '25.50')).toBe(51);
    });
});

// ─── validateProduct ──────────────────────────────────────────────────────────

describe('company-products — validateProduct()', () => {
    it('produto válido completo → sem erros', () => {
        const produto = {
            Produto_DATI: 'DATImonitor',
            Tipo_cobranca: 'Mensal',
            Valor_unitario: 150,
            Qtd_usuarios: 5,
        };
        const { valid, errors } = validateProduct(produto);
        expect(valid).toBe(true);
        expect(errors).toHaveLength(0);
    });

    it('nome vazio → erro obrigatório', () => {
        const { valid, errors } = validateProduct({ Produto_DATI: '', Tipo_cobranca: 'Mensal' });
        expect(valid).toBe(false);
        expect(errors.some(e => e.includes('obrigatório'))).toBe(true);
    });

    it('tipo de cobrança ausente → erro', () => {
        const { valid, errors } = validateProduct({ Produto_DATI: 'Teste', Tipo_cobranca: null });
        expect(valid).toBe(false);
        expect(errors.some(e => e.includes('cobrança'))).toBe(true);
    });

    it('valor unitário negativo → erro', () => {
        const { valid } = validateProduct({ Produto_DATI: 'X', Tipo_cobranca: 'Mensal', Valor_unitario: -10 });
        expect(valid).toBe(false);
    });

    it('qtd usuários negativo → erro', () => {
        const { valid } = validateProduct({ Produto_DATI: 'X', Tipo_cobranca: 'Mensal', Qtd_usuarios: -1 });
        expect(valid).toBe(false);
    });

    it('campos opcionais ausentes → válido', () => {
        const { valid } = validateProduct({ Produto_DATI: 'X', Tipo_cobranca: 'Anual' });
        expect(valid).toBe(true);
    });
});

// ─── formatCurrency ───────────────────────────────────────────────────────────

describe('company-products — formatCurrency()', () => {
    it('1500 → R$ 1.500,00', () => {
        expect(formatCurrency(1500)).toMatch('1.500,00');
    });

    it('99.9 → R$ 99,90', () => {
        expect(formatCurrency(99.9)).toMatch('99,90');
    });

    it('0 → R$ 0,00', () => {
        expect(formatCurrency(0)).toMatch('0,00');
    });

    it('null → R$ 0,00', () => {
        expect(formatCurrency(null)).toBe('R$ 0,00');
    });

    it('string numérica "1500" é aceita', () => {
        expect(formatCurrency('1500')).toMatch('1.500,00');
    });

    it('NaN → R$ 0,00', () => {
        expect(formatCurrency(NaN)).toBe('R$ 0,00');
    });
});

// ─── hasSetupCharge / getSetupTotal ───────────────────────────────────────────

describe('company-products — cobrança de setup', () => {
    it('Cobranca_setup = true → tem setup', () => {
        expect(hasSetupCharge({ Cobranca_setup: true })).toBe(true);
    });

    it('Cobranca_setup = "Sim" → tem setup', () => {
        expect(hasSetupCharge({ Cobranca_setup: 'Sim' })).toBe(true);
    });

    it('Cobranca_setup = false → não tem setup', () => {
        expect(hasSetupCharge({ Cobranca_setup: false })).toBe(false);
    });

    it('Cobranca_setup ausente → não tem setup', () => {
        expect(hasSetupCharge({})).toBe(false);
    });

    it('getSetupTotal com cobrança → retorna valor correto', () => {
        expect(getSetupTotal({ Cobranca_setup: true, Valor_setup: 2000 })).toBe(2000);
    });

    it('getSetupTotal sem cobrança → retorna 0', () => {
        expect(getSetupTotal({ Cobranca_setup: false, Valor_setup: 2000 })).toBe(0);
    });

    it('getSetupTotal sem Valor_setup → retorna 0', () => {
        expect(getSetupTotal({ Cobranca_setup: true })).toBe(0);
    });
});

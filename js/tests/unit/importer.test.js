/**
 * ============================================================================
 * Testes Unitários — Módulo de Importação (lógica pura)
 * js/modules/importer/import-manager.js
 * ============================================================================
 * O import-manager é fortemente acoplado ao DOM, então testamos:
 * 1. A lógica pura de parseamento/validação que pode ser extraída
 * 2. As regras de negócio do pipeline de importação
 * 3. A lógica de renderScore e filtros de qualidade
 *
 * Funções DOM-bound são cobertas pelos testes E2E (Playwright).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Helpers extraídos das regras de negócio do import ───────────────────────

/**
 * Valida uma linha CSV de empresa.
 * Regras do backend (espelhadas aqui):
 *  - empresa (Nome_da_empresa) obrigatória
 *  - cnpj opcional mas se presente deve ter pelo menos 14 dígitos
 *  - email de contato deve ter @
 */
function validateImportRow(row) {
    const errors = [];
    if (!row.empresa || row.empresa.trim().length === 0) {
        errors.push('Nome da empresa é obrigatório');
    }
    if (row.cnpj) {
        const digits = row.cnpj.replace(/\D/g, '');
        if (digits.length !== 14) {
            errors.push('CNPJ deve ter 14 dígitos');
        }
    }
    if (row.contato_email && !row.contato_email.includes('@')) {
        errors.push('E-mail de contato inválido');
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Detecta duplicados por CNPJ dentro de um array de linhas.
 */
function detectDuplicates(rows) {
    const seen = new Map();
    return rows.map((row, i) => {
        if (!row.cnpj) return { ...row, isDuplicate: false };
        const digits = row.cnpj.replace(/\D/g, '');
        if (seen.has(digits)) {
            return { ...row, isDuplicate: true, duplicateOf: seen.get(digits) };
        }
        seen.set(digits, i);
        return { ...row, isDuplicate: false };
    });
}

/**
 * Calcula o score de qualidade de uma importação.
 * Score = (valid / total) * 100
 */
function calcQualityScore({ valid, total }) {
    if (!total) return 0;
    return Math.round((valid / total) * 100);
}

/**
 * Determina se uma importação está bloqueada (>20% inválidos).
 */
function isImportBlocked({ invalid, total }) {
    if (!total) return false;
    return invalid / total > 0.2;
}

/**
 * Parseia extensão de arquivo.
 */
function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

/**
 * Verifica se formato de arquivo é suportado.
 */
function isSupportedFormat(filename) {
    return ['csv', 'xlsx', 'xls'].includes(getFileExtension(filename));
}

// ─── validateImportRow ────────────────────────────────────────────────────────

describe('import — validateImportRow()', () => {
    it('linha válida completa → sem erros', () => {
        const row = {
            empresa: 'TechCorp Ltda',
            cnpj: '12.345.678/0001-99',
            contato_email: 'joao@techcorp.com',
        };
        const { valid, errors } = validateImportRow(row);
        expect(valid).toBe(true);
        expect(errors).toHaveLength(0);
    });

    it('empresa vazia → inválido com mensagem obrigatória', () => {
        const { valid, errors } = validateImportRow({ empresa: '' });
        expect(valid).toBe(false);
        expect(errors.some(e => e.includes('obrigatório'))).toBe(true);
    });

    it('empresa sem nome (só espaços) → inválida', () => {
        const { valid } = validateImportRow({ empresa: '   ' });
        expect(valid).toBe(false);
    });

    it('CNPJ com 13 dígitos → erro de tamanho', () => {
        const { valid, errors } = validateImportRow({
            empresa: 'Empresa X',
            cnpj: '1234567890123', // 13 dígitos
        });
        expect(valid).toBe(false);
        expect(errors.some(e => e.includes('14 dígitos'))).toBe(true);
    });

    it('CNPJ formatado com pontuação é aceito se tiver 14 dígitos', () => {
        const { valid } = validateImportRow({
            empresa: 'Empresa Y',
            cnpj: '12.345.678/0001-99', // 14 dígitos
        });
        expect(valid).toBe(true);
    });

    it('e-mail sem @ → erro de formato', () => {
        const { valid, errors } = validateImportRow({
            empresa: 'Empresa Z',
            contato_email: 'email-sem-arroba.com',
        });
        expect(valid).toBe(false);
        expect(errors.some(e => e.includes('inválido'))).toBe(true);
    });

    it('CNPJ ausente é aceito (campo opcional)', () => {
        const { valid } = validateImportRow({ empresa: 'Sem CNPJ' });
        expect(valid).toBe(true);
    });
});

// ─── detectDuplicates ─────────────────────────────────────────────────────────

describe('import — detectDuplicates()', () => {
    it('array sem duplicados → isDuplicate false para todos', () => {
        const rows = [
            { empresa: 'A', cnpj: '11111111000111' },
            { empresa: 'B', cnpj: '22222222000122' },
        ];
        const result = detectDuplicates(rows);
        expect(result.every(r => !r.isDuplicate)).toBe(true);
    });

    it('segunda ocorrência do mesmo CNPJ → isDuplicate true', () => {
        const cnpj = '11.111.111/0001-11';
        const rows = [
            { empresa: 'Primeira',  cnpj },
            { empresa: 'Duplicada', cnpj },
        ];
        const result = detectDuplicates(rows);
        expect(result[0].isDuplicate).toBe(false);
        expect(result[1].isDuplicate).toBe(true);
        expect(result[1].duplicateOf).toBe(0); // índice da primeira
    });

    it('linha sem CNPJ → nunca é duplicata', () => {
        const rows = [
            { empresa: 'A', cnpj: null },
            { empresa: 'B', cnpj: null },
        ];
        const result = detectDuplicates(rows);
        expect(result.every(r => !r.isDuplicate)).toBe(true);
    });

    it('CNPJ com formatações diferentes são normalizados corretamente', () => {
        const rows = [
            { empresa: 'A', cnpj: '11.111.111/0001-11' },
            { empresa: 'B', cnpj: '11111111000111' }, // mesmo CNPJ sem máscara
        ];
        const result = detectDuplicates(rows);
        expect(result[1].isDuplicate).toBe(true);
    });
});

// ─── calcQualityScore ─────────────────────────────────────────────────────────

describe('import — calcQualityScore()', () => {
    it('100% válidos → score 100', () => {
        expect(calcQualityScore({ valid: 50, total: 50 })).toBe(100);
    });

    it('0 válidos → score 0', () => {
        expect(calcQualityScore({ valid: 0, total: 50 })).toBe(0);
    });

    it('80 de 100 → score 80', () => {
        expect(calcQualityScore({ valid: 80, total: 100 })).toBe(80);
    });

    it('total 0 → score 0 (sem divisão por zero)', () => {
        expect(calcQualityScore({ valid: 0, total: 0 })).toBe(0);
    });

    it('arredonda corretamente (1 de 3 = 33)', () => {
        expect(calcQualityScore({ valid: 1, total: 3 })).toBe(33);
    });
});

// ─── isImportBlocked ─────────────────────────────────────────────────────────

describe('import — isImportBlocked()', () => {
    it('21% inválidos → bloqueado', () => {
        expect(isImportBlocked({ invalid: 21, total: 100 })).toBe(true);
    });

    it('20% inválidos → não bloqueado (limite exclusivo)', () => {
        expect(isImportBlocked({ invalid: 20, total: 100 })).toBe(false);
    });

    it('0% inválidos → não bloqueado', () => {
        expect(isImportBlocked({ invalid: 0, total: 100 })).toBe(false);
    });

    it('total 0 → não bloqueado', () => {
        expect(isImportBlocked({ invalid: 0, total: 0 })).toBe(false);
    });
});

// ─── isSupportedFormat ───────────────────────────────────────────────────────

describe('import — isSupportedFormat()', () => {
    it('CSV é aceito', () => {
        expect(isSupportedFormat('empresas.csv')).toBe(true);
    });

    it('XLSX é aceito', () => {
        expect(isSupportedFormat('planilha.xlsx')).toBe(true);
    });

    it('XLS é aceito', () => {
        expect(isSupportedFormat('planilha.xls')).toBe(true);
    });

    it('PDF não é aceito', () => {
        expect(isSupportedFormat('relatorio.pdf')).toBe(false);
    });

    it('DOC não é aceito', () => {
        expect(isSupportedFormat('importar.doc')).toBe(false);
    });

    it('arquivo sem extensão → false', () => {
        expect(isSupportedFormat('semextensao')).toBe(false);
    });
});

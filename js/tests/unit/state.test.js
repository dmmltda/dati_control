/**
 * @file state.test.js
 * Testes unitários para o módulo de estado (state.js)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { state, resetTempState } from '../../modules/state.js';

describe('state.js — estrutura inicial', () => {
    it('deve ter o array companies', () => {
        expect(Array.isArray(state.companies)).toBe(true);
    });

    it('deve ter currentEditingId nulo por padrão', () => {
        expect(state.currentEditingId).toBeNull();
    });

    it('deve ter arrays de temp vazios inicialmente', () => {
        expect(Array.isArray(state.tempContatos)).toBe(true);
        expect(Array.isArray(state.tempProdutos)).toBe(true);
        expect(Array.isArray(state.tempDashboards)).toBe(true);
        expect(Array.isArray(state.tempNPSHistory)).toBe(true);
        expect(Array.isArray(state.tempReunioesCS)).toBe(true);
        expect(Array.isArray(state.tempChamados)).toBe(true);
        expect(Array.isArray(state.tempNotes)).toBe(true);
        expect(Array.isArray(state.tempReunioes)).toBe(true);
    });

    it('editingContatoIndex deve ser -1 por padrão', () => {
        expect(state.editingContatoIndex).toBe(-1);
    });

    it('editingProdutoIndex deve ser -1 por padrão', () => {
        expect(state.editingProdutoIndex).toBe(-1);
    });
});

describe('state.js — resetTempState()', () => {
    beforeEach(() => {
        // Popular o estado antes do reset
        state.tempContatos.push({ nome: 'Teste' });
        state.tempProdutos.push({ nome: 'DATI Import' });
        state.tempDashboards.push({ data: '2024-01-01' });
        state.tempNPSHistory.push({ score: 9 });
        state.tempReunioesCS.push({ data: '2024-01-01' });
        state.tempChamados.push({ numero: '001' });
        state.tempNotes.push({ text: 'nota' });
        state.tempReunioes.push({ data: '2024-01-01' });
        state.currentEditingId = 'comp_123';
        state.editingContatoIndex = 2;
        state.editingProdutoIndex = 1;
    });

    it('deve limpar todos os arrays temporários', () => {
        resetTempState();
        expect(state.tempContatos).toHaveLength(0);
        expect(state.tempProdutos).toHaveLength(0);
        expect(state.tempDashboards).toHaveLength(0);
        expect(state.tempNPSHistory).toHaveLength(0);
        expect(state.tempReunioesCS).toHaveLength(0);
        expect(state.tempChamados).toHaveLength(0);
        expect(state.tempNotes).toHaveLength(0);
        expect(state.tempReunioes).toHaveLength(0);
    });

    it('deve resetar os índices de edição para -1', () => {
        resetTempState();
        expect(state.editingContatoIndex).toBe(-1);
        expect(state.editingProdutoIndex).toBe(-1);
    });

    it('deve resetar o currentEditingId para null', () => {
        resetTempState();
        expect(state.currentEditingId).toBeNull();
    });
});

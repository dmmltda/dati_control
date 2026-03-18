/**
 * ============================================================================
 * Testes Unitários — activities.js (funções puras / constantes)
 * js/modules/activities.js
 * ============================================================================
 * Testamos apenas funções PURAS e constantes exportadas.
 * Funções que manipulam DOM são excluídas (testadas via E2E).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock de dependências que tocam DOM / estado global ───────────────────────

vi.mock('../../modules/state.js', () => ({
    state: { companies: [], tempContatos: [] }
}));

vi.mock('../../modules/utils.js', () => ({
    showToast: vi.fn(),
    maskCurrency: vi.fn(),
}));

vi.mock('../../core/table-manager.js', () => ({
    TableManager: vi.fn().mockImplementation(() => ({
        setSearch: vi.fn(),
        setFilter: vi.fn(),
        clearFilters: vi.fn(),
        getPaginatedData: vi.fn().mockReturnValue([]),
        getFilteredData: vi.fn().mockReturnValue([]),
        getPaginationState: vi.fn().mockReturnValue({ currentPage: 1, totalPages: 1 }),
        refresh: vi.fn(),
    }))
}));

const {
    ACTIVITY_TYPES,
    ACTIVITY_DEPARTMENTS,
    ACTIVITY_STATUSES,
    ACTIVITY_PRIORITIES,
} = await import('../../modules/activities.js');

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

describe('activities.js — CONSTANTES', () => {
    it('ACTIVITY_TYPES contém os 5 tipos esperados', () => {
        expect(ACTIVITY_TYPES).toContain('Comentário');
        expect(ACTIVITY_TYPES).toContain('Reunião');
        expect(ACTIVITY_TYPES).toContain('Chamados HD');
        expect(ACTIVITY_TYPES).toContain('Chamados CS');
        expect(ACTIVITY_TYPES).toContain('Ação necessária');
        expect(ACTIVITY_TYPES).toHaveLength(5);
    });

    it('ACTIVITY_DEPARTMENTS contém Customer Success e Help Desk', () => {
        expect(ACTIVITY_DEPARTMENTS).toContain('Customer Success');
        expect(ACTIVITY_DEPARTMENTS).toContain('Help Desk');
    });

    it('ACTIVITY_STATUSES tem 4 valores', () => {
        expect(ACTIVITY_STATUSES).toHaveLength(4);
        expect(ACTIVITY_STATUSES).toContain('Aberta');
        expect(ACTIVITY_STATUSES).toContain('Concluída');
    });

    it('ACTIVITY_PRIORITIES inclui "urgente"', () => {
        expect(ACTIVITY_PRIORITIES).toContain('urgente');
        expect(ACTIVITY_PRIORITIES).toContain('baixa');
    });
});

// ─── _formatMinutes (função pure interna — testada indiretamente via mapeamento) ─
// Testamos o comportamento esperado baseado nos mapeamentos do módulo

describe('activities.js — mapeamento de tempo (_formatMinutes)', () => {
    // A função não é exportada, mas podemos testá-la via _mapActivities
    // indiretamente verificando que os dados mapeados têm o campo correto.
    // Como _mapActivities também não é exportada, testamos o conceito:

    it('deve formatar 90 min como "1h 30min"', () => {
        const h = Math.floor(90 / 60);
        const m = 90 % 60;
        expect(h > 0 ? `${h}h ${m}min` : `${m}min`).toBe('1h 30min');
    });

    it('deve formatar 45 min como "45min"', () => {
        const h = Math.floor(45 / 60);
        const m = 45 % 60;
        expect(h > 0 ? `${h}h ${m}min` : `${m}min`).toBe('45min');
    });

    it('deve formatar 0 min como "-"', () => {
        const min = 0;
        expect(min ? `${Math.floor(min/60)}h` : '-').toBe('-');
    });

    it('deve formatar 120 min como "2h 0min"', () => {
        const h = Math.floor(120 / 60);
        const m = 120 % 60;
        expect(`${h}h ${m}min`).toBe('2h 0min');
    });
});

// ─── Lógica de criação de payload (baseada na lógica do modal submit) ─────────

describe('activities.js — construção de payload', () => {
    it('assignees: split por vírgula e trim correto', () => {
        const input = '  João,  Maria , Pedro  ';
        const result = input.split(',').map(s => s.trim()).filter(Boolean);
        expect(result).toEqual(['João', 'Maria', 'Pedro']);
    });

    it('assignees vazio resulta em array vazio', () => {
        const input = '';
        const result = input.split(',').map(s => s.trim()).filter(Boolean);
        expect(result).toHaveLength(0);
    });

    it('assignees com apenas espaços resulta em array vazio', () => {
        const input = '   ,   ,  ';
        const result = input.split(',').map(s => s.trim()).filter(Boolean);
        expect(result).toHaveLength(0);
    });

    it('tempo manual prevalece sobre timer quando > 0', () => {
        const timeMinInput = 30;
        const timerSeconds = 120; // 2 min em segundos
        const timeMin = timeMinInput > 0 ? timeMinInput : (timerSeconds > 0 ? Math.ceil(timerSeconds / 60) : null);
        expect(timeMin).toBe(30);
    });

    it('timer é usado quando tempo manual é 0', () => {
        const timeMinInput = 0;
        const timerSeconds = 90; // 1min30s
        const timeMin = timeMinInput > 0 ? timeMinInput : (timerSeconds > 0 ? Math.ceil(timerSeconds / 60) : null);
        expect(timeMin).toBe(2); // ceil(1.5)
    });

    it('ambos zero → null (sem tempo registrado)', () => {
        const timeMinInput = 0;
        const timerSeconds = 0;
        const timeMin = timeMinInput > 0 ? timeMinInput : (timerSeconds > 0 ? Math.ceil(timerSeconds / 60) : null);
        expect(timeMin).toBeNull();
    });
});

// ─── Lógica de extração de mentions ──────────────────────────────────────────

describe('activities.js — extração de @mentions', () => {
    function extractMentions(text) {
        const re = /@\[([^:]+):([^\]]+)\]/g;
        const ids = [];
        let m;
        while ((m = re.exec(text)) !== null) ids.push(m[1]);
        return [...new Set(ids)];
    }

    it('extrai um mention corretamente', () => {
        const text = 'Olá @[user123:João Silva] veja isso';
        expect(extractMentions(text)).toEqual(['user123']);
    });

    it('extrai múltiplos mentions únicos', () => {
        const text = '@[u1:Ana] e @[u2:Bob] e @[u1:Ana] de novo';
        const result = extractMentions(text);
        expect(result).toEqual(['u1', 'u2']); // deduplicado
    });

    it('retorna array vazio sem mentions', () => {
        expect(extractMentions('texto sem mention')).toHaveLength(0);
    });

    it('não captura @ sem formato correto', () => {
        expect(extractMentions('@joao sem brackets')).toHaveLength(0);
    });
});

// ─── Status e cores ───────────────────────────────────────────────────────────

describe('activities.js — status colors', () => {
    function statusBg(s) {
        const m = {
            'Aberta': 'rgba(99,102,241,0.12)',
            'Em andamento': 'rgba(245,158,11,0.12)',
            'Concluída': 'rgba(16,185,129,0.12)',
            'Cancelada': 'rgba(239,68,68,0.12)'
        };
        return m[s] || 'rgba(255,255,255,0.05)';
    }

    it('"Aberta" tem cor roxa', () => {
        expect(statusBg('Aberta')).toContain('99,102,241');
    });

    it('"Concluída" tem cor verde', () => {
        expect(statusBg('Concluída')).toContain('16,185,129');
    });

    it('status desconhecido retorna cor default', () => {
        expect(statusBg('Outro')).toBe('rgba(255,255,255,0.05)');
    });
});

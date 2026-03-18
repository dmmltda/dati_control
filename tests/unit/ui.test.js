/**
 * @file ui.test.js
 * Testes unitários para o módulo de UI — funções de renderização (ui.js)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { state, resetTempState } from '../../modules/state.js';

// --- Setup DOM mínimo ---
function setupUiDOM() {
    const containers = {
        'dashboard-stats': 'div',
        'company-table-body': 'tbody',
        'contatos-table-body': 'tbody',
        'produtos-table-body': 'tbody',
        'dashboards-table-body': 'tbody',
        'nps-history-table-body': 'tbody',
        'cs-meetings-table-body': 'tbody',
        'tickets-table-body': 'tbody',
        'cs-timeline': 'div',
        'meetings-table-body': 'tbody',
        'search-empresa': 'input',
        'filter-status': 'select',
    };
    Object.entries(containers).forEach(([id, tag]) => {
        if (!document.getElementById(id)) {
            const el = document.createElement(tag);
            el.id = id;
            document.body.appendChild(el);
        } else {
            document.getElementById(id).innerHTML = '';
        }
    });
}

beforeEach(async () => {
    resetTempState();
    // Clear companies in-place to preserve the reference
    state.companies.splice(0, state.companies.length);
    setupUiDOM();
    // Reset DOM inputs that carry state between tests
    const search = document.getElementById('search-empresa');
    if (search) search.value = '';
    const filter = document.getElementById('filter-status');
    if (filter) filter.value = '';

    // Clear TableManager state 10/10
    const { clearCompaniesFilters } = await import('../../modules/ui.js');
    clearCompaniesFilters();
});

// ------- renderDashboard -------
describe('ui.js — renderDashboard()', () => {
    it('deve renderizar card "Total de Empresas" com count 0 se não há empresas', async () => {
        const { renderDashboard } = await import('../../modules/ui.js');
        renderDashboard();
        const stats = document.getElementById('dashboard-stats');
        expect(stats.innerHTML).toContain('Total de Empresas');
        expect(stats.innerHTML).toContain('>0<');
    });

    it('deve contar corretamente empresas por status', async () => {
        state.companies = [
            { id: '1', nome: 'A', status: 'Prospect', updatedAt: Date.now() },
            { id: '2', nome: 'B', status: 'Prospect', updatedAt: Date.now() },
            { id: '3', nome: 'C', status: 'Cliente Ativo', updatedAt: Date.now() }
        ];
        const { renderDashboard } = await import('../../modules/ui.js');
        renderDashboard();
        const stats = document.getElementById('dashboard-stats').innerHTML;
        // Total = 3
        expect(stats).toContain('>3<');
    });
});

// ------- renderCompanyList -------
describe('ui.js — renderCompanyList()', () => {
    it('deve mostrar mensagem de vazio quando não há empresas', async () => {
        const { renderCompanyList } = await import('../../modules/ui.js');
        renderCompanyList();
        expect(document.getElementById('company-table-body').innerHTML).toContain('Nenhum resultado encontrado');
    });

    it('deve renderizar uma linha da tabela por empresa', async () => {
        state.companies = [
            { id: '1', nome: 'Alpha', status: 'Prospect', updatedAt: Date.now() },
            { id: '2', nome: 'Beta', status: 'Lead', updatedAt: Date.now() }
        ];
        const { renderCompanyList } = await import('../../modules/ui.js');
        renderCompanyList();
        const rows = document.getElementById('company-table-body').querySelectorAll('tr');
        expect(rows.length).toBe(2);
    });

    it('deve filtrar empresas pelo campo de busca', async () => {
        state.companies.splice(0, state.companies.length,
            { id: '1', nome: 'Alpha Corp', status: 'Prospect', updatedAt: Date.now() },
            { id: '2', nome: 'Beta Ltda', status: 'Lead', updatedAt: Date.now() }
        );
        
        const { renderCompanyList, handleCompaniesSearch } = await import('../../modules/ui.js');
        handleCompaniesSearch('alpha');
        renderCompanyList();
        
        const body = document.getElementById('company-table-body').innerHTML;
        expect(body).toContain('Alpha Corp');
        expect(body).not.toContain('Beta Ltda');
    });

    it('deve filtrar empresas pelo select de status', async ({ }) => {
        document.getElementById('search-empresa').value = '';
        const filterEl = document.getElementById('filter-status');

        // jsdom só aceita .value se existir um <option> correspondente
        ['', 'Prospect', 'Lead', 'Cliente Ativo'].forEach(val => {
            if (!filterEl.querySelector(`option[value="${val}"]`)) {
                const opt = document.createElement('option');
                opt.value = val;
                filterEl.appendChild(opt);
            }
        });

        state.companies.splice(0, state.companies.length,
            { id: 'f1', nome: 'Alpha Prospect', status: 'Prospect', updatedAt: Date.now() },
            { id: 'f2', nome: 'Beta Cliente', status: 'Cliente Ativo', updatedAt: Date.now() }
        );
        state.companies.splice(0, state.companies.length,
            { id: 'f1', nome: 'Alpha Prospect', status: 'Prospect', updatedAt: Date.now() },
            { id: 'f2', nome: 'Beta Cliente', status: 'Cliente Ativo', updatedAt: Date.now() }
        );

        const { renderCompanyList, handleCompaniesFilter } = await import('../../modules/ui.js');
        handleCompaniesFilter('status', 'Cliente Ativo');
        renderCompanyList();
        
        const body = document.getElementById('company-table-body').innerHTML;
        expect(body).toContain('Beta Cliente');
        expect(body).not.toContain('Alpha Prospect');
    });

    it('Health Score NÃO deve aparecer para status Prospect', async () => {
        state.companies = [
            { id: '1', nome: 'Sem CS', status: 'Prospect', healthScore: 'Saudável', updatedAt: Date.now() }
        ];
        const { renderCompanyList } = await import('../../modules/ui.js');
        renderCompanyList();
        const body = document.getElementById('company-table-body').innerHTML;
        expect(body).not.toContain('Saudável');
    });

    it('Health Score DEVE aparecer para status Cliente Ativo', async () => {
        state.companies = [
            { id: '1', nome: 'Com CS', status: 'Cliente Ativo', healthScore: 'Saudável', nps: '9', updatedAt: Date.now() }
        ];
        const { renderCompanyList } = await import('../../modules/ui.js');
        renderCompanyList();
        const body = document.getElementById('company-table-body').innerHTML;
        expect(body).toContain('Saudável');
        expect(body).toContain('NPS: 9');
    });
});

// ------- renderContatosTable -------
describe('ui.js — renderContatosTable()', () => {
    it('deve mostrar mensagem de vazio quando não há contatos', async () => {
        const { renderContatosTable } = await import('../../modules/ui.js');
        renderContatosTable();
        expect(document.getElementById('contatos-table-body').innerHTML).toContain('Nenhum contato cadastrado');
    });

    it('deve renderizar uma linha por contato', async () => {
        state.tempContatos = [
            { nome: 'Ana', email1: 'ana@dati.com', cargo: 'CEO' },
            { nome: 'Bruno', email1: 'bruno@dati.com', cargo: 'CTO' }
        ];
        const { renderContatosTable } = await import('../../modules/ui.js');
        renderContatosTable();
        const rows = document.getElementById('contatos-table-body').querySelectorAll('tr');
        expect(rows.length).toBe(2);
        expect(document.getElementById('contatos-table-body').innerHTML).toContain('Ana');
        expect(document.getElementById('contatos-table-body').innerHTML).toContain('Bruno');
    });
});

// ------- renderCSTimeline -------
describe('ui.js — renderCSTimeline()', () => {
    it('deve mostrar mensagem de vazio quando não há notas', async () => {
        const { renderCSTimeline } = await import('../../modules/ui.js');
        renderCSTimeline();
        expect(document.getElementById('cs-timeline').innerHTML).toContain('Nenhuma observação registrada');
    });

    it('deve renderizar notas em ordem decrescente de data', async () => {
        state.tempNotes = [
            { text: 'Nota antiga', author: 'admin', date: '01/01/2024', timestamp: 1000 },
            { text: 'Nota nova', author: 'admin', date: '02/01/2024', timestamp: 2000 }
        ];
        const { renderCSTimeline } = await import('../../modules/ui.js');
        renderCSTimeline();
        const html = document.getElementById('cs-timeline').innerHTML;
        // Nota nova deve aparecer primeiro
        expect(html.indexOf('Nota nova')).toBeLessThan(html.indexOf('Nota antiga'));
    });
});

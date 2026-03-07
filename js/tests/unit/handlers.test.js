/**
 * @file handlers.test.js
 * Testes unitários para a lógica de validação dos handlers
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state, resetTempState } from '../../modules/state.js';

// Simula DOM mínimo necessário para os handlers
function setupDOM(fields = {}) {
    const ids = [
        'new-cont-nome', 'new-cont-email1', 'new-cont-tel',
        'new-cont-cargo', 'new-cont-dep', 'new-cont-linkedin',
        'contact-form-container', 'btn-toggle-contact-form',
        'new-prod-nome', 'new-prod-data', 'new-prod-mensalidade',
        'new-prod-minimo', 'new-prod-val-user', 'new-prod-horas-hd',
        'new-prod-proposta', 'new-prod-contrato',
        'produto-form-container', 'btn-toggle-produto-form',
        'new-db-data', 'new-db-dest', 'new-db-link',
        'btn-cancel-dashboard', 'dashboards-table-body',
        'new-nps-data', 'new-nps-dest', 'new-nps-score', 'new-nps-forms',
        'btn-cancel-nps', 'nps-history-table-body',
        'toast-container',
    ];
    ids.forEach(id => {
        if (!document.getElementById(id)) {
            const el = document.createElement(fields[id]?.tag || 'input');
            el.id = id;
            el.value = fields[id]?.value || '';
            if (fields[id]?.files !== undefined) {
                Object.defineProperty(el, 'files', { value: fields[id].files, configurable: true });
            }
            document.body.appendChild(el);
        } else {
            document.getElementById(id).value = fields[id]?.value || '';
        }
    });
}

beforeEach(() => {
    resetTempState();
    setupDOM();
});

// ------- saveNewContato -------
describe('handlers.js — saveNewContato()', () => {
    it('deve adicionar um contato quando nome é preenchido', async () => {
        document.getElementById('new-cont-nome').value = 'João Silva';
        document.getElementById('new-cont-email1').value = 'joao@dati.com';
        document.getElementById('new-cont-cargo').value = 'Gerente';

        const { saveNewContato } = await import('../../modules/handlers.js');
        saveNewContato();

        expect(state.tempContatos).toHaveLength(1);
        expect(state.tempContatos[0].nome).toBe('João Silva');
        expect(state.tempContatos[0].email1).toBe('joao@dati.com');
        expect(state.tempContatos[0].cargo).toBe('Gerente');
    });

    it('NÃO deve adicionar contato quando nome está vazio', async () => {
        document.getElementById('new-cont-nome').value = '';
        const { saveNewContato } = await import('../../modules/handlers.js');
        saveNewContato();
        expect(state.tempContatos).toHaveLength(0);
    });

    it('deve limpar campos após salvar', async () => {
        document.getElementById('new-cont-nome').value = 'Teste';
        const { saveNewContato } = await import('../../modules/handlers.js');
        saveNewContato();
        expect(document.getElementById('new-cont-nome').value).toBe('');
    });
});

// ------- saveTempDashboard -------
describe('handlers.js — saveTempDashboard()', () => {
    it('deve adicionar um dashboard com todos os campos', async () => {
        document.getElementById('new-db-data').value = '2024-03-01';
        document.getElementById('new-db-dest').value = 'equipe@dati.com';
        document.getElementById('new-db-link').value = 'https://powerbi.com/xpto';

        const { saveTempDashboard } = await import('../../modules/handlers.js');
        saveTempDashboard();

        expect(state.tempDashboards).toHaveLength(1);
        expect(state.tempDashboards[0].data).toBe('2024-03-01');
        expect(state.tempDashboards[0].link).toBe('https://powerbi.com/xpto');
    });

    it('NÃO deve adicionar dashboard se algum campo obrigatório estiver vazio', async () => {
        document.getElementById('new-db-data').value = '2024-03-01';
        document.getElementById('new-db-dest').value = '';
        document.getElementById('new-db-link').value = 'https://powerbi.com/xpto';

        const { saveTempDashboard } = await import('../../modules/handlers.js');
        saveTempDashboard();

        expect(state.tempDashboards).toHaveLength(0);
    });
});

// ------- saveTempNPS -------
describe('handlers.js — saveTempNPS()', () => {
    it('deve adicionar registro NPS com score', async () => {
        document.getElementById('new-nps-data').value = '2024-03-01';
        document.getElementById('new-nps-dest').value = 'cliente@empresa.com';
        document.getElementById('new-nps-score').value = '9';
        document.getElementById('new-nps-forms').value = 'form_link';

        const { saveTempNPS } = await import('../../modules/handlers.js');
        saveTempNPS();

        expect(state.tempNPSHistory).toHaveLength(1);
        expect(state.tempNPSHistory[0].score).toBe('9');
    });

    it('NÃO deve salvar NPS sem score', async () => {
        document.getElementById('new-nps-data').value = '2024-03-01';
        document.getElementById('new-nps-dest').value = 'cliente@empresa.com';
        document.getElementById('new-nps-score').value = '';

        const { saveTempNPS } = await import('../../modules/handlers.js');
        saveTempNPS();

        expect(state.tempNPSHistory).toHaveLength(0);
    });
});

// ------- addCSNote -------
describe('handlers.js — addCSNote()', () => {
    beforeEach(() => {
        const noteEl = document.getElementById('new-cs-note') || document.createElement('textarea');
        noteEl.id = 'new-cs-note';
        noteEl.value = '';
        if(!document.getElementById('new-cs-note')) document.body.appendChild(noteEl);

        const timelineEl = document.getElementById('cs-timeline') || document.createElement('div');
        timelineEl.id = 'cs-timeline';
        if(!document.getElementById('cs-timeline')) document.body.appendChild(timelineEl);
    });

    it('deve adicionar nota ao tempNotes', async () => {
        document.getElementById('new-cs-note').value = 'Cliente satisfeito com o suporte.';
        const { addCSNote } = await import('../../modules/handlers.js');
        addCSNote();
        expect(state.tempNotes).toHaveLength(1);
        expect(state.tempNotes[0].text).toBe('Cliente satisfeito com o suporte.');
        expect(state.tempNotes[0].author).toBe('admin');
    });

    it('NÃO deve adicionar nota em branco', async () => {
        document.getElementById('new-cs-note').value = '   ';
        const { addCSNote } = await import('../../modules/handlers.js');
        addCSNote();
        expect(state.tempNotes).toHaveLength(0);
    });

    it('deve limpar o campo após salvar', async () => {
        document.getElementById('new-cs-note').value = 'Minha nota.';
        const { addCSNote } = await import('../../modules/handlers.js');
        addCSNote();
        expect(document.getElementById('new-cs-note').value).toBe('');
    });
});

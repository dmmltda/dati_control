/**
 * @file navigation.test.js
 * Testes unitários para o módulo de navegação (navigation.js)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state, resetTempState } from '../../modules/state.js';

// --- Setup DOM ---
function setupNavDOM() {
    const viewIds = ['view-dashboard', 'view-company-list', 'view-company-form'];
    viewIds.forEach(id => {
        if (!document.getElementById(id)) {
            const el = document.createElement('div');
            el.id = id;
            el.className = 'view-section';
            el.style.display = id === 'view-dashboard' ? 'block' : 'none';
            document.body.appendChild(el);
        }
    });

    // Nav items
    ['dashboard', 'company-list'].forEach(view => {
        if (!document.querySelector(`[data-view="${view}"]`)) {
            const a = document.createElement('a');
            a.className = 'nav-item' + (view === 'dashboard' ? ' active' : '');
            a.dataset.view = view;
            document.body.appendChild(a);
        }
    });

    // Tab contents
    ['tab-dados', 'tab-contatos', 'tab-produtos', 'tab-cs', 'tab-reunioes', 'tab-qualificacao'].forEach(id => {
        if (!document.getElementById(id)) {
            const el = document.createElement('div');
            el.id = id;
            el.className = 'tab-content' + (id === 'tab-dados' ? ' active' : '');
            document.body.appendChild(el);
        }
    });

    // Tab buttons
    ['tab-dados', 'tab-contatos', 'tab-produtos', 'tab-cs', 'tab-reunioes', 'tab-qualificacao'].forEach(tab => {
        if (!document.querySelector(`[data-tab="${tab}"]`)) {
            const btn = document.createElement('button');
            btn.className = 'tab-menu-btn' + (tab === 'tab-dados' ? ' active' : '');
            btn.dataset.tab = tab;
            document.body.appendChild(btn);
        }
    });

    // CS sub-contents
    ['cs-dash', 'cs-nps', 'cs-meet', 'cs-tk', 'cs-hist'].forEach(id => {
        if (!document.getElementById(id)) {
            const el = document.createElement('div');
            el.id = id;
            el.className = 'cs-sub-content' + (id === 'cs-dash' ? ' active' : '');
            document.body.appendChild(el);
        }
    });

    // CS submenu buttons
    ['cs-dash', 'cs-nps', 'cs-meet', 'cs-tk', 'cs-hist'].forEach(tab => {
        if (!document.querySelector(`[data-cs="${tab}"]`)) {
            const btn = document.createElement('button');
            btn.className = 'cs-submenu-btn' + (tab === 'cs-dash' ? ' active' : '');
            btn.dataset.cs = tab;
            document.body.appendChild(btn);
        }
    });
}

beforeEach(() => {
    setupNavDOM();
});

// ------- switchView -------
describe('navigation.js — switchView()', () => {
    it('deve exibir a view correta e ocultar as outras', async () => {
        const { switchView } = await import('../../modules/navigation.js');

        switchView('company-list');

        const list = document.getElementById('view-company-list');
        const dashboard = document.getElementById('view-dashboard');

        expect(list.style.display).toBe('block');
        expect(dashboard.style.display).toBe('none');
    });

    it('deve marcar o nav-item como active', async () => {
        const { switchView } = await import('../../modules/navigation.js');

        switchView('company-list');

        const activeItem = document.querySelector('[data-view="company-list"]');
        const inactiveItem = document.querySelector('[data-view="dashboard"]');

        expect(activeItem.classList.contains('active')).toBe(true);
        expect(inactiveItem.classList.contains('active')).toBe(false);
    });

    it('deve mudar de volta para o dashboard', async () => {
        const { switchView } = await import('../../modules/navigation.js');

        switchView('company-list');
        switchView('dashboard');

        expect(document.getElementById('view-dashboard').style.display).toBe('block');
        expect(document.getElementById('view-company-list').style.display).toBe('none');
    });
});

// ------- switchFormTab -------
describe('navigation.js — switchFormTab()', () => {
    it('deve ativar a tab correta e desativar as outras', async () => {
        const { switchFormTab } = await import('../../modules/navigation.js');

        const btn = document.querySelector('[data-tab="tab-contatos"]');
        switchFormTab('tab-contatos', btn);

        expect(document.getElementById('tab-contatos').classList.contains('active')).toBe(true);
        expect(document.getElementById('tab-dados').classList.contains('active')).toBe(false);
        expect(btn.classList.contains('active')).toBe(true);
    });

    it('deve funcionar sem passar um botão (fallback)', async () => {
        const { switchFormTab } = await import('../../modules/navigation.js');

        switchFormTab('tab-produtos', null);
        expect(document.getElementById('tab-produtos').classList.contains('active')).toBe(true);
    });
});

// ------- switchCSSubTab -------
describe('navigation.js — switchCSSubTab()', () => {
    it('deve ativar o sub-conteúdo CS correto', async () => {
        const { switchCSSubTab } = await import('../../modules/navigation.js');

        const btn = document.querySelector('[data-cs="cs-nps"]');
        switchCSSubTab('cs-nps', btn);

        expect(document.getElementById('cs-nps').classList.contains('active')).toBe(true);
        expect(document.getElementById('cs-dash').classList.contains('active')).toBe(false);
        expect(btn.classList.contains('active')).toBe(true);
    });
});

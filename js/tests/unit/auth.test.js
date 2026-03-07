/**
 * @file auth.test.js
 * Testes unitários para o módulo de autenticação (auth.js)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock sessionStorage ---
const sessionStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });

// --- Setup DOM mínimo ---
function setupAuthDOM() {
    const ids = ['login-screen', 'app-layout', 'login-error', 'username', 'password', 'toast-container', 'dashboard-stats', 'company-table-body'];
    ids.forEach(id => {
        if (!document.getElementById(id)) {
            const tag = ['username', 'password'].includes(id) ? 'input' : 'div';
            const el = document.createElement(tag);
            el.id = id;
            if (id === 'login-screen') el.className = 'flex-active';
            document.body.appendChild(el);
        }
    });
}

beforeEach(() => {
    sessionStorageMock.clear();
    setupAuthDOM();
    document.getElementById('login-screen').className = 'flex-active';
    document.getElementById('app-layout').className = '';
});

// ------- handleLogin -------
describe('auth.js — handleLogin()', () => {
    it('deve autenticar com credenciais corretas e definir sessionStorage', async () => {
        const { handleLogin } = await import('../../modules/auth.js');

        document.getElementById('username').value = 'admin';
        document.getElementById('password').value = 'dati2024';

        const fakeEvent = { preventDefault: vi.fn() };
        handleLogin(fakeEvent);

        expect(fakeEvent.preventDefault).toHaveBeenCalled();
        expect(sessionStorageMock.getItem('dati_auth')).toBe('true');
    });

    it('deve exibir mensagem de erro com credenciais inválidas', async () => {
        const { handleLogin } = await import('../../modules/auth.js');

        document.getElementById('username').value = 'admin';
        document.getElementById('password').value = 'senhaerrada';

        const fakeEvent = { preventDefault: vi.fn() };
        handleLogin(fakeEvent);

        expect(sessionStorageMock.getItem('dati_auth')).toBeNull();
        const err = document.getElementById('login-error');
        expect(err.style.display).toBe('block');
    });

    it('NÃO deve autenticar com usuário errado', async () => {
        const { handleLogin } = await import('../../modules/auth.js');

        document.getElementById('username').value = 'outro';
        document.getElementById('password').value = 'dati2024';

        handleLogin({ preventDefault: vi.fn() });
        expect(sessionStorageMock.getItem('dati_auth')).toBeNull();
    });
});

// ------- handleLogout -------
describe('auth.js — handleLogout()', () => {
    it('deve remover a chave de autenticação do sessionStorage', async () => {
        sessionStorageMock.setItem('dati_auth', 'true');
        const { handleLogout } = await import('../../modules/auth.js');
        handleLogout();
        expect(sessionStorageMock.getItem('dati_auth')).toBeNull();
    });

    it('deve limpar os campos de login após logout', async () => {
        document.getElementById('username').value = 'admin';
        document.getElementById('password').value = 'dati2024';
        const { handleLogout } = await import('../../modules/auth.js');
        handleLogout();
        expect(document.getElementById('username').value).toBe('');
        expect(document.getElementById('password').value).toBe('');
    });
});

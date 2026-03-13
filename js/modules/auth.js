/**
 * @file auth.js
 * Módulo de autenticação — integrado com Clerk
 * Clean UX
 */

import { state } from './state.js';
import { renderDashboard, renderCompanyList } from './ui.js';
import { api } from './api.js';

let _clerk = null;
let _bootstrapping = false;
let _bootstrapped = false;
let _pollInterval = null;

export async function initClerk() {
    const publishableKey = window.__clerk_publishable_key;

    if (!publishableKey || publishableKey.startsWith('COLE_')) {
        _showConfigError();
        return;
    }

    try {
        _clerk = window.Clerk;
        await _clerk.load({ publishableKey });

        console.log('[Auth] Clerk carregado. user:', _clerk.user?.primaryEmailAddress?.emailAddress ?? 'sem sessão');

        if (_clerk.user) {
            await _bootstrapApp();
        } else {
            // Força a URL a limpar hashes zumbis persistentes do clerk que travam no factor-two
            if (window.location.hash.includes('factor')) {
                 history.replaceState(null, '', window.location.pathname);
            }
            _mostrarTelaLogin();
        }
    } catch (err) {
        console.error('[Auth] Erro ao inicializar Clerk:', err);
    }
}

/**
 * Exibe a tela de login montando o componente inline.
 */
function _mostrarTelaLogin() {
    document.getElementById('app-layout')?.classList.remove('flex-active');
    document.getElementById('login-screen')?.classList.add('flex-active');

    const mountEl = document.getElementById('clerk-sign-in-mount');
    if (!mountEl || !_clerk) return;

    try {
        try { _clerk.unmountSignIn(mountEl); } catch (e) {}
        
        // Destrói ativamente a div interna do clerk se existir
        mountEl.innerHTML = '';
        const _id = Math.random().toString(36).substr(2, 9);
        const childEl = document.createElement('div');
        childEl.id = `clerk-inner-${_id}`;
        mountEl.appendChild(childEl);

        _clerk.mountSignIn(childEl, {
            appearance: {
                variables: {
                    colorPrimary: '#0F3460',
                    colorText: '#1A202C',
                    borderRadius: '12px',
                    fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
                },
                elements: {
                    card: {
                        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                        border: '1px solid rgba(255,255,255,0.05)',
                    }
                }
            },
        });

        _iniciarPolling();
    } catch (e) {
        console.error('[Auth] Erro ao montar Sign In:', e);
    }
}

function _iniciarPolling() {
    if (_pollInterval) clearInterval(_pollInterval);

    _pollInterval = setInterval(async () => {
        if (_clerk.user && !_bootstrapping && !_bootstrapped) {
            clearInterval(_pollInterval);
            _pollInterval = null;
            await _bootstrapApp();
        }
    }, 500);
}

async function _bootstrapApp() {
    if (_bootstrapping || _bootstrapped) return;
    _bootstrapping = true;
    console.log('[Auth] Bootstrap iniciado...');

    try {
        let token = null;
        for (let i = 0; i < 15; i++) {
            token = await _clerk.session?.getToken();
            if (token) break;
            await _sleep(300);
        }

        if (!token) {
            console.error('[Auth] Token não disponível após retries.');
            _bootstrapping = false;
            return;
        }

        const res = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            console.error('[Auth] /api/me falhou:', res.status);
            _bootstrapping = false;
            return;
        }

        const me = await res.json();
        window.__usuarioAtual = me;

        // ── Helper global de permissões ───────────────────────────────────────────────
        // Master tem tudo; standard verifica feature_permissions retornado pelo /api/me
        window.canDo = function(permissionKey) {
            const u = window.__usuarioAtual;
            if (!u) return false;
            if (u.user_type === 'master') return true;
            return Array.isArray(u.feature_permissions) && u.feature_permissions.includes(permissionKey);
        };

        console.log(`[Auth] ✅ Sincronizado: ${me.nome} (${me.role})`);


        // ── Atualiza sidebar com dados reais do usuário ──────────────────
        const elNome   = document.getElementById('sidebar-user-name');
        const elRole   = document.getElementById('sidebar-user-role');
        const elAvatar = document.getElementById('sidebar-user-avatar');
        if (elNome)   elNome.textContent   = me.nome  || me.email || 'Usuário';
        if (elRole)   elRole.textContent   = me.user_type === 'master' ? 'Master' : 'Standard';
        if (elAvatar) elAvatar.textContent = me.avatar
            || (me.nome ? me.nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : 'U');

        // Mostra Configurações (label + bloco flat) só para master
        if (me.user_type === 'master') {
            const navConfig = document.getElementById('nav-group-config');
            if (navConfig) navConfig.style.display = 'block';
            const navLabelConfig = document.getElementById('nav-label-config');
            if (navLabelConfig) navLabelConfig.style.display = 'flex';
            const navConfigFlat = document.getElementById('nav-group-config-flat');
            if (navConfigFlat) navConfigFlat.style.display = 'block';
        }

        // Aplica visibilidade de navegação baseada em feature permissions
        _aplicarPermissoesNavegacao(me);


        try {
            // Limpa cache local antes de carregar — garante que standard users não vejam dados antigos
            localStorage.removeItem('dati_control_companies');
            const companies = await api.getCompanies();
            state.companies = companies;
            localStorage.setItem('dati_control_companies', JSON.stringify(companies)); // atualiza cache
            console.log(`[Auth] ✅ ${companies.length} empresas carregadas.`);
        } catch (err) {
            console.warn('[Auth] Erro ao carregar empresas:', err.message);
        }

        document.getElementById('login-screen')?.classList.remove('flex-active');
        document.getElementById('app-layout')?.classList.add('flex-active');

        try { renderDashboard(); } catch (e) { console.warn('[Auth] renderDashboard:', e); }
        try { renderCompanyList(); } catch (e) { console.warn('[Auth] renderCompanyList:', e); }

        _bootstrapped = true;
        document.dispatchEvent(new CustomEvent('dati:app-ready'));
        console.log('[Auth] ✅ Login e setup completos!');

    } catch (err) {
        console.error('[Auth] Erro crítico no bootstrap:', err);
        _bootstrapping = false;
    }
}

export async function handleLogout() {
    _bootstrapped = false;
    _bootstrapping = false;
    if (_pollInterval) clearInterval(_pollInterval);
    if (_clerk) await _clerk.signOut();
    window.__usuarioAtual = null;
    
    // Limpa estado de rotas antes de recarregar
    history.replaceState(null, '', '/');
    window.location.reload();
}

export async function getAuthToken() {
    if (!_clerk?.session) return null;
    return _clerk.session.getToken();
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _showConfigError() {
    const mountEl = document.getElementById('clerk-sign-in-mount');
    if (mountEl) {
        mountEl.innerHTML = `<div><b>⚙️ Clerk Publishable Key não configurada em index.html</b></div>`;
    }
}

export const showApp = _bootstrapApp;
export const handleLogin = (e) => e?.preventDefault();

/**
 * Aplica visibilidade de itens de navegação com base nas feature permissions do usuário.
 * Padrão: exibe TODOS os itens, mas itens sem permissão ficam opacos + 🔒 + tooltip.
 * Configurações continua oculto para Standard (admin-only).
 */
function _aplicarPermissoesNavegacao(me) {
    const isMaster = me.user_type === 'master';
    const fp = Array.isArray(me.feature_permissions) ? me.feature_permissions : [];

    // ─ Itens individuais com data-nav-permission
    document.querySelectorAll('[data-nav-permission]').forEach(el => {
        const perm = el.dataset.navPermission;
        const ok   = isMaster || fp.includes(perm);
        _setNavItemPermissao(el, ok);
    });

    // ─ Grupos (data-nav-permission-group="X,Y") —
    //   dim o grupo inteiro + aplica cadeado/tooltip no toggle se NENHUMA sub-permissão for concedida
    document.querySelectorAll('[data-nav-permission-group]').forEach(el => {
        const perms     = el.dataset.navPermissionGroup.split(',').map(p => p.trim());
        const temAlguma = isMaster || perms.some(p => fp.includes(p));

        // Aplica estilo + cadeado + tooltip DATI no botão toggle (item clicável do grupo)
        const toggle = el.querySelector('.nav-group-toggle');
        if (toggle) _setNavItemPermissao(toggle, temAlguma);

        // Bloqueia cliques nos sub-itens também quando sem permissão
        const subMenu = el.querySelector('.nav-sub-menu');
        if (subMenu) subMenu.style.pointerEvents = temAlguma ? '' : 'none';
    });


    // ─ Configurações: oculto para Standard (admin-only)
    const navConfig        = document.getElementById('nav-group-config');
    const navLabelConfig   = document.getElementById('nav-label-config');
    const navConfigFlat    = document.getElementById('nav-group-config-flat');
    if (navConfig)      navConfig.style.display      = isMaster ? '' : 'none';
    if (navLabelConfig) navLabelConfig.style.display  = isMaster ? 'flex' : 'none';
    if (navConfigFlat)  navConfigFlat.style.display   = isMaster ? '' : 'none';

    // ─ Monitoramento: oculta label + bloco se o usuário não tiver nenhuma permissão de log
    const logPerms          = ['test_logs.view', 'audit.view'];
    const temAlgumaLogPerm  = isMaster || logPerms.some(p => fp.includes(p));
    const navLabelMon       = document.getElementById('nav-label-monitoramento');
    const navGroupMon       = document.getElementById('nav-group-monitoring');
    if (navLabelMon) navLabelMon.style.display = temAlgumaLogPerm ? 'flex' : 'none';
    if (navGroupMon) navGroupMon.style.display = temAlgumaLogPerm ? ''     : 'none';
}

/**
 * Aplica ou remove o estilo "sem permissão" em um item de nav.
 * - Com permissão: aparência normal
 * - Sem permissão: 38% opacidade, cadeado 🔒, tooltip padrão DATI, cursor proibido
 */
function _setNavItemPermissao(el, temPermissao) {
    if (temPermissao) {
        el.style.opacity  = '';
        el.style.cursor   = '';
        el.removeAttribute('data-sem-permissao');
        el.removeAttribute('data-th-tooltip');
        el.removeAttribute('data-th-title');
        el.removeAttribute('data-tooltip-msg');
        el.querySelector('.nav-lock-icon')?.remove();
    } else {
        el.style.opacity = '0.38';
        el.style.cursor  = 'not-allowed';
        el.setAttribute('data-sem-permissao', '1');
        // Tooltip padrão DATI (mesmo sistema das colunas de tabela)
        el.setAttribute('data-th-title', 'SEM PERMISSÃO');
        el.setAttribute('data-th-tooltip', 'Você não tem acesso a este módulo. Solicite ao administrador do sistema.');
        // Adiciona ícone de cadeado (apenas 1x)
        if (!el.querySelector('.nav-lock-icon')) {
            const lock = document.createElement('i');
            lock.className = 'ph ph-lock-simple nav-lock-icon';
            lock.style.cssText = 'font-size:0.7rem; color:#f87171; margin-left:auto; opacity:0.85; flex-shrink:0;';
            el.appendChild(lock);
        }
    }
}



// Expõe globalmente para re-aplicar após salvar permissões
window.aplicarPermissoesNavegacao = () => {
    const me = window.__usuarioAtual;
    if (me) _aplicarPermissoesNavegacao(me);
};



import { state } from './state.js';
import { renderDashboard, renderCompanyList } from './ui.js';
import { api } from './api.js';
import { migrateFromLocalStorage } from './migration.js';
import * as utils from './utils.js';

export async function showApp() {
    console.log('🚀 Inicializando App 10/10...');
    
    // 1. Tentar Migração (LocalStorage -> DB)
    await migrateFromLocalStorage();
    
    // 2. Carregar Dados Reais da API (PostgreSQL)
    try {
        console.log('📡 Buscando empresas do Backend...');
        const companies = await api.getCompanies();
        state.companies = companies;
        console.log(`✅ ${companies.length} empresas carregadas do banco.`);
    } catch (error) {
        console.error('❌ Falha ao carregar empresas do banco:', error);
        // Fallback para evitar tela branca se a API falhar
    }

    const loginScreen = document.getElementById('login-screen');
    const appLayout = document.getElementById('app-layout');
    
    if (loginScreen) loginScreen.classList.remove('flex-active');
    if (appLayout) appLayout.classList.add('flex-active');
    
    renderDashboard();
    renderCompanyList();
}

export function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    
    if (user === 'admin' && pass === 'dati2024') {
        sessionStorage.setItem('dati_auth', 'true');
        showApp();
        document.getElementById('login-error').style.display = 'none';
        utils.showToast('Login efetuado com sucesso!', 'success');
    } else {
        document.getElementById('login-error').style.display = 'block';
    }
}

export function handleLogout() {
    sessionStorage.removeItem('dati_auth');
    document.getElementById('app-layout').classList.remove('flex-active');
    document.getElementById('login-screen').classList.add('flex-active');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

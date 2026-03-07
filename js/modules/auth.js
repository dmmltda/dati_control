import { state } from './state.js';
import { showToast, saveCompanies } from './utils.js';
import { renderDashboard, renderCompanyList } from './ui.js';
import { switchView } from './navigation.js';

export function showApp() {
    const loginScreen = document.getElementById('login-screen');
    const appLayout = document.getElementById('app-layout');
    loginScreen.classList.remove('flex-active');
    appLayout.classList.add('flex-active');
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
        showToast('Login efetuado com sucesso!', 'success');
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

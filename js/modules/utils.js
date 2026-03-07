import { DB_KEY, STATUS_CONFIG, CS_VISIBLE_STATUSES } from './config.js';
import { state } from './state.js';

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'ph-check-circle' : 'ph-warning-circle';
    
    toast.innerHTML = `
        <i class="ph ${icon}" style="font-size: 1.25rem;"></i>
        <div style="font-weight: 500;">${message}</div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function saveCompanies(renderCallback) {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(state.companies));
        if (renderCallback) renderCallback();
    } catch (e) {
        console.error(e);
        alert('Erro: O limite de armazenamento do sistema foi atingido. Você anexou muitos arquivos grandes. Exclua algumas empresas ou remova anexos pesados para poder salvar novamente.');
        throw e;
    }
}

export function maskCurrency(input) {
    let value = input.value;
    value = value.replace(/\D/g, "");
    value = (value / 100).toFixed(2) + "";
    value = value.replace(".", ",");
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    input.value = value;
}

export function maskCNPJ(input) {
    let value = input.value;
    value = value.replace(/\D/g, ""); // Remove não numéricos
    if (value.length > 14) value = value.substring(0, 14);
    
    value = value.replace(/^(\d{2})(\d)/, "$1.$2");
    value = value.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    value = value.replace(/\.(\d{3})(\d)/, ".$1/$2");
    value = value.replace(/(\d{4})(\d)/, "$1-$2");
    
    input.value = value;
}

export async function loadCities(uf, defaultCity = '') {
    const cidadeInput = document.getElementById('emp-cidade');
    const cidadesList = document.getElementById('cidades-list');
    if (!cidadeInput || !cidadesList) return;
    
    cidadesList.innerHTML = '';
    
    if (!uf) {
        cidadeInput.disabled = true;
        cidadeInput.placeholder = 'Selecione um estado primeiro...';
        cidadeInput.value = '';
        return;
    }

    cidadeInput.disabled = true;
    cidadeInput.placeholder = 'Carregando cidades...';

    try {
        const response = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`);
        if (!response.ok) throw new Error('Falha ao buscar cidades');
        const cidades = await response.json();
        
        cidades.forEach(cidade => {
            const option = document.createElement('option');
            option.value = cidade.nome;
            cidadesList.appendChild(option);
        });

        cidadeInput.disabled = false;
        cidadeInput.placeholder = 'Digite para buscar ou selecione...';
        if (defaultCity) cidadeInput.value = defaultCity;
    } catch (error) {
        console.error('Erro ao buscar cidades:', error);
        cidadeInput.disabled = false;
        cidadeInput.placeholder = 'Erro ao carregar cidades. Digite o nome:';
        if (defaultCity) cidadeInput.value = defaultCity;
    }
}

export function updateStatusStyle(select) {
    if(!select) return;
    select.className = 'status-select';
    const status = select.value;
    const config = STATUS_CONFIG[status];
    if(config) {
        select.classList.add(config.class);
    }

    // Conditional visibility for HS and NPS
    const csHeaderMetrics = document.getElementById('cs-header-metrics');
    const csTabBtn = document.getElementById('btn-tab-cs');
    const isVisible = CS_VISIBLE_STATUSES.includes(status);
    
    if(csHeaderMetrics) csHeaderMetrics.style.display = isVisible ? 'flex' : 'none';
    if(csTabBtn) csTabBtn.style.display = isVisible ? 'flex' : 'none';
}

export const getBase64 = (file) => new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 2 * 1024 * 1024) return reject('O arquivo ' + file.name + ' excede o limite máximo de 2MB.');
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve({ name: file.name, data: reader.result });
    reader.onerror = error => reject(error);
});

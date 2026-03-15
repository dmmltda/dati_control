import { DB_KEY, STATUS_CONFIG, CS_VISIBLE_STATUSES } from './config.js';
import { state } from './state.js';
import { CustomSelect } from './custom-select.js';

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

export function maskMoney(input) {
    let value = input.value;
    value = value.replace(/\D/g, "");
    if (!value) {
        input.value = "";
        return;
    }
    value = (value / 100).toFixed(2) + "";
    value = value.replace(".", ",");
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    input.value = value;
}

export function unmaskMoney(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    const cleanValue = value.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(cleanValue) || 0;
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

// Mapa estático de cidades por UF (fallback quando a BrasilAPI não responde)
const CIDADES_FALLBACK = {
    AC: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá', 'Feijó'],
    AL: ['Maceió', 'Arapiraca', 'Rio Largo', 'Palmeira dos Índios', 'União dos Palmares', 'Penedo', 'São Miguel dos Campos', 'Delmiro Gouveia'],
    AM: ['Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru', 'Coari', 'Tefé', 'Tabatinga', 'Maués'],
    AP: ['Macapá', 'Santana', 'Laranjal do Jari', 'Oiapoque', 'Mazagão'],
    BA: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Juazeiro', 'Petrolina', 'Ilhéus', 'Lauro de Freitas', 'Itabuna', 'Jequié', 'Teixeira de Freitas', 'Barreiras', 'Alagoinhas', 'Porto Seguro'],
    CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú', 'Sobral', 'Crato', 'Itapipoca', 'Maranguape', 'Iguatu', 'Quixadá'],
    DF: ['Brasília', 'Ceilândia', 'Taguatinga', 'Samambaia', 'Planaltina', 'Gama', 'Sobradinho', 'Recanto das Emas', 'Santa Maria'],
    ES: ['Vitória', 'Serra', 'Vila Velha', 'Cariacica', 'Linhares', 'São Mateus', 'Cachoeiro de Itapemirim', 'Colatina', 'Guarapari'],
    GO: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde', 'Luziânia', 'Águas Lindas', 'Valparaíso', 'Trindade', 'Formosa', 'Novo Gama'],
    MA: ['São Luís', 'Imperatriz', 'São José de Ribamar', 'Timon', 'Caxias', 'Codó', 'Paço do Lumiar', 'Açailândia', 'Bacabal'],
    MG: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim', 'Montes Claros', 'Ribeirão das Neves', 'Uberaba', 'Governador Valadares', 'Ipatinga', 'Sete Lagoas', 'Divinópolis', 'Santa Luzia', 'Ibirité', 'Poços de Caldas', 'Patos de Minas', 'Pouso Alegre', 'Teófilo Otoni', 'Barbacena', 'Sabará'],
    MS: ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã', 'Naviraí', 'Nova Andradina', 'Aquidauana', 'Sidrolândia'],
    MT: ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra', 'Cáceres', 'Sorriso', 'Lucas do Rio Verde', 'Alto Araguaia'],
    PA: ['Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Parauapebas', 'Castanhal', 'Abaetetuba', 'Cametá', 'Itaituba'],
    PB: ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux', 'Sousa', 'Cajazeiras', 'Cabedelo'],
    PE: ['Recife', 'Caruaru', 'Petrolina', 'Olinda', 'Paulista', 'Camaçari', 'Jaboatão dos Guararapes', 'Garanhuns', 'Vitória de Santo Antão', 'Igarassu', 'Cabo de Santo Agostinho'],
    PI: ['Teresina', 'Parnaíba', 'Picos', 'Piripiri', 'Floriano', 'Campo Maior', 'Barras'],
    PR: ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel', 'São José dos Pinhais', 'Foz do Iguaçu', 'Colombo', 'Guarapuava', 'Paranaguá', 'Araucária', 'Toledo', 'Apucarana', 'Pinhais', 'Campo Largo', 'Almirante Tamandaré'],
    RJ: ['Rio de Janeiro', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu', 'Niterói', 'Belford Roxo', 'São João de Meriti', 'Campos dos Goytacazes', 'Petrópolis', 'Magé', 'Volta Redonda', 'Itaboraí', 'Angra dos Reis', 'Mesquita', 'Nova Friburgo', 'Macaé', 'Nilópolis', 'Queimados'],
    RN: ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante', 'Macaíba', 'Ceará-Mirim', 'Caicó', 'Assu'],
    RO: ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Cacoal', 'Vilhena', 'Jaru', 'Rolim de Moura'],
    RR: ['Boa Vista', 'Rorainópolis', 'Caracaraí', 'Alto Alegre', 'Mucajaí'],
    RS: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas', 'Santa Maria', 'Gravataí', 'Viamão', 'Novo Hamburgo', 'São Leopoldo', 'Rio Grande', 'Alvorada', 'Passo Fundo', 'Sapucaia do Sul', 'Uruguaiana', 'Santa Cruz do Sul', 'Cachoeirinha', 'Bento Gonçalves', 'Erechim', 'Guaíba'],
    SC: ['Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Criciúma', 'Chapecó', 'Itajaí', 'Jaraguá do Sul', 'Lages', 'Palhoça', 'Balneário Camboriú', 'Brusque', 'Tubarão', 'São Bento do Sul'],
    SE: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana', 'São Cristóvão', 'Estância', 'Tobias Barreto'],
    SP: ['São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André', 'Osasco', 'São José dos Campos', 'Ribeirão Preto', 'Sorocaba', 'Santos', 'Mauá', 'Mogi das Cruzes', 'São Vicente', 'Diadema', 'Jundiaí', 'Carapicuíba', 'Piracicaba', 'Bauru', 'Itaquaquecetuba', 'São José do Rio Preto', 'Franca', 'Guarujá', 'Limeira', 'São Carlos', 'Taubaté', 'Praia Grande', 'Barueri', 'Suzano', 'Taboão da Serra', 'Jacareí', 'Marília'],
    TO: ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional', 'Paraíso do Tocantins', 'Colinas do Tocantins', 'Guaraí'],
};

export async function loadCities(uf, defaultCity = '') {
    const cidadeSelect = document.getElementById('emp-cidade');
    if (!cidadeSelect) return;

    // Remove fallback e select antigo
    cidadeSelect.innerHTML = '<option value="">Selecione a cidade...</option>';
    
    // Destrói instância CustomSelect temporariamente se existir 
    // para não bugar durante a inserção ou desabilitação
    if (cidadeSelect._customSelectInstance) {
        cidadeSelect._customSelectInstance.destroy();
        delete cidadeSelect._customSelectInstance;
    }

    if (!uf) {
        cidadeSelect.disabled = true;
        cidadeSelect.innerHTML = '<option value="">Aguardando estado...</option>';
        cidadeSelect._customSelectInstance = new CustomSelect(cidadeSelect, { placeholder: 'Aguardando estado...' });
        return;
    }

    cidadeSelect.disabled = true;
    cidadeSelect.innerHTML = '<option value="">Carregando cidades...</option>';
    cidadeSelect._customSelectInstance = new CustomSelect(cidadeSelect, { placeholder: 'Carregando cidades...' });

    let cidadesArr = [];
    
    // Tenta BrasilAPI com timeout de 5s; se falhar usa o fallback local
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
            `https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`,
            { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (!response.ok) throw new Error('Resposta inválida da BrasilAPI');
        const cidades = await response.json();
        cidadesArr = cidades.map(c => c.nome);

    } catch (error) {
        // Fallback: usa lista local de cidades
        console.warn(`[loadCities] BrasilAPI falhou (${error.message}). Usando lista local para ${uf}.`);
        cidadesArr = CIDADES_FALLBACK[uf] || [];
    }

    // Agora reconstroi as options e recria o CustomSelect
    if (cidadeSelect._customSelectInstance) {
        cidadeSelect._customSelectInstance.destroy();
        delete cidadeSelect._customSelectInstance;
    }

    cidadeSelect.innerHTML = '<option value="">Selecione...</option>';
    cidadesArr.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        cidadeSelect.appendChild(option);
    });

    cidadeSelect.disabled = false;
    cidadeSelect.value = defaultCity || '';

    // Inicializa novamente o CustomSelect limpo e habitado
    cidadeSelect._customSelectInstance = new CustomSelect(cidadeSelect, { placeholder: 'Digite ou selecione a cidade...' });
}


export function updateStatusStyle(select) {
    if (!select) return;
    const hasNativeOnly = select.classList.contains('native-only');
    select.className = hasNativeOnly ? 'status-select native-only' : 'status-select';
    const status = select.value;
    const config = STATUS_CONFIG[status];
    if (config) {
        select.classList.add(config.class);
    }

    // Conditional visibility for HS and NPS
    const csHeaderMetrics = document.getElementById('cs-header-metrics');
    const csTabBtn = document.getElementById('btn-tab-cs');
    const isVisible = CS_VISIBLE_STATUSES.includes(status);

    if (csHeaderMetrics) csHeaderMetrics.style.display = isVisible ? 'flex' : 'none';

    // Só altera visibilidade do btn-tab-cs se ele NÃO foi bloqueado por falta de permissão.
    // dataset.lockedTab === "1" significa que o loop de permissões (navigation.js) ocultou
    // esta aba porque o usuário não tem company_tab.cs — não devemos sobrescrever isso.
    if (csTabBtn && csTabBtn.dataset.lockedTab !== '1') {
        csTabBtn.style.display = isVisible ? 'flex' : 'none';
    }
}

export const getBase64 = (file) => new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 20 * 1024 * 1024) return reject('O arquivo ' + file.name + ' excede o limite máximo de 20MB.');
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve({ name: file.name, data: reader.result });
    reader.onerror = error => reject(error);
});

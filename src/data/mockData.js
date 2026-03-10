/**
 * mockData.js — Dados Mockados Centralizados do Journey
 * Todos os dados de demonstração estão aqui. Nunca espalhe mocks pelos componentes.
 * Data de referência: 10/03/2026 (hoje)
 */

// ─── Usuários do Time DATI ───────────────────────────────────────────────────
export const mockUsuarios = [
    { id: 'u1', nome: 'Ana Lima', avatar: 'AL', role: 'CS Manager' },
    { id: 'u2', nome: 'Carlos Souza', avatar: 'CS', role: 'Account Executive' },
    { id: 'u3', nome: 'Mariana Costa', avatar: 'MC', role: 'Customer Success' },
    { id: 'u4', nome: 'Rafael Oliveira', avatar: 'RO', role: 'SDR' },
    { id: 'u5', nome: 'Beatriz Santos', avatar: 'BS', role: 'Account Manager' },
    { id: 'u6', nome: 'Pedro Alves', avatar: 'PA', role: 'CS Specialist' },
    { id: 'u7', nome: 'Lucas Ferreira', avatar: 'LF', role: 'Sales Rep' },
    { id: 'u8', nome: 'Fernanda Rocha', avatar: 'FR', role: 'CS Analyst' },
];

// ─── Função auxiliar: data relativa ao hoje (10/03/2026) ─────────────────────
const HOJE = new Date('2026-03-10');

function diasAtras(dias) {
    const d = new Date(HOJE);
    d.setDate(d.getDate() - dias);
    return d.toISOString();
}

function diasAFrente(dias) {
    const d = new Date(HOJE);
    d.setDate(d.getDate() + dias);
    return d.toISOString();
}

// ─── Produtos DATI disponíveis ───────────────────────────────────────────────
const PRODUTOS_DATI = [
    'DATI Import',
    'Smart Read',
    'Catálogo de Produtos',
    'DATI Export',
];

// ─── Empresas Mockadas ────────────────────────────────────────────────────────
// 80 Clientes Ativos + 20 Inativos + 30 Leads = 130 total

const nomesAtivos = [
    'Importadora São Paulo LTDA', 'Trade Brasil SC',
    'Global Import Florianópolis', 'Comex Solutions MG',
    'Sul Import & Export', 'Amapá Trading LTDA',
    'Multiexport Brasil SA', 'Norte Comex GO',
    'Delta Import RJ', 'Alfa Trading CE',
    'Via Comex PE', 'Metalúrgica Import SP',
    'Agro Import MT', 'Farma COMEX BA',
    'Tech Import RS', 'Elegance Import e Export',
    'Sudeste Trading LTDA', 'Atlantic Imports PR',
    'Inova COMEX PB', 'Trans Import RN',
    'Prime Commerce Export', 'Optimus Trade Brasil',
    'Nexo Import Solutions', 'Veritas COMEX LTDA',
    'Horizonte Trading PA', 'Import Master SP',
    'Centurium COMEX MG', 'Ático Import SC',
    'Fortuna Trading RJ', 'Integra COMEX GO',
    'Zênite Imports ES', 'Vértice COMEX AM',
    'Alfa & Ômega Imports', 'BioImport Nordeste',
    'PharmaComex BA', 'Têxtil Import SC',
    'SteelTrade Brasil', 'FoodImport Sul LTDA',
    'ChemImport MG', 'LogiTrade SP',
    'MedImport PE', 'AutoComex RS',
    'ElectroImport PA', 'PlastiComex CE',
    'WoodImport MT', 'AgroExport GO',
    'MarineImport RJ', 'AirComex SC',
    'UrbanImport PR', 'DigitalTrade BA',
    'EcoImport AC', 'GreenComex MS',
    'FashionImport SP', 'TechTrade Floripa',
    'PetroBrasComex', 'OceanImport PR',
    'SafeImport GO', 'StarTrade LTDA',
    'KiloImport SP', 'MegaComex RJ',
    'NanoImport CE', 'PolyImport BA',
    'UniComex SC', 'MaxImport MG',
    'ProTrade PE', 'RealImport RS',
    'TopComex SP', 'FirstImport PR',
    'BestTrade GO', 'CoreImport RJ',
    'FlowComex BA', 'SolidImport SP',
    'TrueImport SC', 'NetComex MG',
    'FirmTrade PE', 'PureImport RS',
    'CleanComex GO', 'SmartImport CE',
];

const nomesInativos = [
    'RetroComex LTDA', 'AlphaImport Antiga',
    'Orion Trading Inativo', 'Vector COMEX Encerrado',
    'Classic Import PE', 'Velha Guarda COMEX',
    'Sunset Trading SA', 'Antares Import Inativo',
    'Heritage COMEX MG', 'Fossil Trade RJ',
    'Dormant Import SC', 'Legacy COMEX SP',
    'Archaic Trade CE', 'OldGen Import GO',
    'Vintage COMEX BA', 'Amber Import PR',
    'Discontinued Trade RS', 'Closed COMEX PA',
    'Expired Import MS', 'Terminated Trade RN',
];

const nomesLeads = [
    'Prospect Agro Novo SP', 'Lead Tech Import RS',
    'Reunião COMEX PE', 'Proposta Fashion SC',
    'ProspectMax GO', 'Lead Prime COMEX RJ',
    'Reunião Pharma BA', 'Proposta Steel MG',
    'Interesse Eletrônicos SP', 'Contato Têxtil PR',
    'Demo Agro CE', 'Proposta Log MS',
    'Prospect Marine PA', 'Lead Digital AM',
    'Reunião Food RN', 'Interesse Quím GO',
    'Prospect EcoTrade SC', 'Lead BioComex SP',
    'Proposta OceanTrade RJ', 'Reunião UrbanComex MG',
    'Lead AutoImport RS', 'Prospect GreenTrade BA',
    'Proposta SafeComex PE', 'Lead StarImport CE',
    'Reunião MaxTrade PA', 'Lead CoreImport GO',
    'Prospect UniTrade SC', 'Lead PureTrade SP',
    'Proposta NetImport RJ', 'Reunião FirmComex PR',
];

const segmentos = [
    'Agronegócio', 'Eletrônicos', 'Têxtil', 'Farmacêutico', 'Automotivo',
    'Alimentos e Bebidas', 'Logística', 'Químico', 'Maquinário', 'Metalurgia',
    'Cosméticos', 'Trading', 'Despacho Aduaneiro', 'Hospitalar', 'Ferroviário',
];

const canais = [
    'DATI > Vendedor', 'Google > Orgânico', 'SDR DATI', 'Site',
    'DATI > Indica', 'Parceiros > DMM', 'Gerador de Leads > Scotto',
    'Google > Pago', 'Redes Sociais',
];

const estados = ['SP', 'SC', 'RS', 'MG', 'RJ', 'PR', 'GO', 'BA', 'CE', 'PE', 'PA', 'MT', 'AM', 'MS', 'RN', 'AC'];
const cidades = {
    SP: ['São Paulo', 'Campinas', 'Santos', 'Ribeirão Preto'],
    SC: ['Florianópolis', 'Joinville', 'Blumenau', 'Itajaí'],
    RS: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Santa Maria'],
    MG: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora'],
    RJ: ['Rio de Janeiro', 'Niterói', 'Petrópolis', 'Volta Redonda'],
    PR: ['Curitiba', 'Londrina', 'Maringá', 'Cascavel'],
    GO: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde'],
    BA: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Ilhéus'],
    CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Sobral'],
    PE: ['Recife', 'Caruaru', 'Petrolina', 'Olinda'],
    PA: ['Belém', 'Ananindeua', 'Santarém', 'Marabá'],
    MT: ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop'],
    AM: ['Manaus', 'Parintins', 'Itacoatiara', 'Tefé'],
    MS: ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá'],
    RN: ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante'],
    AC: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá'],
};

const healthScoreOptions = ['Saudável', 'Saudável', 'Saudável', 'Saudável', 'Saudável', 'Saudável', 'Em Atenção', 'Em Atenção', 'Em Atenção', 'Em Risco', 'Em Risco'];

const passosTitulos = [
    'Enviar proposta comercial',
    'Agendar demo do sistema',
    'Follow-up pós reunião',
    'Renovar contrato anual',
    'Verificar onboarding concluído',
    'Apresentar novo módulo',
    'Call de check-in trimestral',
    'Enviar relatório de uso',
    'Coletar NPS do cliente',
    'Negociar upgrade de plano',
    'Resolver pendência técnica',
    'Acompanhar implementação',
    'Reunião de alinhamento CS',
    'Confirmar dados de faturamento',
    'Apresentar case de sucesso',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
}
function nps() {
    const roll = Math.random();
    if (roll < 0.6) return Math.floor(Math.random() * 3) + 7; // 7-9
    if (roll < 0.8) return Math.floor(Math.random() * 2) + 5; // 5-6
    return Math.floor(Math.random() * 5);                      // 0-4
}
function randomCreatedAt() {
    const mesesAtras = Math.floor(Math.random() * 18);
    const d = new Date(HOJE);
    d.setMonth(d.getMonth() - mesesAtras);
    d.setDate(Math.floor(Math.random() * 28) + 1);
    return d.toISOString();
}

/**
 * Calcula status do próximo passo com base na data de vencimento
 * @param {string} dataVencimento - ISO string da data
 * @param {string} statusForcado - se "Concluído", retorna concluído
 */
function calcStatusPasso(dataVencimento, statusForcado) {
    if (statusForcado === 'Concluído') return 'Concluído';
    const venc = new Date(dataVencimento);
    const hoje = new Date(HOJE);
    venc.setHours(0, 0, 0, 0);
    hoje.setHours(0, 0, 0, 0);
    if (venc < hoje) return 'Vencido';
    if (venc.getTime() === hoje.getTime()) return 'Vence Hoje';
    return 'Pendente';
}

/**
 * Gera próximo passo para empresas ativas.
 * Distribuição: 20% vencidos, 10% hoje, 50% próximos 7-30 dias, 20% concluídos
 */
function gerarProximoPasso(empresaId, usuariosDisponiveis) {
    const roll = Math.random();
    let dataVencimento, statusForcado;

    if (roll < 0.20) {
        // Vencido: 1-30 dias atrás
        dataVencimento = diasAtras(Math.floor(Math.random() * 30) + 1);
        statusForcado = 'Pendente';
    } else if (roll < 0.30) {
        // Vence hoje
        dataVencimento = HOJE.toISOString();
        statusForcado = 'Pendente';
    } else if (roll < 0.80) {
        // Próximos 7-30 dias
        dataVencimento = diasAFrente(Math.floor(Math.random() * 24) + 7);
        statusForcado = 'Pendente';
    } else {
        // Concluído: data no passado
        dataVencimento = diasAtras(Math.floor(Math.random() * 15) + 1);
        statusForcado = 'Concluído';
    }

    const responsaveis = pickN(usuariosDisponiveis, Math.random() > 0.4 ? 2 : 1).map(u => u.nome);
    const status = calcStatusPasso(dataVencimento, statusForcado);

    return {
        titulo: pick(passosTitulos),
        dataVencimento,
        responsaveis,
        status,
        empresaId,
    };
}

// ─── Geração principal das empresas ─────────────────────────────────────────

let idCounter = 1;

function criarEmpresaAtiva(nome, index) {
    const id = String(idCounter++);
    const estado = pick(estados);
    const cidade = pick(cidades[estado] || ['Capital']);
    const produtosNomes = pickN(PRODUTOS_DATI, Math.floor(Math.random() * 3) + 1);
    const responsavel = pick(mockUsuarios);
    const healthScore = pick(healthScoreOptions);
    const createdAt = randomCreatedAt();

    return {
        id,
        nome,
        status: 'Cliente Ativo',
        segmento: pick(segmentos),
        canal: pick(canais),
        estado,
        cidade,
        healthScore,
        nps: nps(),
        createdAt,
        updatedAt: diasAtras(Math.floor(Math.random() * 7)),
        responsavel,
        produtos: produtosNomes.map((n, i) => ({
            id: `p${id}-${i}`,
            nome: n,
            tipoCobranca: pick(['Mensal', 'Anual']),
            valorMensalidade: (Math.floor(Math.random() * 180) + 20) * 10,
            dataContrato: diasAtras(Math.floor(Math.random() * 365) + 30),
            dataRenovacao: diasAFrente(Math.floor(Math.random() * 300) + 30),
        })),
        contatos: [
            { id: `c${id}-1`, nome: `Contato Principal ${nome.split(' ')[0]}`, cargo: 'Diretor COMEX', email: `contato@${nome.toLowerCase().replace(/\s+/g, '').slice(0, 10)}.com.br`, telefone: `(11) 9${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}` },
        ],
        chamados: [],
        reunioes: [],
        followUps: [],
        proximoPasso: gerarProximoPasso(id, mockUsuarios),
        atividades: [],
        valorEstimadoMensal: (Math.floor(Math.random() * 450) + 50) * 10,
    };
}

function criarEmpresaInativa(nome, index) {
    const id = String(idCounter++);
    const estado = pick(estados);
    const statusInativo = Math.random() > 0.5 ? 'Cliente Inativo' : 'Cliente Suspenso';

    return {
        id,
        nome,
        status: statusInativo,
        segmento: pick(segmentos),
        canal: pick(canais),
        estado,
        cidade: pick(cidades[estado] || ['Capital']),
        healthScore: pick(['Em Risco', 'Em Atenção', 'Em Risco']),
        nps: Math.floor(Math.random() * 5),
        createdAt: diasAtras(Math.floor(Math.random() * 540) + 180),
        updatedAt: diasAtras(Math.floor(Math.random() * 30) + 7),
        responsavel: pick(mockUsuarios),
        produtos: [],
        contatos: [],
        chamados: [],
        reunioes: [],
        followUps: [],
        proximoPasso: null,
        atividades: [],
        valorEstimadoMensal: 0,
    };
}

const statusLeads = ['Prospect', 'Lead', 'Reunião', 'Proposta | Andamento'];

function criarEmpresaLead(nome, index) {
    const id = String(idCounter++);
    const estado = pick(estados);
    const status = statusLeads[Math.min(index % 4, statusLeads.length - 1)];

    return {
        id,
        nome,
        status,
        segmento: pick(segmentos),
        canal: pick(canais),
        estado,
        cidade: pick(cidades[estado] || ['Capital']),
        healthScore: 'Em Atenção',
        nps: null,
        createdAt: diasAtras(Math.floor(Math.random() * 120) + 7),
        updatedAt: diasAtras(Math.floor(Math.random() * 14)),
        responsavel: pick(mockUsuarios),
        produtos: [],
        contatos: [
            { id: `c${id}-1`, nome: `Prospect ${nome.split(' ')[0]}`, cargo: 'Gerente', email: `lead@prospect.com.br`, telefone: `(11) 9${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}` },
        ],
        chamados: [],
        reunioes: [],
        followUps: [],
        proximoPasso: gerarProximoPasso(id, mockUsuarios),
        atividades: [],
        valorEstimadoMensal: (Math.floor(Math.random() * 200) + 50) * 10,
    };
}

// ─── Exportação Principal: mockEmpresas ──────────────────────────────────────
export const mockEmpresas = [
    ...nomesAtivos.map((nome, i) => criarEmpresaAtiva(nome, i)),
    ...nomesInativos.map((nome, i) => criarEmpresaInativa(nome, i)),
    ...nomesLeads.map((nome, i) => criarEmpresaLead(nome, i)),
];

// ─── Chamados / Help Desk ─────────────────────────────────────────────────────
const titulosChamados = [
    'Erro ao importar DI', 'Sistema lento na classificação NCM', 'NF-e rejeitada no SEFAZ',
    'Dashboard não carrega', 'Falha na integração ERP', 'Usuário sem acesso ao módulo',
    'Bug no relatório de custos', 'Cálculo de frete incorreto', 'Timeout na consulta Siscomex',
    'Erro de encoding na exportação CSV', 'Módulo Smart Read fora do ar',
    'Problema no Catálogo de NCM', 'Imposto calculado errado', 'Tela de onboarding em loop',
    'Email de notificação não enviado', 'Lentidão no filtro de empresas', 'Crash ao salvar produto',
    'Permissão negada no perfil', 'Relatório em branco', 'Campo obrigatório ignorado',
];

const statusChamado = ['Aberto', 'Em Andamento', 'Resolvido'];
const empresasAtivas = nomesAtivos;

export const mockChamados = Array.from({ length: 40 }, (_, i) => {
    const status = statusChamado[Math.floor(Math.random() * statusChamado.length)];
    const criadoEm = diasAtras(Math.floor(Math.random() * 30) + 1);
    const resolvidoEm = status === 'Resolvido'
        ? (() => {
            const d = new Date(criadoEm);
            d.setHours(d.getHours() + Math.floor(Math.random() * 72) + 2);
            return d.toISOString();
        })()
        : null;

    return {
        id: `ch${i + 1}`,
        titulo: pick(titulosChamados),
        status,
        empresa: pick(empresasAtivas),
        responsavel: pick(mockUsuarios).nome,
        criadoEm,
        resolvidoEm,
        diasAberto: Math.floor((HOJE - new Date(criadoEm)) / (1000 * 60 * 60 * 24)),
    };
});

// ─── Onboardings Ativos ───────────────────────────────────────────────────────
export const mockOnboardings = Array.from({ length: 20 }, (_, i) => {
    const empresa = nomesAtivos[i];
    const etapasTotal = pick([5, 6, 7, 8]);
    const etapasConcluidas = Math.floor(Math.random() * (etapasTotal + 1));
    const progresso = Math.round((etapasConcluidas / etapasTotal) * 100);
    const diasDesdeInicio = Math.floor(Math.random() * 90) + 5;
    const dataInicio = diasAtras(diasDesdeInicio);

    return {
        id: `ob${i + 1}`,
        empresa,
        responsavel: pick(mockUsuarios).nome,
        etapasTotal,
        etapasConcluidas,
        progresso,
        dataInicio,
        diasDesdeInicio,
        atrasado: progresso < 50 && diasDesdeInicio > 30,
        critico: diasDesdeInicio > 60,
    };
});

// ─── Estatísticas e Variações Mensais ────────────────────────────────────────
export const mockStats = {
    variacaoMesAnterior: {
        total: +8,
        ativos: +12,
        inativos: -3,
        leads: +5,
        novosMes: +7,
    },
};

// ─── Dados dos últimos 7 dias para o Help Desk LineChart ─────────────────────
export const mockHelpDeskTimeline = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(HOJE);
    d.setDate(d.getDate() - (6 - i));
    const dia = `${d.getDate()}/${d.getMonth() + 1}`;
    return {
        dia,
        abertos: Math.floor(Math.random() * 8) + 2,
        resolvidos: Math.floor(Math.random() * 6) + 1,
    };
});

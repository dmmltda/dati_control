/**
 * ============================================================================
 * Test Data — Dados padronizados para testes E2E
 * js/tests/e2e/fixtures/test-data.js
 * ============================================================================
 * NUNCA usar dados hardcoded nos specs — sempre importar daqui.
 * CNPJs são fictícios (formato válido mas não reais).
 * ============================================================================
 */

// ─── Sufixo único por execução (evita colisões em paralelo + CI) //
const RUN_ID = Date.now().toString(36).toUpperCase();

// ─── EMPRESAS ─────────────────────────────────────────────────────────────────

export const EMPRESA_VALIDA = {
    nome:        `E2E Corp ${RUN_ID}`,
    cnpj:        '11.222.333/0001-81',
    status:      'Prospect',
    tipo:        'Privada',
    segmento:    'Tech',
    modo:        'Direto',
    estado:      'SP',
    cidade:      'São Paulo',
    site:        'https://e2ecorp.com.br',
    lead:        'Inbound',
};

export const EMPRESA_MINIMA = {
    nome:     `E2E Min ${RUN_ID}`,
    status:   'Prospect',
    segmento: 'Tech',
    modo:     'Direto',
};

export const EMPRESA_INVALIDA = {
    nome:  '',           // obrigatório — vazio
    cnpj:  '123',        // CNPJ curto demais
    email: 'semArroba',  // email malformado
};

export const EMPRESA_ATIVA = {
    nome:        `E2E Ativa ${RUN_ID}`,
    status:      'Ativo',
    segmento:    'Tech',
    modo:        'Direto',
    tipo:        'Privada',
    estado:      'SP',
};

// ─── CONTATOS ─────────────────────────────────────────────────────────────────

export const CONTATO_VALIDO = {
    nome:   `Contato E2E ${RUN_ID}`,
    cargo:  'CEO',
    email:  `contato.${RUN_ID.toLowerCase()}@e2ecorp.com`,
    whats:  '(11) 99999-0000',
};

export const CONTATO_INVALIDO = {
    nome:   '',           // obrigatório
    email:  'semArroba',
};

// ─── ATIVIDADES ───────────────────────────────────────────────────────────────

export const ATIVIDADE_VALIDA = {
    tipo:        'Comentário',
    titulo:      `Atividade E2E ${RUN_ID}`,
    descricao:   'Descrição da atividade de teste end-to-end.',
    departamento: 'Customer Success',
    status:      'Aberta',
    prioridade:  'media',
};

export const ATIVIDADE_REUNIAO = {
    tipo:        'Reunião',
    titulo:      `Reunião E2E ${RUN_ID}`,
    descricao:   'Reunião de alinhamento de testes.',
    departamento: 'Customer Success',
    status:      'Aberta',
};

export const ATIVIDADE_CONCLUIDA = {
    ...ATIVIDADE_VALIDA,
    status: 'Concluída',
};

// ─── PRODUTOS ─────────────────────────────────────────────────────────────────

export const PRODUTO_VALIDO = {
    nome:           'DATImonitor',
    tipoCobranca:   'Mensal',
    valorUnitario:  '150',
    qtdUsuarios:    '3',
    // total esperado: R$ 450,00
};

// ─── NPS ──────────────────────────────────────────────────────────────────────

export const NPS_VALIDO = {
    nota:       9,
    comentario: 'Ótimo atendimento nos testes.',
};

// ─── IMPORT CSV ───────────────────────────────────────────────────────────────

export const CSV_VALIDO = `Nome_da_empresa,CNPJ_da_empresa,Status,Segmento_da_empresa,Modo_da_empresa,contato_nome,contato_email
Import E2E Alpha ${RUN_ID},44444444000144,Prospect,Tech,Direto,Ana Alpha,ana@alpha.com
Import E2E Beta ${RUN_ID},55555555000155,Prospect,Tech,Direto,Bob Beta,bob@beta.com`;

export const CSV_INVALIDO = `Nome_da_empresa,CNPJ_da_empresa,Status
,123,Prospect
`;

export const CSV_DUPLICADO = `Nome_da_empresa,CNPJ_da_empresa,Status
Dup E2E ${RUN_ID},66666666000166,Prospect
Dup E2E ${RUN_ID},66666666000166,Prospect`;

// ─── USUÁRIO MASTER ──────────────────────────────────────────────────────────

export const USER_MASTER = {
    email:    process.env.TEST_USER_MASTER_EMAIL    || 'test.master@dati.com.br',
    password: process.env.TEST_USER_MASTER_PASSWORD || 'TestMaster@2026!',
};

export const USER_STANDARD = {
    email:    process.env.TEST_USER_STANDARD_EMAIL    || 'test.standard@dati.com.br',
    password: process.env.TEST_USER_STANDARD_PASSWORD || 'TestStandard@2026!',
};

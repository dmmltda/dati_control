/**
 * @file permissions.js
 * Lista canônica de todas as feature permissions disponíveis no sistema.
 * Usada no backend para validação e no frontend para renderizar checkboxes.
 */

export const FEATURE_PERMISSIONS = {
  // ── 1. NAVEGAÇÃO GLOBAL (Menu Lateral) ────────────────────────────────────
  'dashboard.view':      'Dashboard',
  'companies.view':      'Empresas',
  'my_tasks.view':       'Minhas Atividades',
  'reports.view':        'Relatórios',
  'audit.view':          'Histórico de Alterações',
  'test_logs.view':      'Log de Testes',
  'gabi.view':           'Gabi AI',
  'whatsapp.view':       'WhatsApp Inbox HD',

  // ── 2. VISUALIZAR CLIENTE (Abas internas da Empresa) ────────────────────
  'company_tab.basic_data': 'Dados Básicos',
  'company_tab.products':   'Produtos DATI',
  'company_tab.contacts':   'Contatos',
  'company_tab.cs':         'Customer Success',
  'company_tab.activities': 'Atividades',

  // ── 3. EDIÇÃO DO CLIENTE (Salvar / Alterar / Criar) ─────────────────────
  'company_edit.basic_data': 'Editar Dados Básicos',
  'company_edit.products':   'Editar Produtos DATI',
  'company_edit.contacts':   'Editar Contatos',
  'company_edit.cs':         'Editar Customer Success',
  'company_edit.activities': 'Editar Atividades',
};

// Permissões padrão concedidas automaticamente a novos usuários standard
export const DEFAULT_PERMISSIONS = [
  'dashboard.view',
  'companies.view',
  'company_tab.basic_data',
];

// Agrupamento para renderizar a UI de configuração no modal
export const PERMISSION_GROUPS = [
  {
    label: 'NAVEGAÇÃO GLOBAL',
    keys: [
      'dashboard.view',
      'companies.view',
      'my_tasks.view',
      'reports.view',
      'audit.view',
      'test_logs.view',
      'gabi.view',
      'whatsapp.view',
    ],
  },
  {
    label: 'VISUALIZAR CLIENTE (ABAS)',
    keys: [
      'company_tab.basic_data',
      'company_tab.products',
      'company_tab.contacts',
      'company_tab.cs',
      'company_tab.activities',
    ],
  },
  {
    label: 'EDIÇÃO DO CLIENTE',
    keys: [
      'company_edit.basic_data',
      'company_edit.products',
      'company_edit.contacts',
      'company_edit.cs',
      'company_edit.activities',
    ],
  },
];

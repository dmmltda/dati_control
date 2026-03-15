/**
 * ============================================================================
 * Tutorial Recording Config — Journey CRM
 * scripts/tutorials/tutorials.config.js
 * ============================================================================
 * Cada entrada aqui = um arquivo .webm gerado em assets/tutorials/
 *
 * Para adicionar um novo tutorial:
 *  1. Adicione um objeto no array TUTORIALS abaixo
 *  2. Rode: npm run record-tutorials
 *  3. O vídeo aparece automaticamente em assets/tutorials/<id>.webm
 *  4. Atualize a tooltip no index.html para apontar para o novo vídeo
 * ============================================================================
 */

export const TUTORIALS = [

  // ── TUTORIAL 1: Filtro de empresas por coluna ───────────────────────────
  {
    id:          'filtro-empresas',
    descricao:   'Mostra como usar o filtro da coluna EMPRESA na tabela',
    saida:       'assets/tutorials/filtro-empresas.webm',
    viewport:    { width: 1280, height: 800 },
    duracao_ms:  12000,   // duração total do vídeo gravado

    passos: [
      // 1. Navega para a tela de Empresas
      { acao: 'navegar',      destino: '/#company-list' },
      { acao: 'aguardar_sel', seletor: '#view-company-list .company-table', timeout: 8000 },
      { acao: 'aguardar',     ms: 800 },

      // 2. Mouse começa no center da tabela
      { acao: 'mover_mouse',  x: 640, y: 400 },
      { acao: 'aguardar',     ms: 600 },

      // 3. Move o cursor até o ícone de filtro da coluna EMPRESA
      { acao: 'mover_mouse_para', seletor: 'th[data-key="nome"] .btn-filter-column', offset: { x: 0, y: 0 } },
      { acao: 'aguardar',     ms: 500 },

      // 4. Clica no ícone de filtro — abre dropdown
      { acao: 'clicar',       seletor: 'th[data-key="nome"] .btn-filter-column' },
      { acao: 'aguardar_sel', seletor: '#filter-popover-comp_nome.active, #filter-popover-comp_nome[style*="block"]', timeout: 3000 },
      { acao: 'aguardar',     ms: 600 },

      // 5. Move o cursor para o campo de pesquisa dentro do dropdown
      { acao: 'mover_mouse_para', seletor: '#filter-popover-comp_nome .filter-search-input, #filter-popover-comp_nome input[type="text"]' },
      { acao: 'aguardar',     ms: 300 },

      // 6. Digita "ABC" no campo de pesquisa
      { acao: 'digitar',      seletor: '#filter-popover-comp_nome .filter-search-input, #filter-popover-comp_nome input[type="text"]', texto: 'ABC' },
      { acao: 'aguardar',     ms: 600 },

      // 7. Clica no item "ABC IMPORTADOR" da lista
      { acao: 'clicar_texto', seletor: '#filter-popover-comp_nome .filter-item, #filter-popover-comp_nome li', texto: 'ABC' },
      { acao: 'aguardar',     ms: 800 },

      // 8. Aguarda tabela filtrar
      { acao: 'aguardar_sel', seletor: '#company-table-body tr', timeout: 3000 },
      { acao: 'aguardar',     ms: 1500 },

      // 9. Pausa final para o usuário ver o resultado
      { acao: 'aguardar',     ms: 1000 },
    ],
  },

  // ── TUTORIAL 2 (futuro): Criar atividade ────────────────────────────────
  // {
  //   id:        'criar-atividade',
  //   descricao: 'Como criar uma nova atividade',
  //   saida:     'assets/tutorials/criar-atividade.webm',
  //   passos: [
  //     { acao: 'navegar',  destino: '/#company-list' },
  //     { acao: 'aguardar', ms: 800 },
  //     { acao: 'clicar',   seletor: '.btn-new-activity' },
  //     ...
  //   ]
  // },

];

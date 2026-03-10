/**
 * ProximosPassos.js — Painel Central do Journey ⭐
 * O painel mais importante: mostra o que precisa acontecer hoje por responsável.
 *
 * @param {string} containerId - ID do elemento HTML onde renderizar
 * @param {Array}  empresas    - lista de empresas com proximoPasso
 * @param {Array}  usuarios    - lista de usuários para o filtro
 */

import { colors, statusColors, card } from '../../theme/tokens.js';

// ─── Estado interno do painel ────────────────────────────────────────────────
let _empresas = [];
let _usuarios = [];
let _container = null;
let _filtroResponsavel = 'Todos';
let _filtroTab = 'Todos';
let _paginaAtual = 1;
const ITENS_POR_PAGINA = 15;

const HOJE = new Date('2026-03-10');
HOJE.setHours(0, 0, 0, 0);

// ─── Helpers de data/status ──────────────────────────────────────────────────

/**
 * Calcula o status de exibição do próximo passo
 * @param {Object} passo - { dataVencimento, status }
 * @returns {'Vencido'|'Hoje'|'Pendente'|'Concluído'}
 */
function getDisplayStatus(passo) {
  if (passo.status === 'Concluído') return 'Concluído';
  const venc = new Date(passo.dataVencimento);
  venc.setHours(0, 0, 0, 0);
  if (venc < HOJE) return 'Vencido';
  if (venc.getTime() === HOJE.getTime()) return 'Hoje';
  return 'Pendente';
}

/**
 * Formata data ISO para DD/MM/AAAA
 * @param {string} iso
 */
function formatData(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

/**
 * Calcula quantos dias faltam ou já passaram da data de vencimento
 * @param {string} iso
 * @returns {number} negativo = vencido há X dias
 */
function diffDias(iso) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - HOJE) / (1000 * 60 * 60 * 24));
}

// ─── Extração de todos os próximos passos com contexto ───────────────────────

function getPassos() {
  return _empresas
    .filter(e => e.proximoPasso)
    .map(e => ({
      ...e.proximoPasso,
      empresaNome: e.nome,
      empresaStatus: e.status,
      displayStatus: getDisplayStatus(e.proximoPasso),
    }));
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

function filtrarPassos(passos) {
  let result = passos;

  // Filtro por responsável
  if (_filtroResponsavel !== 'Todos') {
    result = result.filter(p =>
      p.responsaveis?.includes(_filtroResponsavel)
    );
  }

  // Filtro por tab
  switch (_filtroTab) {
    case 'Vencidos':
      result = result.filter(p => p.displayStatus === 'Vencido');
      break;
    case 'Hoje':
      result = result.filter(p => p.displayStatus === 'Hoje');
      break;
    case 'Semana':
      result = result.filter(p => {
        const diff = diffDias(p.dataVencimento);
        return diff >= 0 && diff <= 7 && p.displayStatus !== 'Concluído';
      });
      break;
    case 'Concluídos':
      result = result.filter(p => p.displayStatus === 'Concluído');
      break;
    default:
      break;
  }

  // Ordenação: Vencidos primeiro, depois Hoje, depois Pendente, Concluído por último
  const ordem = { 'Vencido': 0, 'Hoje': 1, 'Pendente': 2, 'Concluído': 3 };
  result.sort((a, b) => (ordem[a.displayStatus] ?? 4) - (ordem[b.displayStatus] ?? 4));

  return result;
}

// ─── Renderização dos badges de status ───────────────────────────────────────

function renderStatusBadge(displayStatus) {
  const config = {
    'Vencido': { bg: 'rgba(239,68,68,0.15)', color: colors.danger, texto: '🔴 Vencido' },
    'Hoje': { bg: 'rgba(245,158,11,0.15)', color: colors.warning, texto: '🟡 Hoje' },
    'Pendente': { bg: 'rgba(100,116,139,0.12)', color: colors.textMuted, texto: '⚪ Pendente' },
    'Concluído': { bg: 'rgba(16,185,129,0.15)', color: colors.success, texto: '✅ Concluído' },
  }[displayStatus] || { bg: '#eee', color: '#666', texto: displayStatus };

  return `<span style="
    background: ${config.bg};
    color: ${config.color};
    font-size: 0.72rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 9999px;
    white-space: nowrap;
  ">${config.texto}</span>`;
}

/**
 * Renderiza avatares/badges dos responsáveis (máx 3)
 * @param {string[]} responsaveis
 */
function renderResponsaveis(responsaveis) {
  const lista = responsaveis?.slice(0, 3) ?? [];
  const avatarColors = [colors.primary, colors.accent, colors.success];
  return `
    <div style="display: flex; align-items: center; gap: -4px;">
      ${lista.map((nome, i) => {
    const iniciais = nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const bg = avatarColors[i % avatarColors.length];
    return `<span title="${nome}" style="
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border-radius: 50%;
          background: ${bg}; color: #fff;
          font-size: 0.65rem; font-weight: 700;
          border: 2px solid white;
          margin-left: ${i > 0 ? '-6px' : '0'};
          position: relative; z-index: ${10 - i};
        ">${iniciais}</span>`;
  }).join('')}
    </div>
  `;
}

/**
 * Estilo da linha da tabela baseado no status
 * @param {string} displayStatus
 */
function rowStyle(displayStatus) {
  const cfg = {
    'Vencido': { bg: '#FEF2F2', border: `border-left: 3px solid ${colors.danger};`, opacity: '1' },
    'Hoje': { bg: '#FFFBEB', border: `border-left: 3px solid ${colors.warning};`, opacity: '1' },
    'Pendente': { bg: 'transparent', border: 'border-left: 3px solid transparent;', opacity: '1' },
    'Concluído': { bg: '#F9FAFB', border: `border-left: 3px solid ${colors.success};`, opacity: '0.6' },
  }[displayStatus] || { bg: 'transparent', border: '', opacity: '1' };

  return `background: ${cfg.bg}; ${cfg.border} opacity: ${cfg.opacity};`;
}

/**
 * Renderiza o badge do estágio da empresa
 * @param {string} status
 */
function renderEstagioBadge(status) {
  const colorMap = {
    'Cliente Ativo': { bg: 'rgba(16,185,129,0.12)', color: colors.success },
    'Cliente Inativo': { bg: 'rgba(239,68,68,0.12)', color: colors.danger },
    'Cliente Suspenso': { bg: 'rgba(239,68,68,0.12)', color: colors.danger },
    'Prospect': { bg: 'rgba(245,158,11,0.12)', color: colors.warning },
    'Lead': { bg: 'rgba(14,52,96,0.12)', color: colors.primary },
    'Reunião': { bg: 'rgba(232,131,42,0.12)', color: colors.accent },
    'Proposta | Andamento': { bg: 'rgba(14,52,96,0.15)', color: colors.primaryLight },
    'Proposta | Recusada': { bg: 'rgba(239,68,68,0.12)', color: colors.danger },
  };
  const c = colorMap[status] || { bg: '#eee', color: '#666' };
  return `<span style="
    background: ${c.bg}; color: ${c.color};
    font-size: 0.68rem; font-weight: 600;
    padding: 2px 8px; border-radius: 9999px;
    white-space: nowrap;
  ">${status}</span>`;
}

// ─── Renderização da tabela ───────────────────────────────────────────────────

function renderTabela(passosFiltrados) {
  const inicio = (_paginaAtual - 1) * ITENS_POR_PAGINA;
  const pagina = passosFiltrados.slice(inicio, inicio + ITENS_POR_PAGINA);

  if (pagina.length === 0) {
    return `
      <div style="text-align: center; padding: 3rem; color: ${colors.textMuted};">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>
        <p style="font-size: 0.875rem;">Nenhum próximo passo encontrado para este filtro.</p>
      </div>
    `;
  }

  const rows = pagina.map(p => `
    <tr style="${rowStyle(p.displayStatus)}"
        onmouseenter="this.style.background=this.style.background||'#F8FAFC';this.style.filter='brightness(0.97)'"
        onmouseleave="this.style.filter='none'">
      <td style="padding: 0.9rem 1rem; font-weight: 600; font-size: 0.82rem; color: ${colors.textMain}; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${p.empresaNome}">
        ${p.empresaNome}
      </td>
      <td style="padding: 0.9rem 1rem; font-size: 0.82rem; color: ${colors.textMain}; max-width: 200px;">
        ${p.titulo}
      </td>
      <td style="padding: 0.9rem 1rem;">
        ${renderResponsaveis(p.responsaveis)}
      </td>
      <td style="padding: 0.9rem 1rem; font-size: 0.82rem; color: ${colors.textMuted}; white-space: nowrap;">
        ${formatData(p.dataVencimento)}
      </td>
      <td style="padding: 0.9rem 1rem;">
        ${renderStatusBadge(p.displayStatus)}
      </td>
      <td style="padding: 0.9rem 1rem;">
        ${renderEstagioBadge(p.empresaStatus)}
      </td>
    </tr>
  `).join('');

  return `
    <div class="table-responsive" style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-family: inherit;">
        <thead>
          <tr style="border-bottom: 2px solid ${colors.border};">
            <th style="padding: 0.75rem 1rem; text-align: left; font-size: 0.72rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.06em;">Empresa</th>
            <th style="padding: 0.75rem 1rem; text-align: left; font-size: 0.72rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.06em;">Próximo Passo</th>
            <th style="padding: 0.75rem 1rem; text-align: left; font-size: 0.72rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.06em;">Responsáveis</th>
            <th style="padding: 0.75rem 1rem; text-align: left; font-size: 0.72rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.06em;">Data</th>
            <th style="padding: 0.75rem 1rem; text-align: left; font-size: 0.72rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.06em;">Status</th>
            <th style="padding: 0.75rem 1rem; text-align: left; font-size: 0.72rem; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.06em;">Estágio</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ─── Paginação ────────────────────────────────────────────────────────────────

function renderPaginacao(total) {
  const totalPaginas = Math.ceil(total / ITENS_POR_PAGINA);
  if (totalPaginas <= 1) return '';

  const inicio = (_paginaAtual - 1) * ITENS_POR_PAGINA + 1;
  const fim = Math.min(_paginaAtual * ITENS_POR_PAGINA, total);

  return `
    <div style="
      display: flex; align-items: center; justify-content: space-between;
      padding: 1rem 0 0; border-top: 1px solid ${colors.border}; margin-top: 0.5rem;
    ">
      <span style="font-size: 0.78rem; color: ${colors.textMuted};">
        Exibindo ${inicio}–${fim} de ${total} resultados
      </span>
      <div style="display: flex; gap: 0.5rem;">
        <button onclick="window._proximosPassos?.irPagina(${_paginaAtual - 1})" ${_paginaAtual === 1 ? 'disabled' : ''}
          style="
            padding: 0.4rem 0.9rem; border-radius: 6px; font-size: 0.8rem;
            border: 1px solid ${colors.border}; background: ${_paginaAtual === 1 ? colors.bgSurface : colors.bgCard};
            color: ${_paginaAtual === 1 ? colors.textMuted : colors.textMain};
            cursor: ${_paginaAtual === 1 ? 'not-allowed' : 'pointer'};
            font-family: inherit;
          ">← Anterior</button>
        <span style="
          padding: 0.4rem 0.9rem; border-radius: 6px; font-size: 0.8rem;
          background: ${colors.primary}; color: white; font-weight: 600;
        ">${_paginaAtual} / ${totalPaginas}</span>
        <button onclick="window._proximosPassos?.irPagina(${_paginaAtual + 1})" ${_paginaAtual === totalPaginas ? 'disabled' : ''}
          style="
            padding: 0.4rem 0.9rem; border-radius: 6px; font-size: 0.8rem;
            border: 1px solid ${colors.border}; background: ${_paginaAtual === totalPaginas ? colors.bgSurface : colors.bgCard};
            color: ${_paginaAtual === totalPaginas ? colors.textMuted : colors.textMain};
            cursor: ${_paginaAtual === totalPaginas ? 'not-allowed' : 'pointer'};
            font-family: inherit;
          ">Próxima →</button>
      </div>
    </div>
  `;
}

// ─── Contadores de resumo ─────────────────────────────────────────────────────

function renderContadores(todos) {
  const vencidos = todos.filter(p => p.displayStatus === 'Vencido').length;
  const hoje = todos.filter(p => p.displayStatus === 'Hoje').length;
  const semana = todos.filter(p => {
    const diff = diffDias(p.dataVencimento);
    return diff >= 0 && diff <= 7 && p.displayStatus !== 'Concluído';
  }).length;

  const badgeStyle = (bg, color) => `
    display: inline-flex; align-items: center; gap: 0.4rem;
    background: ${bg}; color: ${color};
    font-size: 0.78rem; font-weight: 700;
    padding: 5px 12px; border-radius: 9999px;
    border: 1px solid ${color}33;
  `;

  return `
    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
      <span style="${badgeStyle('rgba(239,68,68,0.1)', colors.danger)}">
        🔴 ${vencidos} Vencido${vencidos !== 1 ? 's' : ''}
      </span>
      <span style="${badgeStyle('rgba(245,158,11,0.1)', colors.warning)}">
        🟡 ${hoje} Vencem Hoje
      </span>
      <span style="${badgeStyle('rgba(15,52,96,0.1)', colors.primary)}">
        📅 ${semana} Esta Semana
      </span>
    </div>
  `;
}

// ─── Filtros: Tabs e Dropdown ─────────────────────────────────────────────────

function renderFiltros() {
  const tabs = ['Todos', 'Vencidos', 'Hoje', 'Semana', 'Concluídos'];

  const tabHtml = tabs.map(tab => {
    const ativo = _filtroTab === tab;
    return `
      <button onclick="window._proximosPassos?.setTab('${tab}')"
        style="
          padding: 0.45rem 1rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600;
          border: 1px solid ${ativo ? colors.primary : colors.border};
          background: ${ativo ? colors.primary : 'transparent'};
          color: ${ativo ? '#fff' : colors.textMuted};
          cursor: pointer; transition: all 150ms; font-family: inherit;
        ">${tab}</button>
    `;
  }).join('');

  const optionsHtml = [
    '<option value="Todos">Todos os responsáveis</option>',
    ..._usuarios.map(u => `<option value="${u.nome}" ${_filtroResponsavel === u.nome ? 'selected' : ''}>${u.nome}</option>`),
  ].join('');

  return `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        ${tabHtml}
      </div>
      <select onchange="window._proximosPassos?.setResponsavel(this.value)"
        style="
          padding: 0.45rem 2rem 0.45rem 0.75rem; border-radius: 8px;
          border: 1px solid ${colors.border}; background: ${colors.bgCard};
          color: ${colors.textMain}; font-size: 0.8rem; font-family: inherit;
          cursor: pointer; appearance: auto;
        " aria-label="Filtrar por responsável">
        ${optionsHtml}
      </select>
    </div>
  `;
}

// ─── Render principal ─────────────────────────────────────────────────────────

function render() {
  if (!_container) return;

  const todos = getPassos();
  const passosFiltrados = filtrarPassos(todos);

  _container.innerHTML = `
    <section style="
      background: ${colors.bgCard};
      border-radius: ${card.borderRadius};
      box-shadow: ${card.boxShadow};
      padding: ${card.padding};
      border-top: 3px solid ${colors.accent};
    ">
      <!-- Cabeçalho do painel -->
      <div style="margin-bottom: 1.25rem;">
        <h2 style="
          font-size: 1.1rem; font-weight: 800; color: ${colors.textMain};
          display: flex; align-items: center; gap: 0.6rem; margin: 0 0 0.25rem;
        ">
          <span style="
            background: ${colors.accent}; color: white;
            width: 28px; height: 28px; border-radius: 8px;
            display: inline-flex; align-items: center; justify-content: center;
            font-size: 0.9rem;
          ">⚡</span>
          Próximos Passos por Responsável
          <span style="
            background: rgba(232,131,42,0.12); color: ${colors.accent};
            font-size: 0.68rem; font-weight: 700; padding: 2px 8px;
            border-radius: 9999px; letter-spacing: 0.05em;
          ">PAINEL CENTRAL</span>
        </h2>
        <p style="font-size: 0.8rem; color: ${colors.textMuted}; margin: 0;">
          O que precisa acontecer hoje — e quem é o responsável por fazer acontecer.
        </p>
      </div>

      <!-- Filtros -->
      ${renderFiltros()}

      <!-- Contadores de resumo -->
      ${renderContadores(todos)}

      <!-- Tabela de próximos passos -->
      ${renderTabela(passosFiltrados)}

      <!-- Paginação -->
      ${renderPaginacao(passosFiltrados.length)}
    </section>
  `;
}

// ─── API pública do painel ────────────────────────────────────────────────────

/**
 * Inicializa o painel de Próximos Passos
 * @param {string} containerId
 * @param {Array}  empresas
 * @param {Array}  usuarios
 */
export function renderProximosPassos(containerId, empresas, usuarios) {
  _container = document.getElementById(containerId);
  _empresas = empresas;
  _usuarios = usuarios;
  _paginaAtual = 1;

  // Expõe a API de controle para os event handlers inline
  window._proximosPassos = {
    setTab(tab) {
      _filtroTab = tab;
      _paginaAtual = 1;
      render();
    },
    setResponsavel(nome) {
      _filtroResponsavel = nome;
      _paginaAtual = 1;
      render();
    },
    irPagina(num) {
      const todos = getPassos();
      const passosFiltrados = filtrarPassos(todos);
      const totalPaginas = Math.ceil(passosFiltrados.length / ITENS_POR_PAGINA);
      if (num >= 1 && num <= totalPaginas) {
        _paginaAtual = num;
        render();
      }
    },
  };

  render();
}

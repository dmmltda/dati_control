/**
 * @file deploy.js
 * Tracker de Deploy baseado no TableManager 2.0
 */

import { TableManager } from '../core/table-manager.js';
import { getAuthToken } from './auth.js';
import { showToast } from './utils.js';
import { renderTitleWithTooltip, bindTooltip } from '../src/components/dashboard/Tooltip.js';

const DEPLOY_COLUMNS = [
    { key: 'date',   label: 'Quando',  type: 'string', sortable: true,  filterable: false, searchable: true  },
    { key: 'author', label: 'Quem',    type: 'string', sortable: true,  filterable: true,  searchable: true  },
    { key: 'area',   label: 'Área',    type: 'string', sortable: true,  filterable: true,  searchable: true  },
    { key: 'de',     label: 'De',      type: 'string', sortable: false, filterable: false, searchable: false },
    { key: 'para',   label: 'Para',    type: 'string', sortable: false, filterable: false, searchable: true  },
    { key: 'hash',   label: 'Versão',  type: 'string', sortable: false, filterable: false, searchable: true  },
    { key: 'status', label: 'Status',  type: 'string', sortable: true,  filterable: true,  searchable: false },
];

let _manager = null;
let _allRows = [];
let _filters = { author: '', area: '', status: '', dateFrom: '', dateTo: '' };

// ─── Mapa de palavras-chave → Área de Produto ─────────────────────────────────
// IMPORTANTE: a ordem é prioridade decrescente — o primeiro match vence
const AREA_MAP = [
    // Módulos específicos (palavras-chave muito precisas, rodam primeiro)
    { keywords: ['whatsapp', 'wha', 'inbox'],                                         area: 'WhatsApp HD'           },
    { keywords: ['email', 'e-mail', 'gabi', 'inbound', 'resend', 'webhook'],          area: 'E-mail / Gabi AI'      },
    { keywords: ['nps'],                                                               area: 'NPS'                   },
    { keywords: ['audit', 'histórico', 'historico'],                                    area: 'Histórico'             },
    { keywords: ['scheduler', 'agendament', 'vtt',
                 'log de testes', 'logs de testes',
                 'test log', 'cleanup arquivo', 'cleanup'],                            area: 'Log de Testes'         },
    { keywords: ['relatório', 'relatorio', 'report', 'adherence'],                     area: 'Relatórios'           },
    { keywords: ['kanban', 'pipeline', 'funil', 'funnel'],                             area: 'Funil de Vendas'       },
    { keywords: ['customer success', 'reunião cs', 'reuniao cs', 'cs meeting'],        area: 'Customer Success'      },
    { keywords: ['empresa', 'company', 'companies'],                                   area: 'Empresas'              },
    { keywords: ['tarefa', 'minhas tarefas', 'my task', 'atividade'],                  area: 'Atividades'            },
    { keywords: ['permiss', 'permission', 'usuário', 'usuario', 'admin role'],         area: 'Usuários e Permissões' },
    { keywords: ['kpi', 'dashboard'],                                                  area: 'Dashboard'             },
    { keywords: ['import', 'csv'],                                                     area: 'Importação'           },
    { keywords: ['deploy', 'railway', 'migration', 'migrate', 'tracker'],              area: 'Infraestrutura'        },
    // Tooltip/UI — mais específicos para os painéis que temos
    { keywords: ['tooltip log', 'tooltip testes', 'canvas log', 'canvas testes',
                 'log tooltip', 'test tooltip', 'painel log'],                         area: 'Log de Testes'         },
    { keywords: ['tooltip relat', 'canvas relat', 'tooltip report'],                   area: 'Relatórios'           },
    { keywords: ['tooltip', 'canvas', 'pulse', 'dot', 'ui', 'visual', 'layout',
                 'dark mode', 'glass', 'animation'],                                   area: 'Interface'             },
    // Técnicas — genéricas, sem link de navegação específico
    { keywords: ['auth', 'login', 'clerk', 'session'],                                 area: 'Autenticação'         },
    { keywords: ['prisma', 'banco', 'database', 'schema', 'migration'],                area: 'Banco de Dados'        },
    { keywords: ['api', 'route', 'rota', 'middleware', 'backend', 'server'],           area: 'Back-end / API'        },
];

const TYPE_MAP = {
    'feat'  : 'Novo recurso',
    'fix'   : 'Correção',
    'chore' : 'Manutenção',
    'refactor': 'Refatoração',
    'perf'  : 'Performance',
    'docs'  : 'Documentação',
    'style' : 'Ajuste de estilo',
    'test'  : 'Teste',
    'build' : 'Build',
};

// ─── Mapa Área → view ID do app ─────────────────────────────────────────────────
// Áreas técnicas (Interface, Back-end, DB, Infra) NÃO têm navTarget válido:
// elas afetam o app inteiro e navegar para 'deploy' (página atual) não faz sentido.
const AREA_NAV_MAP = {
    'Dashboard'            : { view: 'dashboard',        icon: 'ph-chart-bar'                  },
    'Empresas'             : { view: 'company-list',     icon: 'ph-buildings'                  },
    'Atividades'           : { view: 'minhas-tarefas',   icon: 'ph-check-square'               },
    'Relatórios'           : { view: 'reports',          icon: 'ph-chart-line-up'              },
    'Histórico'            : { view: 'audit-log',        icon: 'ph-clock-counter-clockwise',   callback: () => typeof auditLog     !== 'undefined' && auditLog.init?.()     },
    'Log de Testes'        : { view: 'log',              icon: 'ph-flask'                      },
    'E-mail / Gabi AI'     : { view: 'email-monitor',    icon: 'ph-envelope',                  callback: () => typeof emailMonitor  !== 'undefined' && emailMonitor.init?.()  },
    'WhatsApp HD'          : { view: 'whatsapp-inbox',   icon: 'ph-whatsapp-logo',             callback: () => typeof whatsappInbox !== 'undefined' && whatsappInbox.init?.() },
    'Usuários e Permissões': { view: 'config-usuarios',  icon: 'ph-users'                      },
    'Autenticação'         : { view: 'config-usuarios',  icon: 'ph-lock'                       },
    'Importação'           : { view: 'company-list',     icon: 'ph-upload-simple'              },
    'NPS'                  : { view: 'company-list',     icon: 'ph-smiley'                     },
    'Customer Success'     : { view: 'company-list',     icon: 'ph-handshake'                  },
    'Funil de Vendas'      : { view: 'company-list',     icon: 'ph-funnel'                     },
    // Interface, Infra, API, DB → sem nav (null é configurado em _parseCommit)
};

function _deployNav(area) {
    const target = AREA_NAV_MAP[area];
    if (!target) return;
    const navEl = document.querySelector(`[data-view="${target.view}"]`);
    if (navEl) navEl.click();
    try { target.callback?.(); } catch(e) { /* ignore */ }
}
window._deployNav = _deployNav;

/**
 * Parseia a mensagem de commit e retorna { area, navTarget, de, para }
 */
function _parseCommit(message) {
    if (!message) return { area: 'Geral', navTarget: null, de: '—', para: '—' };

    const lower = message.toLowerCase();

    // 1. Extrai tipo e escopo do formato convencional: feat(modulo): descricao
    const conventionalMatch = message.match(/^([a-z]+)(?:\(([^)]+)\))?:\s*(.+)/i);
    const typeRaw  = conventionalMatch?.[1]?.toLowerCase() || '';
    const scopeRaw = conventionalMatch?.[2]?.toLowerCase() || '';
    const bodyRaw  = conventionalMatch?.[3] || message;

    // 2. Determina Área a partir do escopo ou palavras-chave no corpo
    let area = 'Geral';
    const searchText = `${scopeRaw} ${lower}`;
    for (const { keywords, area: a } of AREA_MAP) {
        if (keywords.some(k => searchText.includes(k))) {
            area = a;
            break;
        }
    }

    const navTarget = AREA_NAV_MAP[area] ?? null;

    // 3. Monta DE (estado anterior) e PARA (estado resultante)
    const DE_MAP = {
        'feat'    : '—',
        'fix'     : 'Com falha',
        'chore'   : 'Pendente / acumulado',
        'refactor': 'Código legado',
        'perf'    : 'Performance degradada',
        'docs'    : 'Sem documentação',
        'style'   : 'Visual anterior',
        'test'    : 'Sem cobertura',
        'build'   : 'Build anterior',
        'revert'  : 'Versão anterior',
    };

    const de  = DE_MAP[typeRaw] ?? '—';
    const para = bodyRaw;

    return { area, navTarget, de, para };
}

function _formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Renderiza badge de status do Railway com cor e ícone semânticos.
 * Status possíveis: BUILDING, DEPLOYING, SUCCESS, FAILED, CRASHED,
 *                   REMOVED, SLEEPING, SKIPPED, WAITING, QUEUED
 */
function _renderStatusBadge(status) {
    const STATUS_CONFIG = {
        'SUCCESS'   : { label: 'Concluído',   icon: 'ph-check-circle',       color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', pulse: false },
        'BUILDING'  : { label: 'Construindo', icon: 'ph-hammer',             color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)',  pulse: true  },
        'DEPLOYING' : { label: 'Publicando',  icon: 'ph-rocket-launch',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)',  pulse: true  },
        'QUEUED'    : { label: 'Na fila',     icon: 'ph-clock',              color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  pulse: false },
        'WAITING'   : { label: 'Aguardando',  icon: 'ph-hourglass',          color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  pulse: false },
        'FAILED'    : { label: 'Falhou',      icon: 'ph-x-circle',           color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', pulse: false },
        'CRASHED'   : { label: 'Crashou',     icon: 'ph-warning-circle',     color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', pulse: false },
        'REMOVED'   : { label: 'Removido',    icon: 'ph-trash',              color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.18)', pulse: false },
        'SKIPPED'   : { label: 'Ignorado',    icon: 'ph-skip-forward',       color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.18)', pulse: false },
        'SLEEPING'  : { label: 'Hibernando',  icon: 'ph-moon',               color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)', pulse: false },
    };

    const cfg = STATUS_CONFIG[status] || {
        label: status || '—', icon: 'ph-question', color: '#94a3b8',
        bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.18)', pulse: false,
    };

    const pulseStyle = cfg.pulse
        ? 'animation: pulse-dot 1.5s ease-in-out infinite;'
        : '';

    return `<span style="
        font-size:0.75rem;
        background:${cfg.bg};
        color:${cfg.color};
        padding:0.15rem 0.5rem;
        border-radius:4px;
        border:1px solid ${cfg.border};
        display:inline-flex; align-items:center; gap:0.3rem;
        white-space:nowrap;
        ${pulseStyle}
    "><i class="ph ${cfg.icon}"></i> ${cfg.label}</span>`;
}

function _renderRows(data) {
    const tbody = document.getElementById('deploy-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="ph ph-rocket" style="font-size:2rem; display:block; margin-bottom:0.5rem; opacity: 0.5;"></i>
                    Nenhum deploy encontrado.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const isRailway = row.author === 'Railway';
        const color = isRailway ? '#6366f1' : 'var(--text-main)';
        const { area, navTarget, de, para } = _parseCommit(row.message);

        // Badge de Área com cor semântica
        const AREA_COLORS = {
            'Interface'            : { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.3)',  color: '#818cf8' },
            'Log de Testes'        : { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  color: '#fbbf24' },
            'Infraestrutura'       : { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)',  color: '#f87171' },
            'E-mail / Gabi AI'     : { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)',  color: '#a78bfa' },
            'Relatórios'           : { bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.3)',  color: '#38bdf8' },
            'Customer Success'     : { bg: 'rgba(20,184,166,0.12)', border: 'rgba(20,184,166,0.3)',  color: '#2dd4bf' },
            'Banco de Dados'       : { bg: 'rgba(220,38,38,0.1)',   border: 'rgba(220,38,38,0.25)',  color: '#fca5a5' },
        };
        const ac = AREA_COLORS[area] || { bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)', color: '#94a3b8' };
        const areaBadge = `<span style="font-size:0.72rem; background:${ac.bg}; color:${ac.color}; border:1px solid ${ac.border}; border-radius:5px; padding:0.15rem 0.5rem; white-space:nowrap; font-weight:600;">${_escapeHtml(area)}</span>`;

        // Coluna DE: estado anterior (cinza/muted)
        const isVazio = de === '—';
        const deHtml = isVazio
            ? `<span style="font-size:0.75rem; color:#4a5568; font-style:italic;">— não existia</span>`
            : `<span style="font-size:0.75rem; color:#94a3b8; background:rgba(148,163,184,0.08); border:1px solid rgba(148,163,184,0.15); border-radius:4px; padding:0.15rem 0.5rem;">${_escapeHtml(de)}</span>`;

        // Mapa de mensagens explicativas por área sem nav
        const NO_NAV_REASON = {
            'Interface'    : 'Mudanças de interface afetam múltiplas seções do app ao mesmo tempo — não há uma única tela de destino.',
            'Infraestrutura': 'Alterações de infraestrutura (Railway, deploys, CI) não correspondem a uma seção navegável do produto.',
            'Back-end / API': 'Mudanças no servidor ou nas rotas da API não têm representação visual direta em uma seção específica.',
            'Banco de Dados': 'Migrações e alterações de schema afetam os dados de toda a aplicação — sem destino de tela específico.',
            'Autenticação' : 'Mudanças de autenticação são transversais ao sistema — sem seção de produto dedicada.',
            'Geral'        : 'Este commit não foi classificado em uma área específica do produto.',
        };
        const noNavReason = NO_NAV_REASON[area] || `Área "${area}" não tem uma seção única de destino no produto.`;

        // Coluna PARA: clicável — leva para a sessão afetada
        const escapedArea = _escapeHtml(area).replace(/'/g, "\\'");
        const paraHtml = navTarget
            ? `<button
                onclick="window._deployNav('${escapedArea}')"
                title="Ir para: ${_escapeHtml(navTarget.view)}"
                style="
                    background:none; border:none; cursor:pointer; text-align:left; padding:0;
                    display:inline-flex; align-items:flex-start; gap:0.5rem; width:100%;
                    color:var(--text-main); font-size:0.82rem; line-height:1.4; word-break:break-word;
                ">
                <span>${_escapeHtml(para)}</span>
                <span style="
                    flex-shrink:0; margin-top:1px;
                    font-size:0.7rem; color:${ac.color};
                    background:${ac.bg}; border:1px solid ${ac.border};
                    border-radius:4px; padding:0.1rem 0.35rem;
                    display:inline-flex; align-items:center; gap:0.25rem;
                    white-space:nowrap; opacity:0.85;
                    transition: opacity 0.15s;
                " onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85">
                    <i class="ph ${navTarget.icon}"></i> ir
                </span>
              </button>`
            : `<span style="display:inline-flex; align-items:flex-start; gap:0.5rem; width:100%;">
                <span style="font-size:0.82rem; color:var(--text-main); line-height:1.4; word-break:break-word; flex:1;">${_escapeHtml(para)}</span>
                <span
                    class="th-info-btn"
                    data-th-title="SEM LINK DE NAVEGAÇÃO"
                    data-th-tooltip="${_escapeHtml(noNavReason)}"
                    style="
                        flex-shrink:0; margin-top:2px; cursor:help;
                        font-size:0.75rem; color:#4a5568;
                        display:inline-flex; align-items:center;
                        opacity:0.6; transition:opacity 0.15s;
                    "
                    onmouseover="this.style.opacity=1"
                    onmouseout="this.style.opacity=0.6"
                >
                    <i class="ph ph-info"></i>
                </span>
              </span>`;

        const statusHtml = _renderStatusBadge(row.status);

        return `
            <tr style="cursor:default;">
                <td style="font-size:0.82rem; white-space:nowrap; color:var(--text-muted);">${_formatDate(row.date)}</td>
                <td style="font-size:0.85rem; color:${color};">
                    <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                        <i class="ph ${isRailway ? 'ph-robot' : 'ph-user'}"></i> ${_escapeHtml(row.author)}
                    </span>
                </td>
                <td>${areaBadge}</td>
                <td style="min-width:120px;">${deHtml}</td>
                <td style="max-width:340px;">${paraHtml}</td>
                <td style="font-size:0.85rem; font-family:monospace; color:#a78bfa; white-space:nowrap;">
                    <i class="ph ph-git-commit" style="margin-right:0.2rem; color:var(--text-muted);"></i>${_escapeHtml(row.hash)}
                </td>
                <td>${statusHtml}</td>
            </tr>
        `;
    }).join('');
}

function _renderPagination(state) {
    const container = document.getElementById('pagination-deploy');
    if (!container) return;

    const elCount = document.getElementById('deploy-count');
    if (elCount) elCount.textContent = `${state.totalRecords} versão${state.totalRecords !== 1 ? 'ões' : ''}`;

    if (state.totalPages <= 1) {
        container.innerHTML = '';
        container.className = 'pagination-container';
        return;
    }

    const { currentPage, totalPages } = state;
    container.className = 'rpt-pagination';

    container.innerHTML = `
        <button class="btn-ghost btn-sm" ${currentPage === 1 ? 'disabled' : ''} onclick="window._deployGoPage(${currentPage - 1})">
            <i class="ph ph-caret-left"></i> Anterior
        </button>
        <span id="rpt-page-info">Página ${currentPage} de ${totalPages}</span>
        <button class="btn-ghost btn-sm" ${currentPage === totalPages ? 'disabled' : ''} onclick="window._deployGoPage(${currentPage + 1})">
            Próxima <i class="ph ph-caret-right"></i>
        </button>
    `;
}

async function _load() {
    const tbody = document.getElementById('deploy-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="ph ph-spinner" style="font-size:2rem; display:block; margin-bottom:0.5rem; animation: spin 1s linear infinite;"></i>
                    Sincronizando tracking...
                </td>
            </tr>`;
    }

    try {
        const token = await getAuthToken();
        const res = await fetch('/api/deploy/history', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        let data = await res.json();
        _allRows = data;

        if (!_manager) {
            _manager = new TableManager({
                data:             data,
                columns:          DEPLOY_COLUMNS,
                pageSize:         25,
                tableId:          'deploy-tracker-table',
                renderRows:       _renderRows,
                renderPagination: _renderPagination,
            });
            _exposeGlobals();
            _bindTooltips();
        } else {
            _manager.setData(data);
            _bindTooltips();
        }

    } catch (err) {
        console.error('[DeployTracker] Erro ao carregar:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:3rem; color:#ef4444;">
                        <i class="ph ph-warning-circle" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
                        Erro ao carregar tracking: ${_escapeHtml(err.message)}
                    </td>
                </tr>`;
        }
    }
}

function _exposeGlobals() {
    window._deployGoPage = (page) => {
        if (_manager) _manager.goToPage(page);
    };

    window._deploySearch = (value) => {
        if (_manager) _manager.setSearch(value);
    };

    window._deploySort = (col) => {
        if (_manager) _manager.handleSort(col);
    };
    
    window._deployToggleFilter = (key, event) => {
        event.stopPropagation();
        const popover = document.getElementById(`filter-popover-deploy_${key}`);
        if (!popover) return;

        // Fecha todos os outros
        document.querySelectorAll('.filter-popover').forEach(p => {
            if (p !== popover) p.classList.remove('show');
        });

        const isOpen = popover.classList.contains('show');
        if (isOpen) { popover.classList.remove('show'); return; }

        // Constrói o conteúdo
        if (key === 'date') {
            popover.innerHTML = `
                <div style="padding:0.75rem; min-width:240px;">
                    <div class="filter-group">
                        <span class="filter-label">Período</span>
                        <div style="display:flex;flex-direction:column;gap:0.5rem;">
                            <div style="display:flex;align-items:center;gap:0.5rem;">
                                <span style="font-size:0.72rem;color:var(--text-muted);min-width:28px;">De</span>
                                <input type="date" id="deploy-filter-from"
                                    style="flex:1;background:rgba(15,23,42,0.6);border:1px solid var(--dark-border);border-radius:6px;padding:0.35rem 0.5rem;color:var(--text-main);font-size:0.82rem;outline:none;color-scheme:dark;"
                                    onchange="window._deployDateFilter()">
                            </div>
                            <div style="display:flex;align-items:center;gap:0.5rem;">
                                <span style="font-size:0.72rem;color:var(--text-muted);min-width:28px;">Até</span>
                                <input type="date" id="deploy-filter-to"
                                    style="flex:1;background:rgba(15,23,42,0.6);border:1px solid var(--dark-border);border-radius:6px;padding:0.35rem 0.5rem;color:var(--text-main);font-size:0.82rem;outline:none;color-scheme:dark;"
                                    onchange="window._deployDateFilter()">
                            </div>
                        </div>
                    </div>
                    <div class="filter-actions">
                        <button class="btn-clear-filter" onclick="window._deployClearDateFilter()">
                            <i class="ph ph-x-circle"></i> Limpar
                        </button>
                    </div>
                </div>`;
        } else {
            const values = [...new Set((_manager?.getData ? _manager.getData() : _allRows).map(r => r[key]).filter(Boolean))].sort();
            const current = _filters[key] || '';
            const filterLabel = key === 'author' ? 'Autor' : key === 'area' ? 'Área' : 'Status';
            popover.innerHTML = `
                <div class="filter-group">
                    <span class="filter-label">Filtrar por ${filterLabel}</span>
                    <div class="filter-list">
                        <div class="filter-option ${!current ? 'selected' : ''}" onclick="window._deployFilter('${key}', '')">(Tudo)</div>
                        ${values.map(v => `<div class="filter-option ${current === v ? 'selected' : ''}" onclick="window._deployFilter('${key}', '${v.replace(/'/g, "\\'")}')">${v}</div>`).join('')}
                    </div>
                </div>
                <div class="filter-actions">
                    <button class="btn-clear-filter" onclick="window._deployFilter('${key}', '')">
                        <i class="ph ph-x-circle"></i> Limpar Filtro
                    </button>
                </div>`;
        }

        popover.classList.add('show');

        // Posicionamento inteligente
        popover.classList.remove('align-right');
        popover.style.bottom = 'auto';
        popover.style.top = '100%';
        requestAnimationFrame(() => {
            const rect = popover.getBoundingClientRect();
            if (rect.right > window.innerWidth - 20) popover.classList.add('align-right');
            if (rect.bottom > window.innerHeight - 20) {
                popover.style.top = 'auto';
                popover.style.bottom = '100%';
            }
        });
    };

    window._deployFilter = (key, value) => {
        _filters[key] = value || '';
        _applyFilters();
        document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
    };

    window._deployDateFilter = () => {
        const from = document.getElementById('deploy-filter-from')?.value || '';
        const to   = document.getElementById('deploy-filter-to')?.value   || '';
        _filters.dateFrom = from;
        _filters.dateTo   = to;
        _applyFilters();
    };

    window._deployClearDateFilter = () => {
        _filters.dateFrom = '';
        _filters.dateTo   = '';
        const f = document.getElementById('deploy-filter-from');
        const t = document.getElementById('deploy-filter-to');
        if (f) f.value = '';
        if (t) t.value = '';
        _applyFilters();
    };
}

// ─── Aplica filtros locais ─────────────────────────────────────────────────────
function _applyFilters() {
    if (!_manager) return;
    let data = [..._allRows];

    if (_filters.author) data = data.filter(r => r.author === _filters.author);
    if (_filters.area)   data = data.filter(r => _parseCommit(r.message).area === _filters.area);
    if (_filters.status) data = data.filter(r => r.status === _filters.status);
    if (_filters.dateFrom || _filters.dateTo) {
        data = data.filter(r => {
            if (!r.date) return true;
            const d = new Date(r.date);
            if (_filters.dateFrom && d < new Date(_filters.dateFrom + 'T00:00:00')) return false;
            if (_filters.dateTo   && d > new Date(_filters.dateTo   + 'T23:59:59')) return false;
            return true;
        });
    }
    _manager.setData(data);
}

export const deployMonitor = {
    init: async function() {
        console.log('[Deploy] view initialized');
        this.renderUI();
        await _load();
    },

    renderUI: function() {
        const container = document.getElementById('view-deploy');
        if (!container) return;

        // Renderiza apenas se ainda não existir
        if (!document.getElementById('deploy-ui-wrapper')) {
            container.innerHTML = `
                <div id="deploy-ui-wrapper" class="flex-view" style="display:flex; flex-direction:column; height:100%;">
                    
                    <div class="top-bar" style="flex-shrink:0;">
                        <div>
                            <h1 style="display:flex; align-items:center; gap:0.571rem;">
                                <i class="ph ph-rocket" style="color:#6366f1;"></i>
                                Tracker de Deploys
                            </h1>
                            <p>Registro de modificações empurradas para a esteira do Railway em produção.</p>
                        </div>
                        <button class="btn btn-primary" onclick="deployMonitor.init()">
                            <i class="ph ph-arrows-clockwise"></i> Atualizar
                        </button>
                    </div>

                    <div class="glass-panel" style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        
                        <div class="rpt-filters">
                            <div class="rpt-filter-search" style="flex:1; min-width:220px;">
                                <i class="ph ph-magnifying-glass"></i>
                                <input type="text" id="deploy-search-global" placeholder="Pesquisar em todas as colunas..." oninput="window._deploySearch(this.value)">
                            </div>
                        </div>

                        <div class="rpt-info-bar">
                            <span id="deploy-count" class="rpt-count-badge">Carregando...</span>
                        </div>

                        <div class="company-table-container">
                            <table class="company-table" id="deploy-tracker-table">
                                <thead>
                                    <tr>
                                        <th class="sortable-header" data-key="date" style="width:135px; position:relative;">
                                            <div class="header-content">
                                                <span id="vcw-dep-date" onclick="window._deploySort('date')">${renderTitleWithTooltip('Quando')}
                                                    <div id="vct-dep-date" class="vtt-tooltip" style="width:280px;">
                                                        <div class="vtt-arrow vtt-arrow-down" style="left:12px;"></div>
                                                        <div class="vtt-video-container"><canvas id="vcc-dep-date" class="vtt-canvas"></canvas></div>
                                                        <div class="vtt-body">
                                                            <div class="vtt-label">Métrica de Tempo</div>
                                                            <div class="vtt-title">Quando</div>
                                                            <div class="vtt-desc">Data e hora exata em que o deploy foi finalizado no ambiente de produção do Railway.</div>
                                                        </div>
                                                    </div>
                                                </span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('date', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_date" class="filter-popover" style="min-width:260px;"></div>
                                        </th>
                                        <th class="sortable-header" data-key="author" style="width:145px; position:relative;">
                                            <div class="header-content">
                                                <span id="vcw-dep-author" onclick="window._deploySort('author')">${renderTitleWithTooltip('Quem')}
                                                    <div id="vct-dep-author" class="vtt-tooltip" style="width:280px;">
                                                        <div class="vtt-arrow vtt-arrow-down" style="left:12px;"></div>
                                                        <div class="vtt-video-container"><canvas id="vcc-dep-author" class="vtt-canvas"></canvas></div>
                                                        <div class="vtt-body">
                                                            <div class="vtt-label">Autoria</div>
                                                            <div class="vtt-title">Quem</div>
                                                            <div class="vtt-desc">Quem aprovou ou disparou o deploy. 'Railway' indica deploys automáticos da esteira.</div>
                                                        </div>
                                                    </div>
                                                </span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('author', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_author" class="filter-popover"></div>
                                        </th>
                                        <th class="sortable-header" data-key="area" style="width:140px; position:relative;">
                                            <div class="header-content">
                                                <span id="vcw-dep-area" onclick="window._deploySort('area')">${renderTitleWithTooltip('Área')}
                                                    <div id="vct-dep-area" class="vtt-tooltip" style="width:280px;">
                                                        <div class="vtt-arrow vtt-arrow-down" style="left:12px;"></div>
                                                        <div class="vtt-video-container"><canvas id="vcc-dep-area" class="vtt-canvas"></canvas></div>
                                                        <div class="vtt-body">
                                                            <div class="vtt-label">Módulo Afetado</div>
                                                            <div class="vtt-title">Área</div>
                                                            <div class="vtt-desc">Módulo ou seção do sistema afetada por este deploy, categorizada automaticamente pela IA.</div>
                                                        </div>
                                                    </div>
                                                </span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('area', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_area" class="filter-popover"></div>
                                        </th>
                                        <th data-key="de" style="width:130px;">
                                            <div class="header-content">
                                                <span id="vcw-dep-de">${renderTitleWithTooltip('De')}
                                                    <div id="vct-dep-de" class="vtt-tooltip" style="width:280px;right:-140px;">
                                                        <div class="vtt-arrow vtt-arrow-down" style="left:50%; margin-left:-4px;"></div>
                                                        <div class="vtt-video-container"><canvas id="vcc-dep-de" class="vtt-canvas"></canvas></div>
                                                        <div class="vtt-body">
                                                            <div class="vtt-label">Motivação</div>
                                                            <div class="vtt-title">Estado Anterior</div>
                                                            <div class="vtt-desc">Estado ou versão anterior antes da modificação. O problema ou gargalo que motivou o deploy.</div>
                                                        </div>
                                                    </div>
                                                </span>
                                            </div>
                                        </th>
                                        <th data-key="para">
                                            <div class="header-content">
                                                <span id="vcw-dep-para">${renderTitleWithTooltip('Para')}
                                                    <div id="vct-dep-para" class="vtt-tooltip" style="width:280px;">
                                                        <div class="vtt-arrow vtt-arrow-down" style="left:12px;"></div>
                                                        <div class="vtt-video-container"><canvas id="vcc-dep-para" class="vtt-canvas"></canvas></div>
                                                        <div class="vtt-body">
                                                            <div class="vtt-label">Resultado</div>
                                                            <div class="vtt-title">O que foi feito</div>
                                                            <div class="vtt-desc">O que esta versão alterou ou entregou. Clique no botão de atalho para navegar diretamente para a área afetada no sistema.</div>
                                                        </div>
                                                    </div>
                                                </span>
                                            </div>
                                        </th>
                                        <th class="sortable-header" data-key="hash" style="width:85px;">
                                            <div class="header-content">
                                                <span id="vcw-dep-hash" onclick="window._deploySort('hash')">${renderTitleWithTooltip('Versão')}
                                                    <div id="vct-dep-hash" class="vtt-tooltip" style="width:280px;right:-15px;">
                                                        <div class="vtt-arrow vtt-arrow-down" style="right:20px; left:auto;"></div>
                                                        <div class="vtt-video-container"><canvas id="vcc-dep-hash" class="vtt-canvas"></canvas></div>
                                                        <div class="vtt-body">
                                                            <div class="vtt-label">Identificação Única</div>
                                                            <div class="vtt-title">Código SHA</div>
                                                            <div class="vtt-desc">Identificador curto e único do bloqueio de código (commit) inserido no repositório oficial.</div>
                                                        </div>
                                                    </div>
                                                </span>
                                            </div>
                                        </th>
                                        <th class="sortable-header" data-key="status" style="width:110px; position:relative;">
                                            <div class="header-content">
                                                <span id="vcw-dep-status" onclick="window._deploySort('status')">${renderTitleWithTooltip('Status')}
                                                    <div id="vct-dep-status" class="vtt-tooltip" style="width:280px;right:-15px;">
                                                        <div class="vtt-arrow vtt-arrow-down" style="right:20px; left:auto;"></div>
                                                        <div class="vtt-video-container"><canvas id="vcc-dep-status" class="vtt-canvas"></canvas></div>
                                                        <div class="vtt-body">
                                                            <div class="vtt-label">Sincronização API</div>
                                                            <div class="vtt-title">Progresso na Esteira</div>
                                                            <div class="vtt-desc">Status real do deploy no Railway. "Construindo" ou "Publicando" significa que o código ainda não está visível para os usuários finais.</div>
                                                        </div>
                                                    </div>
                                                </span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('status', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_status" class="filter-popover"></div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody id="deploy-table-body">
                                </tbody>
                            </table>
                        </div>
                        <div id="pagination-deploy" class="pagination-container" style="padding:1rem;"></div>
                    </div>
                </div>
            `;

            // Inicializar e configurar os canvases VTT do Deploy Tracker
            setTimeout(() => {
                const W = 300, H = Math.floor(300 * 9 / 16);
                function init(canvas) { canvas.width=W; canvas.height=H; return canvas.getContext('2d'); }
                function ease(t){ return t<0.5 ? 2*t*t : -1+(4-2*t)*t; }
                function prog(f, start, dur) { return Math.max(0, Math.min(1, (f - start)/dur)); }

                const anims = {
                    'dep-date': function(ctx,f) {
                        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
                        ctx.save(); ctx.translate(W/2, H/2);
                        ctx.strokeStyle='#334155'; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(0,0, 40, 0, Math.PI*2); ctx.stroke();
                        
                        const rot = ease(prog(f, 20, 160)) * Math.PI*2;
                        ctx.rotate(rot);
                        ctx.strokeStyle='#6366f1'; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-25); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(15,15); ctx.stroke();
                        ctx.restore();
                    },
                    'dep-author': function(ctx,f) {
                        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
                        ctx.save(); ctx.translate(W/2, H/2);
                        
                        const y = Math.sin(prog(f,0,120)*Math.PI*2)*10;
                        ctx.fillStyle='#6366f1';
                        ctx.beginPath(); ctx.arc(0,-10+y, 15, 0, Math.PI*2); ctx.fill();
                        ctx.beginPath(); ctx.arc(0,25+y, 25, Math.PI, Math.PI*2); ctx.fill();
                        
                        // Badge verde (Railway autômato)
                        if (f > 80 && f < 180) {
                            const sc = Math.sin(prog(f,80,20)*Math.PI)*1.2;
                            ctx.fillStyle='#10b981';
                            ctx.beginPath(); ctx.arc(15,-10+y, 6*sc, 0, Math.PI*2); ctx.fill();
                        }
                        ctx.restore();
                    },
                    'dep-area': function(ctx,f) {
                        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
                        ctx.save(); ctx.translate(W/2, H/2);
                        
                        for(let i=0; i<3; i++) {
                            const sc = 1 + Math.sin((f + i*40)*0.05)*0.1;
                            ctx.fillStyle= i===0 ? '#6366f1' : i===1 ? '#10b981' : '#f59e0b';
                            ctx.globalAlpha = 0.8;
                            ctx.beginPath(); ctx.roundRect(-40 + i*25, -20 + (i%2)*15, 30*sc, 30*sc, 6); ctx.fill();
                        }
                        ctx.restore();
                    },
                    'dep-de': function(ctx,f) {
                        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
                        ctx.save(); ctx.translate(W/2, H/2);
                        
                        // Icone de bug/falha piscante
                        const opacity = 0.3 + Math.sin(f*0.1)*0.7;
                        ctx.globalAlpha = opacity;
                        ctx.fillStyle='#ef4444';
                        ctx.beginPath(); ctx.arc(0,0, 20, 0, Math.PI*2); ctx.fill();
                        ctx.fillStyle='#fff'; ctx.font='bold 24px sans-serif'; ctx.textAlign='center'; ctx.fillText('!', 0, 8);
                        
                        ctx.restore();
                    },
                    'dep-para': function(ctx,f) {
                        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
                        ctx.save(); ctx.translate(W/2, H/2);
                        
                        // Código subindo com check
                        const y = -10 + ((f%100)/100)*20;
                        ctx.fillStyle='rgba(255,255,255,0.1)';
                        ctx.fillRect(-30, y, 60, 4);
                        ctx.fillRect(-30, y+10, 40, 4);
                        
                        if(f > 60 && f < 160) {
                            ctx.globalAlpha = Math.sin(prog(f,60,20)*Math.PI);
                            ctx.fillStyle='#10b981';
                            ctx.beginPath(); ctx.arc(0,0, 25, 0, Math.PI*2); ctx.fill();
                            ctx.fillStyle='#fff';
                            ctx.beginPath(); ctx.moveTo(-8,2); ctx.lineTo(-2,8); ctx.lineTo(10,-4);
                            ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.stroke();
                        }
                        ctx.restore();
                    },
                    'dep-hash': function(ctx,f) {
                        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
                        ctx.save(); ctx.translate(W/2, H/2);
                        
                        ctx.font='16px monospace'; ctx.textAlign='center';
                        ctx.fillStyle='#6366f1';
                        
                        const chars = '0123456789abcdef';
                        let str = '';
                        for(let i=0; i<7; i++) {
                            // "typing" effect
                            if (f > i*10) {
                                // finalizou o char
                                str += (i===0?'a':i===1?'4':i===2?'d':i===3?'2':i===4?'b':i===5?'7':i===6?'c': chars[Math.floor(Math.random()*16)]);
                            } else if (f > (i-1)*10) {
                                // rodando char
                                str += chars[Math.floor(Math.random()*16)];
                            }
                        }
                        ctx.fillText(str || '...', 0, 5);
                        ctx.restore();
                    },
                    'dep-status': function(ctx,f) {
                        ctx.fillStyle='#1a1f2e'; ctx.fillRect(0,0,W,H);
                        ctx.save(); ctx.translate(W/2, H/2);
                        
                        // Progress bar do railway
                        ctx.fillStyle='rgba(255,255,255,0.1)';
                        ctx.beginPath(); ctx.roundRect(-50,-5, 100, 10, 5); ctx.fill();
                        
                        const w = prog(f,20,140) * 100;
                        ctx.fillStyle='#6366f1';
                        if (w > 0) {
                            ctx.beginPath(); ctx.roundRect(-50,-5, w, 10, 5); ctx.fill();
                        }
                        
                        // Sparkle ao completar
                        if (f > 160) {
                            const sc = Math.sin(prog(f,160,20)*Math.PI);
                            ctx.fillStyle='rgba(99,102,241,0.5)';
                            ctx.beginPath(); ctx.arc(50,0, 15*sc, 0, Math.PI*2); ctx.fill();
                        }
                        ctx.restore();
                    }
                };

                function setupVtt(id, durationFrames) {
                    const wrap = document.getElementById(`vcw-${id}`);
                    const tooltip = document.getElementById(`vct-${id}`);
                    const canvas = document.getElementById(`vcc-${id}`);
                    if(!wrap || !tooltip || !canvas) return;

                    const ctx = init(canvas);
                    let animId=null, frame=0, visible=false;
                    
                    function draw(){ anims[id](ctx,frame); }
                    function tick(){ draw(); frame=(frame+1)%durationFrames; animId=requestAnimationFrame(tick); }
                    
                    wrap.addEventListener('mouseenter', () => {
                        if(visible) return; visible=true;
                        document.querySelectorAll('.vtt-tooltip.vtt-visible').forEach(t=>t.classList.remove('vtt-visible'));
                        tooltip.classList.add('vtt-visible'); frame=0; if(animId)cancelAnimationFrame(animId); animId=requestAnimationFrame(tick);
                        window._vttPulse?.seen(id);
                    });
                    wrap.addEventListener('mouseleave', (e) => {
                        if(!wrap.contains(e.relatedTarget)){ visible=false; tooltip.classList.remove('vtt-visible'); if(animId)cancelAnimationFrame(animId); animId=null; frame=0; draw(); }
                    });
                    draw();
                    window._vttPulse?.add(wrap, id);
                }

                setupVtt('dep-date', 200);
                setupVtt('dep-author', 240);
                setupVtt('dep-area', 200);
                setupVtt('dep-de', 160);
                setupVtt('dep-para', 220);
                setupVtt('dep-hash', 180);
                setupVtt('dep-status', 220);

            }, 50);
        }
    }
};

window.deployMonitor = deployMonitor;

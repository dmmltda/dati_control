/**
 * @file deploy.js
 * Tracker de Deploy baseado no TableManager 2.0
 */

import { TableManager } from '../core/table-manager.js';
import { getAuthToken } from './auth.js';
import { showToast } from './utils.js';

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
            : `<span style="font-size:0.82rem; color:var(--text-main); line-height:1.4; word-break:break-word;">${_escapeHtml(para)}</span>`;

        const statusHtml = `<span style="font-size:0.75rem; background:rgba(16,185,129,0.12); color:#10b981; padding:0.15rem 0.5rem; border-radius:4px; border:1px solid rgba(16,185,129,0.25);">
            <i class="ph ph-check-circle"></i> Concluído
        </span>`;

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
        } else {
            _manager.setData(data);
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
                                                <span onclick="window._deploySort('date')">Quando</span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('date', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_date" class="filter-popover" style="min-width:260px;"></div>
                                        </th>
                                        <th class="sortable-header" data-key="author" style="width:145px; position:relative;">
                                            <div class="header-content">
                                                <span onclick="window._deploySort('author')">Quem</span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('author', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_author" class="filter-popover"></div>
                                        </th>
                                        <th class="sortable-header" data-key="area" style="width:140px; position:relative;">
                                            <div class="header-content">
                                                <span onclick="window._deploySort('area')">Área</span>
                                                <button type="button" class="btn-filter-column" onclick="window._deployToggleFilter('area', event)">
                                                    <i class="ph ph-funnel"></i>
                                                </button>
                                            </div>
                                            <div id="filter-popover-deploy_area" class="filter-popover"></div>
                                        </th>
                                        <th data-key="de" style="width:130px;">
                                            <div class="header-content"><span>De</span></div>
                                        </th>
                                        <th data-key="para">
                                            <div class="header-content"><span>Para</span></div>
                                        </th>
                                        <th class="sortable-header" data-key="hash" style="width:85px;">
                                            <div class="header-content">
                                                <span onclick="window._deploySort('hash')">Versão</span>
                                            </div>
                                        </th>
                                        <th class="sortable-header" data-key="status" style="width:110px; position:relative;">
                                            <div class="header-content">
                                                <span onclick="window._deploySort('status')">Status</span>
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
        }
    }
};

window.deployMonitor = deployMonitor;

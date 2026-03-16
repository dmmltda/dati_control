/**
 * ============================================================================
 * log-testes.js — Módulo de Log de Testes (Fase 1)
 * ============================================================================
 * Responsável por:
 *   - Buscar execuções reais via GET /api/test-runs
 *   - Renderizar a tabela com TableManager 2.0
 *   - Exibir badges de status, filtros, paginação
 *   - Mostrar painel de detalhes com stack trace (expand row)
 *   - Atualizar o summary header com dados reais (não mais hardcoded)
 * ============================================================================
 */

import { TableManager } from '../core/table-manager.js';

// ─── Estado do módulo --------------------------------------------------------
let _manager = null;
let _allCases  = [];      // todos os test_cases achatados de todas as runs
let _initialized = false;

// ─── Configuração das colunas ------------------------------------------------
const LOG_COLUMNS = [
    { key: 'data',        label: 'Data',           type: 'date',   sortable: true, filterable: true, filterType: 'date',   searchable: false },
    { key: 'hora',        label: 'Hora',           type: 'string', sortable: true,                                          searchable: false },
    { key: 'tipo',        label: 'Tipo',           type: 'string', sortable: true, filterable: true, filterType: 'select', searchable: true  },
    { key: 'modulo',      label: 'Módulo',         type: 'string', sortable: true, filterable: true, filterType: 'select', searchable: true  },
    { key: 'descricao',   label: 'O que foi testado', type: 'string', sortable: false,                                    searchable: true  },
    { key: 'status',      label: 'Resultado',      type: 'string', sortable: true, filterable: true, filterType: 'select', searchable: true  },
    { key: 'duracao',     label: 'Duração',        type: 'number', sortable: true,                                          searchable: false },
];

// ─── Helpers -----------------------------------------------------------------

function _badgeStatus(status, fixStatus) {
    const map = {
        'APROVADO':      { bg: 'rgba(16,185,129,0.15)',  color: '#10b981', border: 'rgba(16,185,129,0.3)',  icon: 'ph-check-circle' },
        'REPROVADO':     { bg: 'rgba(239,68,68,0.1)',    color: '#ef4444', border: 'rgba(239,68,68,0.2)',   icon: 'ph-x-circle' },
        'ERRO DO TESTE': { bg: 'rgba(245,158,11,0.1)',   color: '#f59e0b', border: 'rgba(245,158,11,0.2)',  icon: 'ph-warning' },
        'IGNORADO':      { bg: 'rgba(100,116,139,0.1)',  color: '#64748b', border: 'rgba(100,116,139,0.2)', icon: 'ph-minus-circle' },
    };
    const s = map[status] || map['ERRO DO TESTE'];
    // Indicador extra de fix aplicado
    const fixIndicator = fixStatus === 'applied'
        ? ' <i class="ph ph-wrench" style="color:#4ade80; font-size:0.65rem; margin-left:2px;"></i>'
        : fixStatus === 'pending'
        ? ' <i class="ph ph-sparkle" style="color:#818cf8; font-size:0.65rem; margin-left:2px;"></i>'
        : '';
    return `<span class="badge" style="background:${s.bg};color:${s.color};border:1px solid ${s.border};font-size:0.75rem;white-space:nowrap;">
                <i class="ph ${s.icon}"></i> ${status}${fixIndicator}
            </span>`;
}


function _badgeTipo(tipo) {
    const map = {
        'UNITÁRIO':   { bg: 'rgba(91,82,246,0.15)',  color: '#5b52f6', border: 'rgba(91,82,246,0.3)' },
        'FUNCIONAL':  { bg: 'rgba(16,185,129,0.1)',  color: '#10b981', border: 'rgba(16,185,129,0.2)' },
        'E2E':        { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', border: 'rgba(245,158,11,0.2)' },
    };
    const s = map[tipo] || { bg: 'rgba(100,116,139,0.1)', color: '#64748b', border: 'rgba(100,116,139,0.2)' };
    return `<span class="badge" style="background:${s.bg};color:${s.color};border:1px solid ${s.border};font-size:0.75rem;">${tipo}</span>`;
}

function _formatDuration(ms) {
    if (!ms && ms !== 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function _formatDate(dt) {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString('pt-BR');
}

function _formatTime(dt) {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Transformar runs em linhas planas para a tabela ------------------------
function _flattenRuns(runs) {
    const rows = [];
    for (const run of runs) {
        const cases = run.test_cases || [];
        if (cases.length === 0) {
            // Run sem casos — mostra a run inteira como uma linha
            rows.push({
                _rowId:      run.id,
                _runId:      run.id,
                data:        _formatDate(run.triggered_at),
                hora:        _formatTime(run.triggered_at),
                tipo:        run.suite_type,
                modulo:      '(suite completa)',
                descricao:   `Execução: ${run.total_tests} testes | ${run.passed_tests} passou | ${run.failed_tests} falhou`,
                status:      run.status === 'passed' ? 'APROVADO' : (run.status === 'failed' ? 'REPROVADO' : 'ERRO DO TESTE'),
                duracao:     run.duration_ms,
                _errorMsg:   null,
                _errorStack: null,
                _screenshot: null,
                _video:      null,
                // Campos de análise enriquecida
                _locationFile: null,
                _locationLine: null,
                _aiAnalysis:   null,
                _fixProposal:  null,
                _fixStatus:    null,
                _caseId:       null,
            });
        } else {
            for (const c of cases) {
                // Parse dos campos JSON de análise
                let aiAnalysis = null;
                let fixProposal = null;
                try { if (c.ai_analysis)  aiAnalysis  = JSON.parse(c.ai_analysis);  } catch {}
                try { if (c.fix_proposal) fixProposal = JSON.parse(c.fix_proposal); } catch {}

                // Mapeamento para nomes novos (compatibilidade legado)
                const statusMap = {
                    'PASSOU': 'APROVADO',
                    'FALHOU': 'REPROVADO',
                    'ERRO':   'ERRO DO TESTE',
                    'SKIPADO': 'IGNORADO'
                };
                const mappedStatus = statusMap[c.status] || c.status || 'ERRO DO TESTE';

                rows.push({
                    _rowId:        c.id,
                    _runId:        run.id,
                    data:          _formatDate(c.created_at || run.triggered_at),
                    hora:          _formatTime(c.created_at || run.triggered_at),
                    tipo:          c.suite_type || run.suite_type,
                    modulo:        c.module || c.suite_file || '—',
                    descricao:     c.test_name,
                    status:        mappedStatus,
                    duracao:       c.duration_ms,
                    _errorMsg:     c.error_message,
                    _errorStack:   c.error_stack,
                    _screenshot:   c.screenshot_url,
                    _video:        c.video_url,
                    // Campos de análise enriquecida
                    _locationFile: c.location_file,
                    _locationLine: c.location_line,
                    _aiAnalysis:   aiAnalysis,
                    _fixProposal:  fixProposal,
                    _fixStatus:    c.fix_status,
                    _caseId:       c.id,
                });
            }
        }
    }
    return rows;
}

// ─── Renderizar linhas da tabela ---------------------------------------------
function _renderRows(data) {
    const tbody = document.getElementById('log-testes-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="ph ph-test-tube" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
                    Nenhum teste encontrado. Execute os testes e os resultados aparecerão aqui.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => {
        const hasDetails = row._errorMsg || row._errorStack || row._screenshot || row._video || row._aiAnalysis;
        const detailsId  = `log-detail-${row._rowId}`;
        const isFailed = row.status === 'REPROVADO' || row.status === 'ERRO DO TESTE';

        // ── Seção: localização do código ──
        const locationSection = (row._locationFile && row._locationLine) ? `
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
                <i class="ph ph-map-pin" style="color:#6366f1; font-size:0.9rem;"></i>
                <span style="font-size:0.75rem; color:var(--text-muted);">Localização:</span>
                <code style="font-size:0.75rem; color:#a5b4fc; background:rgba(99,102,241,0.1); padding:0.15rem 0.5rem; border-radius:4px;">
                    ${_escapeHtml(row._locationFile)}:${row._locationLine}
                </code>
            </div>` : '';

        // ── Seção: mensagem de erro ──
        const errorSection = row._errorMsg ? `
            <div style="margin-bottom:0.75rem;">
                <span style="font-size:0.7rem; color:var(--text-muted); font-weight:600; letter-spacing:0.05em; text-transform:uppercase;">Mensagem de Erro</span>
                <pre style="margin:0.25rem 0 0; font-size:0.78rem; color:#fca5a5; white-space:pre-wrap; font-family:monospace; padding:0.5rem; background:rgba(239,68,68,0.08); border-radius:6px; border-left:2px solid #ef4444;">${_escapeHtml(row._errorMsg)}</pre>
            </div>` : '';

        // ── Seção: análise IA ──
        const ai = row._aiAnalysis;
        let analysisSection = '';
        if (ai) {
            const confiancaPct = Math.round((ai.confianca || 0) * 100);
            const confiancaColor = confiancaPct >= 80 ? '#4ade80' : confiancaPct >= 50 ? '#fbbf24' : '#f87171';
            const tipoColor = {
                'MISMATCH_VALOR': '#fbbf24', 'MISMATCH_NOME': '#fbbf24',
                'EXPORT_AUSENTE': '#f87171', 'MOCK_FALTANDO': '#fb923c',
                'DEPENDENCIA_EXTERNA': '#fb923c', 'LOGICA_NEGOCIO': '#c084fc',
                'LADO_ERRADO': '#60a5fa', 'OUTRO': '#94a3b8'
            }[ai.tipo_falha] || '#94a3b8';

            analysisSection = `
            <div style="margin-bottom:0.75rem; background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.25); border-radius:8px; padding:0.85rem; position:relative;">
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.6rem;">
                    <i class="ph ph-sparkle" style="color:#818cf8; font-size:0.95rem;"></i>
                    <span style="font-size:0.72rem; font-weight:700; color:#818cf8; text-transform:uppercase; letter-spacing:0.06em;">Análise Automática</span>
                    <span style="margin-left:auto; font-size:0.65rem; padding:0.1rem 0.45rem; border-radius:10px; background:${tipoColor}22; color:${tipoColor}; border:1px solid ${tipoColor}44; font-family:monospace;">${ai.tipo_falha || 'OUTRO'}</span>
                </div>
                <p style="margin:0 0 0.5rem; font-size:0.8rem; font-weight:600; color:#e2e8f0;">${_escapeHtml(ai.causa_raiz || '')}</p>
                <p style="margin:0; font-size:0.77rem; color:#cbd5e1; line-height:1.5;">${_escapeHtml(ai.descricao_pt || '')}</p>
                <div style="margin-top:0.5rem; display:flex; align-items:center; gap:0.75rem;">
                    <span style="font-size:0.67rem; color:var(--text-muted);">Confiança:</span>
                    <div style="flex:1; max-width:100px; height:4px; background:rgba(255,255,255,0.1); border-radius:2px;">
                        <div style="width:${confiancaPct}%; height:100%; background:${confiancaColor}; border-radius:2px;"></div>
                    </div>
                    <span style="font-size:0.67rem; color:${confiancaColor};">${confiancaPct}%</span>
                    ${ai.lado_com_problema ? `<span style="font-size:0.67rem; color:var(--text-muted); margin-left:0.5rem;">Problema em: <b style="color:#cbd5e1;">${ai.lado_com_problema}</b></span>` : ''}
                </div>
            </div>`;
        } else if (isFailed && row._fixStatus === 'pending') {
            analysisSection = `
            <div style="margin-bottom:0.75rem; background:rgba(99,102,241,0.05); border:1px dashed rgba(99,102,241,0.2); border-radius:8px; padding:0.7rem; text-align:center;">
                <i class="ph ph-circle-notch ph-spin" style="color:#818cf8; font-size:1rem; display:block; margin-bottom:0.25rem;"></i>
                <span style="font-size:0.72rem; color:#818cf8;">Análise IA em andamento... Atualize a página em instantes.</span>
            </div>`;
        }

        // ── Seção: proposta de correção ──
        const fix = row._fixProposal;
        let fixSection = '';
        if (fix && row._fixStatus !== 'applied' && row._fixStatus !== 'rejected') {
            const diffLines = [];
            if (fix.before) fix.before.split('\n').forEach(l => diffLines.push(`<span class="diff-del">- ${_escapeHtml(l)}</span>`));
            if (fix.after)  fix.after.split('\n').forEach(l => diffLines.push(`<span class="diff-add">+ ${_escapeHtml(l)}</span>`));

            fixSection = `
            <div style="margin-bottom:0.75rem; background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.2); border-radius:8px; padding:0.85rem;">
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.6rem;">
                    <i class="ph ph-wrench" style="color:#4ade80; font-size:0.95rem;"></i>
                    <span style="font-size:0.72rem; font-weight:700; color:#4ade80; text-transform:uppercase; letter-spacing:0.06em;">Correção Proposta</span>
                    <code style="margin-left:auto; font-size:0.67rem; color:#94a3b8; background:rgba(255,255,255,0.05); padding:0.1rem 0.4rem; border-radius:3px;">${_escapeHtml(fix.arquivo || '')}</code>
                </div>
                ${fix.descricao ? `<p style="margin:0 0 0.5rem; font-size:0.77rem; color:#a7f3d0;">${_escapeHtml(fix.descricao)}</p>` : ''}
                <pre class="log-diff-block">${diffLines.join('\n')}</pre>
                <div style="display:flex; gap:0.5rem; margin-top:0.75rem; justify-content:flex-end;">
                    <button class="btn-fix-reject" onclick="window._logTesteFixApprove('${row._caseId}', false)" id="btn-fix-reject-${row._caseId}">
                        <i class="ph ph-x"></i> Rejeitar
                    </button>
                    <button class="btn-fix-approve" onclick="window._logTesteFixApprove('${row._caseId}', true)" id="btn-fix-approve-${row._caseId}">
                        <i class="ph ph-check"></i> Aprovar Correção
                    </button>
                </div>
            </div>`;
        } else if (row._fixStatus === 'applied') {
            fixSection = `
            <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.75rem; color:#4ade80; margin-bottom:0.5rem;">
                <i class="ph ph-check-circle"></i>
                <span>Correção aplicada com sucesso</span>
                ${fix?.arquivo ? `<code style="margin-left:auto; font-size:0.67rem; color:#94a3b8;">${_escapeHtml(fix.arquivo)}</code>` : ''}
            </div>`;
        } else if (row._fixStatus === 'rejected') {
            fixSection = `
            <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.75rem; color:#94a3b8; margin-bottom:0.5rem;">
                <i class="ph ph-x-circle"></i>
                <span>Correção rejeitada manualmente</span>
            </div>`;
        }

        // ── Seção: screenshot e vídeo (Playwright) ou Snippet de Código (Unitário) ──
        let mediaSection = '';
        if (row._screenshot || row._video) {
            mediaSection = `
            <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                ${row._screenshot ? `<a href="${row._screenshot}" target="_blank" class="btn btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.7rem;"><i class="ph ph-image"></i> Screenshot</a>` : ''}
                ${row._video ? `<a href="${row._video}" target="_blank" class="btn btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.7rem;"><i class="ph ph-video"></i> Vídeo</a>` : ''}
            </div>`;
        } else if (ai && ai.code_snippet) {
            mediaSection = `
            <div style="margin-top:0.5rem;">
                <span style="font-size:0.7rem; color:var(--text-muted); font-weight:600; letter-spacing:0.05em; text-transform:uppercase;">Contexto do Código</span>
                <pre style="margin:0.25rem 0 0; font-size:0.72rem; color:#94a3b8; white-space:pre; overflow-x:auto; font-family:monospace; padding:0.6rem; background:#000000; border-radius:6px; border:1px solid #334155;">${_escapeHtml(ai.code_snippet)}</pre>
            </div>`;
        }

        // ── Stack trace (collapsible) ──
        const stackSection = row._errorStack ? `
            <details style="margin-top:0.5rem;">
                <summary style="font-size:0.7rem; color:var(--text-muted); cursor:pointer; user-select:none;">Stack Trace</summary>
                <pre style="margin:0.25rem 0 0; font-size:0.7rem; color:#64748b; white-space:pre-wrap; font-family:monospace; max-height:180px; overflow-y:auto; padding:0.5rem; background:rgba(0,0,0,0.2); border-radius:4px;">${_escapeHtml(row._errorStack)}</pre>
            </details>` : '';

        const borderColor = isFailed ? '#ef4444' : '#10b981';
        const detailContent = hasDetails ? `
            <tr id="${detailsId}" class="log-detail-row" style="display:none;">
                <td colspan="7" style="padding:0.85rem 1.25rem 1rem; background:rgba(0,0,0,0.25); border-left:3px solid ${borderColor};">
                    ${locationSection}
                    ${errorSection}
                    ${analysisSection}
                    ${fixSection}
                    ${mediaSection}
                    ${stackSection}
                </td>
            </tr>` : '';

        return `
            <tr class="log-row" data-row-id="${row._rowId}" style="cursor: ${hasDetails ? 'pointer' : 'default'};"
                ${hasDetails ? `onclick="window._logTesteToggleDetail('${detailsId}')"` : ''}>
                <td style="font-size:0.82rem; white-space:nowrap;">${row.data}</td>
                <td style="font-size:0.82rem; color:var(--text-muted); white-space:nowrap;">${row.hora}</td>
                <td style="text-align:center;">${_badgeTipo(row.tipo)}</td>
                <td style="font-size:0.82rem; color:#94a3b8;">${_escapeHtml(row.modulo)}</td>
                <td style="font-size:0.82rem; max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_escapeHtml(row.descricao)}</td>
                <td style="text-align:center;">${_badgeStatus(row.status, row._fixStatus)}</td>
                <td style="font-size:0.82rem; color:var(--text-muted); white-space:nowrap;">
                    ${_formatDuration(row.duracao)}
                    ${hasDetails ? '<i class="ph ph-caret-down" style="margin-left:0.3rem; font-size:0.7rem; opacity:0.5;"></i>' : ''}
                </td>
            </tr>
            ${detailContent}`;
    }).join('');
}

// ─── Renderizar paginação ---------------------------------------------------
function _renderPagination(state) {
    const container = document.getElementById('pagination-log');
    if (!container) return;

    if (state.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const { currentPage, totalPages, totalRecords } = state;
    let html = `<div class="pagination">
        <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window._logTesteGoPage(${currentPage - 1})">
            <i class="ph ph-caret-left"></i>
        </button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="pagination-page ${i === currentPage ? 'active' : ''}" onclick="window._logTesteGoPage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="pagination-dots">...</span>`;
        }
    }

    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window._logTesteGoPage(${currentPage + 1})">
            <i class="ph ph-caret-right"></i>
        </button>
    </div>
    <div class="pagination-info">Página ${currentPage} de ${totalPages} (${totalRecords} casos)</div>`;
    container.innerHTML = html;
}

// ─── Atualizar summary header com dados reais -------------------------------
function _updateSummary(runs) {
    const totalCases   = runs.reduce((s, r) => s + (r.total_tests || 0), 0);
    const totalPassed  = runs.reduce((s, r) => s + (r.passed_tests || 0), 0);
    const totalFailed  = runs.reduce((s, r) => s + (r.failed_tests || 0), 0);
    const totalErrors  = runs.reduce((s, r) => s + (r.error_tests || 0), 0);
    const lastRun = runs[0];
    const lastDate = lastRun ? _formatDate(lastRun.triggered_at) : 'Nunca';
    const lastTime = lastRun ? _formatDate(lastRun.triggered_at) + ' ' + _formatTime(lastRun.triggered_at) : '';
    const totalMs  = runs.reduce((s, r) => s + (r.duration_ms || 0), 0);

    // Header de última execução
    const headerEl = document.getElementById('log-testes-last-run');
    if (headerEl) {
        headerEl.innerHTML = lastRun
            ? `Última execução: <strong>${lastDate}</strong> — <span style="color:${totalFailed > 0 || totalErrors > 0 ? '#ef4444' : '#10b981'}; font-weight:600;">
                ${totalPassed}/${totalCases} aprovados ${totalFailed > 0 || totalErrors > 0 ? '✗' : '✓'}
               </span>`
            : 'Nenhuma execução disponível. Execute <code>npm run test:report</code> para registrar.';
    }

    // Badges de resumo
    const badgesEl = document.getElementById('log-testes-badges');
    if (badgesEl) {
        badgesEl.innerHTML = `
            <span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);font-size:0.8rem;">
                <i class="ph ph-check-circle"></i> ${totalPassed} Aprovados
            </span>
            <span class="badge" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2);font-size:0.8rem;">
                <i class="ph ph-x-circle"></i> ${totalFailed} Reprovados
            </span>
            <span class="badge" style="background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.2);font-size:0.8rem;">
                <i class="ph ph-warning"></i> ${totalErrors} Erro do teste
            </span>
            <span class="badge" style="background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.2);font-size:0.8rem;">
                <i class="ph ph-clock"></i> ${_formatDuration(totalMs)}
            </span>
            <span class="badge" style="background:rgba(91,82,246,0.1);color:#5b52f6;border:1px solid rgba(91,82,246,0.2);font-size:0.8rem;">
                <i class="ph ph-stack"></i> ${runs.length} execuções
            </span>`;
    }
}

// ─── Indicador de agendamento no botão ─────────────────────────────────────
async function _updateScheduleButtonStatus() {
    const $badge    = document.getElementById('sched-btn-active-badge');
    const $nextTime = document.getElementById('sched-btn-next-time');
    const $btn      = document.getElementById('btn-log-agendamento');
    if (!$badge || !$nextTime) return;

    try {
        const res = await fetch('/api/test-schedule');
        if (!res.ok) return;
        const data = await res.json();
        const scheduler = data.scheduler;
        const config    = data.config;

        // Ativo = enabled no banco, independente do _currentTask em memória
        const isEnabled  = !!config?.enabled;
        const isScheduled = config?.frequency && config.frequency !== 'manual';
        const active = isEnabled;

        if (active && scheduler?.nextRun && isScheduled) {
            // Caso 1: enabled + frequência automática → mostra próxima execução
            const d = new Date(scheduler.nextRun);
            const fmt = d.toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
            $nextTime.textContent = fmt;
            $badge.style.display = 'inline-flex';
            if ($btn) {
                $btn.style.color = '#10b981';
            }
        } else if (active) {
            // Caso 2: enabled mas frequência manual → mostra indicador sem horário
            $nextTime.textContent = 'Ativo';
            $badge.style.display = 'inline-flex';
            if ($btn) {
                $btn.style.color = '#10b981';
            }
        } else {
            // Caso 3: desabilitado
            $badge.style.display = 'none';
            if ($btn) {
                $btn.style.color = '';
            }
        }
    } catch (_) {
        // silencia erros — não critica o botão se a API estiver offline
    }
}

// ─── Popular filtros de coluna (popovers) -----------------------------------
function _buildFilterPopovers() {
    if (!_manager) return;

    const tipoValues   = _manager.getUniqueValues('tipo');
    const moduloValues = _manager.getUniqueValues('modulo');
    const statusValues = ['APROVADO', 'REPROVADO', 'ERRO DO TESTE', 'IGNORADO'];

    _buildSelectPopover('filter-popover-tipo',     tipoValues,   'tipo');
    _buildSelectPopover('filter-popover-modulo',   moduloValues, 'modulo');
    _buildSelectPopover('filter-popover-status',   statusValues, 'status');
    _buildTextSearchPopover('filter-popover-hora',       'hora');
    _buildTextSearchPopover('filter-popover-descricao',  'descricao');
    _buildDurationPopover('filter-popover-duracao',      'duracao');
    _buildDatePopover('filter-popover-data',             'data');
}

function _buildSelectPopover(id, values, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;

    const current    = _manager?.filters[filterKey] || '';
    const currentDir = _manager?.sort.key === filterKey ? _manager.sort.dir : 'none';

    el.innerHTML = `
        <div class="filter-group">
            <span class="filter-label">Ordenar</span>
            <div class="sort-buttons">
                <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> Cresc.
                </button>
                <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Decresc.
                </button>
            </div>
        </div>
        <div class="filter-group">
            <span class="filter-label">Filtrar Valores</span>
            <div class="filter-list">
                <div class="filter-option ${!current ? 'selected' : ''}" onclick="window._logTesteFilter('${filterKey}', '', event)">
                    (Tudo)
                </div>
                ${values.map(v => `
                    <div class="filter-option ${current === v ? 'selected' : ''}" onclick="window._logTesteFilter('${filterKey}', '${v}', event)">
                        ${v}
                    </div>`).join('')}
            </div>
        </div>
        <div class="filter-actions">
            <button class="btn-clear-filter" onclick="window._logTesteFilter('${filterKey}', '', event)">
                <i class="ph ph-trash"></i> Limpar Filtro
            </button>
        </div>`;
}

function _buildTextSearchPopover(id, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;

    const current    = _manager?.filters[filterKey] || '';
    const currentDir = _manager?.sort.key === filterKey ? _manager.sort.dir : 'none';

    el.innerHTML = `
        <div class="filter-group">
            <span class="filter-label">Ordenar</span>
            <div class="sort-buttons">
                <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> A→Z
                </button>
                <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Z→A
                </button>
            </div>
        </div>
        <div class="filter-group">
            <span class="filter-label">Buscar texto</span>
            <input type="text" id="log-text-filter-${filterKey}" class="filter-search"
                placeholder="Filtrar por texto..." value="${_escapeHtml(current)}"
                oninput="window._logTesteTextFilter('${filterKey}', this.value)">
        </div>
        <div class="filter-actions">
            <button class="btn-clear-filter" onclick="window._logTesteFilter('${filterKey}', '', event)">
                <i class="ph ph-trash"></i> Limpar Filtro
            </button>
        </div>`;
}

function _buildDurationPopover(id, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;

    const currentDir    = _manager?.sort.key === filterKey ? _manager.sort.dir : 'none';
    const currentFilter = _manager?.filters[filterKey];

    // Faixas de duração em ms (exibidas em segundos para o usuário)
    const buckets = [
        { label: '< 1s',    min: null, max: 1000 },
        { label: '1s – 5s', min: 1000, max: 5000 },
        { label: '5s – 30s',min: 5000, max: 30000 },
        { label: '> 30s',   min: 30000, max: null },
    ];

    const isActive = (b) => {
        if (!currentFilter || typeof currentFilter !== 'object') return false;
        return currentFilter.min === b.min && currentFilter.max === b.max;
    };

    el.innerHTML = `
        <div class="filter-group">
            <span class="filter-label">Ordenar</span>
            <div class="sort-buttons">
                <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> Cresc.
                </button>
                <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Decresc.
                </button>
            </div>
        </div>
        <div class="filter-group">
            <span class="filter-label">Faixa de Duração</span>
            <div class="filter-list">
                <div class="filter-option ${!currentFilter ? 'selected' : ''}"
                    onclick="window._logTesteFilter('${filterKey}', '', event)">
                    (Tudo)
                </div>
                ${buckets.map(b => `
                    <div class="filter-option ${isActive(b) ? 'selected' : ''}"
                        onclick="window._logTesteRangeBucket('${filterKey}', ${b.min}, ${b.max}, event)">
                        ${b.label}
                    </div>`).join('')}
            </div>
        </div>
        <div class="filter-actions">
            <button class="btn-clear-filter" onclick="window._logTesteFilter('${filterKey}', '', event)">
                <i class="ph ph-trash"></i> Limpar Filtro
            </button>
        </div>`;
}

function _buildDatePopover(id, filterKey) {
    const el = document.getElementById(id);
    if (!el) return;

    const currentDir = _manager?.sort.key === filterKey ? _manager.sort.dir : 'none';

    el.innerHTML = `
        <div class="filter-group">
            <span class="filter-label">Ordenar</span>
            <div class="sort-buttons">
                <button class="btn-sort ${currentDir === 'asc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'asc', event)">
                    <i class="ph ph-sort-ascending"></i> Cresc.
                </button>
                <button class="btn-sort ${currentDir === 'desc' ? 'active' : ''}" onclick="window._logTesteSort('${filterKey}', 'desc', event)">
                    <i class="ph ph-sort-descending"></i> Decresc.
                </button>
            </div>
        </div>
        <div class="filter-group" style="min-width:200px;">
            <span class="filter-label">Intervalo de Datas</span>
            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:0.35rem;">De:</label>
            <input type="date" id="log-date-from" class="input-control" style="width:100%; margin-bottom:0.5rem; font-size:0.8rem; padding:0.35rem 0.5rem;">
            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:0.35rem;">Até:</label>
            <input type="date" id="log-date-to" class="input-control" style="width:100%; margin-bottom:0.75rem; font-size:0.8rem; padding:0.35rem 0.5rem;">
        </div>
        <div class="filter-actions">
            <button class="btn-apply-filter" onclick="window._logTesteDateRange(event)">
                <i class="ph ph-check"></i> Aplicar
            </button>
            <button class="btn-clear-filter" onclick="window._logTesteFilter('${filterKey}', '', event)">
                <i class="ph ph-trash"></i> Limpar
            </button>
        </div>`;
}

// ─── Helper anti-XSS --------------------------------------------------------
function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── API pública do módulo ---------------------------------------------------

/**
 * Inicializa o módulo — busca dados e monta a tabela.
 * Chamado ao navegar para a view "Log Testes".
 */
export async function initLogTestes() {
    if (_initialized) {
        // Já inicializado — apenas refresca
        return refreshLogTestes();
    }

    _exposeGlobals();
    await refreshLogTestes();
    _initialized = true;
}

/**
 * Busca dados frescos da API e atualiza a tabela.
 */
export async function refreshLogTestes() {
    const tbody = document.getElementById('log-testes-body');
    if (!tbody) return;

    // Loading state
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted);">
                <i class="ph ph-spinner" style="font-size:2rem; display:block; margin-bottom:0.5rem; animation: spin 1s linear infinite;"></i>
                Carregando histórico de testes...
            </td>
        </tr>`;

    try {
        const resp = await fetch('/api/test-runs?limit=100');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const runs = await resp.json();

        _allCases = _flattenRuns(runs);
        _updateSummary(runs);

        // Monta ou atualiza o TableManager 2.0
        if (!_manager) {
            _manager = new TableManager({
                data:       _allCases,
                columns:    LOG_COLUMNS,
                pageSize:   25,
                tableId:    null, // sem auto-update de headers (fazemos manual)
                renderRows: _renderRows,
                renderPagination: _renderPagination,
                renderFilters: _renderActiveFilters,
            });
        } else {
            _manager.setData(_allCases);
        }

        _buildFilterPopovers();

        // Atualiza o indicador de agendamento ativo no botão (não bloqueia)
        await _updateScheduleButtonStatus();

        // ── Permissões de Visualização de Testes ─────────────────────────────
        const podeTestar = window.__usuarioAtual && window.__usuarioAtual.user_type === 'master';
        ['btn-log-agendamento', 'btn-log-run-now'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                if (!podeTestar) {
                    btn.disabled = true;
                    btn.style.opacity = '0.6';
                    btn.style.cursor = 'not-allowed';
                    btn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); };
                }
            }
        });

    } catch (err) {
        console.error('[log-testes] Erro ao carregar dados:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:3rem; color:#ef4444;">
                    <i class="ph ph-warning-circle" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
                    Não foi possível carregar os dados de testes.<br>
                    <small style="color:var(--text-muted);">${err.message}</small><br><br>
                    <span style="font-size:0.8rem; color:var(--text-muted);">
                        Para popular o LOG, execute: <code>npm run test:report</code>
                    </span>
                </td>
            </tr>`;
    }
}

/**
 * Busca global — chamada pelo input de pesquisa no HTML.
 */
export function handleLogSearch(query) {
    if (!_manager) return;
    _manager.setSearch(query);
    _updateClearBtn();
}


export function handleLogSort(key) {
    if (!_manager) return;
    _manager.setSort(key);
}

// ─── Setters de filtros do top-bar ──────────────────────────────────────────
export function setStatus(val) {
    if (_manager) _manager.setFilter('status', val || null);
    _updateClearBtn();
}

export function setTipo(val) {
    if (_manager) _manager.setFilter('tipo', val || null);
    _updateClearBtn();
}

const _dateFilters = { from: '', to: '' };

export function setDateFrom(val) {
    _dateFilters.from = val;
    _applyDateRange();
    _updateClearBtn();
}

export function setDateTo(val) {
    _dateFilters.to = val;
    _applyDateRange();
    _updateClearBtn();
}

function _applyDateRange() {
    if (!_manager) return;
    const { from, to } = _dateFilters;
    if (!from && !to) { _manager.setFilter('data', null); return; }
    const fmt = (s) => s ? s.split('-').reverse().join('/') : null;
    _manager.setFilter('data', (from && to) ? `${fmt(from)} a ${fmt(to)}` : fmt(from || to));
}

function _updateClearBtn() {
    const clearBtn = document.getElementById('btn-clear-log-filters');
    const clearDiv = document.getElementById('log-clear-divider');
    const hasFilters = _manager && (_manager.getActiveFilters().length > 0 || !!_manager.getSearch?.());
    if (clearBtn) clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    if (clearDiv) clearDiv.style.display = hasFilters ? 'block' : 'none';
}


/**
 * Filtros ativos (barrinha de chips)
 */
function _renderActiveFilters(activeFilters, search) {
    const bar = document.getElementById('test-log-active-chips');
    if (!bar) return;

    const chips = [];

    if (search) {
        chips.push(`
            <span class="filter-chip">
                <i class="ph ph-magnifying-glass"></i> "${_escapeHtml(search)}"
                <button class="chip-remove" data-remove-tm-search="1">
                    <i class="ph ph-x"></i>
                </button>
            </span>`);
    }

    (activeFilters || []).forEach(f => {
        let displayValue = String(f.value);
        if (typeof f.value === 'object' && f.value !== null) {
            if (f.value.min !== undefined && f.value.max !== undefined) {
                 if (f.value.min === null) displayValue = `< ${f.value.max/1000}s`;
                 else if (f.value.max === null) displayValue = `> ${f.value.min/1000}s`;
                 else displayValue = `${f.value.min/1000}s – ${f.value.max/1000}s`;
            }
        }
        
        chips.push(`
            <span class="filter-chip">
                ${_escapeHtml(f.label)}: <strong>${_escapeHtml(displayValue)}</strong>
                <button class="chip-remove" data-remove-tm-filter="${_escapeHtml(f.key)}">
                    <i class="ph ph-x"></i>
                </button>
            </span>`);
    });

    if (chips.length > 0) {
        bar.innerHTML = chips.join('');
        bar.style.display = 'flex';
    } else {
        bar.innerHTML = '';
        bar.style.display = 'none';
    }

    bar.querySelectorAll('[data-remove-tm-search]').forEach(btn => {
        btn.addEventListener('click', () => {
             const el = document.getElementById('log-search-global');
             if(el) el.value = '';
             if (_manager) _manager.setSearch(''); 
        });
    });

    bar.querySelectorAll('[data-remove-tm-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (_manager) {
                _manager.setFilter(btn.dataset.removeTmFilter, null);
                const th = document.querySelector(`#log-testes-table th[data-key="${btn.dataset.removeTmFilter}"]`);
                if (th) {
                    const btnF = th.querySelector('.btn-filter-column');
                    if (btnF) btnF.classList.remove('active');
                }
                _updateClearBtn();
            }
        });
    });
}


/**
 * Limpa filtros e busca.
 */
export function clearLogFilters() {
    if (!_manager) return;
    _manager.clearFilters();
    _manager.setSearch('');

    // Limpa campos visuais — busca
    const searchInput = document.getElementById('log-search-global');
    if (searchInput) searchInput.value = '';

    // Limpa selects do top-bar
    const selStatus = document.getElementById('filter-log-status');
    if (selStatus) selStatus.value = '';
    const selTipo = document.getElementById('filter-log-tipo');
    if (selTipo) selTipo.value = '';

    // Limpa datas
    const df = document.getElementById('filter-log-date-from');
    const dt = document.getElementById('filter-log-date-to');
    if (df) df.value = '';
    if (dt) dt.value = '';
    _dateFilters.from = '';
    _dateFilters.to   = '';

    const clearBtn = document.getElementById('btn-clear-log-filters');
    const clearDiv = document.getElementById('log-clear-divider');
    if (clearBtn) clearBtn.style.display = 'none';
    if (clearDiv) clearDiv.style.display = 'none';

    document.querySelectorAll('#log-testes-table .btn-filter-column').forEach(btn => btn.classList.remove('active'));
}

// ─── Expõe globais para uso no HTML inline (onclick="...") ------------------
function _exposeGlobals() {
    window._logTesteGoPage = (page) => _manager?.goToPage(page);

    // Abre/fecha o popover de filtro de coluna
    window._logTesteToggleFilter = (filterKey, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;

        const popoverId = `filter-popover-${filterKey}`;
        let popover = document.getElementById(popoverId);

        // Se o elemento não existir no DOM (cache do navegador sem a versão nova do HTML),
        // cria dinamicamente e anexa ao <th> correto
        if (!popover) {
            const th = document.querySelector(`#log-testes-table th[data-key="${filterKey}"]`);
            if (!th) return;
            popover = document.createElement('div');
            popover.id = popoverId;
            popover.className = 'filter-popover';
            th.appendChild(popover);
        }

        // Fecha todos os outros popovers
        document.querySelectorAll('.filter-popover').forEach(p => {
            if (p !== popover) p.classList.remove('show');
        });

        const isOpen = popover.classList.contains('show');
        if (isOpen) {
            popover.classList.remove('show');
        } else {
            // Re-renderiza o conteúdo do popover antes de abrir
            _buildFilterPopovers();
            popover.classList.add('show');

            // Smart positioning: detecta limites da tela
            popover.classList.remove('align-right');
            popover.style.bottom = 'auto';
            popover.style.top = '100%';

            const rect = popover.getBoundingClientRect();
            if (rect.right > window.innerWidth - 20) {
                popover.classList.add('align-right');
            }
            if (rect.bottom > window.innerHeight - 20) {
                popover.style.top = 'auto';
                popover.style.bottom = '100%';
            }
        }
    };


    // Aplica sort explícito via popover
    window._logTesteSort = (key, dir, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;
        _manager.setSortExplicit(key, dir);
        _buildFilterPopovers();
        document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
    };

    window._logTesteFilter = (key, value, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;
        _manager.setFilter(key, value || null);
        _buildFilterPopovers();

        // Atualiza o indicador visual do botão de filtro ativo
        const th = document.querySelector(`#log-testes-table th[data-key="${key}"]`);
        if (th) {
            const btn = th.querySelector('.btn-filter-column');
            if (btn) btn.classList.toggle('active', !!value);
        }

        // Atualiza botão "limpar filtros"
        const activeFilters = _manager.getActiveFilters();
        const clearBtn = document.getElementById('btn-clear-log-filters');
        if (clearBtn) clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';

        // Fecha o popover
        document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
    };

    // Filtro de texto livre (não fecha o popover ao digitar)
    window._logTesteTextFilter = (key, value) => {
        if (!_manager) return;
        _manager.setFilter(key, value || null);

        // Atualiza indicador visual do botão
        const th = document.querySelector(`#log-testes-table th[data-key="${key}"]`);
        if (th) {
            const btn = th.querySelector('.btn-filter-column');
            if (btn) btn.classList.toggle('active', !!value);
        }

        // Atualiza botão "limpar filtros"
        const activeFilters = _manager.getActiveFilters();
        const clearBtn = document.getElementById('btn-clear-log-filters');
        if (clearBtn) clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';
        // Não fecha o popover — usuário está digitando
    };

    // Filtro de range numérico (Duração)
    window._logTesteRangeFilter = (key, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;

        const minEl = document.getElementById(`log-range-min-${key}`);
        const maxEl = document.getElementById(`log-range-max-${key}`);
        const min   = minEl?.value !== '' ? parseFloat(minEl.value) : null;
        const max   = maxEl?.value !== '' ? parseFloat(maxEl.value) : null;

        if (min === null && max === null) {
            _manager.setFilter(key, null);
        } else {
            _manager.setFilter(key, { min, max });
        }

        _buildFilterPopovers();

        // Atualiza indicador visual
        const th = document.querySelector(`#log-testes-table th[data-key="${key}"]`);
        if (th) {
            const btn = th.querySelector('.btn-filter-column');
            const hasFilter = min !== null || max !== null;
            if (btn) btn.classList.toggle('active', hasFilter);
        }

        const activeFilters = _manager.getActiveFilters();
        const clearBtn = document.getElementById('btn-clear-log-filters');
        if (clearBtn) clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';

        document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
    };


    // Aplica faixa de duração predefinida (ex: < 1s, 1-5s)
    window._logTesteRangeBucket = (key, min, max, event) => {
        if (event) event.stopPropagation();
        if (!_manager) return;

        const filterVal = (min === null && max === null) ? null : { min, max };
        _manager.setFilter(key, filterVal);
        _buildFilterPopovers();

        const th = document.querySelector(`#log-testes-table th[data-key="${key}"]`);
        if (th) {
            const btn = th.querySelector('.btn-filter-column');
            if (btn) btn.classList.toggle('active', filterVal !== null);
        }

        const activeFilters = _manager.getActiveFilters();
        const clearBtn = document.getElementById('btn-clear-log-filters');
        if (clearBtn) clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';

        document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
    };

    window._logTesteDateRange = (event) => {
        if (event) event.stopPropagation();
        const from = document.getElementById('log-date-from')?.value;
        const to   = document.getElementById('log-date-to')?.value;
        if (!from && !to) return window._logTesteFilter('data', null);

        // Converte YYYY-MM-DD para DD/MM/YYYY (formato interno do TableManager)
        const fmt = (s) => s ? s.split('-').reverse().join('/') : null;
        const range = from && to ? `${fmt(from)} a ${fmt(to)}` : fmt(from || to);
        window._logTesteFilter('data', range);
    };

    window._logTesteToggleDetail = (detailsId) => {
        const row = document.getElementById(detailsId);
        if (!row) return;
        const isOpen = row.style.display !== 'none';
        row.style.display = isOpen ? 'none' : 'table-row';

        // Anima o caret
        const mainRow = row.previousElementSibling;
        const caret = mainRow?.querySelector('.ph-caret-down');
        if (caret) caret.style.transform = isOpen ? '' : 'rotate(180deg)';
    };

    // ── Handler: Aprovar ou Rejeitar correção da IA ──────────────────────────
    window._logTesteFixApprove = async (caseId, approved) => {
        if (!caseId) return;

        const approveBtn = document.getElementById(`btn-fix-approve-${caseId}`);
        const rejectBtn  = document.getElementById(`btn-fix-reject-${caseId}`);

        // Feedback visual imediato
        if (approveBtn) { approveBtn.disabled = true; approveBtn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Aplicando...'; }
        if (rejectBtn)  { rejectBtn.disabled = true; }

        try {
            const resp = await fetch(`/api/test-runs/${caseId}/fix/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approved }),
            });
            const data = await resp.json();

            if (!resp.ok) throw new Error(data.error || 'Erro ao processar');

            if (approved && data.fix_status === 'applied') {
                // Substituir a seção de fix por mensagem de sucesso
                const fixContainer = approveBtn?.closest('div[style*="rgba(16,185,129"]');
                if (fixContainer) {
                    fixContainer.innerHTML = `
                        <div style="display:flex;align-items:center;gap:0.5rem;font-size:0.78rem;color:#4ade80;">
                            <i class="ph ph-check-circle" style="font-size:1.1rem;"></i>
                            <span>✅ Correção aplicada em <code style="color:#94a3b8;">${data.file || ''}</code></span>
                        </div>`;
                }
            } else {
                // Rejeição
                const fixContainer = rejectBtn?.closest('div[style*="rgba(16,185,129"]');
                if (fixContainer) {
                    fixContainer.innerHTML = `
                        <div style="display:flex;align-items:center;gap:0.5rem;font-size:0.78rem;color:#94a3b8;">
                            <i class="ph ph-x-circle" style="font-size:1rem;"></i>
                            <span>Correção rejeitada. Nenhum arquivo foi modificado.</span>
                        </div>`;
                }
            }
        } catch (err) {
            if (approveBtn) { approveBtn.disabled = false; approveBtn.innerHTML = '<i class="ph ph-check"></i> Aprovar Correção'; }
            if (rejectBtn)  { rejectBtn.disabled = false; }
            alert(`Erro: ${err.message}`);
        }
    };


    // Fecha popovers ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-popover') && !e.target.closest('.btn-filter-column')) {
            document.querySelectorAll('.filter-popover.show').forEach(p => p.classList.remove('show'));
        }
    }, { capture: false });
}



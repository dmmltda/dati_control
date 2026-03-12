/**
 * ============================================================================
 * Módulo: Agendamento de Testes
 * js/modules/log-agendamento.js
 * ============================================================================
 * - Carrega config do banco via GET /api/test-schedule
 * - Salva via PUT /api/test-schedule
 * - Dispara execução manual via POST /api/test-schedule/trigger
 * - Faz poll do status via GET /api/test-schedule/trigger/status/:runId
 * ============================================================================
 */

// ─── Estado interno ───────────────────────────────────────────────────────────

let _pollInterval = null;
let _currentRunId = null;
let _config       = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initAgendamento() {
    console.log('[agendamento] Inicializando...');
    await loadScheduleConfig();
}

// ─── Carrega config ────────────────────────────────────────────────────────────

async function loadScheduleConfig() {
    const $loading = document.getElementById('sched-loading');
    const $form    = document.getElementById('sched-form');

    try {
        if ($loading) $loading.style.display = 'flex';
        if ($form)    $form.style.display    = 'none';

        const res = await fetch('/api/test-schedule');

        if (res.status === 403 || res.status === 404) {
            // Servidor Express não está rodando — mostra form com defaults
            _config = {};
            _renderForm(_config);
            _showMsg('ℹ️ API offline (inicie o servidor Express na porta 3001).', 'info');
            return;
        }

        const data = await res.json();
        _config = data.config || {};
        _renderForm(_config);
        _renderSchedulerStatus(data.scheduler);
        _renderLastRun(data.lastRun);

    } catch (err) {
        console.error('[agendamento] Erro ao carregar:', err);
        _config = {};
        _renderForm(_config);
        _showMsg('ℹ️ Servidor offline — mostrando configurações padrão.', 'info');
    } finally {
        if ($loading) $loading.style.display = 'none';
        if ($form)    $form.style.display    = 'block';
    }
}


// ─── Render form ──────────────────────────────────────────────────────────────

function _renderForm(config) {
    _setVal('sched-enabled',     config.enabled    ? 'true' : 'false');
    _setVal('sched-frequency',   config.frequency  || 'manual');
    _setVal('sched-weekday',     config.weekday    ?? 1);
    _setVal('sched-hour',        String(config.hour   ?? 2).padStart(2, '0'));
    _setVal('sched-minute',      String(config.minute ?? 0).padStart(2, '0'));
    _setVal('sched-notify-email', config.notify_email || '');
    _setVal('sched-environment',  config.environment || 'local');

    _setChecked('sched-run-unit',       config.run_unit       !== false);
    _setChecked('sched-run-functional', config.run_functional !== false);
    _setChecked('sched-run-e2e',        config.run_e2e        === true);
    _setChecked('sched-notify-only-fail', config.notify_on_failure_only !== false);

    // Mostra/oculta weekday
    _toggleWeekdayVisibility(config.frequency || 'manual');
    // Atualiza estado visual dos toggles
    _updateToggleUI('sched-enabled', config.enabled ? 'true' : 'false');
}

function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function _setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = val;
}

// ─── Render scheduler status ──────────────────────────────────────────────────

function _renderSchedulerStatus(scheduler) {
    const $nextRun  = document.getElementById('sched-next-run');
    const $cronExpr = document.getElementById('sched-cron-expr');
    const $badge    = document.getElementById('sched-status-badge');

    if ($nextRun) {
        if (scheduler?.nextRun) {
            const d = new Date(scheduler.nextRun);
            $nextRun.textContent = d.toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } else {
            $nextRun.textContent = 'Manual (sem agendamento)';
        }
    }

    if ($cronExpr) {
        $cronExpr.textContent = scheduler?.cronExpr || '—';
    }

    if ($badge) {
        const active = scheduler?.active;
        $badge.textContent = active ? '● Ativo' : '○ Inativo';
        $badge.className = `sched-status-badge ${active ? 'sched-badge-active' : 'sched-badge-inactive'}`;
    }
}

// ─── Render última execução ───────────────────────────────────────────────────

function _renderLastRun(lastRun) {
    const $area = document.getElementById('sched-last-run-area');
    if (!$area) return;

    if (!lastRun) {
        $area.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nenhuma execução registrada.</p>';
        return;
    }

    const date = new Date(lastRun.triggered_at).toLocaleString('pt-BR');
    const dur  = lastRun.duration_ms ? `${(lastRun.duration_ms / 1000).toFixed(1)}s` : '—';
    const ok   = lastRun.status === 'passed';
    const icon = ok ? '✅' : '❌';
    const color = ok ? '#10b981' : '#ef4444';

    $area.innerHTML = `
        <div class="sched-last-run-card">
            <div class="sched-last-run-icon" style="color:${color}">${icon}</div>
            <div class="sched-last-run-info">
                <div style="font-weight:600;font-size:0.95rem;">${lastRun.suite_type}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${date} · ${dur}</div>
                <div style="font-size:0.8rem;margin-top:0.25rem;">
                    <span style="color:#10b981;">✓ ${lastRun.passed_tests} passou</span>
                    ${lastRun.failed_tests > 0 ? `&nbsp;<span style="color:#ef4444;">✗ ${lastRun.failed_tests} falhou</span>` : ''}
                </div>
            </div>
        </div>`;
}

// ─── Frequência → visibilidade do weekday ─────────────────────────────────────

function _toggleWeekdayVisibility(freq) {
    const $row = document.getElementById('sched-weekday-row');
    if ($row) $row.style.display = (freq === 'semanal') ? 'flex' : 'none';
}

// Handler para change do select de frequência
export function handleFrequencyChange(val) {
    _toggleWeekdayVisibility(val);
}

// ─── Toggle UI ────────────────────────────────────────────────────────────────

function _updateToggleUI(id, val) {
    const el    = document.getElementById(id);
    const label = el?.parentElement?.querySelector('.sched-toggle-label');
    if (!label) return;
    const active = val === 'true';
    label.textContent  = active ? 'Ativado' : 'Desativado';
    label.style.color  = active ? '#10b981' : 'var(--text-muted)';
}

export function handleToggleChange(id) {
    const el = document.getElementById(id);
    if (el) _updateToggleUI(id, el.value);
}

// ─── Salvar configuração ──────────────────────────────────────────────────────

export async function saveScheduleConfig() {
    const $btn = document.getElementById('btn-sched-save');
    const freq = document.getElementById('sched-frequency')?.value || 'manual';

    const payload = {
        enabled:               document.getElementById('sched-enabled')?.value === 'true',
        frequency:             freq,
        weekday:               freq === 'semanal' ? Number(document.getElementById('sched-weekday')?.value ?? 1) : null,
        hour:                  Number(document.getElementById('sched-hour')?.value   ?? 2),
        minute:                Number(document.getElementById('sched-minute')?.value ?? 0),
        run_unit:              document.getElementById('sched-run-unit')?.checked       ?? true,
        run_functional:        document.getElementById('sched-run-functional')?.checked ?? true,
        run_e2e:               document.getElementById('sched-run-e2e')?.checked        ?? false,
        notify_email:          document.getElementById('sched-notify-email')?.value?.trim() || null,
        notify_on_failure_only: document.getElementById('sched-notify-only-fail')?.checked ?? true,
        environment:           document.getElementById('sched-environment')?.value || 'local',
    };

    if ($btn) { $btn.disabled = true; $btn.textContent = 'Salvando...'; }

    try {
        const res  = await fetch('/api/test-schedule', {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Erro ao salvar');

        _config = data.config;
        _renderSchedulerStatus(data.scheduler);
        _showMsg('✅ Configuração salva com sucesso!', 'success');

    } catch (err) {
        console.error(err);
        _showMsg(`❌ Erro: ${err.message}`, 'error');
    } finally {
        if ($btn) { $btn.disabled = false; $btn.textContent = 'Salvar configuração'; }
    }
}

// ─── Execução manual ──────────────────────────────────────────────────────────

export async function runTestsNow() {
    const $btn       = document.getElementById('btn-run-now');
    const $progress  = document.getElementById('sched-run-progress');
    const $result    = document.getElementById('sched-run-result');

    // Coleta tipos selecionados
    const types = [];
    if (document.getElementById('trigger-run-unit')?.checked)       types.push('UNITÁRIO');
    if (document.getElementById('trigger-run-functional')?.checked) types.push('FUNCIONAL');
    if (document.getElementById('trigger-run-e2e')?.checked)        types.push('E2E');

    if (types.length === 0) {
        _showMsg('Selecione pelo menos um tipo de teste.', 'error');
        return;
    }

    const env = document.getElementById('trigger-environment')?.value || 'local';

    if ($btn)      { $btn.disabled = true; $btn.innerHTML = '<i class="ph ph-spinner"></i> Executando...'; }
    if ($progress) { $progress.style.display = 'flex'; }
    if ($result)   { $result.style.display = 'none'; }

    try {
        const res  = await fetch('/api/test-schedule/trigger', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ types, environment: env }),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Erro ao disparar testes');

        _currentRunId = data.runId;
        _startPolling();

    } catch (err) {
        _stopPolling();
        if ($btn)     { $btn.disabled = false; $btn.innerHTML = '<i class="ph ph-play"></i> Executar Agora'; }
        if ($progress) { $progress.style.display = 'none'; }
        _showMsg(`❌ ${err.message}`, 'error');
    }
}

// ─── Poll de status ───────────────────────────────────────────────────────────

function _startPolling() {
    _stopPolling();
    _pollInterval = setInterval(_pollStatus, 3000);
    console.log(`[agendamento] 🔄 Polling iniciado — runId: ${_currentRunId}`);
}

function _stopPolling() {
    if (_pollInterval) {
        clearInterval(_pollInterval);
        _pollInterval = null;
    }
}

async function _pollStatus() {
    if (!_currentRunId) { _stopPolling(); return; }

    try {
        const res  = await fetch(`/api/test-schedule/trigger/status/${_currentRunId}`);
        if (!res.ok) { _stopPolling(); return; }

        const job = await res.json();

        // Atualiza progress text
        const $progressText = document.getElementById('sched-progress-text');
        if ($progressText) {
            const done = job.results?.length || 0;
            const total = job.types?.length || 1;
            $progressText.textContent = `Executando ${done}/${total} suítes...`;
        }

        if (job.done) {
            _stopPolling();
            _renderRunResult(job);
        }

    } catch (_) { /* silencia erros de poll */ }
}

function _renderRunResult(job) {
    const $btn      = document.getElementById('btn-run-now');
    const $progress = document.getElementById('sched-run-progress');
    const $result   = document.getElementById('sched-run-result');

    if ($btn)      { $btn.disabled = false; $btn.innerHTML = '<i class="ph ph-play"></i> Executar Agora'; }
    if ($progress) { $progress.style.display = 'none'; }

    if (!$result) return;

    const allOk  = job.results?.every(r => r.status === 'passed');
    const icon   = allOk ? '✅' : '❌';
    const color  = allOk ? '#10b981' : '#ef4444';
    const dur    = job.finishedAt
        ? ((new Date(job.finishedAt) - new Date(job.started)) / 1000).toFixed(1) + 's'
        : '—';

    const rows = (job.results || []).map(r => {
        const ok = r.status === 'passed';
        return `<div class="sched-result-row">
            <span>${ok ? '✅' : '❌'}</span>
            <span style="font-weight:600;">${r.type}</span>
            <span style="color:${ok ? '#10b981' : '#ef4444'};text-transform:uppercase;">${r.status}</span>
        </div>`;
    }).join('');

    $result.innerHTML = `
        <div class="sched-result-card" style="border-color:${color}20;">
            <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
                <span style="font-size:1.5rem;">${icon}</span>
                <div>
                    <div style="font-weight:700;font-size:1rem;">${allOk ? 'Todos os testes passaram!' : 'Há falhas nos testes'}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">Duração total: ${dur}</div>
                </div>
            </div>
            <div class="sched-results-list">${rows}</div>
            ${job.error ? `<div style="color:#ef4444;font-size:0.8rem;margin-top:0.5rem;">⚠️ ${job.error}</div>` : ''}
        </div>`;
    $result.style.display = 'block';

    // Recarrega o lastRun
    setTimeout(() => loadScheduleConfig(), 1500);
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function _showMsg(text, type = 'info') {
    const $msg = document.getElementById('sched-msg');
    if (!$msg) return;
    $msg.textContent  = text;
    $msg.className    = `sched-msg sched-msg-${type}`;
    $msg.style.display = 'block';
    setTimeout(() => { if ($msg) $msg.style.display = 'none'; }, 4000);
}
